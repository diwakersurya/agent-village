import type { Ask, Reply } from '../../../daemon/src/types';

/** What Enter in the reply box sends. Asks with options need an explicit button: a bare note would Deny a permission. */
export function enterReply(ask: Ask, text: string): Reply | null {
  if (ask.options?.length) return null;
  return text.trim() ? { text } : null;
}
