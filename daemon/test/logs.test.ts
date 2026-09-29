import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseClaudeLine, createCodexParser, parseGeminiFile } from '../src/ingest/logs';
import { readHistoryFrom } from '../src/history';
import { Registry } from '../src/core/registry';

const fx = (f: string) => readFileSync(join(__dirname, 'fixtures', f), 'utf8');
const lines = (f: string) => fx(f).split('\n').filter(Boolean);

describe('claude log parser', () => {
  const envs = lines('claude.jsonl').map(parseClaudeLine).filter(Boolean);
  it('maps prompt, tool, turn_end, error; skips meta/tool_result/thinking/garbage', () => {
    expect(envs.map((e) => e!.event.t)).toEqual(['prompt', 'tool', 'turn_end', 'error']);
    expect(envs[1]!.event).toEqual({ t: 'tool', tool: 'Edit', summary: 'editing Table.tsx' });
    expect(envs[0]).toMatchObject({ kind: 'claude', sessionId: 'c1', cwd: '/w/proj', at: Date.parse('2026-09-28T10:00:00.000Z') });
  });
});

describe('codex log parser', () => {
  it('carries cwd/session from session_meta across lines', () => {
    const p = createCodexParser();
    const envs = lines('codex.jsonl').map(p).filter(Boolean);
    expect(envs.map((e) => e!.event.t)).toEqual(['prompt', 'tool', 'tool', 'turn_end']);
    expect(envs[1]).toMatchObject({ kind: 'codex', sessionId: 'x1', cwd: '/w/api', event: { tool: 'exec_command', summary: 'Bash: rg --files' } });
    expect(envs[2]!.event).toMatchObject({ tool: 'apply_patch', summary: 'editing files' });
  });
});

describe('gemini file parser', () => {
  it('returns last-state envelopes', () => {
    const envs = parseGeminiFile(fx('gemini.json'));
    expect(envs.map((e) => e.event.t)).toEqual(['prompt', 'tool', 'turn_end']);
    expect(envs[0].sessionId).toBe('g1');
  });
});

describe('history', () => {
  it('claude transcript → user/tool/assistant items', () => {
    const items = readHistoryFrom('claude', fx('claude.jsonl'));
    expect(items.map((i) => i.role)).toEqual(['user', 'tool', 'assistant', 'assistant']);
    expect(items[0].text).toBe('fix the table bug');
    expect(items[1].text).toBe('editing Table.tsx');
  });
  it('codex and gemini', () => {
    expect(readHistoryFrom('codex', fx('codex.jsonl')).map((i) => i.role)).toEqual(['user', 'tool', 'tool', 'assistant']);
    expect(readHistoryFrom('gemini', fx('gemini.json')).map((i) => i.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
  });
  it('limits to last N', () => {
    expect(readHistoryFrom('claude', fx('claude.jsonl'), 2)).toHaveLength(2);
  });
});

describe('registry.applyLog', () => {
  it('ignores log events for hook-driven agents', () => {
    const r = new Registry({ canReply: () => false });
    r.apply({ kind: 'claude', sessionId: 'c1', at: 1, pid: 5, event: { t: 'permission', tool: 'Bash', text: 'x' } });
    const askId = r.get('c1')!.ask!.id;
    r.applyLog({ kind: 'claude', sessionId: 'c1', at: 2, event: { t: 'tool', tool: 'Read', summary: 'reading' } });
    expect(r.get('c1')!.ask!.id).toBe(askId);
  });
  it('log agent adopts a matching placeholder (pid, tty)', () => {
    const r = new Registry({ canReply: () => false });
    r.syncProcs([{ pid: 9, ppid: 1, tty: 'ttys3', comm: 'claude', args: 'claude', cwd: '/w/proj' }], 1);
    r.applyLog({ kind: 'claude', sessionId: 'c1', at: 2, cwd: '/w/proj', event: { t: 'tool', tool: 'Read', summary: 'reading' } });
    expect(r.all()).toHaveLength(1);
    expect(r.get('c1')).toMatchObject({ pid: 9, hostRef: { tty: 'ttys3' }, status: 'working' });
  });
  it('scan gives pid to an existing pid-less log agent instead of a duplicate', () => {
    const r = new Registry({ canReply: () => false });
    r.applyLog({ kind: 'claude', sessionId: 'c1', at: 2, cwd: '/w/proj', event: { t: 'prompt' } });
    r.syncProcs([{ pid: 9, ppid: 1, tty: 'ttys3', comm: 'claude', args: 'claude', cwd: '/w/proj' }], 3);
    expect(r.all()).toHaveLength(1);
    expect(r.get('c1')).toMatchObject({ pid: 9, hostRef: { tty: 'ttys3' } });
  });
  it('sweep drops stale pid-less log agents after 10 min', () => {
    const r = new Registry({ canReply: () => false });
    r.applyLog({ kind: 'codex', sessionId: 'x', at: 0, event: { t: 'prompt' } });
    r.sweep(10 * 60_000 + 1);
    expect(r.get('x')).toBeUndefined();
  });
});

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { readHistory } from '../src/history';

describe('I8: history reads only the tail of big transcripts', () => {
  it('caps bytes read and drops the partial first line', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vh-'));
    const f = join(dir, 't.jsonl');
    const line = (i: number) => JSON.stringify({ type: 'user', sessionId: 's', timestamp: '2026-09-28T10:00:00Z', message: { content: `msg ${i} ${'x'.repeat(80)}` } });
    writeFileSync(f, Array.from({ length: 5000 }, (_, i) => line(i)).join('\n') + '\n');
    const items = await readHistory({ kind: 'claude', transcriptPath: f } as any, 10_000, 4096);
    expect(items.length).toBeGreaterThan(10);
    expect(items.length).toBeLessThan(60);
    expect(items.at(-1)!.text.startsWith('msg 4999')).toBe(true);
    expect(items.every((i) => i.text.startsWith('msg '))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('I10: states hooks alone never produce', () => {
  it('idle Notification makes a working agent idle (once)', () => {
    const r = new Registry({ canReply: () => false });
    r.apply({ kind: 'claude', sessionId: 'c', at: 1, pid: 3, event: { t: 'prompt' } });
    r.apply({ kind: 'claude', sessionId: 'c', at: 2, pid: 3, event: { t: 'notify', text: 'Claude is waiting for your input', idle: true } });
    expect(r.get('c')).toMatchObject({ status: 'idle', ask: { type: 'idle' } });
  });
  it('API errors from logs reach hooked agents that are not waiting on something', () => {
    const r = new Registry({ canReply: () => false });
    r.apply({ kind: 'claude', sessionId: 'c', at: 1, pid: 3, event: { t: 'prompt' } });
    r.applyLog({ kind: 'claude', sessionId: 'c', at: 2, event: { t: 'error', text: 'API Error: 529' } });
    expect(r.get('c')).toMatchObject({ status: 'needs_input', ask: { type: 'error' } });
    r.applyLog({ kind: 'claude', sessionId: 'c', at: 3, event: { t: 'tool', tool: 'Read', summary: 'x' } });
    expect(r.get('c')!.ask?.type).toBe('error');
  });
});
