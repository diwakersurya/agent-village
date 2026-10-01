import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { AgentState, Envelope, HostRef } from '../types';
import type { ProcInfo } from '../ingest/procscan';
import { agentKindOf } from '../ingest/procscan';
import { reduce, hostOf, canFocusRef } from './reduce';
import { projectOf } from '../util';

const CRASH_TTL_MS = 10 * 60_000;

/** Terminal handles from a scan; `keep` (what hooks already sent) wins. */
const procRef = (p: ProcInfo, keep?: HostRef): HostRef => ({ ...(p.tty ? { tty: p.tty } : {}), ...p.env, ...keep });

export interface RegistryOpts {
  /** Whether a reply channel exists independent of a held hook. */
  canReply: (a: AgentState) => boolean;
}

/** In-memory agent map. Emits 'upsert' (AgentState) and 'remove' (id). */
export class Registry extends EventEmitter {
  protected agents = new Map<string, AgentState>();
  private held = new Set<string>();
  /** Agents that have sent hook events; their log lines are ignored (hooks are richer + real-time). */
  private hooked = new Set<string>();

  constructor(protected opts: RegistryOpts) {
    super();
  }

  /** keepAsk: record activity but keep a pending (held) ask and its needs_input status. */
  apply(env: Envelope, opts: { keepAsk?: boolean } = {}): AgentState | null {
    this.hooked.add(env.sessionId);
    const prev = this.agents.get(env.sessionId) ?? this.takeOverPid(env);
    if (opts.keepAsk && prev?.ask) {
      const next = reduce(prev, env, randomUUID);
      return next && this.put({ ...next, status: prev.status, ask: prev.ask });
    }
    return this.reduceInto(env, prev);
  }

  /** Log-derived envelope: only for agents without hooks. May adopt a matching placeholder. */
  applyLog(env: Envelope): AgentState | null {
    if (this.hooked.has(env.sessionId)) {
      // Hooks carry no API errors, so let those through — unless the agent is already waiting on something.
      const a = this.agents.get(env.sessionId);
      if (env.event.t !== 'error' || !a || a.ask) return null;
    }
    return this.reduceInto(env, this.agents.get(env.sessionId) ?? this.takeOverPlaceholder(env));
  }

  private takeOverPlaceholder(env: Envelope): AgentState | undefined {
    const ph = this.all().find((a) => a.id.startsWith('pid:') && a.kind === env.kind && !!env.cwd && a.cwd === env.cwd);
    if (!ph) return undefined;
    this.remove(ph.id);
    return { ...ph, id: env.sessionId };
  }

  private reduceInto(env: Envelope, prev: AgentState | undefined): AgentState | null {
    const next = reduce(prev, env, randomUUID);
    if (!next) {
      if (prev) this.remove(prev.id);
      return null;
    }
    return this.put(next);
  }

  /** A new session on a pid replaces whatever was on that pid (placeholder, or a pre-/clear session). */
  private takeOverPid(env: Envelope): AgentState | undefined {
    if (!env.pid) return undefined;
    const old = this.all().find((a) => a.pid === env.pid && a.id !== env.sessionId);
    if (!old) return undefined;
    this.remove(old.id);
    return { ...old, id: env.sessionId, ask: undefined };
  }

  /** Reconcile with a process scan: add placeholders for unseen agents, crash vanished ones. */
  syncProcs(procs: ProcInfo[], now: number) {
    const alive = new Set(procs.map((p) => p.pid));
    // Fill in terminal handles hooks didn't send (e.g. WARP_FOCUS_URL, or agents without hooks).
    for (const p of procs) {
      const a = this.all().find((x) => x.pid === p.pid);
      if (!a) continue;
      const hostRef = procRef(p, a.hostRef);
      const transcriptPath = a.transcriptPath ?? p.transcriptPath;
      if (Object.keys(hostRef).length !== Object.keys(a.hostRef).length || transcriptPath !== a.transcriptPath) this.put({ ...a, hostRef, host: hostOf(hostRef), transcriptPath });
    }
    const known = new Set(this.all().map((a) => a.pid));
    for (const p of procs) {
      const kind = agentKindOf(p);
      if (!kind || known.has(p.pid)) continue;
      const orphan = this.all().find((a) => !a.pid && a.kind === kind && a.cwd && a.cwd === p.cwd);
      if (orphan) {
        const hostRef = procRef(p, orphan.hostRef);
        this.put({ ...orphan, pid: p.pid, hostRef, host: hostOf(hostRef) });
        continue;
      }
      const hostRef = procRef(p);
      const cwd = p.cwd ?? '';
      this.put({
        id: `pid:${p.pid}`, kind, pid: p.pid, cwd, project: projectOf(cwd) || kind,
        host: hostOf(hostRef), hostRef, status: 'idle', activity: { summary: 'watching…' }, transcriptPath: p.transcriptPath, lastEventAt: now,
      });
    }
    for (const a of this.all()) {
      if (!a.pid || alive.has(a.pid) || a.status === 'crashed') continue;
      if (a.id.startsWith('pid:')) this.remove(a.id);
      else this.put({ ...a, status: 'crashed', crashedAt: now, ask: undefined, activity: { summary: 'exited' } });
    }
  }

  sweep(now: number) {
    for (const a of this.all()) {
      if (a.crashedAt && now - a.crashedAt > CRASH_TTL_MS) this.remove(a.id);
      else if (!a.pid && now - a.lastEventAt > CRASH_TTL_MS) this.remove(a.id); // stale log-only session
    }
  }

  get(id: string) { return this.agents.get(id); }
  all() { return [...this.agents.values()]; }

  patch(id: string, p: Partial<AgentState>) {
    const a = this.agents.get(id);
    if (a) this.put({ ...a, ...p });
  }

  /** Mark whether a hook for this agent is currently held open (enables reply). */
  setHeld(id: string, held: boolean) {
    if (held) this.held.add(id); else this.held.delete(id);
    const a = this.agents.get(id);
    if (a) this.put(a);
  }

  /** canFocus/canReply are derived here, never taken from the caller. */
  protected put(a: Omit<AgentState, 'canFocus' | 'canReply'>): AgentState {
    // Permission/question asks can only be answered through a held hook: typing into the agent's own
    // menu would press Enter on its default choice. Idle/error asks can also go through a channel.
    const typed = a.ask?.type === 'idle' || a.ask?.type === 'error';
    const withReply: AgentState = { ...a, canFocus: canFocusRef(a.hostRef), canReply: false };
    withReply.canReply = !!a.ask && (this.held.has(a.id) || (typed && this.opts.canReply(withReply)));
    this.agents.set(a.id, withReply);
    this.emit('upsert', withReply);
    return withReply;
  }

  protected remove(id: string) {
    this.held.delete(id);
    this.hooked.delete(id);
    if (this.agents.delete(id)) this.emit('remove', id);
  }
}
