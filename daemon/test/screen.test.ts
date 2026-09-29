import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCommandsFrom } from '../src/history';
import { screenPlan, parseScreen } from '../src/respond/channels';
import type { AgentState, HostRef } from '../src/types';
import { hostOf } from '../src/core/reduce';

const fx = (f: string) => readFileSync(join(__dirname, 'fixtures', f), 'utf8');
const agent = (hostRef: HostRef): AgentState => ({
  id: 's', kind: 'claude', pid: 1, cwd: '/w', project: 'w', host: hostOf(hostRef), hostRef,
  status: 'working', activity: { summary: '' }, canReply: false, canFocus: true, lastEventAt: 0,
});

describe('command feed from transcripts', () => {
  it('claude: shell commands paired with output; unfinished = running; non-shell tools skipped', () => {
    expect(readCommandsFrom('claude', fx('claude-cmds.jsonl'))).toEqual([
      { at: Date.parse('2026-09-28T10:00:01.000Z'), cmd: 'npm test', output: 'Tests  5 passed', running: false },
      { at: Date.parse('2026-09-28T10:00:04.000Z'), cmd: 'npm run build', output: '', running: true },
    ]);
  });
  it('codex: exec_command + function_call_output', () => {
    expect(readCommandsFrom('codex', fx('codex.jsonl'))).toEqual([
      { at: Date.parse('2026-09-28T10:00:02.000Z'), cmd: 'rg --files', output: 'a.ts', running: false },
    ]);
  });
  it('keeps only the last N and clips long output to its tail', () => {
    const lines = Array.from({ length: 50 }, (_, i) => JSON.stringify({ type: 'assistant', sessionId: 'c', timestamp: '2026-09-28T10:00:00Z', message: { content: [{ type: 'tool_use', id: `b${i}`, name: 'Bash', input: { command: `echo ${i}` } }] } }));
    lines.push(JSON.stringify({ type: 'user', sessionId: 'c', message: { content: [{ type: 'tool_result', tool_use_id: 'b49', content: 'x\n'.repeat(500) + 'END' }] } }));
    const cmds = readCommandsFrom('claude', lines.join('\n'), 5);
    expect(cmds.map((c) => c.cmd)).toEqual(['echo 45', 'echo 46', 'echo 47', 'echo 48', 'echo 49']);
    expect(cmds[4].output.endsWith('END')).toBe(true);
    expect(cmds[4].output.split('\n').length).toBeLessThanOrEqual(80);
  });
});

describe('live terminal screen', () => {
  it('tmux captures the visible pane; orca reads the rendered screen; others have none', () => {
    expect(screenPlan(agent({ tmuxPane: '%2' }))).toEqual(['tmux', 'capture-pane', '-p', '-t', '%2']);
    expect(screenPlan(agent({ orcaPane: 'p' }), 'term_1')).toEqual(['orca', 'terminal', 'read', '--terminal', 'term_1', '--screen', '--json']);
    expect(screenPlan(agent({ orcaPane: 'p' }))).toBeNull();
    expect(screenPlan(agent({ termProgram: 'WarpTerminal' }))).toBeNull();
  });
  it('parses orca JSON and trims trailing blank lines', () => {
    expect(parseScreen('orca', JSON.stringify({ result: { terminal: { tail: ['$ ls', 'a.ts', '', ''] } } }))).toEqual(['$ ls', 'a.ts']);
    expect(parseScreen('tmux', '$ ls\na.ts\n\n\n')).toEqual(['$ ls', 'a.ts']);
    expect(parseScreen('orca', 'not json')).toBeNull();
  });
});
