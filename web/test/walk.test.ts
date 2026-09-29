import { describe, expect, it } from 'vitest';
import { BODY_RADIUS, PERSON_RADIUS, TELEPORT_GAP, officeColliders, resolve, teleportSpot, walkStep, type Seg } from '../src/scene/walk';
import { officePlan, planBoxes, planWalls } from '../src/scene/office/officePlan';

const wall: Seg[] = [[-5, 0, 5, 0]]; // along x at z = 0

describe('walk', () => {
  it('walks forward (towards -z) at yaw 0 and strafes right to +x', () => {
    const [x, z] = walkStep(0, 5, 0, 1, 0, 1, []);
    expect(x).toBeCloseTo(0); expect(z).toBeCloseTo(4);
    const [x2, z2] = walkStep(0, 5, 0, 0, 1, 1, []);
    expect(x2).toBeCloseTo(1); expect(z2).toBeCloseTo(5);
  });
  it('diagonal input is not faster than straight', () => {
    const [x, z] = walkStep(0, 0, 0, 1, 1, 1, []);
    expect(Math.hypot(x, z)).toBeCloseTo(1);
  });
  it('cannot walk through a wall, stops a body radius short', () => {
    let p: [number, number] = [0, 2];
    for (let i = 0; i < 50; i++) p = walkStep(p[0], p[1], 0, 1, 0, 0.2, wall);
    expect(p[1]).toBeCloseTo(BODY_RADIUS, 5);
  });
  it('slides along a wall when walking into it at an angle', () => {
    const [x, z] = walkStep(0, 0.3, 0, 1, 1, 0.5, wall);
    expect(z).toBeCloseTo(BODY_RADIUS, 5);
    expect(x).toBeGreaterThan(0.3);
  });
  it('office colliders = walls + footprints; the floor grows with the agents', () => {
    const a = officeColliders(1), b = officeColliders(60);
    const pa = officePlan(1);
    expect(a.segs).toHaveLength(planWalls(pa).length + planBoxes(pa).length * 4);
    expect(b.segs.length).toBeGreaterThan(a.segs.length);
  });
  it('the entrance spawn spot is free', () => {
    for (const n of [1, 6, 30]) {
      const { segs, spawn } = officeColliders(n);
      expect(resolve(spawn[0], spawn[1], segs)).toEqual(spawn);
    }
  });
  it('furniture is solid: walking into every desk, pillar and table stops outside it', () => {
    const plan = officePlan(6);
    const { segs } = officeColliders(6);
    for (const b of planBoxes(plan)) {
      // approach from 2 m in front (+z side) of the box, heading straight at it
      let p: [number, number] = [b.cx, b.cz + b.hd + 2];
      for (let i = 0; i < 200; i++) p = walkStep(p[0], p[1], 0, 1, 0, 0.05, segs); // yaw 0 = towards -z
      const inside = Math.abs(p[0] - b.cx) < b.hw && Math.abs(p[1] - b.cz) < b.hd;
      expect(inside).toBe(false);
    }
  });
  it('the left outer wall stops you at its inner face plus a body radius', () => {
    const plan = officePlan(6);
    const { segs } = officeColliders(6);
    // walk left along the lounge (no meeting rooms there)
    let p: [number, number] = [plan.minX, plan.loungeZ0 + 0.8];
    for (let i = 0; i < 600; i++) p = walkStep(p[0], p[1], Math.PI / 2, 1, 0, 0.05, segs); // yaw π/2 looks at -x
    expect(p[0]).toBeCloseTo(plan.leftX + 0.075 + BODY_RADIUS, 5);
  });
  it('you can walk into a meeting room through its door but not through the glass', () => {
    const plan = officePlan(6);
    const { segs } = officeColliders(6);
    const room = plan.rooms[0];
    const walkLeft = (z: number) => {
      let p: [number, number] = [plan.glassX + 1.2, z];
      for (let i = 0; i < 200; i++) p = walkStep(p[0], p[1], Math.PI / 2, 1, 0, 0.05, segs);
      return p[0];
    };
    expect(walkLeft(room.doorZ)).toBeLessThan(plan.glassX - 1); // through the door
    expect(walkLeft((room.z0 + room.doorZ - 0.5) / 2)).toBeGreaterThan(plan.glassX); // glass holds
  });
});

describe('teleport', () => {
  it('lands at arm\'s length on the side you came from, facing the agent', () => {
    const [x, z, yaw] = teleportSpot(0, 0, 0, 10, [], []);
    expect(x).toBeCloseTo(0); expect(z).toBeCloseTo(TELEPORT_GAP);
    expect(yaw).toBeCloseTo(0); // looking down -z, at the agent
  });
  it('picks another side when that one is blocked by a desk', () => {
    const [x, z] = teleportSpot(0, 0, 0, 10, [], [{ cx: 0, cz: 1.4, hw: 1, hd: 0.3 }]);
    expect(Math.hypot(x, z)).toBeCloseTo(TELEPORT_GAP);
    expect(Math.abs(x) > 1.3 || z < 1.4 - 0.3 - BODY_RADIUS).toBe(true);
  });
  it('lands clear of every desk and wall beside a real office seat', () => {
    const n = 12, plan = officePlan(n), { segs, boxes } = officeColliders(n);
    const s = plan.seats[0];
    const [x, z] = teleportSpot(s.x, s.z, plan.spawn[0], plan.spawn[1], segs, boxes);
    const [rx, rz] = resolve(x, z, segs);
    expect(Math.hypot(rx - x, rz - z)).toBeLessThan(1e-3);
  });
});

describe('viewpoints', () => {
  it('every vantage point is free standing room (no wall, desk or table), for small and big offices', () => {
    for (const n of [1, 8, 24, 60]) {
      const { segs, boxes, viewpoints } = officeColliders(n);
      expect(viewpoints.map((v) => v.name)).toEqual(['Bean bag', 'Stage', 'Pantry', 'Meeting room']);
      for (const v of viewpoints) {
        const [rx, rz] = resolve(v.x, v.z, segs);
        expect(Math.hypot(rx - v.x, rz - v.z), `${v.name} @${n}`).toBeLessThan(1e-3);
        expect(boxes.some((b) => Math.abs(v.x - b.cx) < b.hw + BODY_RADIUS && Math.abs(v.z - b.cz) < b.hd + BODY_RADIUS), v.name).toBe(false);
      }
    }
  });
  it('standing on the stage raises your eyes', () => {
    const { viewpoints, floor } = officeColliders(8);
    const st = viewpoints.find((v) => v.name === 'Stage')!;
    expect(floor(st.x, st.z)).toBeGreaterThan(0);
    expect(floor(0, 0)).toBe(0);
  });
});
