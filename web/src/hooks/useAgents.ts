import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../api/client';
import { useAgents } from '../store/agents';
import type { AgentState } from '../../../daemon/src/types';

/** Mount once: streams daemon state into the store. */
export function useAgentsConnection() {
  useEffect(() => {
    const { apply, setConnected } = useAgents.getState();
    return api.connect(apply, setConnected);
  }, []);
}

const byProjectThenId = (a: AgentState, b: AgentState) => a.project.localeCompare(b.project) || a.id.localeCompare(b.id);

/** Agents in a stable order (so desks/slots don't shuffle as state changes). */
export function useAgentList(): AgentState[] {
  const agents = useAgents(useShallow((s) => Object.values(s.agents)));
  return useMemo(() => [...agents].sort(byProjectThenId), [agents]);
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
