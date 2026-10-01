import type { AgentState } from '../../../daemon/src/types';
import type { Monitor } from '../store/agents';

/** `disabled` is the reason it can't be used right now (shown as its tooltip); disabled items stay in place, so keys 1…n don't shift. */
export type MenuItem = { key: Exclude<Monitor, 'closed'> | 'terminal'; label: string; disabled?: string };

/** What a focused agent's beacon offers, in order (keys 1…n pick them, Enter the first). Needs-you leads with the answer. */
export function menuItems(a: AgentState): MenuItem[] {
  const items: MenuItem[] = [];
  const exited = a.status === 'crashed';
  if (a.ask) items.push({ key: 'reply', label: a.ask.type === 'permission' ? 'Answer' : 'Reply' });
  items.push({ key: 'live', label: 'Live', ...(exited ? { disabled: 'Exited — no live screen' } : {}) });
  items.push({ key: 'history', label: 'History' });
  const noTerminal = exited ? 'Exited — its terminal is gone' : !a.canFocus ? 'Can’t bring this terminal forward from here' : undefined;
  items.push({ key: 'terminal', label: 'Terminal', ...(noTerminal ? { disabled: noTerminal } : {}) });
  return items;
}

/** The item Enter should run: the first one that's usable right now (an exited agent's first item, Live, isn't). */
export const defaultItem = (a: AgentState): MenuItem | undefined => menuItems(a).find((i) => !i.disabled);
