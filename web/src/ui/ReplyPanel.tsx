import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { api } from '../api/client';
import { useAgents } from '../store/agents';
import { useSelectedAgent } from '../hooks/useSelectedAgent';
import type { AgentState, Reply } from '../../../daemon/src/types';
import { enterReply } from './replyKeys';
import { ReplyModeIcon } from './ReplyModeIcon';
import { KindBadge, StatusDot } from './AgentBadges';
import { askLabel, statusLabel } from './status';
import { useLatest, usePresence, type PresenceState } from './usePresence';
import { useDialog } from './useDialog';
import styles from './ReplyPanel.module.css';

const HOST_LABEL: Record<AgentState['host'], string> = { pty: 'village pty', tmux: 'tmux', orca: 'Orca', terminal: 'terminal' };
const ERRORS: Record<string, string> = {
  stale: 'Answered elsewhere — the agent moved on.',
  'no-channel': 'Can’t type into this terminal — answer it there.',
  'terminal-only': 'This prompt can only be answered in its terminal now.',
  network: 'Couldn’t reach villaged.',
  'no-token': 'Not connected to villaged — open the link printed by `village start`.',
};

/** The 'reply' overlay: answer the selected agent's question / permission (opened from its beacon menu). */
export function ReplyPanel() {
  const selected = useSelectedAgent();
  const isOpen = useAgents((s) => s.monitor === 'reply') && !!selected;
  const agent = useLatest(isOpen ? selected : undefined);
  const { mounted, state, onEnd } = usePresence(isOpen);
  if (!mounted || !agent) return null;
  return <PanelBody key={agent.id} agent={agent} open={isOpen} state={state} onEnd={onEnd} />;
}

function PanelBody({ agent, open, state, onEnd }: { agent: AgentState; open: boolean; state: PresenceState; onEnd: ReturnType<typeof usePresence>['onEnd'] }) {
  const setMonitor = useAgents((s) => s.setMonitor);
  const markSent = useAgents((s) => s.markSent);
  const sentFor = useAgents((s) => s.sent[agent.id]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const input = useRef<HTMLTextAreaElement>(null);
  const close = () => setMonitor('closed');
  const dialog = useDialog<HTMLElement>(open, close, input);
  const titleId = useId();
  const ask = agent.ask;
  const sent = !!ask && sentFor === ask.id;

  useEffect(() => { setError(undefined); }, [ask?.id]);
  // answered elsewhere (in its terminal) while this was open: say so, then close rather than send a stale answer
  const gone = !ask;
  useEffect(() => {
    if (!gone || !open) return;
    const t = setTimeout(() => setMonitor('closed'), 2000);
    return () => clearTimeout(t);
  }, [gone, open, setMonitor]);

  async function send(r: Reply) {
    if (!ask || busy || !canType) return;
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
  // why the answer controls are greyed out (their tooltip); undefined = usable
  const why = !agent.canReply ? 'Watch-only: answer in its terminal' : sent ? 'Already sent — waiting for the agent' : busy ? 'Sending…' : undefined;
  const noFocus = agent.canFocus ? undefined : agent.status === 'crashed' ? 'Exited — its terminal is gone' : 'Can’t bring this terminal forward from here';

  return (
    <aside className={styles.panel} {...dialog.props} aria-labelledby={titleId} data-state={state} inert={state === 'closing'} {...onEnd}>
      <header className={styles.head}>
        <KindBadge kind={agent.kind} />
        <strong className={styles.project} id={titleId}>{agent.project || '—'}</strong>
        <span className={styles.chip}>{HOST_LABEL[agent.host]}</span>
        <ReplyModeIcon canReply={agent.canReply} />
        <button className={styles.close} aria-label="close" title="Close (Esc)" onClick={close}>×</button>
      </header>

      <p className={styles.status}>
        <StatusDot status={agent.status} label={statusLabel(agent.status)} /> {agent.activity.summary}
      </p>

      {gone && <p className={styles.note}><span aria-hidden>✓</span> Answered elsewhere — nothing left to reply to.</p>}
      {ask && (
        <section className={styles.ask}>
          <div className={styles.askLabel}>{askLabel(ask.type)}</div>
          <pre className={styles.askText}>{ask.text}</pre>
          {ask.options && ask.options.length > 0 && (
            <div className={styles.options}>
              {ask.options.map((o) => (
                <button key={o} aria-disabled={why ? true : undefined} title={why}
                  className={o === 'Deny' ? styles.secondary : styles.primary}
                  onClick={() => send({ option: o, text: text.trim() || undefined })}>
                  {o}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={input}
            className={styles.input}
            rows={3}
            value={text}
            disabled={!canType || busy}
            title={why}
            aria-label="your reply"
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
          <button className={styles.primary} aria-disabled={why || !text.trim() ? true : undefined}
            title={why ?? (!text.trim() ? 'Type a reply first' : undefined)}
            onClick={() => { if (text.trim()) send({ text }); }}>Send</button>
        )}
        {/* always shown; greyed out with the reason when this terminal can't be brought forward */}
        <button className={agent.canReply || noFocus ? styles.secondary : styles.primary} aria-disabled={noFocus ? true : undefined} title={noFocus}
          onClick={() => { if (!noFocus) void api.focus(agent.id); }}>Focus terminal</button>
        <button className={styles.secondary} onClick={() => setMonitor('history')}>History</button>
      </footer>
    </aside>
  );
}
