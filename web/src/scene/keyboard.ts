import { Vector3 } from 'three';
import type { AgentState } from '../../../daemon/src/types';

export type KeyAction =
  | { type: 'pan'; dx: number; dz: number }
  | { type: 'zoom'; dir: 1 | -1 }
  | { type: 'orbit'; dir: 1 | -1 }
  | { type: 'cycle'; dir: 1 | -1; needsOnly: boolean }
  | { type: 'focus' }
  | { type: 'reset' }
  | { type: 'escape' }
  | { type: 'menu'; index: number }
  | { type: 'help' }
  | { type: 'walk' };

export const SHORTCUTS: [string, string][] = [
  ['← ↑ → ↓ / W A S D', 'Pan'],
  ['+ / −', 'Zoom in / out'],
  ['Q / E', 'Rotate'],
  ['Tab / Shift+Tab', 'Next / previous agent'],
  ['N', 'Next agent that needs you'],
  ['F', 'Fly to the selected agent'],
  ['0', 'Reset view'],
  ['1 – 4 / Enter', 'Focused agent: pick from its beacon menu (Enter = first)'],
  ['P', 'Walk mode (first person): drag to look, WASD walk, Shift run, click a beacon to teleport'],
  ['Esc', 'Close the overlay, then deselect, then leave walk mode'],
  ['?', 'Show / hide shortcuts'],
];

const PAN: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0],
  ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1],
};

const typing = (t: EventTarget | null) => {
  const tag = (t as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!(t as HTMLElement | null)?.isContentEditable;
};

/** Pure key → action mapping; null when the key isn't ours (or the user is typing). */
export function keyAction(e: KeyboardEvent): KeyAction | null {
  if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (PAN[k]) return { type: 'pan', dx: PAN[k][0], dz: PAN[k][1] };
  if (/^[1-9]$/.test(k)) return { type: 'menu', index: Number(k) - 1 };
  switch (k) {
    case '+': case '=': return { type: 'zoom', dir: -1 };
    case '-': case '_': return { type: 'zoom', dir: 1 };
    case 'q': return { type: 'orbit', dir: -1 };
    case 'e': return { type: 'orbit', dir: 1 };
    case 'Tab': return { type: 'cycle', dir: e.shiftKey ? -1 : 1, needsOnly: false };
    case 'n': return { type: 'cycle', dir: 1, needsOnly: true };
    case 'f': return { type: 'focus' };
    case '0': return { type: 'reset' };
    case 'Escape': return { type: 'escape' };
    case 'Enter': return { type: 'menu', index: 0 };
    case '?': return { type: 'help' };
    case 'p': return { type: 'walk' };
    default: return null;
  }
}

/** Next/previous agent in display order, wrapping; `needsOnly` restricts to agents waiting on you. */
export function nextAgentId(list: AgentState[], current: string | undefined, dir: 1 | -1, needsOnly: boolean): string | undefined {
  const pool = needsOnly ? list.filter((a) => a.status === 'needs_input') : list;
  if (!pool.length) return undefined;
  const i = pool.findIndex((a) => a.id === current);
  if (i === -1) return pool[dir === 1 ? 0 : pool.length - 1].id;
  return pool[(i + dir + pool.length) % pool.length].id;
}

const MIN_DIST = 3, MAX_DIST = 80;

/** Moves camera + target together on the ground plane, relative to where the camera is looking. */
export function pan(cam: Vector3, target: Vector3, dx: number, dz: number) {
  const forward = new Vector3().subVectors(target, cam).setY(0);
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();
  const right = new Vector3(-forward.z, 0, forward.x);
  const step = Math.max(0.5, cam.distanceTo(target) * 0.08);
  const move = right.multiplyScalar(dx * step).add(forward.multiplyScalar(-dz * step));
  cam.add(move);
  target.add(move);
}

export function zoom(cam: Vector3, target: Vector3, dir: 1 | -1) {
  const offset = new Vector3().subVectors(cam, target);
  const d = Math.min(MAX_DIST, Math.max(MIN_DIST, offset.length() * (dir < 0 ? 0.85 : 1 / 0.85)));
  cam.copy(target).add(offset.setLength(d));
}

export function orbit(cam: Vector3, target: Vector3, dir: 1 | -1) {
  const offset = new Vector3().subVectors(cam, target);
  offset.applyAxisAngle(new Vector3(0, 1, 0), (dir * Math.PI) / 12);
  cam.copy(target).add(offset);
}
