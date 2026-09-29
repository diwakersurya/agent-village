import { describe, expect, it } from 'vitest';
import { BALL_R, POOL_L, POOL_W, moving, rack, settle, shoot, step, type PoolBall } from '../src/scene/games/pool';

const run = (balls: PoolBall[], secs = 15) => { const ev = []; for (let t = 0; t < secs && (t === 0 || moving(balls)); t += 1 / 60) ev.push(...step(balls, 1 / 60)); return ev; };
const ball = (x: number, z: number, p: Partial<PoolBall> = {}): PoolBall => ({ x, z, vx: 0, vz: 0, color: '#fff', ...p });

describe('pool', () => {
  it('a straight hit passes the speed on (equal masses) and everything comes to rest', () => {
    const b = [ball(0, 0.5, { cue: true }), ball(0, 0)];
    shoot(b, 0, -1, 0.3);
    const ev = run(b);
    expect(ev.some((e) => e.type === 'hit')).toBe(true);
    expect(b[0].z).toBeGreaterThan(b[1].z); // cue ball stops behind, the object ball goes on
    expect(Math.abs(b[0].z - 0.5)).toBeLessThan(0.5); // cue stopped near the contact point
    expect(moving(b)).toBe(false);
  });
  it('pots a ball rolled at a corner pocket', () => {
    const b = [ball(-POOL_W / 2 + 0.3, -POOL_L / 2 + 0.3, { cue: true })];
    shoot(b, -1, -1, 0.3);
    const ev = run(b);
    expect(ev.find((e) => e.type === 'pot')).toMatchObject({ cue: true });
    expect(b[0].potted).toBe(true);
    expect(settle(b)).toBe(true); // only the cue left: re-rack
    expect(b.length).toBe(rack().length);
  });
  it('bounces off a cushion and stays on the table', () => {
    const b = [ball(0, 0, { cue: true })];
    shoot(b, 1, 0.5, 0.5); // clear of the middle pocket
    const ev = run(b);
    expect(ev.some((e) => e.type === 'cushion')).toBe(true);
    expect(Math.abs(b[0].x)).toBeLessThanOrEqual(POOL_W / 2 - BALL_R + 1e-9);
  });
  it('a potted cue ball is respotted once the table is still', () => {
    const b = [ball(0, 0, { cue: true, potted: true }), ball(0.5, 0.5)];
    expect(settle(b)).toBe(true);
    expect(b[0].potted).toBe(false);
  });
  it('the break scatters the rack without any ball leaving the table', () => {
    const b = rack();
    const cue = b.find((x) => x.cue)!;
    shoot(b, -cue.x, -0.9 - cue.z, 1);
    run(b, 30);
    for (const x of b) if (!x.potted) { expect(Math.abs(x.x)).toBeLessThan(POOL_W / 2); expect(Math.abs(x.z)).toBeLessThan(POOL_L / 2); }
    expect(moving(b)).toBe(false);
  });
});
