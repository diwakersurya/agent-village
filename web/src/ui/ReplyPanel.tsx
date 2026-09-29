import { useEffect, useState, type KeyboardEvent } from 'react';
import { api } from '../api/client';
import { useAgents } from '../store/agents';
import { useSelectedAgent } from '../hooks/useSelectedAgent';
import type { AgentState, Reply } from '../../../daemon/src/types';
import { enterReply } from './replyKeys';
import { ReplyModeIcon } from './ReplyModeIcon';
import styles from './ReplyPanel.module.css';

const HOST_LABEL: Record<AgentState['host'], string> = { pty: 'village pty', tmux: 'tmux', orca: 'Orca', terminal: 'terminal' };
const ERRORS: Record<string, string> = {
  stale: 'Answered elsewhere — the agent moved on.',
  'no-channel': 'Can’t type into this terminal — answer it there.',
  'terminal-only': 'This prompt can only be answered in its terminal now.',
  network: 'Couldn’t reach villaged.',
};

/** The 'reply' overlay: answer the selected agent's question / permission (opened from its beacon menu). */
export function ReplyPanel() {
  const agent = useSelectedAgent();
  const open = useAgents((s) => s.monitor === 'reply');
  if (!agent || !open) return null;
  return <PanelBody key={agent.id} agent={agent} />;
}

function PanelBody({ agent }: { agent: AgentState }) {
  const setMonitor = useAgents((s) => s.setMonitor);
  const markSent = useAgents((s) => s.markSent);
  const sentFor = useAgents((s) => s.sent[agent.id]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const ask = agent.ask;
  const sent = !!ask && sentFor === ask.id;

  useEffect(() => { setError(undefined); }, [ask?.id]);
  // answered elsewhere (in its terminal) while this was open: say so, then close rather than send a stale answer
  const gone = !ask;
  useEffect(() => {
    if (!gone) return;
    const t = setTimeout(() => setMonitor('closed'), 2000);
    return () => clearTimeout(t);
  }, [gone, setMonitor]);

  async function send(r: Reply) {
    if (!ask || busy) return;
    setBusy(true);
    setError(undefined);
    const res = await api.reply(agent.id, ask.id, r);
    setBusy(false);
    if (res.ok) { markSent(agent.id, ask.id); setText(''); }
    else setError(ERRORS[res.error] ?? `Reply failed: ${res.error}`);
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || !ask) return;
    e.preventDefault();
    const r = enterReply(ask, text);
    if (r) send(r);
  };
  const canType = !!ask && agent.canReply && !sent;

  return (
    <aside className={styles.panel} aria-label={`${agent.kind} in ${agent.project}`}>
      <header className={styles.head}>
        <span className={styles.kind} data-kind={agent.kind}>{agent.kind}</span>
        <strong className={styles.project}>{agent.project || '—'}</strong>
        <span className={styles.chip}>{HOST_LABEL[agent.host]}</span>
        <ReplyModeIcon canReply={agent.canReply} />
        <button className={styles.close} aria-label="close" title="Close (Esc)" onClick={() => setMonitor('closed')}>×</button>
      </header>

      <p className={styles.status} data-status={agent.status}>
        <i className={styles.dot} /> {agent.activity.summary}
      </p>

      {gone && <p className={styles.note}><span aria-hidden>✓</span> Answered elsewhere — nothing left to reply to.</p>}
      {ask && (
        <section className={styles.ask}>
          <div className={styles.askLabel}>{ask.type === 'permission' ? 'Needs permission' : ask.type === 'question' ? 'Question' : ask.type === 'error' ? 'Error' : 'Waiting for you'}</div>
          <pre className={styles.askText}>{ask.text}</pre>
          {ask.options && ask.options.length > 0 && (
            <div className={styles.options}>
              {ask.options.map((o) => (
                <button key={o} disabled={!canType || busy} className={o === 'Deny' ? styles.secondary : styles.primary} onClick={() => send({ option: o, text: text.trim() || undefined })}>
                  {o}
                </button>
              ))}
            </div>
          )}
          <textarea
            className={styles.input}
            rows={3}
            value={text}
            disabled={!canType || busy}
            placeholder={!agent.canReply ? 'Answer this one in its own terminal' : ask.options ? 'Optional note, sent with the button you pick' : 'Type a reply… (Enter to send, Shift+Enter for newline)'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
          />
          {sent && <p className={styles.note}><span aria-hidden>✓</span> Sent — waiting for the agent</p>}
          {error && <p className={styles.error}><span aria-hidden>⚠</span> {error}</p>}
        </section>
      )}

      <footer className={styles.actions}>
        {ask && !ask.options && (
          <button className={styles.primary} disabled={!canType || busy || !text.trim()} onClick={() => send({ text })}>Send</button>
        )}
        {agent.canFocus && (
          <button className={agent.canReply ? styles.secondary : styles.primary} onClick={() => api.focus(agent.id)}>Focus terminal</button>
        )}
        <button className={styles.secondary} onClick={() => setMonitor('history')}>History</button>
      </footer>
    </aside>
  );
}
