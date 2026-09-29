import { describe, expect, it } from 'vitest';
import { routeFromSeat, wanderSpots, type P2 } from '../src/scene/office/wander';
import { SEAT_Z, officePlan, planBoxes, planWalls, seatToWorld } from '../src/scene/office/officePlan';

const cross = (a: P2, b: P2, c: P2, d: P2) => {
  const o = (p: P2, q: P2, r: P2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
};

describe('wander routes', () => {
  for (const n of [1, 8, 24, 60]) {
    it(`never pass through a wall, desk, pillar or table (${n} agents)`, () => {
      const plan = officePlan(n);
      const walls = planWalls(plan);
      const boxes = planBoxes(plan);
      const bad: string[] = [];
      for (const seat of plan.seats.slice(0, n)) {
        for (const spot of wanderSpots(plan)) {
          const start = seatToWorld(seat, 0, SEAT_Z);
          const pts: P2[] = [start, ...routeFromSeat(plan, seat, spot)];
          for (let k = 1; k < pts.length; k++) {
            for (const [x1, z1, x2, z2] of walls) if (cross(pts[k - 1], pts[k], [x1, z1], [x2, z2])) bad.push(`${spot.name} leg ${k} vs wall`);
            for (let t = 0; t <= 1; t += 0.02) {
              const px = pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pz = pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t;
              for (const b of boxes) if (Math.abs(px - b.cx) < b.hw && Math.abs(pz - b.cz) < b.hd) bad.push(`${spot.name} leg ${k} through ${b.cx.toFixed(1)},${b.cz.toFixed(1)}`);
            }
          }
        }
      }
      expect([...new Set(bad)]).toEqual([]);
    });
  }
});

describe('office plan', () => {
  it('has a seat for every agent, empty desks to spare, and all five value pillars', () => {
    for (const n of [0, 1, 7, 24, 25, 100]) {
      const p = officePlan(n);
      expect(p.seats.length).toBeGreaterThanOrEqual(Math.max(n, 24));
      expect(p.pillars).toHaveLength(5);
      expect(new Set(p.pillars.map((q) => q.value)).size).toBe(5);
    }
  });
  it('seats face their bench: the monitor side (-z local) points at the bench centre line', () => {
    const p = officePlan(8);
    for (const s of p.seats) {
      const [mx] = seatToWorld(s, 0, -0.2); // the monitor
      expect(Math.abs(mx - p.benches[s.bench].x)).toBeLessThan(Math.abs(s.x - p.benches[s.bench].x) + 1e-9);
    }
  });
});

describe('seat order', () => {
  it('spreads the first agents over different benches, and never reuses a seat', () => {
    const p = officePlan(6);
    const firstBenches = p.seats.slice(0, p.benches.length).map((s) => s.bench);
    expect(new Set(firstBenches).size).toBe(p.benches.length);
    expect(new Set(p.seats.map((s) => `${s.x},${s.z}`)).size).toBe(p.seats.length);
  });
});
