import { describe, it, expect } from 'vitest';
import { loopPoint, spawnDirt, sweep } from '../src/scene/office/vacuumPath';

describe('robot vacuum loop', () => {
  const hx = 7, hz = 5; // loop half-extents
  const perim = 4 * (hx + hz);
  it('starts at a corner and walks the rectangle', () => {
    expect(loopPoint(0, hx, hz)).toMatchObject({ x: -hx, z: hz });
    expect(loopPoint(2 * hx, hx, hz)).toMatchObject({ x: hx, z: hz });
    const p = loopPoint(2 * hx + hz, hx, hz);
    expect(p.x).toBeCloseTo(hx);
    expect(p.z).toBeCloseTo(0);
  });
  it('wraps around and never leaves the loop', () => {
    for (let s = 0; s < perim * 3; s += 0.37) {
      const p = loopPoint(s, hx, hz);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(hx + 1e-9);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(hz + 1e-9);
      expect(Math.abs(p.x) === hx || Math.abs(p.z) === hz || Math.abs(Math.abs(p.x) - hx) < 1e-9 || Math.abs(Math.abs(p.z) - hz) < 1e-9).toBe(true);
    }
    expect(loopPoint(perim + 1, hx, hz)).toEqual(loopPoint(1, hx, hz));
  });
  it('heading points along the direction of travel', () => {
    expect(loopPoint(1, hx, hz).heading).toBeCloseTo(Math.PI / 2); // along +x
    expect(loopPoint(2 * hx + 1, hx, hz).heading).toBeCloseTo(Math.PI); // along -z
  });
});

describe('dirt', () => {
  const hx = 7, hz = 5;
  it('spawns on the loop, within the vacuum pickup radius of its path', () => {
    for (let i = 0; i < 200; i++) {
      const d = spawnDirt(hx, hz);
      const offX = Math.min(Math.abs(Math.abs(d.x) - hx), Math.abs(Math.abs(d.z) - hz));
      expect(offX).toBeLessThanOrEqual(0.15 + 1e-9);
    }
  });
  it('a full lap of the vacuum picks up every patch', () => {
    let dirt = Array.from({ length: 20 }, () => spawnDirt(hx, hz));
    for (let s = 0; s < 4 * (hx + hz); s += 0.05) {
      const p = loopPoint(s, hx, hz);
      dirt = sweep(dirt, p.x, p.z, 0.3);
    }
    expect(dirt).toHaveLength(0);
  });
  it('sweep keeps the array identity when nothing is picked (no re-render)', () => {
    const dirt = [spawnDirt(hx, hz)];
    expect(sweep(dirt, 100, 100, 0.3)).toBe(dirt);
  });
});
