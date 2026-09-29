import { PoolTable } from '../games/PoolTable';
import { PingPongTable } from '../games/PingPongTable';
import { useCanvasTexture } from '../../hooks/useTextTexture';
import { PILLAR, WALL_H, type OfficePlan } from './officePlan';

type V3 = [number, number, number];

/** The billiards lounge at the front (zigzag carpet is drawn by Room): playable billiards and table tennis, the big pillar with the cue rack. */
export function Lounge({ plan }: { plan: OfficePlan }) {
  const [bx, , bz] = plan.bigPillar;
  return (
    <group>
      {/* both tables run side to side */}
      <group position={plan.billiards} rotation={[0, Math.PI / 2, 0]}><PoolTable /></group>
      <group position={plan.tableTennis} rotation={[0, Math.PI / 2, 0]}><PingPongTable /></group>
      {/* the big plain pillar by the billiards table, cue rack on its side and a whiteboard leaning on it */}
      <mesh position={[bx, WALL_H / 2, bz]} castShadow receiveShadow><boxGeometry args={[1.4, WALL_H, 1.6]} /><meshStandardMaterial color="#f2f2ef" /></mesh>
      {/* cue rack on the face towards the billiards table (+x) */}
      <group position={[bx + 0.72, 0, bz]} rotation={[0, Math.PI, 0]}><CueRack position={[0, 0, 0]} /></group>
      <group position={[bx + 0.3, 0.78, bz - 0.86]} rotation={[0.12, Math.PI, 0]}>
        <mesh castShadow><boxGeometry args={[1.0, 1.5, 0.04]} /><meshStandardMaterial color="#fafafa" /></mesh>
        {[0.45, 0.3, 0.15, 0].map((y, i) => <mesh key={y} position={[-0.1 + (i % 2) * 0.05, y, 0.025]}><planeGeometry args={[0.6 - i * 0.08, 0.02]} /><meshBasicMaterial color="#1f2937" /></mesh>)}
      </group>
    </group>
  );
}

const VALUES = [
  { pre: "we're", big: 'customer', hi: 'obsessed', body: ['We listen - a lot.', "We're fueled by customer", 'feedback and data.'] },
  { pre: "we're", big: 'in it', hi: 'together', body: ['We celebrate our achievements', 'and learn from our', 'mistakes together.'] },
  { pre: 'we look for', big: 'creative', hi: 'solutions', body: ['We never stop improving.', 'Building a transformational', 'platform for recruiting.'] },
  { pre: 'we are', big: 'drama-', hi: 'free', body: ["We're open, honest and", 'straightforward with', 'teammates and customers.'] },
  { pre: 'we are', big: 'true to', hi: 'ourselves', body: ['We encourage sharing', 'diverse points of view', 'and imaginative ideas.'] },
];

/** White structural pillar with one of the company values on two faces (front and the side facing the room's centre). */
export function ValuePillar({ x, z, value }: { x: number; z: number; value: number }) {
  const v = VALUES[value % VALUES.length];
  const tex = useCanvasTexture(512, 1024, (g) => {
    g.fillStyle = '#f7f7f5'; g.fillRect(0, 0, 512, 1024);
    g.fillStyle = '#2d2a6e'; g.font = '600 44px ui-sans-serif, system-ui, sans-serif'; g.fillText(v.pre, 48, 300);
    g.font = '800 78px ui-sans-serif, system-ui, sans-serif'; g.fillText(v.big, 48, 380);
    g.fillStyle = '#f5c518'; g.fillRect(40, 400, g.measureText(v.hi).width + 20, 84);
    g.fillStyle = '#2d2a6e'; g.fillText(v.hi, 50, 470);
    g.font = '500 28px ui-sans-serif, system-ui, sans-serif'; g.fillStyle = '#4b4f7a';
    v.body.forEach((l, i) => g.fillText(l, 48, 560 + i * 40));
    g.fillStyle = '#f5c518'; g.beginPath(); g.arc(90, 820, 34, 0, Math.PI * 2); g.fill();
  }, [value]);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, WALL_H / 2, 0]} castShadow receiveShadow><boxGeometry args={[PILLAR, WALL_H, PILLAR]} /><meshStandardMaterial color="#f7f7f5" /></mesh>
      {/* value on the front (+z) and back (-z) faces, so you read it walking either way down the gap */}
      {[0, Math.PI].map((r) => (
        <mesh key={r} position={[0, WALL_H / 2, Math.cos(r) * (PILLAR / 2 + 0.002)]} rotation={[0, r, 0]}>
          <planeGeometry args={[PILLAR, WALL_H]} /><meshStandardMaterial map={tex} />
        </mesh>
      ))}
    </group>
  );
}

/** Wall rack with four cues, on the snooker room's side wall (faces -x). */
function CueRack({ position }: { position: V3 }) {
  return (
    <group position={position} rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, 1.6, 0]}><boxGeometry args={[0.8, 0.08, 0.06]} /><meshStandardMaterial color="#5b2a16" /></mesh>
      <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.8, 0.08, 0.06]} /><meshStandardMaterial color="#5b2a16" /></mesh>
      {[-0.27, -0.09, 0.09, 0.27].map((x) => (
        <mesh key={x} position={[x, 0.95, 0.05]} castShadow><cylinderGeometry args={[0.008, 0.015, 1.45, 8]} /><meshStandardMaterial color="#d6b98c" /></mesh>
      ))}
    </group>
  );
}
