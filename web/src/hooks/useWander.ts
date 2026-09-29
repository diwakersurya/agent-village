import { useEffect, useRef, useState } from 'react';
import type { AgentState } from '../../../daemon/src/types';
import type { OfficePlan, Seat } from '../scene/office/officePlan';
import { pathLength, routeFromSeat, wanderSpots, type P2, type Spot } from '../scene/office/wander';
import { positions } from '../scene/positions';
import { useAgents } from '../store/agents';

export const WANDER_SPEED = 1.3; // a stroll, not the 3 u/s status dash
/** At most this many agents away from their desks at once (eating, drinking, playing). */
export const MAX_AWAY = 2;
/** Office-wide gap between one agent getting up and the next. */
export const LEAVE_GAP_MS = 3 * 60_000;

const awayNow = new Set<string>();
let lastLeave = -Infinity;
/** Claims one of the MAX_AWAY slots; false if the office is busy enough or someone got up in the last LEAVE_GAP_MS. */
export function tryLeave(id: string, now = Date.now()): boolean {
  if (awayNow.has(id)) return true;
  if (awayNow.size >= MAX_AWAY || now - lastLeave < LEAVE_GAP_MS) return false;
  awayNow.add(id);
  lastLeave = now;
  return true;
}
export function returned(id: string) { awayNow.delete(id); }

export interface Trip { route: [number, number, number][]; face: number; away: boolean }

const to3 = (pts: P2[]): [number, number, number][] => pts.map(([x, z]) => [x, 0, z]);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Idle agents now and then get up — water cooler, pantry, a game of table tennis or snooker — then come back.
 * Anyone who isn't idle stays at (or heads straight back to) their desk, so where they are still tells you their status.
 * Returns the current trip (a route to follow + facing at the end) or null when at the desk.
 */
export function useWander(agent: AgentState, plan: OfficePlan, seat: Seat, home: [number, number, number]): Trip | null {
  const [trip, setTrip] = useState<Trip | null>(null);
  const out = useRef<P2[] | null>(null);
  const idle = agent.status === 'idle';
  const key = `${seat.x},${seat.z},${plan.n}`;
  // called over to a game table by you (usePlaymate): go there now, come back when you leave
  const mate = useAgents((s) => (s.playmate?.id === agent.id ? s.playmate : undefined));
  const summonKey = mate ? `${mate.game}:${mate.x.toFixed(2)},${mate.z.toFixed(2)}` : '';
  const summoned = useRef(false);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const goBack = () => {
      const route = out.current;
      if (!route) return setTrip(null);
      // retrace the aisles from wherever they are now
      const p = positions.get(agent.id);
      const here: P2 = p ? [p.x, p.z] : route[route.length - 1];
      let k = 0;
      route.forEach((q, i) => { if (Math.hypot(q[0] - here[0], q[1] - here[1]) < Math.hypot(route[k][0] - here[0], route[k][1] - here[1])) k = i; });
      const back = [here, ...route.slice(0, k + 1).reverse()];
      out.current = null;
      returned(agent.id); // heading back frees the slot for someone else
      setTrip({ route: [...to3(back), home], face: Math.PI, away: false });
      t = setTimeout(() => setTrip(null), (pathLength(back) / WANDER_SPEED + 1.5) * 1000);
    };
    if (!idle) { summoned.current = false; if (out.current) goBack(); return () => clearTimeout(t); }
    if (mate) {
      const route = routeFromSeat(plan, seat, { name: mate.game, pos: [mate.x, mate.z], face: mate.face });
      out.current = route;
      summoned.current = true;
      setTrip({ route: to3(route), face: mate.face, away: true });
      return () => clearTimeout(t);
    }
    if (summoned.current) { summoned.current = false; goBack(); }
    const schedule = () => {
      t = setTimeout(() => {
        // only agents that are done (idle) get here; and only a few away at once
        // the agent you're focused on stays put (its menu / overlay is about them)
        if (Math.random() < 0.45 || useAgents.getState().selectedId === agent.id || !tryLeave(agent.id)) return schedule();
        const spots = wanderSpots(plan);
        const spot: Spot = spots[Math.floor(Math.random() * spots.length)];
        const route = routeFromSeat(plan, seat, spot);
        out.current = route;
        setTrip({ route: to3(route), face: spot.face, away: true });
        const there = pathLength(route) / WANDER_SPEED;
        t = setTimeout(() => { goBack(); t = setTimeout(schedule, (pathLength(route) / WANDER_SPEED + 2) * 1000); }, (there + rand(8, 18)) * 1000);
      }, rand(8, 22) * 1000);
    };
    schedule();
    return () => clearTimeout(t);
    // (a non-idle status re-runs this effect, which sends them back via goBack → returned)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-plan only when idleness or the desk changes
  }, [idle, key, summonKey]);

  useEffect(() => () => returned(agent.id), [agent.id]);
  return trip;
}
