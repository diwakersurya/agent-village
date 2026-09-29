import { AMENITY_SCALE, BENCH_PITCH, SEAT_Z, seatToWorld, type OfficePlan, type Seat } from './officePlan';

export type P2 = [number, number];
export interface Spot { name: string; pos: P2; face: number }

/** Places an idle agent might wander to, and which way they face when there (yaw, +z = 0). */
export function wanderSpots(p: OfficePlan): Spot[] {
  const [px, , pz] = p.pantry.pos;
  const [cx, , cz] = p.cooler.pos;
  const midZ = (p.backZ + p.loungeZ0) / 2;
  return [
    { name: 'water cooler', pos: [cx - 0.9, cz], face: Math.PI / 2 },
    // in front of the coffee machine (pantry local x -0.25 → world z pz + 0.25·scale)
    { name: 'pantry', pos: [px + 1.55, pz + 0.25 * AMENITY_SCALE], face: -Math.PI / 2 },
    // billiards: at the cushion on the side facing the desks; table tennis: at the end
    { name: 'billiards', pos: [p.billiards[0] + 0.6, p.billiards[2] - 1.6], face: 0 },
    { name: 'table tennis', pos: [p.tableTennis[0] - 1.95, p.tableTennis[2]], face: Math.PI / 2 },
    { name: 'window', pos: [p.windowX(midZ) - 1.2, midZ], face: Math.PI / 2 },
  ];
}

/**
 * Waypoints from a seat to a spot, walking the aisles so nobody passes through a desk or pillar:
 * push the chair back into the aisle beside the bench → down that aisle to the lounge edge →
 * across the lounge edge → (the window spot goes up the outer right aisle instead) → the spot.
 */
export function routeFromSeat(p: OfficePlan, seat: Seat, spot: Spot): P2[] {
  const b = p.benches[seat.bench];
  const aisleX = b.x + seat.side * (BENCH_PITCH / 2);
  const [, sz] = seatToWorld(seat, 0, SEAT_Z);
  const edge = p.loungeZ0 + 0.8; // lounge edge: past the front pillars, before the tables and pantry
  const route: P2[] = [[aisleX, sz], [aisleX, edge]];
  if (spot.name === 'window') route.push([p.maxX, edge], [p.maxX, spot.pos[1]]);
  else route.push([spot.pos[0], edge]);
  route.push(spot.pos);
  return route;
}

export const pathLength = (pts: P2[]) => pts.slice(1).reduce((d, q, i) => d + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
