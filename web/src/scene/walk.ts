import { STAGE, officePlan, planBoxes, planWalls, type Box, type Viewpoint } from './office/officePlan';

/** A wall segment on the floor plane (x, z). */
export type Seg = [number, number, number, number];

export const EYE_HEIGHT = 1.6;
export const BODY_RADIUS = 0.35; // keeps the camera's near plane clear of surfaces
export const WALK_SPEED = 2.2; // units/s
export const RUN_SPEED = 4.5;
export const PERSON_RADIUS = 0.7; // agents are solid too; big enough for chibi heads leaning back in a seated pose

/** Walls, window ledge, meeting rooms, desks, pillars, lounge tables and amenities as floor segments (from the office plan). */
export interface Colliders { segs: Seg[]; boxes: Box[]; spawn: [number, number]; viewpoints: Viewpoint[]; floor: (x: number, z: number) => number }

export function officeColliders(n: number): Colliders {
  const plan = officePlan(n);
  const segs: Seg[] = [...planWalls(plan)];
  const boxes = planBoxes(plan);
  for (const b of boxes) segs.push(...boxSegs(b));
  const [sx, , sz] = plan.stage;
  // step up onto the stage: your eyes rise with it
  const floor = (x: number, z: number) => (Math.abs(x - sx) < STAGE.hw && Math.abs(z - sz) < STAGE.hd ? STAGE.h : 0);
  return { segs, boxes, spawn: plan.spawn, viewpoints: plan.viewpoints, floor };
}

function boxSegs({ cx, cz, hw, hd }: Box): Seg[] {
  const x0 = cx - hw, x1 = cx + hw, z0 = cz - hd, z1 = cz + hd;
  return [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
}

/** Pushes a circle at (x, z) out of every segment it overlaps. A few passes settle corners. */
export function resolve(x: number, z: number, segs: Seg[], r = BODY_RADIUS): [number, number] {
  for (let pass = 0; pass < 3; pass++) {
    for (const [ax, az, bx, bz] of segs) {
      const vx = bx - ax, vz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
      const px = ax + vx * t, pz = az + vz * t;
      const dx = x - px, dz = z - pz;
      const d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d > 1e-6) { x = px + (dx / d) * r; z = pz + (dz / d) * r; }
      else { x = px - (vz / Math.hypot(vx, vz)) * r; z = pz + (vx / Math.hypot(vx, vz)) * r; } // exactly on the line: push along the normal
    }
  }
  return [x, z];
}

/** Pushes (x, z) out of each agent's body circle. */
export function pushFromBodies(x: number, z: number, bodies: [number, number][], r = BODY_RADIUS + PERSON_RADIUS): [number, number] {
  for (const [bx, bz] of bodies) {
    const dx = x - bx, dz = z - bz;
    const d = Math.hypot(dx, dz);
    if (d >= r) continue;
    if (d < 1e-6) { x = bx; z = bz + r; } // dead centre: step back towards +z
    else { x = bx + (dx / d) * r; z = bz + (dz / d) * r; }
  }
  return [x, z];
}

/** Moves by input (forward/strafe in -1..1) relative to yaw (0 = looking towards -z), then collides. */
export function walkStep(x: number, z: number, yaw: number, fwd: number, strafe: number, dist: number, segs: Seg[], bodies: [number, number][] = []): [number, number] {
  const len = Math.hypot(fwd, strafe);
  if (len === 0) return resolve(...pushFromBodies(x, z, bodies), segs); // agents walk too; get out of their way
  const f = fwd / len, s = strafe / len;
  const ux = -Math.sin(yaw) * f + Math.cos(yaw) * s;
  const uz = -Math.cos(yaw) * f - Math.sin(yaw) * s;
  // sub-steps no longer than half the body so a big frame (tab switch, slow GPU) can't tunnel through a partition
  const n = Math.ceil(dist / (BODY_RADIUS / 2));
  for (let i = 0; i < n; i++) [x, z] = resolve(...pushFromBodies(x + (ux * dist) / n, z + (uz * dist) / n, bodies), segs);
  return [x, z];
}

const NEAR = 2.5; // walk up this close and the agent notices you
const LEAVE = 3.5; // hysteresis: they let you go once you're this far

/** Nearest agent within reach and roughly in front of you (so walking past someone's back doesn't grab them). */
export function nearestAgent(x: number, z: number, yaw: number, bodies: [string, number, number][], current?: string): string | undefined {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let best: string | undefined, bestD = Infinity;
  for (const [id, bx, bz] of bodies) {
    const dx = bx - x, dz = bz - z, d = Math.hypot(dx, dz);
    const limit = id === current ? LEAVE : NEAR;
    if (d > limit) continue;
    if (id !== current && d > 0.8 && (dx * fx + dz * fz) / d < 0.3) continue; // behind or well off to the side
    if (d < bestD) { best = id; bestD = d; }
  }
  return best;
}

export const TELEPORT_GAP = 2.0; // stand this far from the agent: whole person in view, still within auto-focus range

/**
 * Where to land when teleporting to an agent at (ax, az) from (fx, fz): at arm's length on the side you came from,
 * or the nearest free side (not in a wall, desk or someone else). Returns the spot and the yaw that faces the agent.
 */
export function teleportSpot(ax: number, az: number, fx: number, fz: number, segs: Seg[], boxes: Box[], others: [number, number][] = []): [number, number, number] {
  const from = Math.atan2(fx - ax, fz - az);
  const inBox = (x: number, z: number) => boxes.some((b) => Math.abs(x - b.cx) < b.hw + BODY_RADIUS && Math.abs(z - b.cz) < b.hd + BODY_RADIUS);
  const crowded = (x: number, z: number) => others.some(([ox, oz]) => Math.hypot(x - ox, z - oz) < BODY_RADIUS + PERSON_RADIUS);
  let best: [number, number] | null = null;
  for (let k = 0; k < 16 && !best; k++) {
    const a = from + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8); // alternate either side of where you came from
    const x = ax + Math.sin(a) * TELEPORT_GAP, z = az + Math.cos(a) * TELEPORT_GAP;
    const [rx, rz] = resolve(x, z, segs);
    if (Math.hypot(rx - x, rz - z) < 1e-3 && !inBox(x, z) && !crowded(x, z)) best = [x, z];
  }
  const [x, z] = best ?? [ax + Math.sin(from) * TELEPORT_GAP, az + Math.cos(from) * TELEPORT_GAP];
  return [x, z, Math.atan2(-(ax - x), -(az - z))]; // yaw 0 looks down -z
}
