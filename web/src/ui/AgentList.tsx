import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useAgents } from '../store/agents';
import { useAgentList } from '../hooks/useAgents';
import { agentName } from '../lib/agent';
import { KindBadge } from './AgentBadges';
import { statusLabel } from './status';
import { usePresence } from './usePresence';
import styles from './AgentList.module.css';

/** Top-right "Agents" button + dropdown menu; picking one focuses it (selects, maximises its monitor, flies the camera there). */
export function AgentList() {
  const open = useAgents((s) => s.listOpen);
  const toggle = useAgents((s) => s.toggleList);
  const focusAgent = useAgents((s) => s.focusAgent);
  const selectedId = useAgents((s) => s.selectedId);
  const agents = useAgentList();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const { mounted, state, onEnd } = usePresence(open);
  const needs = agents.filter((a) => a.status === 'needs_input').length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) toggle(); };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // this Esc only closes the list (not also the overlay / selection, on window)
      toggle();
      button.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // menu pattern: opening moves focus to the first item
    list.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus({ preventScroll: true });
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, toggle]);

  /** ArrowUp/Down (wrapping), Home/End move between the menu's items. */
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length
      : e.key === 'ArrowUp' ? (i - 1 + items.length) % items.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    e.stopPropagation(); // arrows also pan the camera
    items[next].focus();
  };

  // Agents that need you first, then by project.
  const sorted = [...agents].sort((a, b) => Number(b.status === 'needs_input') - Number(a.status === 'needs_input'));

  return (
    <div className={styles.root} ref={root}>
      <button ref={button} className={styles.button} aria-expanded={open} aria-haspopup="menu" onClick={toggle}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
        Agents <span className={styles.count}>{agents.length}</span>
        {needs > 0 && <span className={styles.needs} aria-label={`${needs} ${statusLabel('needs_input', needs)}`}>{needs}</span>}
      </button>
      {mounted && (
        <ul ref={list} className={styles.list} role="menu" aria-label="agents" data-state={state} inert={state === 'closing'} {...onEnd} onKeyDown={onListKey}>
          {sorted.length === 0 && <li role="none" className={styles.empty}>No agents running</li>}
          {sorted.map((a) => (
            <li key={a.id} role="none">
              <button role="menuitem" className={styles.row} data-status={a.status} aria-current={a.id === selectedId ? 'true' : undefined}
                onClick={() => focusAgent(a.id)}>
                <KindBadge kind={a.kind} swatch />
                <span className={styles.name}>
                  <strong>{agentName(a)}</strong>
                  <span className={styles.summary}>{a.status === 'needs_input' && a.ask ? `✋ ${a.ask.text.split('\n')[0]}` : a.activity.summary}</span>
                </span>
                <span className={styles.status}>{statusLabel(a.status)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
