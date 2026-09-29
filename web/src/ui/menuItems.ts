import type { AgentState } from '../../../daemon/src/types';
import type { Monitor } from '../store/agents';

export type MenuItem = { key: Exclude<Monitor, 'closed'> | 'terminal'; label: string };

/** What a focused agent's beacon offers, in order (keys 1…n pick them, Enter the first). Needs-you leads with the answer. */
export function menuItems(a: AgentState): MenuItem[] {
  const items: MenuItem[] = [];
  if (a.ask) items.push({ key: 'reply', label: a.ask.type === 'permission' ? 'Answer' : 'Reply' });
  if (a.status !== 'crashed') items.push({ key: 'live', label: 'Live' });
  items.push({ key: 'history', label: 'History' });
  if (a.canFocus && a.status !== 'crashed') items.push({ key: 'terminal', label: 'Terminal' });
  return items;
}
