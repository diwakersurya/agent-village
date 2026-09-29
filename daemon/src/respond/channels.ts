import { execFile } from 'node:child_process';
import type { AgentState, Channels } from '../types';

export type Argv = [cmd: string, ...args: string[]];

// Text always travels as an argv item (execFile, no shell) — never interpolated into a script.
const TERMINAL_SEND = `on run argv
  set theTty to "/dev/" & item 1 of argv
  tell application "Terminal"
    repeat with w in windows
      repeat with t in tabs of w
        if tty of t is theTty then
          do script (item 2 of argv) in t
          return
        end if
      end repeat
    end repeat
  end tell
end run`;

const TERMINAL_FOCUS = `on run argv
  set theTty to "/dev/" & item 1 of argv
  tell application "Terminal"
    repeat with w in windows
      repeat with t in tabs of w
        if tty of t is theTty then
          set selected of t to true
          set index of w to 1
          activate
          return
        end if
      end repeat
    end repeat
  end tell
end run`;

const APP_FOR_TERM: Record<string, string> = {
  Apple_Terminal: 'Terminal', WarpTerminal: 'Warp', 'iTerm.app': 'iTerm', ghostty: 'Ghostty', vscode: 'Visual Studio Code', Orca: 'Orca',
};

const isAppleTerminal = (a: AgentState) => a.hostRef.termProgram === 'Apple_Terminal' && !!a.hostRef.tty;
// A newline would submit a partial prompt in a TUI, so channel sends are single-line.
const oneLine = (t: string) => t.replace(/[\r\n]+/g, ' ').trim();

export function sendPlan(a: AgentState, text: string, orcaHandle?: string): Argv[] | null {
  const t = oneLine(text);
  switch (a.host) {
    case 'tmux':
      return [['tmux', 'send-keys', '-t', a.hostRef.tmuxPane!, '-l', '--', t], ['tmux', 'send-keys', '-t', a.hostRef.tmuxPane!, 'Enter']];
    case 'orca':
      // ponytail: orca's parser may read a leading '-' as a flag; a leading space is harmless in a prompt.
      return orcaHandle ? [['orca', 'terminal', 'send', '--terminal', orcaHandle, '--text', t.startsWith('-') ? ` ${t}` : t, '--enter']] : null;
    case 'terminal':
      return isAppleTerminal(a) ? [['osascript', '-e', TERMINAL_SEND, a.hostRef.tty!, t]] : null;
    default:
      return null; // pty handled by ptyWrite
  }
}

export function focusPlan(a: AgentState, orcaHandle?: string): Argv[] {
  const app = APP_FOR_TERM[a.hostRef.termProgram ?? ''];
  if (a.host === 'tmux') {
    const p = a.hostRef.tmuxPane!;
    return [['tmux', 'select-window', '-t', p], ['tmux', 'select-pane', '-t', p], ...(app ? [['open', '-a', app] as Argv] : [])];
  }
  if (a.host === 'orca') return orcaHandle ? [['orca', 'terminal', 'switch', '--terminal', orcaHandle], ['open', '-a', 'Orca']] : [['open', '-a', 'Orca']];
  if (a.hostRef.warpFocusUrl?.startsWith('warp://')) return [['open', a.hostRef.warpFocusUrl]];
  if (isAppleTerminal(a)) return [['osascript', '-e', TERMINAL_FOCUS, a.hostRef.tty!]];
  return app ? [['open', '-a', app]] : []; // unknown terminal: do nothing rather than open a random one
}

export function screenPlan(a: AgentState, orcaHandle?: string): Argv | null {
  if (a.host === 'tmux') return ['tmux', 'capture-pane', '-p', '-t', a.hostRef.tmuxPane!];
  if (a.host === 'orca' && orcaHandle) return ['orca', 'terminal', 'read', '--terminal', orcaHandle, '--screen', '--json'];
  return null;
}

export function parseScreen(via: 'tmux' | 'orca', out: string): string[] | null {
  let lines: string[];
  if (via === 'tmux') lines = out.split('\n');
  else {
    try { lines = JSON.parse(out)?.result?.terminal?.tail; } catch { return null; }
    if (!Array.isArray(lines)) return null;
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines;
}

/** Orca pane keys end with the terminal's leafId (see spike notes). */
export function orcaHandleFor(paneKey: string, list: any): string | undefined {
  const terms: any[] = list?.result?.terminals ?? [];
  return terms.find((t) => t.leafId && paneKey.endsWith(t.leafId))?.handle;
}

const defaultExec = (argv: Argv) =>
  new Promise<string>((resolve, reject) =>
    execFile(argv[0], argv.slice(1), { timeout: 10_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout))));

export function createChannels(
  exec: (argv: Argv) => Promise<string> = defaultExec,
  ptyWrite?: (id: string, text: string) => Promise<void>,
): Channels {
  const orcaHandle = async (a: AgentState) => {
    if (a.host !== 'orca' || !a.hostRef.orcaPane) return undefined;
    const out = await exec(['orca', 'terminal', 'list', '--json']).catch(() => '{}');
    try { return orcaHandleFor(a.hostRef.orcaPane, JSON.parse(out)); } catch { return undefined; }
  };

  return {
    canSend: (a) => a.host === 'tmux' || a.host === 'orca' || (a.host === 'pty' && !!ptyWrite) || isAppleTerminal(a),
    async send(a, text) {
      if (a.host === 'pty' && ptyWrite) return ptyWrite(a.hostRef.ptyId!, oneLine(text));
      const plan = sendPlan(a, text, await orcaHandle(a));
      if (!plan) throw new Error(`no reply channel for ${a.host}`);
      for (const argv of plan) await exec(argv);
    },
    async screen(a) {
      const plan = screenPlan(a, await orcaHandle(a));
      if (!plan) return null;
      return parseScreen(plan[0] as 'tmux' | 'orca', await exec(plan));
    },
    async focus(a) {
      for (const argv of focusPlan(a, await orcaHandle(a))) await exec(argv).catch(() => {});
    },
  };
}
