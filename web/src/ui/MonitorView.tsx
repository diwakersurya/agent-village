import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAgents, type Monitor } from '../store/agents';
import { useSelectedAgent } from '../hooks/useSelectedAgent';
import type { AgentState, HistoryItem, ScreenResult } from '../../../daemon/src/types';
import styles from './MonitorView.module.css';

const POLL_MS = 1000;
const HOST_SCREEN: Record<string, string> = { tmux: 'tmux', orca: 'Orca' };

/** The selected agent's monitor, maximised: its live terminal (or command feed) and its history. */
export function MonitorView() {
  const agent = useSelectedAgent();
  const monitor = useAgents((s) => s.monitor);
  const setMonitor = useAgents((s) => s.setMonitor);

  if (!agent || (monitor !== 'live' && monitor !== 'history')) return null;
  return (
    <section className={styles.monitor} aria-label={`${agent.project} monitor`} data-status={agent.status}>
      <header className={styles.bezel}>
        <span className={styles.kind} data-kind={agent.kind}>{agent.kind}</span>
        <strong className={styles.project}>{agent.project || '—'}</strong>
        <span className={styles.activity}><i className={styles.dot} /> {agent.activity.summary}</span>
        <Tabs value={monitor} onChange={setMonitor} />
        <button className={styles.icon} aria-label="minimise monitor" title="Minimise (Esc)" onClick={() => setMonitor('closed')}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M5 19h14" /></svg>
        </button>
      </header>
      <div className={styles.glass}>
        {monitor === 'live' ? <LiveScreen key={agent.id} agent={agent} /> : <HistoryList key={agent.id} agent={agent} />}
      </div>
    </section>
  );
}

function Tabs({ value, onChange }: { value: Monitor; onChange: (m: Monitor) => void }) {
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
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    let live = true;
    const tick = () => api.screen(agent.id)
      .then((d) => { if (live) { setData(d); setError(undefined); } })
      .catch((e) => { if (live) setError(e.message); });
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => { live = false; clearInterval(t); };
  }, [agent.id]);

  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [data]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  return (
    <>
      <div className={styles.source}>
        {data?.source === 'screen' ? `● Live terminal · ${HOST_SCREEN[agent.host] ?? agent.host}` : '● Live command feed · from the session log'}
      </div>
      <div className={styles.screen} ref={scroller} onScroll={onScroll}>
        {error && <p className={styles.error}><span aria-hidden>⚠</span> Couldn’t read the terminal: {error}</p>}
        {!data && !error && <Skeleton />}
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

function HistoryList({ agent }: { agent: AgentState }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string>();
  const end = useRef<HTMLDivElement>(null);
  const tick = Math.floor(agent.lastEventAt / 3000); // refetch at most every 3s while active

  useEffect(() => {
    let live = true;
    api.history(agent.id)
      .then((h) => { if (live) { setItems(h); setError(undefined); } })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [agent.id, tick]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [items]);

  return (
    <div className={styles.screen}>
      {error && <p className={styles.error}><span aria-hidden>⚠</span> Couldn’t load history: {error}</p>}
      {!items && !error && <Skeleton />}
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
      <div ref={end} />
    </div>
  );
}

function Skeleton() {
  return <div aria-busy>{Array.from({ length: 6 }, (_, i) => <div key={i} className={styles.skeleton} />)}</div>;
}
