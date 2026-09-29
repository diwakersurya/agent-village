import { describe, expect, it } from 'vitest';
import { LEAVE_GAP_MS, MAX_AWAY, returned, tryLeave } from '../src/hooks/useWander';

describe('away cap', () => {
  it('lets at most MAX_AWAY agents away, and only one every LEAVE_GAP_MS', () => {
    const t0 = 1e12;
    expect(MAX_AWAY).toBe(2);
    expect(tryLeave('a', t0)).toBe(true);
    expect(tryLeave('b', t0 + 1000)).toBe(false); // too soon after 'a'
    expect(tryLeave('a', t0 + 1000)).toBe(true); // already away: keeps its slot
    expect(tryLeave('b', t0 + LEAVE_GAP_MS)).toBe(true);
    expect(tryLeave('c', t0 + 3 * LEAVE_GAP_MS)).toBe(false); // two away: full
    returned('a');
    expect(tryLeave('c', t0 + 3 * LEAVE_GAP_MS)).toBe(true); // slot freed, gap passed
    ['a', 'b', 'c'].forEach(returned);
  });
});
