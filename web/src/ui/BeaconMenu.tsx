import { useEffect } from 'react';
import { api } from '../api/client';
import { useAgents } from '../store/agents';
import { useSelectedAgent } from '../hooks/useSelectedAgent';
import { menuAnchor } from '../scene/beaconAnchor';
import { menuItems, type MenuItem } from './menuItems';
import styles from './BeaconMenu.module.css';

/** Runs a menu item for an agent: opens its overlay, or (terminal) brings its terminal window forward. */
export function runItem(id: string, item: MenuItem) {
  if (item.key === 'terminal') void api.focus(id);
  else useAgents.getState().openMonitor(id, item.key);
}

/**
 * The focused agent's beacon, extended: the only way to see an agent's live screen / history or answer it.
 * Fans out beside the beacon (scene/BeaconMenuAnchor keeps it pinned there); hidden while an overlay is open.
 */
export function BeaconMenu() {
  const agent = useSelectedAgent();
  const open = useAgents((s) => s.monitor !== 'closed');
  const items = agent ? menuItems(agent) : [];
  useEffect(() => () => { menuAnchor.el = null; }, []);
  if (!agent || open) return null;
  return (
    <div className={styles.anchor} ref={(el) => { menuAnchor.el = el; }} style={{ visibility: 'hidden' }}>
      <nav className={styles.menu} data-status={agent.status} aria-label={`${agent.project} actions`}>
        <span className={styles.who}>{agent.project || agent.kind}</span>
        {items.map((it, i) => (
          <button key={it.key} className={`${styles.item} ${it.key === 'reply' ? styles.primary : ''}`} onClick={() => runItem(agent.id, it)}>
            <kbd>{i + 1}</kbd>{it.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
