import { useSyncExternalStore } from 'react';
import { isMuted, setMuted, subscribeMuted } from '../audio/sfx';

export function useMuted(): [boolean, (m: boolean) => void] {
  return [useSyncExternalStore(subscribeMuted, isMuted), setMuted];
}
