import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { sfx, syncListener, unlockAudio } from '../audio/sfx';
import { useAgents } from '../store/agents';
import { positions } from './positions';

/** Keeps the audio listener on the camera, and makes working agents type (audible only up close). */
export function SceneAudio() {
  const nextKey = useRef(new Map<string, number>());
  useEffect(() => {
    // browsers only allow audio after a gesture
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);
  useFrame(({ camera, clock }) => {
    syncListener(camera);
    const now = clock.elapsedTime;
    for (const a of Object.values(useAgents.getState().agents)) {
      if (a.status !== 'working' || useAgents.getState().hiddenStatuses.includes('working')) continue;
      const p = positions.get(a.id);
      if (!p) continue;
      const due = nextKey.current.get(a.id) ?? now + Math.random();
      if (now >= due) {
        sfx.key([p.x, 0.8, p.z]); // their keyboard is right in front of them
        // bursts of keys with the odd thinking pause
        nextKey.current.set(a.id, now + (Math.random() < 0.08 ? 0.8 + Math.random() * 1.5 : 0.07 + Math.random() * 0.16));
      } else if (!nextKey.current.has(a.id)) nextKey.current.set(a.id, due);
    }
  });
  return null;
}
