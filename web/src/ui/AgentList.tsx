import { useEffect, useRef } from 'react';
import { useAgents } from '../store/agents';
import { useAgentList } from '../hooks/useAgents';
import styles from './AgentList.module.css';

/** Top-right "Agents" button + dropdown; picking one focuses it (selects, maximises its monitor, flies the camera there). */
export function AgentList() {
  const open = useAgents((s) => s.listOpen);
  const toggle = useAgents((s) => s.toggleList);
  const focusAgent = useAgents((s) => s.focusAgent);
  const selectedId = useAgents((s) => s.selectedId);
  const agents = useAgentList();
  const root = useRef<HTMLDivElement>(null);
  const needs = agents.filter((a) => a.status === 'needs_input').length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) toggle(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') toggle(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, toggle]);

  // Agents that need you first, then by project.
  const sorted = [...agents].sort((a, b) => Number(b.status === 'needs_input') - Number(a.status === 'needs_input'));

  return (
    <div className={styles.root} ref={root}>
      <button className={styles.button} aria-expanded={open} aria-haspopup="listbox" onClick={toggle}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
        Agents <span className={styles.count}>{agents.length}</span>
        {needs > 0 && <span className={styles.needs} aria-label={`${needs} need you`}>{needs}</span>}
      </button>
      {open && (
        <ul className={styles.list} role="listbox" aria-label="agents">
          {sorted.length === 0 && <li className={styles.empty}>No agents running</li>}
          {sorted.map((a) => (
            <li key={a.id} role="option" aria-selected={a.id === selectedId}>
              <button className={styles.row} data-status={a.status} onClick={() => focusAgent(a.id)}>
                <i className={styles.kind} data-kind={a.kind} aria-hidden />
                <span className={styles.name}>
                  <strong>{a.project || a.kind}</strong>
                  <span className={styles.summary}>{a.status === 'needs_input' && a.ask ? `✋ ${a.ask.text.split('\n')[0]}` : a.activity.summary}</span>
                </span>
                <span className={styles.status}>{a.status === 'needs_input' ? 'needs you' : a.status === 'crashed' ? 'exited' : a.status}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
