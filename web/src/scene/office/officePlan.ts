/**
 * The office floor plan, modelled on the real office (open benching, pillars with the company values, glass meeting
 * rooms down the left, curved window wall on the right, billiards lounge at the front). Everything that draws the office,
 * collides with it in walk mode, or routes agents around it reads this one plan, so they can't drift apart.
 *
 * Seen from above, +z = front (entrance / overview camera):
 *
 *   backZ   ┌─────────────── yellow wall · photo grid ───────────────┐
 *           │ meeting │cor-│  ▯bench▯   ▯bench▯   ▯bench▯  ( windows
 *           │ rooms   │ri- │     ■ pillars in the gaps ■           (  curve
 *           │ (glass) │dor │  ▯bench▯   ▯bench▯   ▯bench▯          (  out
 *   lounge  ├─────────┴────┴──── zigzag carpet ─────────────────────  (
 *           │ pantry      billiards        ▮      table tennis  cooler
 *   frontZ  └──────────────────── entrance ──────────────────────────┘
 */
export const WALL_T = 0.15;
export const WALL_H = 3.6;
export const AMENITY_SCALE = 1.3;
export const PLANT_SCALE = 1.5;

export const SEATS_PER_SIDE = 4;
export const SEAT_PITCH = 1.8; // along the bench: elbow room between neighbours
export const BENCH_W = 1.5; // both desks, back to back
export const BENCH_PITCH = 6.0; // bench centre to centre: chairs + a ~3 m walkway between
export const ROW_GAP = 3.5;
export const BACK_GAP = 3.0;
export const FRONT_GAP = 3.0;
export const LOUNGE_D = 9;
export const CORRIDOR = 2.0;
export const ROOM_D = 4.0; // meeting room depth (x)
export const ROOM_LEN = 4.5; // meeting room length (z)
export const SEAT_Z = 0.62; // where a working agent sits, in the seat's local frame
export const PILLAR = 1.1;
export const STAGE = { hw: 1.5, hd: 1.1, h: 0.25 }; // small platform stage in the lounge's right corner

type V3 = [number, number, number];
/** Floor footprint: centre x/z and half extents. */
export type Box = { cx: number; cz: number; hw: number; hd: number };
/** Wall on the floor plane: x1, z1, x2, z2. */
export type WallSeg = [number, number, number, number];

/**
 * One desk position. Local frame (like a single desk): desk centred at the origin, monitor towards -z,
 * the person sits at +z facing -z. `rotY` turns that frame so -z points at the bench's centre line.
 */
/** A walk-mode vantage point: where you stand and the yaw you face (0 looks down -z). */
export interface Viewpoint { name: string; icon: string; x: number; z: number; yaw: number }

export interface Seat { x: number; z: number; rotY: number; side: -1 | 1; bench: number }

export interface OfficePlan {
  n: number;
  benches: { x: number; z: number; L: number }[];
  seats: Seat[];
  minX: number; maxX: number; // work area (outer aisles)
  leftX: number; glassX: number; backZ: number; loungeZ0: number; frontZ: number;
  frontGapZ: number; backGapZ: number;
  pillars: { x: number; z: number; value: number }[];
  rooms: { z0: number; z1: number; doorZ: number }[];
  billiards: V3; tableTennis: V3; bigPillar: V3;
  pantry: { pos: V3; rotY: number };
  cooler: { pos: V3; rotY: number };
  plants: V3[];
  beanbag: V3;
  stage: V3;
  /** Places to look from in walk mode: you start at a random one, and can dash to any via its marker. */
  viewpoints: Viewpoint[];
  spawn: [number, number];
  vacuum: { cx: number; cz: number; hx: number; hz: number };
  /** x of the window wall's inner face at depth z (it bows outwards mid-floor). */
  windowX: (z: number) => number;
}

/** Seat-local (lx, lz) → world (x, z). */
export function seatToWorld(s: Seat, lx: number, lz: number): [number, number] {
  const c = Math.cos(s.rotY), sn = Math.sin(s.rotY);
  return [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c];
}

export function officePlan(n: number): OfficePlan {
  const perBench = SEATS_PER_SIDE * 2;
  const needed = Math.max(1, Math.ceil(n / perBench));
  // at least 3 benches: a real office has empty desks, and it leaves room for all five value pillars
  const cols = Math.max(3, Math.ceil(Math.sqrt(needed * 1.6)));
  const rows = Math.max(1, Math.ceil(needed / cols));
  const L = SEATS_PER_SIDE * SEAT_PITCH;
  const RP = L + ROW_GAP;
  const benches: OfficePlan['benches'] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) benches.push({ x: (c - (cols - 1) / 2) * BENCH_PITCH, z: (r - (rows - 1) / 2) * RP, L });

  const minX = benches[0].x - BENCH_PITCH / 2, maxX = benches[cols - 1].x + BENCH_PITCH / 2;
  const backEnd = -((rows - 1) / 2) * RP - L / 2, frontEnd = ((rows - 1) / 2) * RP + L / 2;
  const backZ = backEnd - BACK_GAP, loungeZ0 = frontEnd + FRONT_GAP, frontZ = loungeZ0 + LOUNGE_D;
  const glassX = minX - CORRIDOR, leftX = glassX - ROOM_D;
  const windowX = (z: number) => maxX + 1.8 + 1.4 * Math.sin(((frontZ - z) / (frontZ - backZ)) * Math.PI);

  // seat order spreads agents out: one seat per bench per round (front row first), alternating sides and ends,
  // so a handful of agents sit across the floor instead of crowding one desk
  const seats: Seat[] = [];
  const order = [0, SEATS_PER_SIDE - 1, 1, SEATS_PER_SIDE - 2].filter((v, i, a) => v >= 0 && a.indexOf(v) === i);
  for (let i = 0; i < SEATS_PER_SIDE; i++) if (!order.includes(i)) order.push(i);
  for (const i of order) for (const side of [1, -1] as const) for (let r = rows - 1; r >= 0; r--) for (let c = 0; c < cols; c++) {
    const bi = r * cols + c, b = benches[bi];
    seats.push({ x: b.x + side * (BENCH_W / 4), z: b.z - L / 2 + SEAT_PITCH / 2 + i * SEAT_PITCH, rotY: side * Math.PI / 2, side, bench: bi });
  }

  // pillars stand in the gaps between bench rows, on the bench centre lines (clear of the aisles)
  const gaps = [backEnd - BACK_GAP / 2];
  for (let r = 0; r < rows - 1; r++) gaps.push(benches[r * cols].z + L / 2 + ROW_GAP / 2);
  gaps.push(frontEnd + FRONT_GAP / 2);
  const spots = gaps.flatMap((z) => benches.slice(0, cols).map((b) => ({ x: b.x, z })));
  const pick = Math.min(5, spots.length);
  const pillars = Array.from({ length: pick }, (_, k) => ({ ...spots[Math.round((k * (spots.length - 1)) / Math.max(1, pick - 1))], value: k }));

  const rooms = [];
  for (let z0 = backZ; z0 + ROOM_LEN <= loungeZ0 + 1e-6; z0 += ROOM_LEN) rooms.push({ z0, z1: z0 + ROOM_LEN, doorZ: z0 + ROOM_LEN - 0.9 });

  const W = maxX - minX;
  const A = AMENITY_SCALE;
  const tableZ = loungeZ0 + 4.2;
  const billiards: V3 = [minX + W * 0.3, 0, tableZ];
  const tableTennis: V3 = [minX + W * 0.75, 0, tableZ];
  const coolerZ = loungeZ0 + 1.4;
  const bbZ = loungeZ0 + 4.5, stageZ = loungeZ0 + 6.9;
  const beanbag: V3 = [windowX(bbZ) - 1.2, 0, bbZ];
  const stage: V3 = [windowX(stageZ) - 0.9 - STAGE.hw, 0, stageZ];
  const pantryX = leftX + WALL_T / 2 + 0.34 * A;
  const room = rooms[Math.floor(rooms.length / 2)] ?? { z0: backZ, z1: backZ + ROOM_LEN };
  // every vantage point looks towards the middle of the desks
  const vp = (name: string, icon: string, x: number, z: number): Viewpoint => ({ name, icon, x, z, yaw: Math.atan2(x, z) });
  const viewpoints = [
    vp('Bean bag', '🛋️', beanbag[0] - 1.0, bbZ + 0.4),
    vp('Stage', '🎤', stage[0], stage[2]),
    vp('Pantry', '☕', pantryX + 1.9, tableZ - 1.8),
    vp('Meeting room', '👥', (leftX + glassX) / 2, (room.z0 + room.z1) / 2),
  ];
  return {
    n, benches, seats, minX, maxX, leftX, glassX, backZ, loungeZ0, frontZ, windowX,
    frontGapZ: frontEnd + FRONT_GAP / 2, backGapZ: backEnd - BACK_GAP / 2,
    pillars, rooms, billiards, tableTennis,
    // the big plain pillar beside the billiards table (cue rack on it), clear of the entrance walk-in
    bigPillar: [billiards[0] - 3.3, 0, tableZ - 0.5],
    // pantry against the left wall of the lounge, facing into the room (+x)
    pantry: { pos: [pantryX, 0, tableZ], rotY: Math.PI / 2 },
    // water cooler by the windows, facing into the room (-x)
    cooler: { pos: [windowX(coolerZ) - 1.1, 0, coolerZ], rotY: -Math.PI / 2 },
    plants: [[leftX + 0.9, 0, frontZ - 0.9], [maxX + 0.3, 0, backZ + 0.9]],
    beanbag, stage, viewpoints,
    spawn: [(minX + maxX) / 2, frontZ - 1.2],
    // loop the outer aisles and the back/front gaps, offset past the pillars
    vacuum: { cx: (minX + maxX) / 2, cz: (backEnd - BACK_GAP / 2 + frontEnd + FRONT_GAP / 2) / 2, hx: W / 2, hz: (frontEnd - backEnd + BACK_GAP) / 2 - 1.0 },
  };
}

/** Solid footprints for walk mode (geometry in Seat/Bench/Room/Lounge/Amenities, local units × scale). */
export function planBoxes(p: OfficePlan): Box[] {
  const A = AMENITY_SCALE;
  const [px, , pz] = p.pantry.pos;
  const [cx, , cz] = p.cooler.pos;
  return [
    ...p.benches.map((b) => ({ cx: b.x, cz: b.z, hw: BENCH_W / 2, hd: b.L / 2 })),
    ...p.pillars.map((q) => ({ cx: q.x, cz: q.z, hw: PILLAR / 2, hd: PILLAR / 2 })),
    { cx: p.bigPillar[0], cz: p.bigPillar[2], hw: 0.7, hd: 0.8 },
    // tables run along x
    { cx: p.billiards[0], cz: p.billiards[2], hw: 2.0, hd: 1.1 },
    { cx: p.tableTennis[0], cz: p.tableTennis[2], hw: 1.45, hd: 0.85 },
    // pantry turned +90°: its length (counter x -1.13…1.13 + fridge …1.85) runs along -z, depth ±0.33 along x
    { cx: px, cz: pz - 0.36 * A, hw: 0.33 * A, hd: 1.49 * A },
    ...[-0.5, 0.3].map((x) => ({ cx: px + 0.75 * A, cz: pz - x * A, hw: 0.17 * A, hd: 0.17 * A })),
    { cx, cz, hw: 0.35 * A, hd: 0.35 * A },
    ...p.plants.map(([x, , z]) => ({ cx: x, cz: z, hw: 0.38 * PLANT_SCALE, hd: 0.38 * PLANT_SCALE })),
  ];
}

/** Walls: outer shell, window wall (its ledge), glass meeting rooms with a door each. */
export function planWalls(p: OfficePlan): WallSeg[] {
  const l = p.leftX + WALL_T / 2, b = p.backZ + WALL_T / 2, f = p.frontZ - WALL_T / 2;
  const right = p.windowX(p.frontZ) + 1;
  const segs: WallSeg[] = [[l, b, l, f], [l, b, p.maxX + 4, b], [l, f, right, f]];
  // window wall: its ledge seat sticks out 0.6
  for (let z = p.backZ; z < p.frontZ; z += 1) segs.push([p.windowX(z) - 0.6, z, p.windowX(Math.min(p.frontZ, z + 1)) - 0.6, Math.min(p.frontZ, z + 1)]);
  const g = p.glassX;
  let z = p.backZ;
  for (const r of p.rooms) {
    segs.push([g, z, g, r.doorZ - 0.5]);
    z = r.doorZ + 0.5;
    segs.push([p.leftX, r.z1, g, r.z1]); // wall between rooms (and after the last)
  }
  if (p.rooms.length) segs.push([g, z, g, p.rooms[p.rooms.length - 1].z1]);
  return segs;
}
