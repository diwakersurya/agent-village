import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useAgents } from '../store/agents';
import { beaconObjs, menuAnchor } from './beaconAnchor';

const v = new Vector3(), fwd = new Vector3(), to = new Vector3(), right = new Vector3(), sc = new Vector3();
const EDGE = 0.45; // beacon disc + ring radius (Beacon units)
const MENU_HALF = 80; // px: half the tallest menu
const MENU_W = 180; // px: the menu's width, so it never runs off the right edge
const TOPBAR_FALLBACK = 52; // px: --topbar-height (ui/tokens.css) when it can't be read
const TOPBAR_GAP = 12; // px: breathing room between the top bar and the menu

/** The top bar's height from the --topbar-height token (cached once read; it's a fixed token, not a live layout value). */
let topbar: number | undefined;
function topbarHeight() {
  if (topbar !== undefined) return topbar;
  try {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-height'));
    if (Number.isFinite(v) && v > 0) return (topbar = v); // only cache a real value (the stylesheet may not be in yet)
  } catch { /* no CSSOM */ }
  return TOPBAR_FALLBACK;
}

/** Pins the focused agent's beacon menu (a DOM overlay: constant size, never hidden behind walls) beside its beacon. */
export function BeaconMenuAnchor() {
  useFrame(({ camera, size }) => {
    const el = menuAnchor.el;
    if (!el) return;
    const id = useAgents.getState().selectedId;
    const b = id ? beaconObjs.get(id) : undefined;
    if (!b) { el.style.visibility = 'hidden'; return; }
    b.getWorldPosition(v);
    camera.getWorldDirection(fwd);
    // pin to the disc's right edge on screen, so a close-up (big) beacon isn't covered
    right.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(EDGE * b.getWorldScale(sc).x);
    v.add(right);
    const behind = to.subVectors(v, camera.position).dot(fwd) < 0;
    v.project(camera);
    const off = behind || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05;
    el.style.visibility = off ? 'hidden' : '';
    // keep the whole menu on screen (clear of the top bar) even when the beacon is near an edge
    const y = Math.min(size.height - MENU_HALF, Math.max(topbarHeight() + TOPBAR_GAP + MENU_HALF, ((1 - v.y) / 2) * size.height));
    if (!off) el.style.transform = `translate(${Math.min(size.width - MENU_W, ((v.x + 1) / 2) * size.width)}px, ${y}px)`;
  });
  return null;
}
