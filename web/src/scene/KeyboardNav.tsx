import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { useAgents } from '../store/agents';
import { useShownAgents } from '../hooks/useAgents';
import { menuItems } from '../ui/menuItems';
import { runItem } from '../ui/BeaconMenu';
import { keyAction, nextAgentId, orbit, pan, zoom } from './keyboard';

/** Global keyboard navigation: pan / zoom / rotate the camera, cycle and focus agents. */
export function KeyboardNav() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitImpl | null;
  const agents = useShownAgents();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const act = keyAction(e);
      if (!act) return;
      const s = useAgents.getState();
      // Let Tab keep moving focus through buttons; only cycle agents from the scene itself.
      if (e.key === 'Tab' && document.activeElement && document.activeElement !== document.body) return;
      if (act.type === 'escape' && s.listOpen) return; // the agent list closes itself
      // in walk mode WASD/arrows move you (WalkControls) and the orbit-camera keys don't apply
      // an overlay is open: the scene is frozen (only Esc / help still apply)
      if (s.monitor !== 'closed' && act.type !== 'escape' && act.type !== 'help') return;
      if (act.type === 'menu') {
        const a = s.selectedId ? s.agents[s.selectedId] : undefined;
        const item = a && menuItems(a)[act.index];
        if (!item) return;
        e.preventDefault();
        runItem(a.id, item);
        return;
      }
      if (s.walk && (act.type === 'pan' || act.type === 'zoom' || act.type === 'orbit' || act.type === 'reset')) return;
      e.preventDefault();
      switch (act.type) {
        case 'pan': if (controls) { pan(camera.position, controls.target, act.dx, act.dz); controls.update(); } break;
        case 'zoom': if (controls) { zoom(camera.position, controls.target, act.dir); controls.update(); } break;
        case 'orbit': if (controls) { orbit(camera.position, controls.target, act.dir); controls.update(); } break;
        case 'cycle': { const id = nextAgentId(agents, s.selectedId, act.dir, act.needsOnly); if (id) s.focusAgent(id); break; }
        case 'focus': if (s.selectedId) s.flyToSelected(); break;
        case 'reset': s.resetView(); break;
        case 'help': s.toggleHelp(); break;
        case 'walk': s.setWalk(!s.walk); break;
        case 'escape':
          if (s.helpOpen) s.toggleHelp();
          else if (s.monitor !== 'closed') s.setMonitor('closed');
          else if (s.selectedId) s.select(undefined);
          else if (s.walk) s.setWalk(false);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [camera, controls, agents]);

  return null;
}
