import { useAgents } from '../store/agents';
import { useShownAgents } from '../hooks/useAgents';
import { compassEls } from '../scene/compass';
import styles from './CompassLayer.module.css';

/** Walk mode: one arrow per agent that needs you; scene/WalkCompass moves them to the screen edge (hidden while in view). */
export function CompassLayer() {
  const walk = useAgents((s) => s.walk);
  const needy = useShownAgents().filter((a) => a.status === 'needs_input');
  if (!walk || !needy.length) return null;
  return (
    <div className={styles.layer} aria-hidden>
      {needy.map((a) => (
        <div key={a.id} className={styles.arrow} style={{ display: 'none' }}
          ref={(el) => { if (el) compassEls.set(a.id, el); else compassEls.delete(a.id); }}>
          <span className={styles.chevron}>➤</span>
          <span className={styles.label} />
        </div>
      ))}
    </div>
  );
}
