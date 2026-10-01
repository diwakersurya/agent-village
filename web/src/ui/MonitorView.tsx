import { useEffect, useId, useState } from 'react';
import { api } from '../api/client';
import { useAgents, type Monitor } from '../store/agents';
import { useSelectedAgent } from '../hooks/useSelectedAgent';
import type { AgentState, HistoryItem, ScreenResult } from '../../../daemon/src/types';
import { KindBadge, StatusDot } from './AgentBadges';
import { statusLabel } from './status';
import { useLatest, usePresence } from './usePresence';
import { useDialog } from './useDialog';
import { useStickToBottom } from './useStickToBottom';
import styles from './MonitorView.module.css';

const POLL_MS = 1000;
const HOST_SCREEN: Record<string, string> = { tmux: 'tmux', orca: 'Orca' };
type Tab = Extract<Monitor, 'live' | 'history'>;

/** The selected agent's monitor, maximised: its live terminal (or command feed) and its history. */
export function MonitorView() {
  const selected = useSelectedAgent();
  const monitor = useAgents((s) => s.monitor);
  const setMonitor = useAgents((s) => s.setMonitor);
  const isOpen = !!selected && (monitor === 'live' || monitor === 'history');
  // while closing, keep showing what was on screen
  const agent = useLatest(isOpen ? selected : undefined);
  const tab = useLatest<Tab>(isOpen ? (monitor as Tab) : undefined);
  const { mounted, state, onEnd } = usePresence(isOpen);
  const close = () => setMonitor('closed');
  const dialog = useDialog<HTMLElement>(isOpen, close);
  const titleId = useId();

  if (!mounted || !agent || !tab) return null;
  return (
    <section className={styles.monitor} {...dialog.props} aria-labelledby={titleId} data-status={agent.status}
      data-state={state} inert={state === 'closing'} {...onEnd}>
      <header className={styles.bezel}>
        <KindBadge kind={agent.kind} />
        <strong className={styles.project} id={titleId}>{agent.project || '—'}</strong>
        <span className={styles.activity}><StatusDot status={agent.status} label={statusLabel(agent.status)} /> {agent.activity.summary}</span>
        <Tabs value={tab} onChange={setMonitor} />
        <button className={styles.icon} aria-label="minimise monitor" title="Minimise (Esc)" onClick={close}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M5 19h14" /></svg>
        </button>
      </header>
      <div className={styles.glass}>
        {tab === 'live' ? <LiveScreen key={agent.id} agent={agent} /> : <HistoryList key={agent.id} agent={agent} />}
      </div>
    </section>
  );
}

function Tabs({ value, onChange }: { value: Tab; onChange: (m: Monitor) => void }) {
  return (
    <div className={styles.tabs} role="tablist">
      {(['live', 'history'] as const).map((t) => (
        <button key={t} role="tab" aria-selected={value === t} className={value === t ? styles.on : ''} onClick={() => onChange(t)}>
          {t === 'live' ? 'Live' : 'History'}
        </button>
      ))}
    </div>
  );
}

/** Polls the daemon every second; follows the bottom unless the user scrolled up. */
function LiveScreen({ agent }: { agent: AgentState }) {
  const [data, setData] = useState<ScreenResult | null>(null);
  const [error, setError] = useState<string>();
  const stick = useStickToBottom(data);

  useEffect(() => {
    let live = true;
    const tick = () => api.screen(agent.id)
      .then((d) => { if (live) { setData(d); setError(undefined); } })
      .catch((e) => { if (live) setError(e.message); });
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => { live = false; clearInterval(t); };
  }, [agent.id]);

  return (
    <>
      <div className={styles.source}>
        {!data ? '● Live · connecting…' : data.source === 'screen' ? `● Live terminal · ${HOST_SCREEN[agent.host] ?? agent.host}` : '● Live command feed · from the session log'}
      </div>
      <div className={styles.screen} ref={stick.ref} onScroll={stick.onScroll}>
        {/* a failed poll keeps the last good screen on view below the warning */}
        {error && <p className={styles.error}><span aria-hidden>⚠</span> Couldn’t read the terminal: {error}</p>}
        {!data && !error && <TermSkeleton />}
        {data?.source === 'screen' && <pre className={styles.term}>{data.lines.join('\n')}</pre>}
        {data?.source === 'commands' && data.commands.length === 0 && (
          <p className={styles.empty}>No shell commands yet — {agent.activity.summary}</p>
        )}
        {data?.source === 'commands' && data.commands.map((c, i) => (
          <div key={`${c.at}-${i}`} className={styles.cmd}>
            <div className={styles.prompt}>
              <span aria-hidden>$</span> {c.cmd}
              {c.running && <span className={styles.running}>running…</span>}
            </div>
            {c.output && <pre className={styles.output}>{c.output}</pre>}
          </div>
        ))}
      </div>
    </>
  );
}

const ICON: Record<HistoryItem['role'], string> = { user: '🧑', assistant: '🤖', tool: '🔧' };

/** Refetches as the agent works; stays at the bottom only if you were already there (scrolling up to read isn't undone). */
function HistoryList({ agent }: { agent: AgentState }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string>();
  const stick = useStickToBottom(items);
  const tick = Math.floor(agent.lastEventAt / 3000); // refetch at most every 3s while active

  useEffect(() => {
    let live = true;
    api.history(agent.id)
      .then((h) => { if (live) { setItems(h); setError(undefined); } })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [agent.id, tick]);

  return (
    <div className={styles.screen} ref={stick.ref} onScroll={stick.onScroll}>
      {error && <p className={styles.error}><span aria-hidden>⚠</span> Couldn’t load history: {error}</p>}
      {!items && !error && <HistorySkeleton />}
      {items?.length === 0 && <p className={styles.empty}>No transcript for this agent yet.</p>}
      {items?.map((it, i) => (
        <div key={i} className={styles.item} data-role={it.role}>
          <span aria-hidden>{ICON[it.role]}</span>
          <div>
            <time className={styles.time}>{it.at ? new Date(it.at).toLocaleTimeString() : ''}</time>
            <p className={styles.text}>{it.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Placeholder rows shaped like history items (icon · time · a line or two of text), so nothing jumps when they load. */
function HistorySkeleton() {
  const rows = [[90, 60], [75], [95, 80, 40], [65], [85, 50]];
  return (
    <div aria-busy aria-label="loading history">
      {rows.map((lines, i) => (
        <div key={i} className={styles.item} aria-hidden>
          <span className={`${styles.bone} ${styles.boneIcon}`} />
          <div>
            <span className={`${styles.bone} ${styles.boneTime}`} />
            {lines.map((w, j) => <span key={j} className={`${styles.bone} ${styles.boneText}`} style={{ width: `${w}%` }} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Placeholder terminal lines of ragged width, at the terminal's line height. */
function TermSkeleton() {
  const widths = [42, 78, 64, 30, 88, 55, 70, 24, 60, 46];
  return (
    <div aria-busy aria-label="loading terminal">
      {widths.map((w, i) => <span key={i} className={`${styles.bone} ${styles.boneLine}`} style={{ width: `${w}%` }} aria-hidden />)}
    </div>
  );
}
