import { useAgents } from '../store/agents';
import styles from './WalkHud.module.css';

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
    <div className={styles.hint} role="status">
      {touch
        ? <>drag to look · joystick to walk · tap a beacon</>
        : <><kbd>drag</kbd> look around · <kbd>W A S D</kbd> walk · <kbd>Shift</kbd> run · <kbd>click</kbd> a beacon or 📍 place tag to teleport · the cooler, pantry or vacuum · <kbd>Esc</kbd> leave walk mode</>}
    </div>
    </>
  );
}
