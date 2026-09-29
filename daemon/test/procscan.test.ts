import { describe, it, expect } from 'vitest';
import { parsePs, agentKindOf, findAgentAncestor, parseLsofCwd, parseEnvRefs } from '../src/ingest/procscan';
import { Registry } from '../src/core/registry';

const PS = `
    1     0 ??       /sbin/launchd
  100     1 ttys001  -zsh
  200   100 ttys001  claude --resume
  201   200 ttys001  /bin/sh -c foo
  202   201 ttys001  /bin/sh /x/village-hook.sh claude
  300     1 ??       /Applications/Claude.app/Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper
  400   100 ttys002  node /usr/local/bin/codex
  500   100 ttys003  node /opt/homebrew/bin/gemini -y
  600   100 ttys004  node /x/claude-mem/scripts/mcp-server.cjs
  700   100 ttys005  /Applications/Codex.app/Contents/Resources/codex app-server
  800   100 ttys006  /Users/u/.local/bin/claude
`;

describe('procscan', () => {
  const procs = parsePs(PS);
  const table = new Map(procs.map((p) => [p.pid, p]));

  it('parses ps rows, comm = basename of argv0', () => {
    expect(procs.find((p) => p.pid === 200)).toMatchObject({ ppid: 100, tty: 'ttys001', comm: 'claude', args: 'claude --resume' });
    expect(procs.find((p) => p.pid === 1)?.tty).toBe('');
  });

  it('classifies agent processes', () => {
    const kinds = Object.fromEntries(procs.map((p) => [p.pid, agentKindOf(p)]));
    expect(kinds).toMatchObject({ 200: 'claude', 300: null, 400: 'codex', 500: 'gemini', 600: null, 202: null, 700: null, 800: 'claude' });
  });

  it('walks up to the agent ancestor', () => {
    expect(findAgentAncestor(202, table)?.pid).toBe(200);
    expect(findAgentAncestor(200, table)?.pid).toBe(200);
    expect(findAgentAncestor(100, table)).toBeNull();
  });

  it('parses lsof cwd output', () => {
    expect(parseLsofCwd('p200\nfcwd\nn/Users/u/proj\np400\nfcwd\nn/tmp/x y\n')).toEqual(new Map([[200, '/Users/u/proj'], [400, '/tmp/x y']]));
  });
});

describe('parseEnvRefs', () => {
  it('pulls terminal handles out of `ps eww` output', () => {
    const out = 'claude --resume TERM_PROGRAM=WarpTerminal HOME=/Users/u WARP_FOCUS_URL=warp://session/3ad7 SHELL=/bin/zsh';
    expect(parseEnvRefs(out)).toEqual({ termProgram: 'WarpTerminal', warpFocusUrl: 'warp://session/3ad7' });
    expect(parseEnvRefs('claude TERM_PROGRAM=Orca ORCA_PANE_KEY=tab:leaf TMUX_PANE=%4')).toEqual({ termProgram: 'Orca', orcaPane: 'tab:leaf', tmuxPane: '%4' });
    expect(parseEnvRefs('claude')).toEqual({});
  });
});

describe('registry syncProcs', () => {
  const proc = { pid: 200, ppid: 100, tty: 'ttys001', comm: 'claude', args: 'claude', cwd: '/w/proj' };

  it('placeholder → merge → crash → sweep', () => {
    const r = new Registry({ canReply: () => false });
    const removed: string[] = [];
    r.on('remove', (id) => removed.push(id));

    r.syncProcs([proc], 1000);
    expect(r.get('pid:200')).toMatchObject({ kind: 'claude', status: 'idle', cwd: '/w/proj', project: 'proj', hostRef: { tty: 'ttys001' } });

    r.apply({ kind: 'claude', sessionId: 's1', at: 1100, pid: 200, event: { t: 'prompt' } });
    expect(r.get('pid:200')).toBeUndefined();
    expect(removed).toContain('pid:200');
    expect(r.get('s1')).toMatchObject({ status: 'working', cwd: '/w/proj', hostRef: { tty: 'ttys001' } });

    r.syncProcs([proc], 1200); // still alive: no new placeholder
    expect(r.all()).toHaveLength(1);

    r.syncProcs([], 2000);
    expect(r.get('s1')).toMatchObject({ status: 'crashed', crashedAt: 2000 });
    expect(r.get('s1')?.ask).toBeUndefined();

    r.sweep(2000 + 9 * 60_000);
    expect(r.get('s1')).toBeDefined();
    r.sweep(2000 + 10 * 60_000 + 1);
    expect(r.get('s1')).toBeUndefined();
  });

  it('env refs give placeholders a focusable host, and enrich hook agents missing them', () => {
    const r = new Registry({ canReply: () => false });
    r.syncProcs([{ ...proc, env: { termProgram: 'WarpTerminal', warpFocusUrl: 'warp://session/1' } }], 1);
    expect(r.get('pid:200')).toMatchObject({ canFocus: true, hostRef: { tty: 'ttys001', warpFocusUrl: 'warp://session/1' } });
    r.apply({ kind: 'claude', sessionId: 's9', at: 2, pid: 300, event: { t: 'prompt' } });
    r.syncProcs([{ ...proc, env: { termProgram: 'WarpTerminal', warpFocusUrl: 'warp://session/1' } }, { ...proc, pid: 300, env: { orcaPane: 'tab:leaf' } }], 3);
    expect(r.get('s9')).toMatchObject({ host: 'orca', canFocus: true, hostRef: { orcaPane: 'tab:leaf' } });
  });

  it('placeholder for dead process is dropped, not crashed', () => {
    const r = new Registry({ canReply: () => false });
    r.syncProcs([proc], 1000);
    r.syncProcs([], 2000);
    expect(r.get('pid:200')).toBeUndefined();
  });

  it('agents without pid are never crashed by scan', () => {
    const r = new Registry({ canReply: () => false });
    r.apply({ kind: 'codex', sessionId: 'c1', at: 1, event: { t: 'prompt' } });
    r.syncProcs([], 2000);
    expect(r.get('c1')?.status).toBe('working');
  });
});

import { claudeProjectDir } from '../src/ingest/procscan';

describe('claudeProjectDir', () => {
  it('encodes a cwd the way Claude names its project folders', () => {
    expect(claudeProjectDir('/Users/u/personal/code/agents-village')).toBe('-Users-u-personal-code-agents-village');
    expect(claudeProjectDir('/Users/u/site.github.io')).toBe('-Users-u-site-github-io');
    expect(claudeProjectDir('/private/tmp/x/-Users-y')).toBe('-private-tmp-x--Users-y');
  });
  it('placeholders carry the transcript path found by the scanner', () => {
    const r = new Registry({ canReply: () => false });
    r.syncProcs([{ pid: 5, ppid: 1, tty: 't', comm: 'claude', args: 'claude', cwd: '/w', transcriptPath: '/tx.jsonl' }], 1);
    expect(r.get('pid:5')?.transcriptPath).toBe('/tx.jsonl');
  });
});
