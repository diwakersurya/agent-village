import { api } from './api/client';
import { useAgentsConnection, useAgentList } from './hooks/useAgents';
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
import styles from './App.module.css';

export function App() {
  useAgentsConnection();
  useAgentSounds();
  const agents = useAgentList();
  const connected = useAgents((s) => s.connected);
  const overlay = useAgents((s) => s.monitor !== 'closed');
  const setMonitor = useAgents((s) => s.setMonitor);

  return (
    <div className={styles.app}>
      <Stage />
      <TopBar />
      <BeaconMenu />
      {/* an open overlay freezes the scene; clicking outside it closes it */}
      {overlay && <div className={styles.backdrop} onClick={() => setMonitor('closed')} aria-hidden />}
      <MonitorView />
      <ReplyPanel />
      <ShortcutsHelp />
      <WalkHud />
      <CompassLayer />
      <Toast />
      {api.mode === 'no-token' && (
        <div className={styles.notice}>
          <strong><span aria-hidden>🔑</span> Not connected</strong>
          <p>Open the link printed by <code>village start</code> — it carries your access token.</p>
          <p>Or look around with <a href="?demo=1">demo agents</a>.</p>
        </div>
      )}
      {api.mode === 'live' && connected && agents.length === 0 && (
        <div className={styles.notice}>
          <strong><span aria-hidden>🌱</span> The village is empty</strong>
          <p>Start <code>claude</code>, <code>codex</code> or <code>gemini</code> in any terminal and they’ll show up here.</p>
        </div>
      )}
    </div>
  );
}
