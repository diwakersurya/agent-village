import { api } from '../api/client';
import { useAgents, type View } from '../store/agents';
import { useStatusCounts } from '../hooks/useAgents';
import { AgentList } from './AgentList';
import { useMuted } from '../hooks/useMuted';
import styles from './TopBar.module.css';

const STATUS: { key: 'working' | 'needs_input' | 'idle' | 'crashed'; label: string; cls: string }[] = [
  { key: 'needs_input', label: 'need you', cls: styles.needs },
  { key: 'working', label: 'working', cls: styles.working },
  { key: 'idle', label: 'idle', cls: styles.idle },
  { key: 'crashed', label: 'exited', cls: styles.crashed },
];

export function TopBar() {
  const view = useAgents((s) => s.view);
  const setView = useAgents((s) => s.setView);
  const walk = useAgents((s) => s.walk);
  const setWalk = useAgents((s) => s.setWalk);
  const connected = useAgents((s) => s.connected);
  const counts = useStatusCounts();
  const hidden = useAgents((s) => s.hiddenStatuses);
  const toggleStatus = useAgents((s) => s.toggleStatus);
  const [muted, setMuted] = useMuted();

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden>⌂</span>
        <span className={styles.name}>Agents Village</span>
        {api.mode === 'demo' && <span className={styles.demo}>demo</span>}
      </div>

      <div className={styles.counts} role="group" aria-label="show or hide agents by status">
        {STATUS.map((s) => {
          const shown = !hidden.includes(s.key);
          return (
            <button key={s.key} aria-pressed={shown} title={`${shown ? 'Hide' : 'Show'} ${s.label} agents`}
              className={`${styles.count} ${s.cls} ${counts[s.key] ? '' : styles.zero} ${shown ? '' : styles.off}`}
              onClick={() => toggleStatus(s.key)}>
              <i className={styles.dot} />{counts[s.key]} {s.label}
            </button>
          );
        })}
      </div>

      <div className={styles.right}>
        <AgentList />
        <button className={styles.walk} aria-pressed={!muted} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} title={muted ? 'Unmute sounds' : 'Mute sounds'} onClick={() => setMuted(!muted)}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            {muted ? <path d="m22 9-6 6M16 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />}
          </svg>
        </button>
        <button className={`${styles.walk} ${walk ? styles.on : ''}`} aria-pressed={walk} title="Walk around in first person (P)" onClick={() => setWalk(!walk)}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="13" cy="4" r="2" /><path d="M9 21l2-6 3 3v3M7 12l3-4 4 1 3 3M11 15l1-6" />
          </svg>
          Walk
        </button>
        <div className={styles.toggle} role="tablist" aria-label="view">
          {(['office', 'village'] as View[]).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? styles.on : ''} onClick={() => setView(v)}>
              {v === 'office' ? 'Office' : 'Village'}
            </button>
          ))}
        </div>
        <span className={styles.conn} title={connected ? 'connected to villaged' : 'reconnecting…'}>
          <i className={`${styles.dot} ${connected ? styles.live : styles.down}`} />
          {connected ? 'live' : 'offline'}
        </span>
      </div>
    </header>
  );
}
