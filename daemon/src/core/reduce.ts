import type { AgentState, Envelope, Host, HostRef } from '../types';
import { projectOf } from '../util';

export function hostOf(ref: HostRef): Host {
  if (ref.ptyId) return 'pty';
  if (ref.tmuxPane) return 'tmux';
  if (ref.orcaPane) return 'orca';
  return 'terminal';
}

const KNOWN_TERMS = new Set(['Apple_Terminal', 'WarpTerminal', 'iTerm.app', 'ghostty', 'vscode', 'Orca']);

/** Focus is only offered when we know which terminal (ideally which tab) the agent lives in. */
export function canFocusRef(ref: HostRef): boolean {
  return !!(ref.tmuxPane || ref.orcaPane || ref.warpFocusUrl || (ref.termProgram && KNOWN_TERMS.has(ref.termProgram)));
}

/** Pure state transition. Returns null when the agent should be removed. */
export function reduce(prev: AgentState | undefined, env: Envelope, newId: () => string): AgentState | null {
  const ev = env.event;
  if (ev.t === 'session_end') return null;

  const cwd = env.cwd || prev?.cwd || '';
  const hostRef = { ...prev?.hostRef, ...stripEmpty(env.hostRef) };
  const s: AgentState = {
    id: prev?.id ?? env.sessionId,
    kind: env.kind,
    pid: env.pid || prev?.pid || 0,
    cwd,
    project: projectOf(cwd),
    host: hostOf(hostRef),
    hostRef,
    status: prev?.status ?? 'working',
    activity: prev?.activity ?? { summary: 'starting up' },
    ask: prev?.ask,
    canReply: prev?.canReply ?? false,
    canFocus: canFocusRef(hostRef),
    lastEventAt: Math.max(env.at, prev?.lastEventAt ?? 0),
    transcriptPath: env.transcriptPath || prev?.transcriptPath,
  };

  switch (ev.t) {
    case 'prompt':
      return { ...s, status: 'working', ask: undefined, activity: { summary: 'thinking…' } };
    case 'tool':
      return { ...s, status: 'working', ask: undefined, activity: { tool: ev.tool, summary: ev.summary } };
    case 'permission':
      return {
        ...s, status: 'needs_input', activity: { tool: ev.tool, summary: `wants to use ${ev.tool}` },
        ask: { id: newId(), type: 'permission', text: ev.text, options: ['Allow', 'Deny'] },
      };
    case 'question':
      return {
        ...s, status: 'needs_input', activity: { summary: 'has a question' },
        ask: { id: newId(), type: 'question', text: ev.text, options: ev.options },
      };
    case 'turn_end':
      return {
        ...s, status: 'idle', activity: { summary: 'done — what next?' },
        ask: { id: newId(), type: 'idle', text: ev.text || 'Finished. What should I do next?' },
      };
    case 'error':
      return { ...s, status: 'needs_input', activity: { summary: 'hit an error' }, ask: { id: newId(), type: 'error', text: ev.text } };
    case 'notify':
      if (ev.idle && s.status !== 'idle' && !s.ask) {
        return { ...s, status: 'idle', activity: { summary: 'done — what next?' }, ask: { id: newId(), type: 'idle', text: 'Waiting for your input.' } };
      }
      return { ...s, activity: { ...s.activity, summary: ev.text } };
  }
}

function stripEmpty(ref?: HostRef): HostRef {
  if (!ref) return {};
  return Object.fromEntries(Object.entries(ref).filter(([, v]) => v)) as HostRef;
}
