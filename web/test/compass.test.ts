import { describe, expect, it } from 'vitest';
import { edgeArrow } from '../src/scene/compass';

describe('edgeArrow', () => {
  it('no arrow when the target is on screen', () => {
    expect(edgeArrow(0.2, -0.5, false)).toBeNull();
  });
  it('off to the right: arrow on the right edge pointing right', () => {
    const a = edgeArrow(3, 0, false)!;
    expect(a.x).toBeCloseTo(0.86); expect(a.y).toBeCloseTo(0); expect(a.angle).toBeCloseTo(0);
  });
  it('clamps to the edge along the direction, keeping the ratio', () => {
    const a = edgeArrow(-4, 2, false)!;
    expect(a.x).toBeCloseTo(-0.86); expect(a.y).toBeCloseTo(0.43);
  });
  it('behind the camera flips the mirrored projection', () => {
    const a = edgeArrow(0.5, 0, true)!; // projects to the right, but is behind → turn left
    expect(a.x).toBeCloseTo(-0.86);
  });
  it('dead behind points down (turn around)', () => {
    const a = edgeArrow(0, 0, true)!;
    expect(a.y).toBeCloseTo(-0.86);
  });
});
