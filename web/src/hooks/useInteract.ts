import { useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useHoverCursor } from './useHoverCursor';

/**
 * Props that make a group usable: click it in the overview, or aim the crosshair at it and click in walk mode
 * (WalkControls calls userData.interact, if you're close enough).
 */
export function useInteract(fn: () => void) {
  const latest = useRef(fn);
  latest.current = fn;
  const hover = useHoverCursor();
  return useMemo(() => ({
    userData: { interact: () => latest.current() },
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); latest.current(); },
    ...hover,
  }), [hover]);
}

/** Press-and-hold target: `down` on press, `up` on release (e.g. charge a pool shot, swing a bat). */
export interface Hold { down(): void; up(): void }

/** Props for a press-and-hold group: pointer down/up in the overview, or WalkControls (userData.hold) in walk mode, within reach. */
export function useHold(hold: Hold) {
  const latest = useRef(hold);
  latest.current = hold;
  const hover = useHoverCursor();
  return useMemo(() => ({
    userData: { hold: { down: () => latest.current.down(), up: () => latest.current.up() } },
    onPointerDown: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); latest.current.down(); },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); latest.current.up(); },
    ...hover,
  }), [hover]);
}
