import { useEffect, useState } from 'react';
import { useAgentsConnection } from './hooks/useAgents';
import { useAgentSounds } from './hooks/useAgentSounds';
import { useAgents } from './store/agents';
import { Stage } from './scene/Stage';
import { TopBar } from './ui/TopBar';
import { ReplyPanel } from './ui/ReplyPanel';
import { MonitorView } from './ui/MonitorView';
import { ShortcutsHelp } from './ui/ShortcutsHelp';
import { WalkHud } from './ui/WalkHud';
import { CompassLayer } from './ui/CompassLayer';
import { Toast } from './ui/Toast';
import { BeaconMenu } from './ui/BeaconMenu';
import { TouchPad } from './ui/TouchPad';
import { usePresence } from './ui/usePresence';
import { useConnStatus } from './ui/connection';
import styles from './App.module.css';

export function App() {
  useAgentsConnection();
  useAgentSounds();
  const empty = useAgents((s) => Object.keys(s.agents).length === 0);
  const hydrated = useAgents((s) => s.hydrated);
  const conn = useConnStatus();
  const mode = useAgents((s) => s.mode);

  return (
    <div className={styles.app}>
      <Stage />
      <TopBar />
      <BeaconMenu />
      <Backdrop />
      <MonitorView />
      <ReplyPanel />
      <ShortcutsHelp />
      <WalkHud />
      <TouchPad />
      <CompassLayer />
      <Toast />
      {mode === 'no-token' && (
        <div className={styles.notice}>
          <strong><span aria-hidden>🔑</span> Not connected</strong>
          <p>Open the link printed by <code>village start</code> — it carries your access token.</p>
          <p>Or look around with <a href="?demo=1">demo agents</a>.</p>
        </div>
      )}
      {mode === 'live' && empty && (conn !== 'live' || !hydrated) && <ConnectingNotice reconnecting={conn !== 'connecting'} />}
      {mode === 'live' && empty && conn === 'live' && hydrated && (
        <div className={styles.notice}>
          <strong><span aria-hidden>🌱</span> The village is empty</strong>
          <p>Start <code>claude</code>, <code>codex</code> or <code>gemini</code> in any terminal and they’ll show up here.</p>
        </div>
      )}
    </div>
  );
}

/** An open overlay freezes the scene; clicking outside it closes it. Fades in and out with the overlay. */
function Backdrop() {
  const overlay = useAgents((s) => s.monitor !== 'closed');
  const setMonitor = useAgents((s) => s.setMonitor);
  const { mounted, state, onEnd } = usePresence(overlay);
  if (!mounted) return null;
  return <div className={styles.backdrop} data-state={state} {...onEnd} onClick={() => setMonitor('closed')} aria-hidden />;
}

const SLOW_MS = 4000;

/** Before the first snapshot: say we're connecting (not an empty grey office), and after a while what to check. */
function ConnectingNotice({ reconnecting }: { reconnecting: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={styles.notice} role="status" aria-live="polite">
      <strong className={styles.connecting}><i className={styles.pulse} aria-hidden /> {reconnecting ? 'Reconnecting to villaged…' : 'Connecting to villaged…'}</strong>
      <p className={slow ? styles.hint : `${styles.hint} ${styles.later}`}>
        Taking a while — is <code>village start</code> still running?
      </p>
    </div>
  );
}
