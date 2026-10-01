import type { AgentKind, Status } from '../../../daemon/src/types';
import styles from './AgentBadges.module.css';

/** The agent's kind: a coloured uppercase pill, or (`swatch`) just its colour dot. */
export function KindBadge({ kind, swatch }: { kind: AgentKind; swatch?: boolean }) {
  if (swatch) return <i className={`${styles.kind} ${styles.swatch}`} data-kind={kind} aria-hidden />;
  return <span className={`${styles.kind} ${styles.pill}`} data-kind={kind}>{kind}</span>;
}

/** Status colour dot; decorative unless given a `label` (then it's an image with that text as its tooltip). */
export function StatusDot({ status, label }: { status: Status; label?: string }) {
  return label
    ? <i className={styles.dot} data-status={status} role="img" aria-label={label} title={label} />
    : <i className={styles.dot} data-status={status} aria-hidden />;
}
