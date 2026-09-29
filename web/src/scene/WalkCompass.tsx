import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useAgents } from '../store/agents';
import { compassEls, edgeArrow } from './compass';
import { positions } from './positions';

const v = new Vector3(), toTarget = new Vector3(), fwd = new Vector3();

/**
 * Walk mode: positions the edge-of-screen arrows (rendered by ui/CompassLayer, outside the canvas: a drei <Html>
 * overlay gets hidden whenever its anchor is behind the camera, which is exactly when you need the arrow).
 */
export function WalkCompass() {
  useFrame(({ camera, size }) => {
    camera.getWorldDirection(fwd);
    const agents = useAgents.getState().agents;
    for (const [id, el] of compassEls) {
      const a = agents[id];
      const p = positions.get(id);
      if (!a || !p) { el.style.display = 'none'; continue; }
      v.set(p.x, p.y + 1.5, p.z);
      toTarget.subVectors(v, camera.position);
      const behind = toTarget.dot(fwd) < 0;
      v.project(camera);
      const arrow = edgeArrow(v.x, v.y, behind);
      if (!arrow) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.transform = `translate(${((arrow.x + 1) / 2) * size.width}px, ${((1 - arrow.y) / 2) * size.height}px) translate(-50%, -50%)`;
      (el.firstChild as HTMLElement).style.transform = `rotate(${-arrow.angle}rad)`;
      (el.lastChild as HTMLElement).textContent = `${a.project || a.kind} · ${Math.round(toTarget.length())}m`;
    }
  });
  return null;
}
