import { describe, it, expect, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTailers } from '../src/ingest/logs';
import { readCommands, readHistory, _cmdCacheSize } from '../src/history';
import type { Envelope } from '../src/types';

const dirs: string[] = [];
const stops: (() => void)[] = [];
afterEach(() => { stops.splice(0).forEach((s) => s()); for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'vtail-')); dirs.push(d); return d; };
const until = async (fn: () => boolean) => { for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 20)); };
const tail = (home: string) => { const got: Envelope[] = []; stops.push(startTailers((e) => got.push(e), home, 50)); return got; };
const now = new Date().toISOString();
const claudeLine = (sid: string, text: string) => JSON.stringify({ type: 'user', sessionId: sid, timestamp: now, message: { content: text } });

describe('tailer', () => {
  it('one unreadable file does not stop the others', async () => {
    const home = tmp();
    const proj = join(home, '.claude/projects/p');
    mkdirSync(proj, { recursive: true });
    writeFileSync(join(proj, 'a.jsonl'), claudeLine('a', 'hi') + '\n');
    chmodSync(join(proj, 'a.jsonl'), 0o000);
    writeFileSync(join(proj, 'b.jsonl'), claudeLine('b', 'hello') + '\n');
    const got = tail(home);
    await until(() => got.length > 0);
    expect(got.map((e) => e.sessionId)).toEqual(['b']);
  });

  it('a file deleted between ticks is dropped quietly, new ones still read', async () => {
    const home = tmp();
    const proj = join(home, '.claude/projects/p');
    mkdirSync(proj, { recursive: true });
    writeFileSync(join(proj, 'a.jsonl'), claudeLine('a', 'one') + '\n');
    const got = tail(home);
    await until(() => got.length > 0);
    rmSync(join(proj, 'a.jsonl'));
    writeFileSync(join(proj, 'c.jsonl'), claudeLine('c', 'two') + '\n');
    await until(() => got.some((e) => e.sessionId === 'c'));
    expect(got.map((e) => e.sessionId)).toEqual(['a', 'c']);
  });

  it('big codex rollouts: session_meta from line 1, then only the tail', async () => {
    const home = tmp();
    const dir = join(home, '.codex/sessions/2026/09/28');
    mkdirSync(dir, { recursive: true });
    const meta = JSON.stringify({ timestamp: now, type: 'session_meta', payload: { id: 'x1', cwd: '/w/api', instructions: 'i'.repeat(100_000) } });
    const msg = (m: string) => JSON.stringify({ timestamp: now, type: 'event_msg', payload: { type: 'user_message', message: m } });
    const filler = Array.from({ length: 4000 }, () => JSON.stringify({ type: 'response_item', payload: { type: 'reasoning', text: 'x'.repeat(100) } }));
    writeFileSync(join(dir, 'rollout-x.jsonl'), [meta, msg('old'), ...filler, msg('latest')].join('\n') + '\n');
    const got = tail(home);
    await until(() => got.length > 0);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ sessionId: 'x1', cwd: '/w/api', event: { t: 'prompt', text: 'latest' } });
  });
});

describe('transcript reads', () => {
  it('missing transcript → [] (not an error)', async () => {
    const a = { kind: 'claude', transcriptPath: join(tmp(), 'gone.jsonl') } as any;
    expect(await readHistory(a)).toEqual([]);
    expect(await readCommands(a)).toEqual([]);
    expect(await readHistory({ ...a, kind: 'gemini' })).toEqual([]);
  });

  it('readCommands caches until the file changes', async () => {
    const f = join(tmp(), 't.jsonl');
    writeFileSync(f, readFileSync(join(__dirname, 'fixtures/claude-cmds.jsonl')));
    const a = { kind: 'claude', transcriptPath: f } as any;
    const first = await readCommands(a);
    expect(first.length).toBeGreaterThan(0);
    expect(await readCommands(a)).toBe(first);
    writeFileSync(f, readFileSync(f, 'utf8') + JSON.stringify({ type: 'assistant', sessionId: 'c1', timestamp: now, message: { content: [{ type: 'tool_use', id: 'z', name: 'Bash', input: { command: 'ls' } }] } }) + '\n');
    const next = await readCommands(a);
    expect(next).not.toBe(first);
    expect(next.at(-1)).toMatchObject({ cmd: 'ls', running: true });
  });

  it('command cache stays bounded', async () => {
    const d = tmp();
    for (let i = 0; i < 80; i++) {
      const f = join(d, `${i}.jsonl`);
      writeFileSync(f, '');
      await readCommands({ kind: 'claude', transcriptPath: f } as any);
    }
    expect(_cmdCacheSize()).toBeLessThanOrEqual(64);
  });
});
