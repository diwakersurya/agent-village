import { describe, it, expect } from 'vitest';
import { normalizeHook } from '../src/ingest/normalize';

const meta = { pid: 42, at: 100 };
const base = { session_id: 's1', cwd: '/w/proj', transcript_path: '/t.jsonl' };

describe('normalizeHook', () => {
  it('claude PreToolUse Bash → tool', () => {
    const e = normalizeHook('claude', { ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' } }, meta)!;
    expect(e).toMatchObject({ kind: 'claude', sessionId: 's1', pid: 42, cwd: '/w/proj', transcriptPath: '/t.jsonl', at: 100 });
    expect(e.event).toEqual({ t: 'tool', tool: 'Bash', summary: 'Bash: npm test' });
  });

  it('PermissionRequest → permission with command text', () => {
    const e = normalizeHook('claude', { ...base, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf dist' } }, meta)!;
    expect(e.event).toEqual({ t: 'permission', tool: 'Bash', text: 'Bash: rm -rf dist' });
  });

  it('PermissionRequest for non-bash tool shows JSON input', () => {
    const e = normalizeHook('codex', { ...base, hook_event_name: 'PermissionRequest', tool_name: 'Write', tool_input: { file_path: '/a.ts' } }, meta)!;
    expect(e.event).toMatchObject({ t: 'permission', tool: 'Write' });
    expect((e.event as any).text).toContain('/a.ts');
  });

  it('AskUserQuestion → question with option labels', () => {
    const e = normalizeHook('claude', {
      ...base, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion',
      tool_input: { questions: [{ question: 'Which db?', options: [{ label: 'Postgres' }, { label: 'SQLite' }] }] },
    }, meta)!;
    expect(e.event).toEqual({ t: 'question', text: 'Which db?', options: ['Postgres', 'SQLite'] });
  });

  it('ExitPlanMode → question with approve options', () => {
    const e = normalizeHook('claude', { ...base, hook_event_name: 'PreToolUse', tool_name: 'ExitPlanMode', tool_input: { plan: 'Do X' } }, meta)!;
    expect(e.event).toMatchObject({ t: 'question', options: ['Approve', 'Keep planning'] });
  });

  it('Stop → turn_end, SessionEnd → session_end, prompt, notify', () => {
    expect(normalizeHook('claude', { ...base, hook_event_name: 'Stop' }, meta)!.event.t).toBe('turn_end');
    expect(normalizeHook('claude', { ...base, hook_event_name: 'SessionEnd' }, meta)!.event.t).toBe('session_end');
    expect(normalizeHook('claude', { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'hi' }, meta)!.event).toEqual({ t: 'prompt', text: 'hi' });
    expect(normalizeHook('claude', { ...base, hook_event_name: 'Notification', message: 'Claude needs your permission' }, meta)!.event)
      .toEqual({ t: 'notify', text: 'Claude needs your permission' });
  });

  it('gemini events', () => {
    expect(normalizeHook('gemini', { ...base, hook_event_name: 'BeforeTool', tool_name: 'run_shell_command', tool_input: { command: 'ls' } }, meta)!.event)
      .toEqual({ t: 'tool', tool: 'run_shell_command', summary: 'Bash: ls' });
    expect(normalizeHook('gemini', { ...base, hook_event_name: 'AfterAgent' }, meta)!.event.t).toBe('turn_end');
    expect(normalizeHook('gemini', { ...base, hook_event_name: 'BeforeAgent', prompt: 'go' }, meta)!.event.t).toBe('prompt');
  });

  it('unknown event or missing session → null', () => {
    expect(normalizeHook('claude', { ...base, hook_event_name: 'Weird' }, meta)).toBeNull();
    expect(normalizeHook('claude', { hook_event_name: 'Stop' }, meta)).toBeNull();
    expect(normalizeHook('claude', null, meta)).toBeNull();
  });
});
