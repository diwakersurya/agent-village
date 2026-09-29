import { describe, expect, it } from 'vitest';
import { beaconKind } from '../src/scene/Beacon';

describe('beaconKind', () => {
  it('shows the status', () => {
    expect(beaconKind('working', false)).toBe('working');
    expect(beaconKind('idle', false)).toBe('idle');
    expect(beaconKind('crashed', false)).toBe('crashed');
    expect(beaconKind('needs_input', false)).toBe('needs_input');
  });
  it('turns into a ✓ once you have answered the question', () => {
    expect(beaconKind('needs_input', true)).toBe('sent');
    expect(beaconKind('working', true)).toBe('working'); // stale sent flag never masks a new state
  });
});
