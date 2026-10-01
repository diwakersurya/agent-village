import { describe, it, expect } from 'vitest';
import { assignSeats, seatsNeeded } from '../src/scene/office/seats';

const seats = (m: Map<string, number>) => Object.fromEntries(m);

describe('assignSeats', () => {
  it('seats newcomers in order on the first free seats', () => {
    expect(seats(assignSeats(new Map(), ['a', 'b', 'c']))).toEqual({ a: 0, b: 1, c: 2 });
  });
  it('keeps everyone in place when someone joins ahead of them in display order', () => {
    const m = assignSeats(new Map(), ['b', 'c']);
    expect(seats(assignSeats(m, ['a', 'b', 'c']))).toEqual({ b: 0, c: 1, a: 2 });
  });
  it('frees a seat on leave and gives it to the next newcomer, without moving anyone else', () => {
    let m = assignSeats(new Map(), ['a', 'b', 'c']);
    m = assignSeats(m, ['a', 'c']);
    expect(seats(m)).toEqual({ a: 0, c: 2 });
    m = assignSeats(m, ['a', 'c', 'd', 'e']);
    expect(seats(m)).toEqual({ a: 0, c: 2, d: 1, e: 3 });
  });
  it('is idempotent for the same list', () => {
    const m = assignSeats(new Map(), ['x', 'y']);
    expect(seats(assignSeats(m, ['x', 'y']))).toEqual(seats(m));
  });
  it('sizes the office for the highest occupied seat', () => {
    const m = assignSeats(assignSeats(new Map(), ['a', 'b', 'c']), ['c']);
    expect(seatsNeeded(m)).toBe(3);
    expect(seatsNeeded(new Map())).toBe(0);
  });
});
