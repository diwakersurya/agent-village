/** Point `s` units along a rectangle loop (half-extents hx, hz), starting front-left, going clockwise seen from above.
 *  heading = yaw with +z as forward (three.js convention: atan2(dx, dz)). */
export function loopPoint(s: number, hx: number, hz: number): { x: number; z: number; heading: number } {
  const w = 2 * hx, d = 2 * hz, perim = 2 * (w + d);
  let t = ((s % perim) + perim) % perim;
  if (t < w) return { x: -hx + t, z: hz, heading: Math.PI / 2 };
  t -= w;
  if (t < d) return { x: hx, z: hz - t, heading: Math.PI };
  t -= d;
  if (t < w) return { x: hx - t, z: -hz, heading: -Math.PI / 2 };
  t -= w;
  return { x: -hx, z: -hz + t, heading: 0 };
}

export interface Dirt { id: number; x: number; z: number; spin: number }
let nextDirtId = 1;

/** A dirt patch at a random spot on the loop (within the vacuum's width of it), so the vacuum will drive over it. */
export function spawnDirt(hx: number, hz: number, rand: () => number = Math.random): Dirt {
  const perim = 4 * (hx + hz);
  const p = loopPoint(rand() * perim, hx, hz);
  const side = (rand() - 0.5) * 0.3; // perpendicular to travel
  return { id: nextDirtId++, x: p.x + Math.cos(p.heading) * side, z: p.z - Math.sin(p.heading) * side, spin: rand() * Math.PI * 2 };
}

/** Dirt the vacuum at (x, z) doesn't cover (pickup radius r). Returns the same array when nothing was picked. */
export function sweep(dirt: Dirt[], x: number, z: number, r: number): Dirt[] {
  const left = dirt.filter((d) => Math.hypot(d.x - x, d.z - z) > r);
  return left.length === dirt.length ? dirt : left;
}
