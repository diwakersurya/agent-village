import { useEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';

/**
 * Pointer-cursor hover props for a clickable 3D object. Resets the cursor if the object unmounts while hovered
 * (an agent leaving, a view switch), so the page isn't left with a stuck pointer. `stop` keeps the hover from
 * reaching objects behind / around it.
 */
export function useHoverCursor(stop = true) {
  const hovered = useRef(false);
  useEffect(() => () => { if (hovered.current) document.body.style.cursor = ''; }, []);
  return useMemo(() => ({
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { if (stop) e.stopPropagation(); hovered.current = true; document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { hovered.current = false; document.body.style.cursor = ''; },
  }), [stop]);
}
