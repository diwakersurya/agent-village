import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useAgents } from '../store/agents';
import { compassEls, edgeArrow } from './compass';
import { positions } from './positions';
import { agentName } from '../lib/agent';

const v = new Vector3(), toTarget = new Vector3(), fwd = new Vector3();

/** What each arrow element last got, so a frame only touches the DOM when something actually changed. */
interface Written { display: string; pos: string; rot: string; text: string }
const written = new WeakMap<HTMLElement, Written>();
const hide = (el: HTMLElement, w: Written) => { if (w.display !== 'none') el.style.display = w.display = 'none'; };

/**
 * Walk mode: positions the edge-of-screen arrows (rendered by ui/CompassLayer, outside the canvas: a drei <Html>
 * overlay gets hidden whenever its anchor is behind the camera, which is exactly when you need the arrow).
 */
export function WalkCompass() {
  useFrame(({ camera, size }) => {
    camera.getWorldDirection(fwd);
    const agents = useAgents.getState().agents;
    for (const [id, el] of compassEls) {
      let w = written.get(el);
      if (!w) { w = { display: el.style.display, pos: '', rot: '', text: '' }; written.set(el, w); }
      const a = agents[id];
      const p = positions.get(id);
      if (!a || !p) { hide(el, w); continue; }
      v.set(p.x, p.y + 1.5, p.z);
      toTarget.subVectors(v, camera.position);
      const behind = toTarget.dot(fwd) < 0;
      v.project(camera);
      const arrow = edgeArrow(v.x, v.y, behind);
      if (!arrow) { hide(el, w); continue; }
      if (w.display !== '') el.style.display = w.display = '';
      // whole pixels / centiradians: sub-pixel jitter isn't worth a style write
      const pos = `translate(${Math.round(((arrow.x + 1) / 2) * size.width)}px, ${Math.round(((1 - arrow.y) / 2) * size.height)}px) translate(-50%, -50%)`;
      if (pos !== w.pos) el.style.transform = w.pos = pos;
      const rot = `rotate(${(-arrow.angle).toFixed(2)}rad)`;
      if (rot !== w.rot) (el.firstChild as HTMLElement).style.transform = w.rot = rot;
      const text = `${agentName(a)} · ${Math.round(toTarget.length())}m`;
      if (text !== w.text) (el.lastChild as HTMLElement).textContent = w.text = text;
    }
  });
  return null;
}
