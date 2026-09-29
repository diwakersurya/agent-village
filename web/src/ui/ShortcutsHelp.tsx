import { useAgents } from '../store/agents';
import { SHORTCUTS } from '../scene/keyboard';
import styles from './ShortcutsHelp.module.css';

export function ShortcutsHelp() {
  const open = useAgents((s) => s.helpOpen);
  const toggle = useAgents((s) => s.toggleHelp);
  return (
    <div className={styles.root}>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="keyboard shortcuts">
          <strong>Keyboard</strong>
          <dl>
            {SHORTCUTS.map(([k, what]) => (
              <div key={k} className={styles.row}><dt><kbd>{k}</kbd></dt><dd>{what}</dd></div>
            ))}
          </dl>
        </div>
      )}
      <button className={styles.button} aria-expanded={open} aria-label="keyboard shortcuts (?)" title="Keyboard shortcuts (?)" onClick={toggle}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
        </svg>
      </button>
    </div>
  );
}
