export type AgentKind = 'claude' | 'codex' | 'gemini';
export type Host = 'pty' | 'tmux' | 'orca' | 'terminal';
export type Status = 'working' | 'needs_input' | 'idle' | 'crashed';
export type AskType = 'permission' | 'question' | 'idle' | 'error';

export interface Ask {
  id: string;
  type: AskType;
  text: string;
  options?: string[];
}

export interface HostRef {
  tmuxPane?: string;
  orcaPane?: string; // ORCA_PANE_KEY; resolved to a terminal handle at send time
  tty?: string;
  termProgram?: string;
  ptyId?: string;
  warpFocusUrl?: string; // WARP_FOCUS_URL=warp://session/<id>
}

export interface AgentState {
  id: string;
  kind: AgentKind;
  pid: number;
  cwd: string;
  project: string;
  host: Host;
  hostRef: HostRef;
  status: Status;
  activity: { tool?: string; summary: string };
  ask?: Ask;
  canReply: boolean;
  canFocus: boolean;
  lastEventAt: number;
  transcriptPath?: string;
  crashedAt?: number;
}

export type AgentEvent =
  | { t: 'prompt'; text?: string }
  | { t: 'tool'; tool: string; summary: string }
  | { t: 'permission'; tool: string; text: string }
  | { t: 'question'; text: string; options?: string[] }
  | { t: 'turn_end'; text?: string }
  | { t: 'notify'; text: string; idle?: boolean }
  | { t: 'error'; text: string }
  | { t: 'session_end' };

export interface Envelope {
  kind: AgentKind;
  sessionId: string;
  at: number;
  event: AgentEvent;
  pid?: number;
  cwd?: string;
  transcriptPath?: string;
  hostRef?: HostRef;
  /** Claude/Codex tool_use_id — ties PostToolUse to the PermissionRequest it resolves. */
  toolUseId?: string;
}

export interface Reply {
  option?: string;
  text?: string;
}

export interface HistoryItem {
  at: number;
  role: 'user' | 'assistant' | 'tool';
  text: string;
}

export type ServerMsg =
  | { type: 'snapshot'; agents: AgentState[] }
  | { type: 'upsert'; agent: AgentState }
  | { type: 'remove'; id: string };

export interface Channels {
  canSend(a: AgentState): boolean;
  send(a: AgentState, text: string): Promise<void>;
  focus(a: AgentState): Promise<void>;
  /** The rendered terminal screen, when the host can show it (tmux, Orca). */
  screen?(a: AgentState): Promise<string[] | null>;
}

export interface CommandItem { at: number; cmd: string; output: string; running: boolean }

export type ScreenResult =
  | { source: 'screen'; lines: string[] }
  | { source: 'commands'; commands: CommandItem[] };
