import { useEffect } from 'react';
import { api } from '../api/client';
import { useAgents } from '../store/agents';
import { useSelectedAgent } from '../hooks/useSelectedAgent';
import { menuAnchor } from '../scene/beaconAnchor';
import { agentName } from '../lib/agent';
import { menuItems, type MenuItem } from './menuItems';
import { useLatest, usePresence } from './usePresence';
import styles from './BeaconMenu.module.css';

/** Runs a menu item for an agent: opens its overlay, or (terminal) brings its terminal window forward. Disabled items do nothing. */
export function runItem(id: string, item: MenuItem) {
  if (item.disabled) return;
  if (item.key === 'terminal') void api.focus(id);
  else useAgents.getState().openMonitor(id, item.key);
}

/**
 * The focused agent's beacon, extended: the only way to see an agent's live screen / history or answer it.
 * Fans out beside the beacon (scene/BeaconMenuAnchor keeps it pinned there); fades away while an overlay is open.
 */
export function BeaconMenu() {
  const selected = useSelectedAgent();
  const overlay = useAgents((s) => s.monitor !== 'closed');
  const live = selected && !overlay ? selected : undefined;
  const agent = useLatest(live);
  const { mounted, state, onEnd } = usePresence(!!live);
  useEffect(() => () => { menuAnchor.el = null; }, []);
  if (!agent || !mounted) return null;
  const items = menuItems(agent);
  return (
    <div className={styles.anchor} ref={(el) => { menuAnchor.el = el; }} style={{ visibility: 'hidden' }}>
      <nav className={styles.menu} data-status={agent.status} data-state={state} inert={state === 'closing'} {...onEnd}
        aria-label={`${agentName(agent)} actions`}>
        <span className={styles.who}>{agentName(agent)}</span>
        {items.map((it, i) => (
          <button key={it.key} className={`${styles.item} ${it.key === 'reply' ? styles.primary : ''}`}
            aria-disabled={it.disabled ? true : undefined} title={it.disabled}
            onClick={() => runItem(agent.id, it)}>
            <kbd>{i + 1}</kbd>{it.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
