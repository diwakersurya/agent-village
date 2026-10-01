import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { AgentKind, HostRef } from '../types';

const run = promisify(execFile);

export interface ProcInfo { pid: number; ppid: number; comm: string; args: string; tty: string; cwd?: string; env?: HostRef; transcriptPath?: string }

/** Parses `ps -axo pid=,ppid=,tty=,args=`. comm is the basename of argv[0]. */
export function parsePs(out: string): ProcInfo[] {
  const rows: ProcInfo[] = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const args = m[4].trim();
    const argv0 = args.split(' ')[0];
    rows.push({ pid: +m[1], ppid: +m[2], tty: m[3] === '??' ? '' : m[3], args, comm: argv0.split('/').pop()!.replace(/^-/, '') });
  }
  return rows;
}

const KIND_RE = /(?:^|\/)(claude|codex|gemini)(?:\.js|\.mjs|\.cjs)?$/;

export function agentKindOf(p: ProcInfo): AgentKind | null {
  if (/\/Applications\/[^/]+\.app\//.test(p.args)) return null; // desktop apps + their helpers
  const direct = p.comm.match(KIND_RE);
  if (direct) return direct[1] as AgentKind;
  if (p.comm === 'node' || p.comm === 'bun') {
    const script = p.args.split(' ')[1] ?? '';
    const m = script.match(KIND_RE);
    if (m) return m[1] as AgentKind;
  }
  return null;
}

export function findAgentAncestor(pid: number, table: Map<number, ProcInfo>): ProcInfo | null {
  let p = table.get(pid);
  for (let hops = 0; p && hops <= 5; hops++) {
    if (agentKindOf(p)) return p;
    p = table.get(p.ppid);
  }
  return null;
}

/** Parses `lsof -a -d cwd -Fn -p <pids>`. */
export function parseLsofCwd(out: string): Map<number, string> {
  const res = new Map<number, string>();
  let pid = 0;
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) pid = +line.slice(1);
    else if (line.startsWith('n') && pid) res.set(pid, line.slice(1));
  }
  return res;
}

const ENV_KEYS: Record<string, keyof HostRef> = {
  TERM_PROGRAM: 'termProgram', ORCA_PANE_KEY: 'orcaPane', TMUX_PANE: 'tmuxPane', WARP_FOCUS_URL: 'warpFocusUrl', VILLAGE_PTY_ID: 'ptyId',
};

/** Terminal handles from `ps eww` output (command followed by the process environment). */
export function parseEnvRefs(out: string): HostRef {
  const ref: HostRef = {};
  for (const m of out.matchAll(/(?:^|\s)(TERM_PROGRAM|ORCA_PANE_KEY|TMUX_PANE|WARP_FOCUS_URL|VILLAGE_PTY_ID)=(\S+)/g)) ref[ENV_KEYS[m[1]]] = m[2];
  return ref;
}

/** Claude keeps transcripts in ~/.claude/projects/<cwd with every non-alphanumeric char as '-'>/ */
export const claudeProjectDir = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, '-');

/** Newest transcript for a Claude cwd. ponytail: two sessions in one folder both get the newest; hooks give the exact one. */
export async function newestClaudeTranscript(cwd: string, home = homedir()): Promise<string | undefined> {
  const dir = join(home, '.claude/projects', claudeProjectDir(cwd));
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.jsonl'));
  let best: { f: string; m: number } | undefined;
  for (const f of files) {
    const m = (await stat(join(dir, f)).catch(() => null))?.mtimeMs ?? 0;
    if (!best || m > best.m) best = { f, m };
  }
  return best && join(dir, best.f);
}

/** Periodic scanner; keeps the last ps table so hook pids can be resolved to agent pids. */
export function createScanner() {
  let table = new Map<number, ProcInfo>();
  const cwds = new Map<number, string>();
  const envs = new Map<number, HostRef>();

  /** needsTranscript: skip the transcript lookup (readdir + stat per file) for agents that already have one. */
  async function scan(needsTranscript: (pid: number) => boolean = () => true): Promise<ProcInfo[]> {
    const { stdout } = await run('ps', ['-axo', 'pid=,ppid=,tty=,args='], { maxBuffer: 16 * 1024 * 1024 });
    const procs = parsePs(stdout);
    table = new Map(procs.map((p) => [p.pid, p]));
    const agents = procs.filter((p) => agentKindOf(p));
    const missing = agents.filter((p) => !cwds.has(p.pid)).map((p) => p.pid);
    if (missing.length) {
      const { stdout: l } = await run('lsof', ['-a', '-d', 'cwd', '-Fn', '-p', missing.join(',')]).catch((e) => ({ stdout: String(e.stdout ?? '') }));
      for (const [pid, cwd] of parseLsofCwd(l)) cwds.set(pid, cwd);
    }
    const noEnv = agents.filter((p) => !envs.has(p.pid)).map((p) => String(p.pid));
    if (noEnv.length) {
      const { stdout: e } = await run('ps', ['eww', '-o', 'pid=,command=', '-p', noEnv.join(',')], { maxBuffer: 16 * 1024 * 1024 }).catch((x) => ({ stdout: String(x.stdout ?? '') }));
      for (const line of e.split('\n')) {
        const m = line.match(/^\s*(\d+)\s+(.*)$/);
        if (m) envs.set(+m[1], parseEnvRefs(m[2]));
      }
    }
    const alive = new Set(agents.map((p) => p.pid));
    for (const pid of cwds.keys()) if (!alive.has(pid)) cwds.delete(pid);
    for (const pid of envs.keys()) if (!alive.has(pid)) envs.delete(pid);
    return Promise.all(agents.map(async (p) => {
      const cwd = cwds.get(p.pid);
      const kind = agentKindOf(p);
      return { ...p, cwd, env: envs.get(p.pid), transcriptPath: kind === 'claude' && cwd && needsTranscript(p.pid) ? await newestClaudeTranscript(cwd) : undefined };
    }));
  }

  const resolvePid = (pid: number) => findAgentAncestor(pid, table)?.pid ?? pid;

  return { scan, resolvePid };
}
