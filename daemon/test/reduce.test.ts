import { describe, it, expect } from 'vitest';
import { reduce } from '../src/core/reduce';
import { summarizeTool, toolCategory } from '../src/core/summarize';
import type { Envelope } from '../src/types';

let n = 0;
const id = () => `a${++n}`;
const env = (event: Envelope['event'], extra: Partial<Envelope> = {}): Envelope => ({
  kind: 'claude', sessionId: 's1', at: 1, event, pid: 10, cwd: '/x/proj', ...extra,
});

describe('reduce', () => {
  it('creates a working agent on prompt', () => {
    const s = reduce(undefined, env({ t: 'prompt' }), id)!;
    expect(s).toMatchObject({ id: 's1', status: 'working', project: 'proj', host: 'terminal' });
  });

  it('tool sets activity and clears ask', () => {
    let s = reduce(undefined, env({ t: 'permission', tool: 'Bash', text: 'rm -rf dist' }), id)!;
    expect(s.status).toBe('needs_input');
    expect(s.ask?.type).toBe('permission');
    expect(s.ask?.options).toEqual(['Allow', 'Deny']);
    s = reduce(s, env({ t: 'tool', tool: 'Edit', summary: 'editing a.ts' }), id)!;
    expect(s).toMatchObject({ status: 'working', activity: { tool: 'Edit', summary: 'editing a.ts' } });
    expect(s.ask).toBeUndefined();
  });

  it('turn_end → idle with idle ask', () => {
    const s = reduce(undefined, env({ t: 'turn_end' }), id)!;
    expect(s.status).toBe('idle');
    expect(s.ask?.type).toBe('idle');
  });

  it('question carries options', () => {
    const s = reduce(undefined, env({ t: 'question', text: 'Pick', options: ['A', 'B'] }), id)!;
    expect(s.ask).toMatchObject({ type: 'question', options: ['A', 'B'] });
  });

  it('error → needs_input error ask', () => {
    expect(reduce(undefined, env({ t: 'error', text: 'overloaded' }), id)!.ask?.type).toBe('error');
  });

  it('notify keeps status but updates summary', () => {
    const s = reduce(undefined, env({ t: 'prompt' }), id)!;
    const t = reduce(s, env({ t: 'notify', text: 'waiting for input' }), id)!;
    expect(t.status).toBe('working');
    expect(t.activity.summary).toBe('waiting for input');
  });

  it('session_end removes', () => {
    expect(reduce(undefined, env({ t: 'session_end' }), id)).toBeNull();
  });

  it('detects host from hostRef', () => {
    expect(reduce(undefined, env({ t: 'prompt' }, { hostRef: { tmuxPane: '%3' } }), id)!.host).toBe('tmux');
    expect(reduce(undefined, env({ t: 'prompt' }, { hostRef: { orcaPane: 'x' } }), id)!.host).toBe('orca');
    expect(reduce(undefined, env({ t: 'prompt' }, { hostRef: { ptyId: 'p1', tmuxPane: '%1' } }), id)!.host).toBe('pty');
  });

  it('canFocus only when the terminal is known', () => {
    expect(reduce(undefined, env({ t: 'prompt' }), id)!.canFocus).toBe(false);
    expect(reduce(undefined, env({ t: 'prompt' }, { hostRef: { warpFocusUrl: 'warp://session/x' } }), id)!.canFocus).toBe(true);
    expect(reduce(undefined, env({ t: 'prompt' }, { hostRef: { orcaPane: 'x' } }), id)!.canFocus).toBe(true);
    expect(reduce(undefined, env({ t: 'prompt' }, { hostRef: { termProgram: 'Apple_Terminal', tty: 't' } }), id)!.canFocus).toBe(true);
  });

  it('two sessions in same cwd are distinct agents', () => {
    const a = reduce(undefined, env({ t: 'prompt' }), id)!;
    const b = reduce(undefined, env({ t: 'prompt' }, { sessionId: 's2' }), id)!;
    expect(a.id).not.toBe(b.id);
    expect(a.project).toBe(b.project);
  });

  it('keeps earlier cwd/pid when later envelope omits them', () => {
    const a = reduce(undefined, env({ t: 'prompt' }), id)!;
    const b = reduce(a, { kind: 'claude', sessionId: 's1', at: 5, event: { t: 'turn_end' } }, id)!;
    expect(b).toMatchObject({ cwd: '/x/proj', pid: 10, lastEventAt: 5 });
  });
});

describe('summarize', () => {
  it('summarizes common tools', () => {
    expect(summarizeTool('Bash', { command: 'npm test' })).toBe('Bash: npm test');
    expect(summarizeTool('Edit', { file_path: '/a/b/Table.tsx' })).toBe('editing Table.tsx');
    expect(summarizeTool('Read', { file_path: '/a/b/x.md' })).toBe('reading x.md');
    expect(summarizeTool('Grep', { pattern: 'foo' })).toBe('searching foo');
    expect(summarizeTool('exec_command', { cmd: 'ls -la' })).toBe('Bash: ls -la');
    expect(summarizeTool('Mystery', {})).toBe('Mystery');
  });

  it('truncates long commands', () => {
    expect(summarizeTool('Bash', { command: 'x'.repeat(200) }).length).toBeLessThanOrEqual(66);
  });

  it('categorizes tools', () => {
    expect(toolCategory('Bash')).toBe('bash');
    expect(toolCategory('run_shell_command')).toBe('bash');
    expect(toolCategory('Grep')).toBe('read');
    expect(toolCategory('apply_patch')).toBe('edit');
    expect(toolCategory('WebFetch')).toBe('web');
    expect(toolCategory('mcp__x__y')).toBe('web');
    expect(toolCategory('TodoWrite')).toBe('other');
  });
});
