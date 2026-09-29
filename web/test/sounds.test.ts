import { describe, expect, it } from 'vitest';
import { sfx, soundFor } from '../src/audio/sfx';

describe('soundFor', () => {
  it('is silent on first sighting and when nothing changed', () => {
    expect(soundFor(undefined, 'needs_input')).toBeNull();
    expect(soundFor('working', 'working')).toBeNull();
  });
  it('chimes when an agent starts needing you, from any state', () => {
    expect(soundFor('working', 'needs_input')).toBe('needsYou');
    expect(soundFor('idle', 'needs_input')).toBe('needsYou');
  });
  it('dings only when work finishes, bonks on crash', () => {
    expect(soundFor('working', 'idle')).toBe('done');
    expect(soundFor('needs_input', 'idle')).toBeNull(); // answered/dismissed, not "finished"
    expect(soundFor('working', 'crashed')).toBe('crashed');
    expect(soundFor('idle', 'working')).toBeNull();
  });
  it('sound calls are safe no-ops without Web Audio (node, locked, muted)', () => {
    expect(() => { sfx.needsYou([0, 0, 0]); sfx.greet([0, 0, 0]); sfx.key([0, 0, 0]); sfx.footstep(true); sfx.sent(); }).not.toThrow();
  });
});
