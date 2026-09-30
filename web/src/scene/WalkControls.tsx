import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Raycaster, Vector2, type Material, type Object3D, type PerspectiveCamera } from 'three';
import { useAgents } from '../store/agents';
import { useAgentList } from '../hooks/useAgents';
import { EYE_HEIGHT, RUN_SPEED, WALK_SPEED, nearestAgent, officeColliders, teleportSpot, walkStep } from './walk';
import { positions } from './positions';
import { touchMove } from './touchMove';
import { sfx } from '../audio/sfx';
import type { Hold } from '../hooks/useInteract';

const LOOK = 0.0022; // rad per mouse px
const WALK_FOV = 70;
const REACH = 3.5; // how close you must be to use the cooler / pantry
const MAX_PITCH = 1.3;
const MOVE: Record<string, [number, number]> = {
  w: [1, 0], ArrowUp: [1, 0], s: [-1, 0], ArrowDown: [-1, 0],
  a: [0, -1], ArrowLeft: [0, -1], d: [0, 1], ArrowRight: [0, 1],
};
const DASH_SECS = 0.45; // teleport: a fast rush, not a cut
const DASH_FOV = 45; // extra lens width at the dash's peak (speed feel)
const CLICK_SLOP = 6; // px of pointer travel before a press counts as a drag

const overlayOpen = () => useAgents.getState().monitor !== 'closed';

const typing = (t: EventTarget | null) => {
  const tag = (t as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || !!(t as HTMLElement | null)?.isContentEditable;
};

/** First-person walk mode: drag to look around, WASD/arrows to walk (Shift runs), click an agent or amenity, click a beacon to teleport. Frozen while an overlay is open. */
export function WalkControls() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const setEvents = useThree((s) => s.setEvents);
  const view = useAgents((s) => s.view);
  const n = useAgentList().length;
  const col = useMemo(() => (view === 'office' ? officeColliders(n) : { segs: [], boxes: [], spawn: [0, 22] as [number, number], viewpoints: [], floor: () => 0 }), [view, n]);
  const keys = useRef(new Set<string>());
  const yaw = useRef(0);
  const pitch = useRef(0);
  const stride = useRef(0);
  const nearbyCheck = useRef(0);
  /** Teleport in flight: from/to x, z, yaw, and when it started. */
  const dash = useRef<{ x0: number; z0: number; y0: number; p0: number; x1: number; z1: number; y1: number; pitch: number; t: number; id?: string } | null>(null);

  // step in at the front of the room / village, looking in
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    const orbitFov = cam.fov;
    cam.fov = WALK_FOV; // eye-level view needs a wider lens than the overview
    cam.updateProjectionMatrix();
    cam.rotation.order = 'YXZ';
    // start at a random vantage point (the village has none: its entrance)
    const v = col.viewpoints[Math.floor(Math.random() * col.viewpoints.length)];
    const [sx, sz, sy] = v ? [v.x, v.z, v.yaw] : [col.spawn[0], col.spawn[1], 0];
    cam.position.set(sx, EYE_HEIGHT + col.floor(sx, sz), sz);
    yaw.current = sy;
    pitch.current = -0.08;
    return () => { cam.rotation.order = 'XYZ'; cam.fov = orbitFov; cam.updateProjectionMatrix(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-enter only when the view changes, not when an agent joins
  }, [view, camera]);

  useEffect(() => {
    const canvas = gl.domElement;
    // we pick ourselves (with a drag threshold), so R3F's own click/hover handlers stay off in walk mode
    setEvents({ enabled: false });
    canvas.style.cursor = 'grab';
    // one-finger drag looks around on touch screens (instead of scrolling / zooming the page)
    canvas.style.touchAction = 'none';
    /** Flash-dash to (x1, z1) facing y1; `id` = the agent to focus on arrival. */
    const dashTo = (x1: number, z1: number, y1: number, pitchTo: number, id?: string) => {
      if (dash.current) return;
      // turn the shortest way round
      let y0 = yaw.current;
      while (y1 - y0 > Math.PI) y0 += 2 * Math.PI;
      while (y0 - y1 > Math.PI) y0 -= 2 * Math.PI;
      dash.current = { x0: camera.position.x, z0: camera.position.z, y0, p0: pitch.current, x1, z1, y1, pitch: pitchTo, t: performance.now(), id };
      sfx.whoosh();
      useAgents.getState().dashed();
    };
    const teleportTo = (id: string) => {
      const p = positions.get(id);
      if (!p) return;
      const others = [...positions.entries()].filter(([k]) => k !== id).map(([, q]): [number, number] => [q.x, q.z]);
      const [x1, z1, y1] = teleportSpot(p.x, p.z, camera.position.x, camera.position.z, col.segs, col.boxes, others);
      dashTo(x1, z1, y1, 0.08, id); // settle with their face and beacon both in view
    };
    const under = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const ray = new Raycaster();
      ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      // first solid thing under the cursor (see-through glass, rugs and rings don't block)
      const hits = ray.intersectObject(scene, true);
      const hit = hits.find((h) => {
        const m = (h.object as Object3D & { material?: Material }).material;
        return h.object.visible && !(m && m.transparent && m.opacity < 0.7);
      });
      return { hits, hit };
    };
    /** A press-and-hold target (the pool table, the table tennis table) within reach under the cursor. */
    const holdAt = (e: PointerEvent): Hold | null => {
      const { hit } = under(e);
      if (!hit || hit.distance > REACH) return null;
      for (let o: Object3D | null = hit.object; o; o = o.parent) if ((o.userData as { hold?: Hold }).hold) return (o.userData as { hold: Hold }).hold;
      return null;
    };
    const pick = (e: PointerEvent) => {
      const { hits, hit } = under(e);
      // a beacon (they float above everything, the "!" even shows through walls) teleports you to its agent
      for (const h of hits) for (let o: Object3D | null = h.object; o; o = o.parent) {
        const { beaconOf: id, viewpoint } = o.userData as { beaconOf?: string; viewpoint?: number };
        const v = viewpoint !== undefined && o.visible ? col.viewpoints[viewpoint] : undefined;
        if (v) { useAgents.getState().select(undefined); return dashTo(v.x, v.z, v.yaw, -0.08); }
        // the focused agent's beacon is already extended into its menu (a DOM overlay handles those clicks)
        if (id && o.visible && id !== useAgents.getState().selectedId) return teleportTo(id);
      }
      for (let o: Object3D | null = hit?.object ?? null; o; o = o.parent) {
        const { agentId, interact } = o.userData as { agentId?: string; interact?: () => void };
        if (interact) {
          // only within arm's reach
          if (hit!.distance <= REACH) interact(); else useAgents.getState().showToast('Walk closer to use it');
          return;
        }
        if (!agentId) continue;
        useAgents.getState().select(agentId); // focus only: its beacon menu does the rest
        return;
      }
    };
    // press and drag to look around; a press that barely moves is a click
    let drag: { x: number; y: number; moved: number } | null = null;
    let holding: Hold | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || overlayOpen()) return;
      // pressing on a game table plays it (charge a shot / swing) instead of looking around
      holding = holdAt(e);
      if (holding) { holding.down(); canvas.setPointerCapture(e.pointerId); return; }
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      yaw.current -= dx * LOOK;
      pitch.current = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch.current - dy * LOOK));
    };
    const onUp = (e: PointerEvent) => {
      if (holding) { holding.up(); holding = null; return; }
      if (!drag) return;
      if (drag.moved < CLICK_SLOP) pick(e);
      drag = null;
      canvas.style.cursor = 'grab';
    };
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === 'Shift' || MOVE[k]) {
        if (e.type === 'keydown') keys.current.add(k); else keys.current.delete(k);
      }
    };
    const onBlur = () => { keys.current.clear(); drag = null; };
    // picked from the agent list / Tab / N: same dash as clicking their beacon
    const unsub = useAgents.subscribe((s, prev) => { if (s.teleportReq && s.teleportReq !== prev.teleportReq) teleportTo(s.teleportReq.id); });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onBlur);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      unsub();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onBlur);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      canvas.style.cursor = '';
      setEvents({ enabled: true });
      useAgents.getState().setNearby(undefined);
    };
  }, [gl, camera, scene, setEvents, col]);

  useFrame((_, dt) => {
    const cam = camera as PerspectiveCamera;
    // an agent's overlay is open: you stand still (and stop auto-focusing whoever you're near)
    if (overlayOpen()) { keys.current.clear(); return; }
    if (dash.current) {
      const d = dash.current;
      const k = Math.min(1, (performance.now() - d.t) / (DASH_SECS * 1000));
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2; // ease in-out: launch, rush, brake
      const dx = d.x0 + (d.x1 - d.x0) * e, dz = d.z0 + (d.z1 - d.z0) * e;
      camera.position.set(dx, EYE_HEIGHT + col.floor(dx, dz), dz);
      yaw.current = d.y0 + (d.y1 - d.y0) * e;
      pitch.current = d.p0 + (d.pitch - d.p0) * e;
      cam.fov = WALK_FOV + DASH_FOV * Math.sin(k * Math.PI);
      cam.updateProjectionMatrix();
      camera.rotation.set(pitch.current, yaw.current, 0);
      if (k === 1) { dash.current = null; if (d.id) useAgents.getState().select(d.id); }
      return;
    }
    nearbyCheck.current -= dt;
    if (nearbyCheck.current <= 0) { nearbyCheck.current = 0.2; checkNearby(camera.position.x, camera.position.z, yaw.current); }
    let fwd = 0, strafe = 0;
    for (const k of keys.current) if (MOVE[k]) { fwd += MOVE[k][0]; strafe += MOVE[k][1]; }
    // touch joystick: analog (a light push walks slowly), pushed to the edge runs
    const pad = Math.hypot(touchMove.fwd, touchMove.strafe);
    if (pad > 0.15) { fwd += touchMove.fwd; strafe += touchMove.strafe; }
    const run = keys.current.has('Shift') || pad > 0.92;
    const speed = (run ? RUN_SPEED : WALK_SPEED) * Math.min(1, Math.hypot(fwd, strafe));
    const bodies = [...positions.values()].map((p): [number, number] => [p.x, p.z]);
    const [x, z] = walkStep(camera.position.x, camera.position.z, yaw.current, fwd, strafe, speed * Math.min(dt, 0.1), col.segs, bodies);
    stride.current += Math.hypot(x - camera.position.x, z - camera.position.z);
    if (stride.current > (run ? 0.9 : 0.65)) { stride.current = 0; sfx.footstep(run); }
    camera.position.set(x, camera.position.y + (EYE_HEIGHT + col.floor(x, z) - camera.position.y) * Math.min(1, dt * 12), z); // step up / down smoothly
    camera.rotation.set(pitch.current, yaw.current, 0);
  });

  return null;
}

function checkNearby(x: number, z: number, yaw: number) {
  const s = useAgents.getState();
  const bodies = [...positions.entries()].map(([id, p]): [string, number, number] => [id, p.x, p.z]);
  s.setNearby(nearestAgent(x, z, yaw, bodies, s.nearbyId));
}
