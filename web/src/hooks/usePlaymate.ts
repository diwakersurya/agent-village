import { useEffect, useRef } from 'react';
import { useAgents, type Playmate } from '../store/agents';
import { positions } from '../scene/positions';

const CHECK_SECS = 0.5;

/**
 * Game tables call it every frame with whether you're at the table and where an opponent should stand.
 * When you arrive, the nearest idle agent is called over; when you leave (or they get busy), they go back to their desk.
 * Returns the current playmate's agent id (undefined = nobody free: the bot plays you).
 */
export function usePlaymate(game: Playmate['game']) {
  const next = useRef(0);
  const mate = useRef<string | undefined>(undefined);
  useEffect(() => () => { if (useAgents.getState().playmate?.game === game) useAgents.getState().setPlaymate(undefined); }, [game]);
  return (near: boolean, spot: { x: number; z: number; face: number }, now: number): string | undefined => {
    if (now < next.current) return mate.current;
    next.current = now + CHECK_SECS;
    const s = useAgents.getState();
    const cur = s.playmate?.game === game ? s.playmate : undefined;
    const ok = (id: string) => { const a = s.agents[id]; return !!a && a.status === 'idle' && !s.hiddenStatuses.includes('idle'); };
    if (!near) {
      if (cur) { s.setPlaymate(undefined); s.showToast('👋 See you later'); }
      return (mate.current = undefined);
    }
    if (cur && ok(cur.id)) {
      // you walked round to the other end/side: they move too
      if (Math.hypot(cur.x - spot.x, cur.z - spot.z) > 0.5) s.setPlaymate({ ...cur, ...spot });
      return (mate.current = cur.id);
    }
    if (s.playmate && s.playmate.game !== game) return (mate.current = undefined); // busy at the other table
    const idle = Object.values(s.agents).filter((a) => ok(a.id)).map((a) => {
      const p = positions.get(a.id);
      return { a, d: p ? Math.hypot(p.x - spot.x, p.z - spot.z) : Infinity };
    }).sort((x, y) => x.d - y.d);
    const pick = idle[0]?.a;
    if (!pick) {
      if (cur) s.setPlaymate(undefined);
      return (mate.current = undefined);
    }
    if (pick.id !== cur?.id) s.showToast(`${game === 'pool' ? '🎱' : '🏓'} ${pick.project || pick.kind} is coming to play`);
    s.setPlaymate({ game, id: pick.id, ...spot });
    return (mate.current = pick.id);
  };
}
