import { useEffect, useState, type AnimationEvent, type TransitionEvent } from 'react';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

/** How long a closing overlay stays mounted for its exit transition (≈ --motion-base, plus slack). */
export const EXIT_MS = 220;

export type PresenceState = 'open' | 'closing';

/**
 * Keeps something mounted briefly after `open` turns false so it can play an exit transition.
 * Render while `mounted`; put `data-state={state}` on the element (CSS fades/slides `[data-state='closing']`)
 * and spread `onEnd` (unmounts as soon as the element's own transition/animation ends; EXIT_MS is the fallback).
 */
export function usePresence(open: boolean, ms = EXIT_MS) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open || !mounted) return;
    if (prefersReducedMotion()) { setMounted(false); return; }
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open, mounted, ms]);

  const done = (e: TransitionEvent | AnimationEvent) => { if (!open && e.target === e.currentTarget) setMounted(false); };
  const state: PresenceState = open ? 'open' : 'closing';
  return { mounted: open || mounted, state, onEnd: { onTransitionEnd: done, onAnimationEnd: done } };
}

/** The latest defined value, kept after it becomes undefined (so a closing overlay still has its content). */
export function useLatest<T>(v: T | undefined): T | undefined {
  const [last, setLast] = useState(v);
  if (v !== undefined && v !== last) setLast(v);
  return v ?? last;
}
