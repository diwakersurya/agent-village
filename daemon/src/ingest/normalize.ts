import type { AgentEvent, AgentKind, Envelope, HostRef } from '../types';
import { summarizeTool, toolCategory } from '../core/summarize';
import { clip } from '../util';

interface Meta { pid?: number; hostRef?: HostRef; at: number }

/** Map one agent hook payload (Claude/Codex/Gemini) to a normalized envelope. */
export function normalizeHook(kind: AgentKind, p: any, meta: Meta): Envelope | null {
  if (!p || typeof p !== 'object' || !p.session_id) return null;
  const event = toEvent(p);
  if (!event) return null;
  return {
    kind, sessionId: String(p.session_id), at: meta.at, event,
    pid: meta.pid, cwd: str(p.cwd), transcriptPath: str(p.transcript_path), hostRef: meta.hostRef, toolUseId: str(p.tool_use_id),
  };
}

function toEvent(p: any): AgentEvent | null {
  const tool = String(p.tool_name ?? '');
  switch (p.hook_event_name) {
    case 'UserPromptSubmit':
    case 'BeforeAgent':
      return { t: 'prompt', text: p.prompt };
    case 'PreToolUse':
    case 'BeforeTool':
      if (tool === 'AskUserQuestion') return askQuestion(p.tool_input);
      if (tool === 'ExitPlanMode') return { t: 'question', text: `Approve plan?\n\n${String(p.tool_input?.plan ?? '').slice(0, 2000)}`, options: ['Approve', 'Keep planning'] };
      return { t: 'tool', tool, summary: summarizeTool(tool, p.tool_input) };
    case 'PostToolUse':
    case 'AfterTool':
      return { t: 'tool', tool, summary: summarizeTool(tool, p.tool_input) };
    case 'PermissionRequest':
      return { t: 'permission', tool, text: permissionText(tool, p.tool_input) };
    case 'Stop':
    case 'AfterAgent':
      return { t: 'turn_end' };
    case 'Notification': {
      const text = String(p.message ?? 'notification');
      const idle = p.notification_type === 'idle_prompt' || /waiting for your input/i.test(text);
      return idle ? { t: 'notify', text, idle } : { t: 'notify', text };
    }
    case 'SessionStart':
      return { t: 'notify', text: 'ready' };
    case 'SessionEnd':
      return { t: 'session_end' };
    default:
      return null;
  }
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

function askQuestion(input: any): AgentEvent {
  const q = input?.questions?.[0];
  const options = Array.isArray(q?.options) ? q.options.map((o: any) => String(o?.label ?? o)) : undefined;
  return { t: 'question', text: String(q?.question ?? 'The agent has a question'), options };
}

function permissionText(tool: string, input: unknown): string {
  if (toolCategory(tool) === 'bash') return summarizeTool(tool, input);
  return `${tool}: ${clip(JSON.stringify(input ?? {}), 500)}`;
}
