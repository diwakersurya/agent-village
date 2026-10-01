import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';
const mql = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null);

function subscribe(onChange: () => void) {
  const m = mql();
  if (!m) return () => {};
  m.addEventListener('change', onChange);
  return () => m.removeEventListener('change', onChange);
}

/** Current OS "reduce motion" setting (false where it can't be read, e.g. SSR / tests). */
export const prefersReducedMotion = () => mql()?.matches ?? false;

/** True when the user asked the OS to reduce motion; updates live when they flip the setting. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
