import { useEffect, useState } from 'react';
import { useAgents } from '../store/agents';

export type ConnStatus = 'live' | 'connecting' | 'reconnecting' | 'offline' | 'demo' | 'no-token';

export const CONN_LABEL: Record<ConnStatus, string> = {
  live: 'Live',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  offline: 'Offline',
  demo: 'Demo',
  'no-token': 'Not connected',
};

export const CONN_TIP: Record<ConnStatus, string> = {
  live: 'Live — connected to villaged',
  connecting: 'Connecting to villaged…',
  reconnecting: 'Reconnecting… lost the connection to villaged, retrying',
  offline: 'Offline — this device has no network; will reconnect when it’s back',
  demo: 'Demo — made-up agents, nothing is connected',
  'no-token': 'Not connected — open the link printed by `village start` (it carries your token)',
};

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** Where the UI stands with villaged: live, (re)connecting, offline, or not wired to a daemon at all (demo / no token). */
export function useConnStatus(): ConnStatus {
  const connected = useAgents((s) => s.connected);
  const mode = useAgents((s) => s.mode);
  const [ever, setEver] = useState(connected);
  const [net, setNet] = useState(online);
  if (connected && !ever) setEver(true);

  useEffect(() => {
    const update = () => setNet(online());
    addEventListener('online', update);
    addEventListener('offline', update);
    return () => { removeEventListener('online', update); removeEventListener('offline', update); };
  }, []);

  if (mode === 'demo') return 'demo';
  if (mode === 'no-token') return 'no-token';
  if (connected) return 'live';
  if (!net) return 'offline';
  return ever ? 'reconnecting' : 'connecting';
}
