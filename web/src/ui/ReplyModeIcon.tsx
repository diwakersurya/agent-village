import styles from './ReplyModeIcon.module.css';

const MODES = {
  twoWay: { label: 'Two-way — your replies are sent to this agent', path: 'M4 8h13l-3-3M20 16H7l3 3' },
  watchOnly: { label: 'Watch-only — answer this agent in its own terminal', path: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z' },
};

/** Icon for whether replies can reach the agent; the full explanation shows as a tooltip on hover/focus. */
export function ReplyModeIcon({ canReply }: { canReply: boolean }) {
  const mode = canReply ? MODES.twoWay : MODES.watchOnly;
  return (
    <span className={styles.icon} data-mode={canReply ? 'two-way' : 'watch-only'} data-tip={mode.label} aria-label={mode.label} role="img" tabIndex={0}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={mode.path} />
      </svg>
    </span>
  );
}
