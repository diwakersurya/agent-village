import { describe, it, expect } from 'vitest';
import { sendPlan, focusPlan, createChannels, orcaHandleFor, type Argv } from '../src/respond/channels';
import type { AgentState, HostRef } from '../src/types';
import { hostOf } from '../src/core/reduce';

const agent = (hostRef: HostRef): AgentState => ({
  id: 's', kind: 'claude', pid: 1, cwd: '/w', project: 'w', host: hostOf(hostRef), hostRef,
  status: 'idle', activity: { summary: '' }, canReply: false, canFocus: true, lastEventAt: 0,
});
const NASTY = `"; rm -rf ~ $(whoami) \`id\` 'q'`;
const DASHED = '-Rabc do it';

describe('sendPlan', () => {
  it('tmux sends literal text then Enter', () => {
    expect(sendPlan(agent({ tmuxPane: '%3' }), NASTY)).toEqual([
      ['tmux', 'send-keys', '-t', '%3', '-l', '--', NASTY],
      ['tmux', 'send-keys', '-t', '%3', 'Enter'],
    ]);
  });

  it('orca uses resolved handle', () => {
    expect(sendPlan(agent({ orcaPane: 'x:leaf' }), NASTY, 'term_1')).toEqual([
      ['orca', 'terminal', 'send', '--terminal', 'term_1', '--text', NASTY, '--enter'],
    ]);
    expect(sendPlan(agent({ orcaPane: 'x:leaf' }), 'hi')).toBeNull(); // unresolved
  });

  it('Terminal.app passes text as argv item, never inside the script', () => {
    const plan = sendPlan(agent({ tty: 'ttys004', termProgram: 'Apple_Terminal' }), NASTY)!;
    expect(plan).toHaveLength(1);
    const [cmd, , script, tty, text] = plan[0];
    expect(cmd).toBe('osascript');
    expect(script).not.toContain('rm -rf');
    expect([tty, text]).toEqual(['ttys004', NASTY]);
  });

  it('collapses newlines so a TUI does not submit partial lines', () => {
    expect(sendPlan(agent({ tmuxPane: '%1' }), 'line one\nline two\r\n')![0][6]).toBe('line one line two');
  });

  it('replies starting with "-" are not parsed as flags', () => {
    expect(sendPlan(agent({ tmuxPane: '%1' }), '-R')![0]).toEqual(['tmux', 'send-keys', '-t', '%1', '-l', '--', '-R']);
    expect(sendPlan(agent({ orcaPane: 'p' }), '- fix tests', 'term_1')![0]).toContain(' - fix tests');
  });

  it('Warp / unknown → null', () => {
    expect(sendPlan(agent({ tty: 'ttys1', termProgram: 'WarpTerminal' }), 'x')).toBeNull();
    expect(sendPlan(agent({}), 'x')).toBeNull();
  });
});

describe('focusPlan', () => {
  it('tmux selects window+pane and raises the terminal app', () => {
    expect(focusPlan(agent({ tmuxPane: '%3', termProgram: 'WarpTerminal' }))).toEqual([
      ['tmux', 'select-window', '-t', '%3'],
      ['tmux', 'select-pane', '-t', '%3'],
      ['open', '-a', 'Warp'],
    ]);
  });
  it('orca without resolvable handle still raises Orca', () => {
    expect(focusPlan(agent({ orcaPane: 'p' }))).toEqual([['open', '-a', 'Orca']]);
  });
  it('orca switches terminal', () => {
    expect(focusPlan(agent({ orcaPane: 'p' }), 'term_9')).toEqual([['orca', 'terminal', 'switch', '--terminal', 'term_9'], ['open', '-a', 'Orca']]);
  });
  it('Terminal.app selects tab by tty', () => {
    const [[cmd, , , tty]] = focusPlan(agent({ tty: 'ttys004', termProgram: 'Apple_Terminal' }));
    expect([cmd, tty]).toEqual(['osascript', 'ttys004']);
  });
  it('Warp jumps to the exact session via WARP_FOCUS_URL', () => {
    expect(focusPlan(agent({ termProgram: 'WarpTerminal', warpFocusUrl: 'warp://session/abc' }))).toEqual([['open', 'warp://session/abc']]);
    expect(focusPlan(agent({ termProgram: 'WarpTerminal' }))).toEqual([['open', '-a', 'Warp']]);
  });
  it('non-warp:// focus urls are ignored', () => {
    expect(focusPlan(agent({ termProgram: 'WarpTerminal', warpFocusUrl: 'file:///etc/passwd' }))).toEqual([['open', '-a', 'Warp']]);
  });
  it('unknown terminal → no plan (never opens a random Terminal)', () => {
    expect(focusPlan(agent({}))).toEqual([]);
    expect(focusPlan(agent({ tty: 'ttys1' }))).toEqual([]);
  });
});

describe('orcaHandleFor', () => {
  it('matches leafId at the end of the pane key', () => {
    const list = { result: { terminals: [{ handle: 'term_a', leafId: 'aaaa' }, { handle: 'term_b', leafId: '544e08d5-36ee-47bb-84b8-ae2d52f6c031' }] } };
    expect(orcaHandleFor('tab:544e08d5-36ee-47bb-84b8-ae2d52f6c031', list)).toBe('term_b');
    expect(orcaHandleFor('tab:zzz', list)).toBeUndefined();
  });
});

describe('createChannels', () => {
  it('executes plans in order and routes pty writes', async () => {
    const ran: Argv[] = [];
    const pty: string[] = [];
    const ch = createChannels(async (a) => { ran.push(a); return '{}'; }, async (id, t) => { pty.push(`${id}:${t}`); });
    await ch.send(agent({ tmuxPane: '%1' }), 'go');
    expect(ran.map((a) => a[1])).toEqual(['send-keys', 'send-keys']);
    await ch.send(agent({ ptyId: 'p1' }), 'hello');
    expect(pty).toEqual(['p1:hello']);
    expect(ch.canSend(agent({ termProgram: 'WarpTerminal' }))).toBe(false);
    expect(ch.canSend(agent({ tty: 't', termProgram: 'Apple_Terminal' }))).toBe(true);
    await expect(ch.send(agent({ termProgram: 'WarpTerminal' }), 'x')).rejects.toThrow(/no reply channel/);
  });
});

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hasTmux = (() => { try { execFileSync('tmux', ['-V']); return true; } catch { return false; } })();

describe.skipIf(!hasTmux)('live tmux channel', () => {
  it('delivers nasty text literally to a fake agent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'village-'));
    const out = join(dir, 'out');
    const session = `villagetest${process.pid}`;
    execFileSync('tmux', ['new-session', '-d', '-s', session, '-x', '200', '-y', '20', `sh -c 'read -r L; printf %s "$L" > ${out}; sleep 3'`]);
    try {
      const pane = execFileSync('tmux', ['list-panes', '-t', session, '-F', '#{pane_id}']).toString().trim();
      await createChannels().send(agent({ tmuxPane: pane }), DASHED + NASTY);
      let got = '';
      for (let i = 0; i < 50 && !got; i++) { await new Promise((r) => setTimeout(r, 50)); try { got = readFileSync(out, 'utf8'); } catch {} }
      expect(got).toBe(DASHED + NASTY);
    } finally {
      try { execFileSync('tmux', ['kill-session', '-t', session]); } catch {}
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
