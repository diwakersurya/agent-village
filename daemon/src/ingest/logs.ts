import { open, readdir, stat, type FileHandle } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent, AgentKind, Envelope } from '../types';
import { summarizeTool } from '../core/summarize';
import { parse, ts as tsOr } from '../util';

const ts = (v: unknown) => tsOr(v, Date.now());

function toolEvent(name: string, input: unknown): AgentEvent {
  if (name === 'AskUserQuestion') {
    const q = (input as any)?.questions?.[0];
    return { t: 'question', text: String(q?.question ?? 'The agent has a question'), options: q?.options?.map((o: any) => String(o?.label ?? o)) };
  }
  return { t: 'tool', tool: name, summary: summarizeTool(name, input) };
}

/** One line of ~/.claude/projects/<proj>/<session>.jsonl */
export function parseClaudeLine(line: string): Envelope | null {
  const d = parse(line);
  if (!d?.sessionId || d.isSidechain) return null;
  const c = d.message?.content;
  const env = (event: AgentEvent): Envelope => ({ kind: 'claude', sessionId: d.sessionId, at: ts(d.timestamp), cwd: d.cwd, event });
  if (d.type === 'assistant') {
    if (d.isApiErrorMessage) return env({ t: 'error', text: textOf(c) || 'API error' });
    const tools = Array.isArray(c) ? c.filter((b: any) => b?.type === 'tool_use') : [];
    if (tools.length) { const t = tools[tools.length - 1]; return env(toolEvent(t.name, t.input)); }
    if (d.message?.stop_reason === 'end_turn') return env({ t: 'turn_end' });
    return null;
  }
  if (d.type === 'user' && !d.isMeta) {
    if (Array.isArray(c) && c.some((b: any) => b?.type === 'tool_result')) return null;
    const text = textOf(c);
    return text ? env({ t: 'prompt', text }) : null;
  }
  if (d.type === 'system' && d.level === 'error') return env({ t: 'error', text: String(d.content ?? 'error') });
  return null;
}

/** Codex rollout files: session_meta on line 1 carries id + cwd, so the parser is stateful per file. */
export function createCodexParser(fallbackId = '') {
  let sessionId = fallbackId, cwd: string | undefined;
  return (line: string): Envelope | null => {
    const d = parse(line);
    const p = d?.payload;
    if (!p) return null;
    if (d.type === 'session_meta') { sessionId = p.id ?? sessionId; cwd = p.cwd; return null; }
    const env = (event: AgentEvent): Envelope | null => (sessionId ? { kind: 'codex', sessionId, at: ts(d.timestamp), cwd, event } : null);
    if (d.type === 'response_item' && (p.type === 'function_call' || p.type === 'custom_tool_call')) {
      const input = p.type === 'function_call' ? parse(p.arguments ?? '{}') : { input: p.input };
      return env({ t: 'tool', tool: p.name, summary: summarizeTool(p.name, input) });
    }
    if (d.type === 'event_msg') {
      if (p.type === 'user_message') return env({ t: 'prompt', text: p.message });
      if (p.type === 'task_complete') return env({ t: 'turn_end' });
      if (p.type === 'error' || p.type === 'stream_error') return env({ t: 'error', text: String(p.message ?? 'error') });
    }
    return null;
  };
}

/** Gemini chat files are whole JSON documents rewritten in place. */
export function parseGeminiFile(json: string): Envelope[] {
  const d = parse(json);
  if (!d?.sessionId || !Array.isArray(d.messages)) return [];
  const out: Envelope[] = [];
  for (const m of d.messages) {
    const env = (event: AgentEvent) => out.push({ kind: 'gemini', sessionId: d.sessionId, at: ts(m.timestamp), event });
    if (m.type === 'user') env({ t: 'prompt', text: textOf(m.content) });
    else if (m.type === 'gemini') {
      const calls = Array.isArray(m.toolCalls) ? m.toolCalls : [];
      if (calls.length) { const c = calls[calls.length - 1]; env(toolEvent(c.name, c.args)); }
      else env({ t: 'turn_end' });
    }
  }
  return out;
}

export function textOf(c: unknown): string {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('\n');
  return '';
}

// ---- tailer ----

const RECENT_MS = 10 * 60_000;
const INITIAL_TAIL_BYTES = 256 * 1024;

async function* walk(dir: string, depth: number): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory() && depth > 0) yield* walk(p, depth - 1);
    else if (e.isFile()) yield p;
  }
}

interface FileState { offset: number; partial: string; codex?: ReturnType<typeof createCodexParser>; mtime: number }

/**
 * Polls recently modified session logs and emits envelopes for new lines.
 * ponytail: 1s polling over three dirs; switch to fs.watch if CPU ever shows up.
 */
export function startTailers(onEnv: (e: Envelope) => void, home = homedir(), intervalMs = 1000): () => void {
  const files = new Map<string, FileState>();
  const roots: [AgentKind, string, number, RegExp][] = [
    ['claude', join(home, '.claude/projects'), 1, /\.jsonl$/],
    ['codex', join(home, '.codex/sessions'), 3, /\.jsonl$/],
    ['gemini', join(home, '.gemini/tmp'), 2, /\/chats\/session-.*\.json$/],
  ];
  let busy = false;

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const now = Date.now();
      for (const [kind, root, depth, re] of roots) {
        for await (const f of walk(root, depth)) {
          if (!re.test(f)) continue;
          const s = await stat(f).catch(() => null);
          if (!s || now - s.mtimeMs > RECENT_MS) continue;
          // One file vanishing (rotated, deleted) mid-tick must not abort the rest.
          try { await readFile(kind, f, s.size, s.mtimeMs); }
          catch (e) { files.delete(f); if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[tailer]', f, (e as Error).message); }
        }
      }
      for (const [f, st] of files) if (now - st.mtime > RECENT_MS) files.delete(f);
    } finally {
      busy = false;
    }
  }

  async function readFile(kind: AgentKind, f: string, size: number, mtime: number) {
    let st = files.get(f);
    if (kind === 'gemini') {
      if (st?.mtime === mtime) return;
      files.set(f, { offset: size, partial: '', mtime });
      const fh = await open(f, 'r');
      try { const envs = parseGeminiFile((await fh.readFile()).toString('utf8')); const last = envs.at(-1); if (last) onEnv({ ...last, transcriptPath: f }); }
      finally { await fh.close(); }
      return;
    }
    const fh = await open(f, 'r');
    try {
      if (!st) {
        const offset = Math.max(0, size - INITIAL_TAIL_BYTES);
        st = { offset, partial: '', mtime, codex: kind === 'codex' ? createCodexParser(codexIdFromName(f)) : undefined };
        if (st.codex && offset > 0) st.codex(await firstLine(fh)); // session_meta lives on line 1; a cut first line just fails to parse
        files.set(f, st);
      }
      st.mtime = mtime;
      if (size < st.offset) { st.offset = 0; st.partial = ''; } // truncated/rotated
      if (size === st.offset) return;
      const buf = Buffer.alloc(size - st.offset);
      await fh.read(buf, 0, buf.length, st.offset);
      st.offset = size;
      const chunk = st.partial + buf.toString('utf8');
      const lines = chunk.split('\n');
      st.partial = lines.pop() ?? '';
      for (const line of lines) {
        const env = kind === 'claude' ? parseClaudeLine(line) : st.codex!(line);
        if (env) onEnv({ ...env, transcriptPath: f });
      }
    } finally {
      await fh.close();
    }
  }

  const run = () => tick().catch((e) => console.error('[tailer]', e));
  run();
  const timer = setInterval(run, intervalMs);
  return () => clearInterval(timer);
}

/** session_meta can carry long instructions, so read in chunks until the first newline. */
async function firstLine(fh: FileHandle, max = 4 * 1024 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  for (let pos = 0; pos < max;) {
    const buf = Buffer.alloc(64 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, pos);
    if (!bytesRead) break;
    const nl = buf.subarray(0, bytesRead).indexOf(10);
    chunks.push(buf.subarray(0, nl < 0 ? bytesRead : nl));
    if (nl >= 0) break;
    pos += bytesRead;
  }
  return Buffer.concat(chunks).toString('utf8');
}

const codexIdFromName = (f: string) => f.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/)?.[1] ?? '';
