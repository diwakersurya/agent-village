/**
 * Billiards physics on the table plane, in the table's own frame: x across (±W/2), z along (±L/2), metres.
 * Balls roll with friction, collide elastically (equal mass), bounce off cushions and drop into six pockets.
 */
export const POOL_W = 1.8, POOL_L = 3.5, BALL_R = 0.035;
const POCKET_R = 0.09;
const FRICTION = 0.6; // m/s² rolling deceleration
const CUSHION = 0.78; // speed kept off a cushion
export const MAX_SHOT = 4.5; // m/s at full power
export const POCKETS: [number, number][] = [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * POOL_W / 2, sz * POOL_L / 2]);

export interface PoolBall { x: number; z: number; vx: number; vz: number; color: string; cue?: boolean; potted?: boolean }
export type PoolEvent = { type: 'hit' | 'cushion'; x: number; z: number; speed: number } | { type: 'pot'; x: number; z: number; cue: boolean };

const CUE_SPOT: [number, number] = [0.18, 1.3];

/** Reds in a triangle, colours on their spots, cue ball in the baulk (same layout the table always showed). */
export function rack(): PoolBall[] {
  const b: PoolBall[] = [];
  const add = (x: number, z: number, color: string, cue = false) => b.push({ x, z, vx: 0, vz: 0, color, ...(cue ? { cue } : {}) });
  add(CUE_SPOT[0], CUE_SPOT[1], '#fafaf9', true);
  for (let row = 0; row < 5; row++) for (let i = 0; i <= row; i++) add((i - row / 2) * BALL_R * 2.05, -0.9 - row * BALL_R * 1.8, '#b91c1c');
  add(-0.3, 1.05, '#facc15'); add(0.3, 1.05, '#16a34a'); add(0, 1.05, '#78350f');
  add(0, 0, '#2563eb'); add(0, -0.7, '#ec4899'); add(0, -1.4, '#0a0a0a');
  return b;
}

export const moving = (balls: PoolBall[]) => balls.some((b) => !b.potted && (b.vx !== 0 || b.vz !== 0));

/** Strike the cue ball along (dx, dz) with power 0..1. */
export function shoot(balls: PoolBall[], dx: number, dz: number, power: number) {
  const c = balls.find((b) => b.cue);
  const d = Math.hypot(dx, dz);
  if (!c || c.potted || !d) return;
  const v = Math.max(0.05, Math.min(1, power)) * MAX_SHOT;
  c.vx = (dx / d) * v; c.vz = (dz / d) * v;
}

/** Advance dt seconds (sub-stepped so fast balls don't tunnel). Mutates balls; returns what happened, for sounds. */
export function step(balls: PoolBall[], dt: number): PoolEvent[] {
  const ev: PoolEvent[] = [];
  const live = balls.filter((b) => !b.potted);
  const n = Math.max(1, Math.ceil((dt * MAX_SHOT) / (BALL_R * 0.5)));
  const h = dt / n;
  for (let s = 0; s < n; s++) {
    for (const b of live) {
      if (b.potted) continue;
      const sp = Math.hypot(b.vx, b.vz);
      if (!sp) continue;
      const ns = Math.max(0, sp - FRICTION * h);
      if (ns < 0.01) { b.vx = 0; b.vz = 0; continue; }
      b.vx *= ns / sp; b.vz *= ns / sp;
      b.x += b.vx * h; b.z += b.vz * h;
      for (const [px, pz] of POCKETS) {
        if (Math.hypot(b.x - px, b.z - pz) < POCKET_R) { b.potted = true; b.vx = 0; b.vz = 0; ev.push({ type: 'pot', x: px, z: pz, cue: !!b.cue }); break; }
      }
      if (b.potted) continue;
      const mx = POOL_W / 2 - BALL_R, mz = POOL_L / 2 - BALL_R;
      if (Math.abs(b.x) > mx) { b.x = Math.sign(b.x) * mx; b.vx = -b.vx * CUSHION; b.vz *= CUSHION; ev.push({ type: 'cushion', x: b.x, z: b.z, speed: Math.abs(b.vx) }); }
      if (Math.abs(b.z) > mz) { b.z = Math.sign(b.z) * mz; b.vz = -b.vz * CUSHION; b.vx *= CUSHION; ev.push({ type: 'cushion', x: b.x, z: b.z, speed: Math.abs(b.vz) }); }
    }
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (a.potted || b.potted) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= BALL_R * 2 || d === 0) continue;
      const nx = dx / d, nz = dz / d;
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      // separate, then swap the velocity components along the line of centres (equal masses, elastic)
      const push = (BALL_R * 2 - d) / 2;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      if (rel <= 0) continue;
      a.vx -= rel * nx; a.vz -= rel * nz; b.vx += rel * nx; b.vz += rel * nz;
      ev.push({ type: 'hit', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, speed: rel });
    }
  }
  return ev;
}

/** Once everything has stopped: a potted cue ball comes back to its spot; a cleared table re-racks. Returns true if it changed anything. */
export function settle(balls: PoolBall[]): boolean {
  if (moving(balls)) return false;
  if (balls.every((b) => b.cue || b.potted)) { balls.splice(0, balls.length, ...rack()); return true; }
  const c = balls.find((b) => b.cue);
  if (c?.potted) {
    c.potted = false; [c.x, c.z] = CUE_SPOT;
    // don't drop it on top of another ball
    while (balls.some((b) => b !== c && !b.potted && Math.hypot(b.x - c.x, b.z - c.z) < BALL_R * 2.2)) c.x -= BALL_R * 2.5;
    return true;
  }
  return false;
}
