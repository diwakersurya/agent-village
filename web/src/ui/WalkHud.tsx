import type { ReactNode } from 'react';
import { useAgents } from '../store/agents';
import styles from './WalkHud.module.css';

/** Hint chips, most important first; `drop` = the narrowest width class at which the chip is hidden (see CSS). */
const KEYS: { hint: ReactNode; drop?: 'md' | 'lg' }[] = [
  { hint: <><kbd>W A S D</kbd> walk</> },
  { hint: <><kbd>drag</kbd> look around</> },
  { hint: <><kbd>Shift</kbd> run</>, drop: 'md' },
  { hint: <><kbd>click</kbd> a beacon or 📍 tag to teleport</>, drop: 'md' },
  { hint: <>try the cooler, pantry or vacuum</>, drop: 'lg' },
  { hint: <><kbd>Esc</kbd> leave walk mode</> },
];
const TOUCH: ReactNode[] = [<>drag to look</>, <>joystick to walk</>, <>tap a beacon</>];

/** Controls hint while in first-person walk mode, and the teleport flash. */
export function WalkHud() {
  const walk = useAgents((s) => s.walk);
  const dashN = useAgents((s) => s.dashN);
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  if (!walk) return null;
  return (
    <>
    {/* remounted per teleport so the flash animation replays */}
    {dashN > 0 && <div key={dashN} className={styles.flash} aria-hidden />}
    <ul className={styles.hint} role="status" aria-label="walk mode controls">
      {touch
        ? TOUCH.map((h, i) => <li key={i} className={styles.chip}>{h}</li>)
        : KEYS.map((k, i) => <li key={i} className={`${styles.chip} ${k.drop ? styles[k.drop] : ''}`}>{k.hint}</li>)}
    </ul>
    </>
  );
}
