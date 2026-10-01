import { readFile, stat } from 'node:fs/promises';
import type { AgentKind, AgentState, CommandItem, HistoryItem } from './types';
import { summarizeTool, toolCategory } from './core/summarize';
import { textOf } from './ingest/logs';
import { clip, isEnoent, parse, readTail, ts } from './util';

const TAIL_BYTES = 2 * 1024 * 1024;
const CACHE_MAX = 64;

/** Transcript text → timeline items (newest last), capped to the last `limit`. */
export function readHistoryFrom(kind: AgentKind, raw: string, limit = 200): HistoryItem[] {
  const out: HistoryItem[] = [];
  const push = (at: number, role: HistoryItem['role'], text: string) => { if (text.trim()) out.push({ at, role, text: clip(text, 4000) }); };

  if (kind === 'gemini') {
    const d = parse(raw);
    for (const m of d?.messages ?? []) {
      const at = ts(m.timestamp);
      if (m.type === 'user') push(at, 'user', textOf(m.content));
      if (m.type === 'gemini') {
        push(at, 'assistant', textOf(m.content));
        for (const c of m.toolCalls ?? []) push(at, 'tool', summarizeTool(c.name, c.args));
      }
    }
    return out.slice(-limit);
  }

  for (const line of raw.split('\n')) {
    const d = parse(line);
    if (!d) continue;
    const at = ts(d.timestamp);
    if (kind === 'claude') {
      if (d.isMeta || d.isSidechain) continue;
      const c = d.message?.content;
      if (d.type === 'user' && !(Array.isArray(c) && c.some((b: any) => b?.type === 'tool_result'))) push(at, 'user', textOf(c));
      if (d.type === 'assistant' && Array.isArray(c)) {
        for (const b of c) {
          if (b?.type === 'text') push(at, 'assistant', b.text);
          if (b?.type === 'tool_use') push(at, 'tool', summarizeTool(b.name, b.input));
        }
      }
    } else {
      const p = d.payload;
      if (d.type === 'event_msg' && p?.type === 'user_message') push(at, 'user', String(p.message ?? ''));
      if (d.type === 'event_msg' && p?.type === 'agent_message') push(at, 'assistant', String(p.message ?? ''));
      if (d.type === 'response_item' && (p?.type === 'function_call' || p?.type === 'custom_tool_call')) {
        push(at, 'tool', summarizeTool(p.name, p.type === 'function_call' ? parse(p.arguments ?? '{}') : {}));
      }
    }
  }
  return out.slice(-limit);
}

const OUTPUT_LINES = 80;
const tailLines = (s: string) => s.split('\n').slice(-OUTPUT_LINES).join('\n');
const resultText = (c: unknown) => (typeof c === 'string' ? c : textOf(c));

/** Shell commands the agent ran, paired with their output (tail); a command with no output yet is still running. */
export function readCommandsFrom(kind: AgentKind, raw: string, limit = 30): CommandItem[] {
  const out: CommandItem[] = [];
  const byId = new Map<string, CommandItem>();
  for (const line of raw.split('\n')) {
    const d = parse(line);
    if (!d || d.isSidechain) continue;
    if (kind === 'claude') {
      for (const b of Array.isArray(d.message?.content) ? d.message.content : []) {
        if (b?.type === 'tool_use' && toolCategory(b.name) === 'bash' && b.input?.command) {
          const c = { at: ts(d.timestamp), cmd: String(b.input.command), output: '', running: true };
          byId.set(b.id, c); out.push(c);
        } else if (b?.type === 'tool_result' && byId.has(b.tool_use_id)) {
          Object.assign(byId.get(b.tool_use_id)!, { output: tailLines(resultText(b.content)), running: false });
        }
      }
    } else if (kind === 'codex') {
      const p = d.payload;
      if (d.type === 'response_item' && p?.type === 'function_call' && toolCategory(p.name) === 'bash') {
        const args = parse(p.arguments ?? '{}') ?? {};
        const cmd = args.cmd ?? args.command;
        if (!cmd) continue;
        const c = { at: ts(d.timestamp), cmd: Array.isArray(cmd) ? cmd.join(' ') : String(cmd), output: '', running: true };
        byId.set(p.call_id, c); out.push(c);
      } else if (d.type === 'response_item' && p?.type === 'function_call_output' && byId.has(p.call_id)) {
        Object.assign(byId.get(p.call_id)!, { output: tailLines(resultText(p.output)), running: false });
      }
    }
  }
  return out.slice(-limit);
}

const cmdCache = new Map<string, { key: string; items: CommandItem[] }>();

/** Transcript gone (rotated/deleted) reads as empty, not an error. */
const orEmpty = <T>(e: unknown): T[] => { if (isEnoent(e)) return []; throw e; };

export async function readCommands(a: AgentState): Promise<CommandItem[]> {
  if (!a.transcriptPath || a.kind === 'gemini') return [];
  const path = a.transcriptPath;
  try {
    const { size, mtimeMs } = await stat(path);
    const key = `${size}:${mtimeMs}`;
    const hit = cmdCache.get(path);
    if (hit?.key === key) return hit.items; // polled every second while the monitor is open
    const items = readCommandsFrom(a.kind, (await readTail(path, TAIL_BYTES)).text);
    cmdCache.delete(path);
    cmdCache.set(path, { key, items });
    if (cmdCache.size > CACHE_MAX) cmdCache.delete(cmdCache.keys().next().value!); // oldest insert
    return items;
  } catch (e) {
    cmdCache.delete(path);
    return orEmpty(e);
  }
}

/** Reads only the last `maxBytes` of JSONL transcripts (they grow to tens of MB); Gemini files are whole JSON docs. */
export async function readHistory(a: AgentState, limit = 200, maxBytes = TAIL_BYTES): Promise<HistoryItem[]> {
  if (!a.transcriptPath) return [];
  try {
    const raw = a.kind === 'gemini' ? await readFile(a.transcriptPath, 'utf8') : (await readTail(a.transcriptPath, maxBytes)).text;
    return readHistoryFrom(a.kind, raw, limit);
  } catch (e) {
    return orEmpty(e);
  }
}

export const _cmdCacheSize = () => cmdCache.size;
