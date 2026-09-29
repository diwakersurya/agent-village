import { useAgents } from '../store/agents';

export function useSelectedAgent() {
  return useAgents((s) => (s.selectedId ? s.agents[s.selectedId] : undefined));
}
