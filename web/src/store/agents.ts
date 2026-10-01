import { create } from 'zustand';
import type { AgentState, ServerMsg, Status } from '../../../daemon/src/types';
import type { ClientMode } from '../api/client';

export type View = 'office' | 'village';
export interface Playmate { game: 'pool' | 'tt'; id: string; x: number; z: number; face: number }
/** The one overlay open for the selected agent (chosen from its beacon menu); while open, you can't move. */
export type Monitor = 'closed' | 'live' | 'history' | 'reply';

interface AgentsStore {
  agents: Record<string, AgentState>;
  selectedId?: string;
  view: View;
  connected: boolean;
  /** A snapshot has arrived since the last (re)connect: until then an empty agent list means "don't know yet". */
  hydrated: boolean;
  /** Which client is behind the scene: live daemon, opted-in demo, or not connected (no / rejected token). */
  mode: ClientMode;
  /** The selected agent's open overlay. */
  monitor: Monitor;
  listOpen: boolean;
  /** First-person walk mode, and whether the mouse is captured in it. */
  walk: boolean;
  /** Walk mode: the agent you walked up to (auto-selected), and a counter bumped each time one greets you. */
  nearbyId?: string;
  greet?: { id: string; n: number };
  /** Short message at the bottom of the screen (e.g. "Coffee's ready"). */
  toast?: { text: string; id: number };
  helpOpen: boolean;
  /** Bumped on each walk-mode teleport: plays the flash overlay. */
  dashN: number;
  /** An idle agent called over to play with you at a game table (and where they stand / face there). */
  playmate?: Playmate;
  /** Walk mode: focusing from the list / keyboard asks WalkControls to teleport there (it selects on arrival). */
  teleportReq?: { id: string; n: number };
  /** Statuses filtered out of the scene (and its sounds) to cut the noise; remembered across reloads. */
  hiddenStatuses: Status[];
  /** Bumped to ask the camera to fly to the selection / reset the framing. */
  focusNonce: number;
  resetNonce: number;
  /** agentId → askId we already answered (bubble shows "sent" until the ask changes). */
  sent: Record<string, string>;
  apply(m: ServerMsg): void;
  /** Select (focus) an agent; its overlays open from the beacon menu via openMonitor. */
  select(id?: string): void;
  openMonitor(id: string, m?: Exclude<Monitor, 'closed'>): void;
  setMonitor(m: Monitor): void;
  setView(v: View): void;
  setConnected(b: boolean): void;
  setMode(m: ClientMode): void;
  toggleList(): void;
  /** From the agent list / keyboard: select, fly the camera there (walk mode: teleport there), close the list. */
  focusAgent(id: string): void;
  markSent(id: string, askId: string): void;
  toggleHelp(): void;
  flyToSelected(): void;
  resetView(): void;
  setWalk(on: boolean): void;
  showToast(text: string): void;
  /** Walk mode proximity: focus + greet the agent you're next to (undefined = walked away). Never overrides a selection you made. */
  setNearby(id?: string): void;
  toggleStatus(s: Status): void;
  dashed(): void;
  setPlaymate(p?: Playmate): void;
}

const readView = (): View => {
  const fromUrl = new URLSearchParams(location.search).get('view');
  if (fromUrl === 'office' || fromUrl === 'village') return fromUrl;
  try { return localStorage.getItem('village.view') === 'village' ? 'village' : 'office'; } catch { return 'office'; }
};

const HIDDEN_KEY = 'village.hiddenStatuses';
const readHidden = (): Status[] => {
  try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]') as Status[]; } catch { return []; }
};

const CLEARED = { selectedId: undefined, monitor: 'closed' as Monitor };

const bump = (g: AgentsStore['greet'], id: string) => ({ id, n: (g?.n ?? 0) + 1 });

export const useAgents = create<AgentsStore>((set) => ({
  agents: {},
  view: typeof window === 'undefined' ? 'office' : readView(),
  connected: false,
  hydrated: false,
  mode: 'live', // set from the client on mount (useAgentsConnection)
  monitor: 'closed',
  listOpen: false,
  // walk mode is the landing experience; ?walk=0 opens the overview instead
  walk: typeof window === 'undefined' ? false : new URLSearchParams(location.search).get('walk') !== '0',
  helpOpen: false,
  dashN: 0,
  hiddenStatuses: typeof window === 'undefined' ? [] : readHidden(),
  focusNonce: 0,
  resetNonce: 0,
  sent: {},

  apply: (m) => set((s) => {
    if (m.type === 'snapshot') {
      const agents = Object.fromEntries(m.agents.map((a) => [a.id, a]));
      return { agents, hydrated: true, ...(s.selectedId && !agents[s.selectedId] ? CLEARED : {}) };
    }
    if (m.type === 'remove') {
      const { [m.id]: _, ...agents } = s.agents;
      const { [m.id]: __, ...sent } = s.sent;
      return { agents, sent, ...(s.selectedId === m.id ? CLEARED : {}) };
    }
    const sent = { ...s.sent };
    if (sent[m.agent.id] && sent[m.agent.id] !== m.agent.ask?.id) delete sent[m.agent.id];
    return { agents: { ...s.agents, [m.agent.id]: m.agent }, sent };
  }),
  select: (id) => set((s) => (!id ? { ...CLEARED, nearbyId: undefined } : id === s.selectedId ? { nearbyId: undefined } : { selectedId: id, monitor: 'closed', nearbyId: undefined, greet: bump(s.greet, id) })),
  openMonitor: (id, monitor = 'live') => set({ selectedId: id, monitor }),
  setMonitor: (monitor) => set({ monitor }),
  setView: (view) => {
    try { localStorage.setItem('village.view', view); } catch { /* storage blocked */ }
    set({ view });
  },
  setConnected: (connected) => set(connected ? { connected } : { connected, hydrated: false }),
  // a rejected token: the live agents are gone, not just offline
  setMode: (mode) => set((s) => (mode === s.mode ? {} : { mode, ...(mode === 'no-token' ? { agents: {}, sent: {}, ...CLEARED } : {}) })),
  toggleList: () => set((s) => ({ listOpen: !s.listOpen })),
  focusAgent: (id) => set((s) => s.walk
    ? { teleportReq: bump(s.teleportReq, id), monitor: 'closed', listOpen: false }
    : ({ selectedId: id, monitor: 'closed', listOpen: false, focusNonce: s.focusNonce + 1, greet: bump(s.greet, id) })),
  markSent: (id, askId) => set((s) => ({ sent: { ...s.sent, [id]: askId } })),
  toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
  flyToSelected: () => set((s) => ({ focusNonce: s.focusNonce + 1 })),
  resetView: () => set((s) => ({ resetNonce: s.resetNonce + 1 })),
  // leaving walk mode re-frames the orbit camera
  setWalk: (walk) => set((s) => (walk === s.walk ? {} : { walk, listOpen: false, ...(walk ? {} : { resetNonce: s.resetNonce + 1 }) })),
  setNearby: (id) => set((s) => {
    if (id === s.nearbyId) return {};
    const ours = !s.selectedId || s.selectedId === s.nearbyId; // the current selection is one we made (or none)
    if (!id) return { nearbyId: undefined, ...(ours && s.monitor === 'closed' ? { selectedId: undefined } : {}) };
    if (!ours || s.monitor !== 'closed') return { nearbyId: undefined };
    return { nearbyId: id, selectedId: id, greet: bump(s.greet, id) };
  }),
  setPlaymate: (playmate) => set({ playmate }),
  dashed: () => set((s) => ({ dashN: s.dashN + 1 })),
  toggleStatus: (st) => set((s) => {
    const hiddenStatuses = s.hiddenStatuses.includes(st) ? s.hiddenStatuses.filter((x) => x !== st) : [...s.hiddenStatuses, st];
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(hiddenStatuses)); } catch { /* storage blocked */ }
    const sel = s.selectedId ? s.agents[s.selectedId] : undefined;
    return { hiddenStatuses, ...(sel && hiddenStatuses.includes(sel.status) ? CLEARED : {}) };
  }),
  showToast: (text) => set((s) => ({ toast: { text, id: (s.toast?.id ?? 0) + 1 } })),
}));
