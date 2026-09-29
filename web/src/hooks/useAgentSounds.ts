import { useEffect } from 'react';
import type { Status } from '../../../daemon/src/types';
import { sfx, soundFor } from '../audio/sfx';
import { useAgents } from '../store/agents';
import { positions } from '../scene/positions';
import { isShown } from './useAgents';

/** Plays a sound when an agent starts needing you, finishes, or crashes, and when your reply is sent; an agent that notices you chirps hello. */
export function useAgentSounds() {
  useEffect(() => {
    const prev = new Map<string, Status>(Object.values(useAgents.getState().agents).map((a) => [a.id, a.status]));
    let prevSent = useAgents.getState().sent;
    let prevGreet = useAgents.getState().greet;
    return useAgents.subscribe((s) => {
      for (const a of Object.values(s.agents)) {
        const kind = soundFor(prev.get(a.id), a.status);
        prev.set(a.id, a.status);
        if (!kind || !isShown(a)) continue;
        const p = positions.get(a.id);
        sfx[kind](p ? [p.x, 1.5, p.z] : undefined);
      }
      if (s.sent !== prevSent) {
        if (Object.keys(s.sent).some((id) => s.sent[id] !== prevSent[id])) sfx.sent();
        prevSent = s.sent;
      }
      if (s.greet !== prevGreet) {
        prevGreet = s.greet;
        const p = s.greet && positions.get(s.greet.id);
        // each agent has its own pitch, so a chirp still sounds like someone
        if (p) sfx.greet([p.x, 1.5, p.z], 0.85 + ([...s.greet!.id].reduce((h, ch) => h + ch.charCodeAt(0), 0) % 7) * 0.05);
      }
    });
  }, []);
}
