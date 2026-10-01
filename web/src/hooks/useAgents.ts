import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../api/client';
import { useAgents } from '../store/agents';
import type { AgentState } from '../../../daemon/src/types';
import { assignSeats, seatsNeeded } from '../scene/office/seats';

/** Mount once: streams daemon state into the store (and the client's mode: live / demo / no-token). */
export function useAgentsConnection() {
  useEffect(() => {
    const { apply, setConnected, setMode } = useAgents.getState();
    setMode(api.mode);
    return api.connect(apply, setConnected, setMode);
  }, []);
}

const byProjectThenId = (a: AgentState, b: AgentState) => a.project.localeCompare(b.project) || a.id.localeCompare(b.id);

/** Agents in a stable order (so desks/slots don't shuffle as state changes). */
export function useAgentList(): AgentState[] {
  const agents = useAgents(useShallow((s) => Object.values(s.agents)));
  return useMemo(() => [...agents].sort(byProjectThenId), [agents]);
}

/** id → desk index, kept across renders and view switches so nobody changes desk when someone else joins or leaves. */
let seatMap = new Map<string, number>();

/** Stable desk per agent (see assignSeats), plus the office size that fits them all (pass to officePlan / officeColliders). */
export function useSeats(): { seatOf: ReadonlyMap<string, number>; size: number } {
  const list = useAgentList();
  return useMemo(() => {
    seatMap = assignSeats(seatMap, list.map((a) => a.id)); // idempotent for the same list, so every caller agrees
    return { seatOf: seatMap, size: seatsNeeded(seatMap) };
  }, [list]);
}

/** Agents whose status isn't filtered out (see the top bar's status toggles). */
export function useShownAgents(): AgentState[] {
  const list = useAgentList();
  const hidden = useAgents((s) => s.hiddenStatuses);
  return useMemo(() => list.filter((a) => !hidden.includes(a.status)), [list, hidden]);
}

export const isShown = (a: AgentState) => !useAgents.getState().hiddenStatuses.includes(a.status);

export function useStatusCounts() {
  const list = useAgentList();
  return useMemo(() => {
    const c = { working: 0, needs_input: 0, idle: 0, crashed: 0 };
    for (const a of list) c[a.status]++;
    return c;
  }, [list]);
}
