import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import type { Group } from 'three';
import { useCanvasTexture } from '../../hooks/useTextTexture';
import { STAGE, type Viewpoint } from './officePlan';

type V3 = [number, number, number];

/** Small platform stage: dark boards, a light strip along the front edge, a mic stand. */
export function Stage({ position }: { position: V3 }) {
  const { hw, hd, h } = STAGE;
  return (
    <group position={position}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow><boxGeometry args={[hw * 2, h, hd * 2]} /><meshStandardMaterial color="#3a2a1e" roughness={0.8} /></mesh>
      <mesh position={[-hw - 0.01, h * 0.55, 0]}><boxGeometry args={[0.02, 0.05, hd * 2]} /><meshStandardMaterial color="#fde68a" emissive="#fbbf24" emissiveIntensity={1.2} /></mesh>
      <group position={[0.3, h, 0]}>
        <mesh position={[0, 0.02, 0]}><cylinderGeometry args={[0.16, 0.16, 0.03, 16]} /><meshStandardMaterial color="#111" /></mesh>
        <mesh position={[0, 0.75, 0]}><cylinderGeometry args={[0.012, 0.012, 1.5, 8]} /><meshStandardMaterial color="#222" metalness={0.6} /></mesh>
        <mesh position={[-0.05, 1.52, 0]} rotation={[0, 0, 0.5]}><capsuleGeometry args={[0.03, 0.06, 4, 8]} /><meshStandardMaterial color="#333" metalness={0.5} /></mesh>
      </group>
    </group>
  );
}

const HIDE_NEAR = 1.5; // you're standing on it: no marker in your face

/** Walk mode: a floating tag at each vantage point; click one to dash there (WalkControls reads userData.viewpoint). */
export function ViewpointMarkers({ points }: { points: Viewpoint[] }) {
  return <>{points.map((v, i) => <Marker key={v.name} v={v} index={i} />)}</>;
}

function Marker({ v, index }: { v: Viewpoint; index: number }) {
  const g = useRef<Group>(null);
  const tex = useCanvasTexture(320, 96, (ctx) => {
    ctx.clearRect(0, 0, 320, 96);
    ctx.fillStyle = 'rgba(17, 24, 39, 0.88)';
    ctx.beginPath(); ctx.roundRect(4, 4, 312, 88, 44); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = '600 40px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${v.icon} ${v.name}`, 160, 50);
  }, [v.name, v.icon]);
  useFrame(({ camera, clock }) => {
    if (!g.current) return;
    const d = Math.hypot(camera.position.x - v.x, camera.position.z - v.z);
    g.current.visible = d > HIDE_NEAR;
    g.current.scale.setScalar(Math.min(4, Math.max(0.45, d * 0.12))); // roughly constant size on screen: far ones stay readable
    g.current.position.y = 2.3 + Math.sin(clock.elapsedTime * 1.5 + index) * 0.05;
  });
  return (
    <group position={[v.x, 0, v.z]}>
      <group ref={g} userData={{ viewpoint: index }}>
        <Billboard>
          {/* drawn over walls, so you can always find (and pick) the other vantage points */}
          <mesh renderOrder={8}>
            <planeGeometry args={[1.25, 0.375]} />
            <meshBasicMaterial map={tex} transparent depthTest={false} toneMapped={false} />
          </mesh>
        </Billboard>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.35, 0.45, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}
