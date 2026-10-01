/**
 * Stable desk assignment: everyone keeps the seat they got; a newcomer takes the first free seat (lowest index,
 * i.e. the front-row-first order of officePlan.seats); leaving frees the seat. `ids` in display order, so several
 * newcomers at once (a snapshot) are seated deterministically.
 */
export function assignSeats(prev: ReadonlyMap<string, number>, ids: readonly string[]): Map<string, number> {
  const live = new Set(ids);
  const next = new Map<string, number>();
  for (const [id, seat] of prev) if (live.has(id)) next.set(id, seat);
  const taken = new Set(next.values());
  let free = 0;
  for (const id of ids) {
    if (next.has(id)) continue;
    while (taken.has(free)) free++;
    next.set(id, free);
    taken.add(free);
  }
  return next;
}

/** How many seats the office must have for this assignment (someone may sit beyond the head count after others left). */
export const seatsNeeded = (seats: ReadonlyMap<string, number>) => {
  let max = -1;
  for (const s of seats.values()) if (s > max) max = s;
  return Math.max(seats.size, max + 1);
};
