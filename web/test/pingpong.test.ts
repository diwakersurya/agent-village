import { describe, expect, it } from 'vitest';
import { TT_L, TT_TOP, aimShot, newRally, stepRally, swing, type Rally } from '../src/scene/games/pingpong';

const until = (r: Rally, stop: (ev: string[]) => boolean, swingAt?: (r: Rally) => boolean, secs = 6) => {
  const all: string[] = [];
  for (let t = 0; t < secs; t += 1 / 120) {
    const ev = stepRally(r, 1 / 120, !!swingAt?.(r), () => 0.5);
    all.push(...ev);
    if (stop(ev)) break;
  }
  return all;
};

describe('table tennis', () => {
  it('aimShot lands the ball on its target', () => {
    const b = { x: 0, y: 1, z: 1.5, vx: 0, vy: 0, vz: 0 };
    aimShot(b, 0.3, -0.7, 0.8);
    for (let t = 0; t < 0.8 - 1e-9; t += 0.001) { b.vy -= 9.8 * 0.001; b.x += b.vx * 0.001; b.y += b.vy * 0.001; b.z += b.vz * 0.001; }
    expect(b.x).toBeCloseTo(0.3, 1); expect(b.z).toBeCloseTo(-0.7, 1); expect(b.y).toBeCloseTo(TT_TOP, 1);
  });
  it('only a ball coming at you, in reach, can be hit; timing sets the direction', () => {
    expect(swing({ x: 0, y: TT_TOP + 0.2, z: TT_L / 2 + 0.15, vx: 0, vy: 0, vz: -2 })).toBeNull(); // going away
    expect(swing({ x: 0, y: TT_TOP + 0.2, z: 0, vx: 0, vy: 0, vz: 2 })).toBeNull(); // not here yet
    const early = swing({ x: 0, y: TT_TOP + 0.2, z: TT_L / 2 - 0.1, vx: 0, vy: 0, vz: 2 })!;
    const late = swing({ x: 0, y: TT_TOP + 0.2, z: TT_L / 2 + 0.45, vx: 0, vy: 0, vz: 2 })!;
    expect(early.tx).toBeGreaterThan(0); expect(late.tx).toBeLessThan(0);
  });
  it('serve → bot returns → never swinging loses you the point', () => {
    const r = newRally();
    stepRally(r, 1 / 120, true, () => 0.5); // serve
    const ev = until(r, (e) => e.some((x) => x.startsWith('point')));
    expect(ev.filter((e) => e === 'hit').length).toBeGreaterThanOrEqual(1); // the bot hit it back
    expect(ev).toContain('point-bot');
    expect(r.score).toEqual({ you: 0, bot: 1 });
  });
  it('a well-timed swing returns the ball and keeps the rally going', () => {
    const r = newRally();
    stepRally(r, 1 / 120, true, () => 0.5);
    const ev = until(r, (e) => e.some((x) => x.startsWith('point')), (s) => s.hitter === 'bot' && s.bounced && Math.abs(s.ball.z - (TT_L / 2 + 0.15)) < 0.05, 4);
    expect(ev.filter((e) => e === 'hit').length).toBeGreaterThanOrEqual(3); // serve, bot, you, (bot…)
  });
});

describe('bot misses', () => {
  it('a missed return stays missed and the point goes to you', () => {
    const r = newRally();
    stepRally(r, 1 / 120, true, () => 0.5);
    const rolls = [0.05]; // first roll after the bounce: miss; any re-roll would return it
    const ev: string[] = [];
    for (let t = 0; t < 5 && !ev.some((e) => e.startsWith('point')); t += 1 / 120) ev.push(...stepRally(r, 1 / 120, false, () => rolls.shift() ?? 0.99));
    expect(ev).toContain('point-you');
  });
});
