import { useEffect } from 'react';
import { LoopOnce, LoopRepeat, type AnimationAction } from 'three';
import type { Status } from '../../../daemon/src/types';
import { CLIPS, ONCE_CLIPS } from '../scene/characters';

/** desk = at their desk, field = village, spot = somewhere in the office they wandered to (cooler, games room…). */
export type Place = 'desk' | 'field' | 'spot';

export function clipKey(status: Status, moving: boolean, place: Place): keyof typeof CLIPS {
  if (status === 'crashed') return 'crashed';
  if (moving) return 'walk';
  if (status === 'needs_input') return 'needsYou';
  if (status === 'working') return place === 'desk' ? 'sitWork' : 'standWork';
  if (place === 'spot') return 'standWork'; // busy with the coffee machine / a game
  return place === 'desk' ? 'idleSitChair' : 'idleSit';
}

/** Cross-fades the model's actions to the clip that matches the agent's state. */
export function useAgentAnimation(actions: Record<string, AnimationAction | null>, status: Status, moving: boolean, place: Place) {
  const key = clipKey(status, moving, place);
  useEffect(() => {
    const name = CLIPS[key].find((c) => actions[c]);
    const action = name ? actions[name] : null;
    if (!action) return;
    const once = ONCE_CLIPS.has(name!);
    action.reset();
    action.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    action.fadeIn(0.3).play();
    return () => { action.fadeOut(0.3); };
  }, [key, actions]);
}
