/**
 * Where to put an edge-of-screen arrow for a target at normalised device coords (x, y ∈ -1..1 when on screen).
 * `behind` = the target is behind the camera (its projection is mirrored, so flip it). null = on screen, no arrow.
 * Returns the arrow's NDC position clamped to `margin` and its angle (radians, y up).
 */
export function edgeArrow(x: number, y: number, behind: boolean, margin = 0.86): { x: number; y: number; angle: number } | null {
  if (!behind && Math.abs(x) <= 1 && Math.abs(y) <= 1) return null;
  if (behind) { x = -x; y = -y; }
  if (Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6) y = -1; // dead behind: point down ("turn around")
  const k = margin / Math.max(Math.abs(x), Math.abs(y));
  return { x: x * k, y: y * k, angle: Math.atan2(y, x) };
}

/** agentId → its arrow element (registered by ui/CompassLayer, positioned every frame by scene/WalkCompass). */
export const compassEls = new Map<string, HTMLDivElement>();
