import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { positions } from './positions';
import { KeyboardNav } from './KeyboardNav';
import { WalkControls } from './WalkControls';
import { SceneAudio } from './SceneAudio';
import { BeaconMenuAnchor } from './BeaconMenuAnchor';
import { WalkCompass } from './WalkCompass';
import { Html, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { useAgents, type View } from '../store/agents';
import { useAgentList, useSeats } from '../hooks/useAgents';
import { OfficeLayout } from './office/OfficeLayout';
import { VillageLayout } from './village/VillageLayout';
import { officePlan } from './office/officePlan';
import { useReducedMotion } from '../hooks/useReducedMotion';

export function Stage() {
  const view = useAgents((s) => s.view);
  const connected = useAgents((s) => s.connected);
  const select = useAgents((s) => s.select);
  const walk = useAgents((s) => s.walk);
  const overlay = useAgents((s) => s.monitor !== 'closed');
  const agents = useAgentList();
  const officeSize = useSeats().size;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 9, 11], fov: 45 }}
      // Html overlays live inside the canvas container, so only real canvas clicks deselect.
      onPointerMissed={(e) => { if ((e.target as HTMLElement | null)?.tagName === 'CANVAS') select(undefined); }}
      style={{ position: 'absolute', inset: 0, filter: connected ? undefined : 'grayscale(0.8) brightness(0.8)', transition: 'filter .4s' }}
    >
      <color attach="background" args={[view === 'office' ? '#efe9dd' : '#cfe3f2']} />
      <hemisphereLight args={['#ffffff', '#8d7f6a', 0.9]} />
      <directionalLight position={[10, 18, 8]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={30} shadow-camera-bottom={-30} />
      {walk ? <WalkControls /> : (
        <>
          <OrbitControls makeDefault enabled={!overlay} maxPolarAngle={1.35} minDistance={3} maxDistance={80} enableDamping />
          <CameraRig view={view} count={officeSize} projects={new Set(agents.map((a) => a.project)).size} />
          <CameraFocus view={view} />
        </>
      )}
      <KeyboardNav />
      <SceneAudio />
      <BeaconMenuAnchor />
      {/* ponytail: the first drei <Html> in a scene never mounts (drei 10 + R3F 9 + React 19); this sentinel absorbs it. Drop when fixed upstream. */}
      <Html key={view} />
      {walk && <WalkCompass />}
      {view === 'office' ? <OfficeLayout agents={agents} /> : <VillageLayout agents={agents} />}
    </Canvas>
  );
}

/** Flies the camera to the selected agent (~1s; reduced motion: cuts straight there), then hands control back to the user. */
function CameraFocus({ view }: { view: View }) {
  const still = useReducedMotion();
  const selectedId = useAgents((s) => s.selectedId);
  const focusNonce = useAgents((s) => s.focusNonce);
  const controls = useThree((s) => s.controls) as OrbitImpl | null;
  const until = useRef(0);
  useEffect(() => { if (selectedId) until.current = performance.now() + 1100; }, [selectedId, focusNonce]);
  const goalCam = useRef(new Vector3());
  const goalTarget = useRef(new Vector3());
  useFrame(({ camera }, dt) => {
    if (!selectedId || !controls || performance.now() > until.current) return;
    const p = positions.get(selectedId);
    if (!p) return;
    const k = still ? 1 : Math.min(1, dt * 5);
    // aim at chest height, not the feet, so the head and bubble above it stay in frame
    goalTarget.current.set(p.x, p.y + 1.2, p.z);
    controls.target.lerp(goalTarget.current, k);
    const [up, back] = view === 'office' ? [4.5, 5.5] : [8, 10];
    goalCam.current.set(p.x, p.y + up, p.z + back);
    camera.position.lerp(goalCam.current, k);
    controls.update();
    if (still) until.current = 0; // one cut is enough: hand control straight back
  });
  return null;
}

/** Re-frames the camera when the view (or office size) changes; the user can orbit freely after. */
function CameraRig({ view, count, projects }: { view: View; count: number; projects: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitImpl | null;
  const resetNonce = useAgents((s) => s.resetNonce);
  useEffect(() => {
    if (view === 'office') {
      // frame the whole floor: benches, meeting rooms, windows and the lounge in front
      const p = officePlan(count);
      const cx = (p.leftX + p.windowX(0)) / 2, cz = (p.backZ + p.frontZ) / 2;
      const d = Math.max(p.windowX(0) - p.leftX, p.frontZ - p.backZ) * 0.78 + 2;
      camera.position.set(cx, d * 0.95, cz + d * 0.85);
      controls?.target.set(cx, 0.5, cz);
    } else {
      const r = Math.max(15, projects * 2.2) + 4; // matches housePositions' ring radius
      camera.position.set(0, r * 1.25, r * 1.45);
      controls?.target.set(0, 0.5, 0);
    }
    controls?.update();
  }, [view, count, projects, camera, controls, resetNonce]);
  return null;
}
