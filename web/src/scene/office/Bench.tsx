import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, MeshStandardMaterial } from 'three';
import type { AgentState } from '../../../../daemon/src/types';
import { useCanvasTexture, useTextTexture } from '../../hooks/useTextTexture';
import { useAgents } from '../../store/agents';
import { CHARACTER, STATUS_COLOR } from '../characters';
import { KeyboardMouse, Mug, PenStand } from './DeskItems';
import { BENCH_W, SEAT_PITCH, SEAT_Z } from './officePlan';

const FRAME = '#374151';
const TOP = '#f5f5f3', LEG = '#5e626a', PED = '#f0f0ee';
const EMPTY_SCREEN = ['#7fb8d8', '#f2c230']; // unoccupied desks keep the office's blue / yellow screens
const DIVIDER_H = 0.5;
const DESK_Y = 0.76;

/** A long white bench desk, two rows of seats back to back, with a central divider rail (per-seat screens are on the seats). */
export function Bench({ x, z, L }: { x: number; z: number; L: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, DESK_Y, 0]} castShadow receiveShadow><boxGeometry args={[BENCH_W, 0.05, L]} /><meshStandardMaterial color={TOP} /></mesh>
      {[-1, 1].flatMap((sz) => [-1, 1].map((sx) => (
        <mesh key={`${sx}${sz}`} position={[sx * (BENCH_W / 2 - 0.06), DESK_Y / 2, sz * (L / 2 - 0.08)]} castShadow><boxGeometry args={[0.06, DESK_Y, 0.06]} /><meshStandardMaterial color={LEG} /></mesh>
      )))}
      {/* divider rail */}
      <mesh position={[0, DESK_Y + DIVIDER_H + 0.015, 0]}><boxGeometry args={[0.05, 0.03, L]} /><meshStandardMaterial color={LEG} /></mesh>
    </group>
  );
}

/** Everything at one seat, in the seat's local frame (desk centre at the origin, monitor towards -z, sitter at +z). */
export function SeatKit({ agent, index, away = false }: { agent?: AgentState; index: number; away?: boolean }) {
  return (
    <>
      {/* white pedestal under the desk */}
      <mesh position={[0.42, 0.29, 0.02]} castShadow><boxGeometry args={[0.42, 0.55, 0.5]} /><meshStandardMaterial color={PED} /></mesh>
      {agent ? <Occupied agent={agent} /> : <Empty index={index} />}
      <Chair hidden={(agent?.status === 'working' || agent?.status === 'idle') && !away} />
    </>
  );
}

const screenZ = -BENCH_W / 4 + 0.022; // this seat's face of the central divider

function Occupied({ agent }: { agent: AgentState }) {
  const glow = useStatusGlow(agent.status);
  const plate = useNameplate(agent.project || agent.kind, agent.status, CHARACTER[agent.kind].color);
  const crashed = agent.status === 'crashed';
  const screenTex = useTextTexture(crashed ? '✕ exited' : agent.activity.summary, crashed ? '#7f1d1d' : STATUS_COLOR[agent.status]);
  return (
    <>
      {/* desk screen: this seat's half of the divider glows in the agent's status colour */}
      <mesh position={[0, DESK_Y + DIVIDER_H / 2, screenZ]} material={glow}><planeGeometry args={[SEAT_PITCH - 0.08, DIVIDER_H]} /></mesh>
      {/* nameplate clipped to the top of the screen */}
      <group position={[0, DESK_Y + DIVIDER_H + 0.12, screenZ - 0.005]}>
        <mesh><boxGeometry args={[1.14, 0.2, 0.02]} /><meshStandardMaterial color={FRAME} /></mesh>
        <mesh position={[0, 0, 0.011]}><planeGeometry args={[1.1, 0.175]} /><meshBasicMaterial map={plate} toneMapped={false} /></mesh>
      </group>
      {/* monitor faces the sitter; clicking it maximises it */}
      <group position={[0, 1.07, -0.14]}>
        <mesh castShadow><boxGeometry args={[0.66, 0.4, 0.04]} /><meshStandardMaterial color="#15161a" /></mesh>
        <mesh position={[0, 0, 0.021]}><planeGeometry args={[0.6, 0.345]} /><meshBasicMaterial map={screenTex} toneMapped={false} /></mesh>
      </group>
      <mesh position={[0, DESK_Y + 0.07, -0.16]}><boxGeometry args={[0.06, 0.12, 0.06]} /><meshStandardMaterial color="#15161a" /></mesh>
      <KeyboardMouse position={[0, DESK_Y + 0.025, 0.12]} />
      <Mug position={[-0.5, DESK_Y + 0.025, 0.1]} color={CHARACTER[agent.kind].color} />
      <PenStand position={[0.5, DESK_Y + 0.025, -0.15]} />
    </>
  );
}

function Empty({ index }: { index: number }) {
  return (
    <>
      <mesh position={[0, DESK_Y + DIVIDER_H / 2, screenZ]}><planeGeometry args={[SEAT_PITCH - 0.08, DIVIDER_H]} /><meshStandardMaterial color={EMPTY_SCREEN[index % 2]} /></mesh>
      <group position={[0, 1.07, -0.14]}>
        <mesh castShadow><boxGeometry args={[0.66, 0.4, 0.04]} /><meshStandardMaterial color="#15161a" /></mesh>
      </group>
      <mesh position={[0, DESK_Y + 0.07, -0.16]}><boxGeometry args={[0.06, 0.12, 0.06]} /><meshStandardMaterial color="#15161a" /></mesh>
    </>
  );
}

/** Black mesh office chair, tucked in at the desk. While its agent is seated it's hidden: the seated agent carries it (Person SitChair). */
function Chair({ hidden }: { hidden: boolean }) {
  if (hidden) return null;
  return (
    <group position={[0, 0, SEAT_Z + 0.25]}>
      <mesh position={[0, 0.46, 0]} castShadow><boxGeometry args={[0.52, 0.08, 0.5]} /><meshStandardMaterial color="#1b1c1f" roughness={0.8} /></mesh>
      <mesh position={[0, 0.85, 0.24]} rotation={[-0.08, 0, 0]} castShadow><boxGeometry args={[0.48, 0.66, 0.05]} /><meshStandardMaterial color="#1b1c1f" roughness={0.8} /></mesh>
      {[-0.27, 0.27].map((x) => <mesh key={x} position={[x, 0.6, 0.02]}><boxGeometry args={[0.04, 0.04, 0.34]} /><meshStandardMaterial color="#2a2b2f" /></mesh>)}
      <mesh position={[0, 0.23, 0]}><cylinderGeometry args={[0.035, 0.035, 0.44]} /><meshStandardMaterial color={LEG} /></mesh>
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2;
        return <mesh key={i} position={[Math.cos(a) * 0.15, 0.03, Math.sin(a) * 0.15]} rotation={[0, -a, 0]}><boxGeometry args={[0.3, 0.03, 0.04]} /><meshStandardMaterial color={LEG} /></mesh>;
      })}
    </group>
  );
}

const PLATE_W = 704, PLATE_H = 112; // 1.1 × 0.175 plane (same 6.3:1 ratio)
const GLYPH: Record<AgentState['status'], string> = { working: '', needs_input: '!', idle: 'z', crashed: '✕' };

/** Nameplate: status disc (arc = working, ! = needs you, z = idle, ✕ = exited) + name, kind-coloured underline. */
export function useNameplate(name: string, status: AgentState['status'], kindColor: string) {
  return useCanvasTexture(PLATE_W, PLATE_H, (ctx) => {
    ctx.fillStyle = FRAME;
    ctx.fillRect(0, 0, PLATE_W, PLATE_H);
    ctx.fillStyle = kindColor;
    ctx.fillRect(0, PLATE_H - 10, PLATE_W, 10);
    ctx.font = '700 58px ui-sans-serif, -apple-system, system-ui, sans-serif';
    const textW = Math.min(ctx.measureText(name).width, PLATE_W - 160);
    const r = 30, gap = 20;
    const x0 = (PLATE_W - (r * 2 + gap + textW)) / 2;
    const cy = (PLATE_H - 10) / 2;
    const sc = STATUS_COLOR[status];
    if (status === 'working') {
      ctx.lineWidth = 9;
      ctx.strokeStyle = sc + '55';
      ctx.beginPath(); ctx.arc(x0 + r, cy, r - 5, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = sc;
      ctx.beginPath(); ctx.arc(x0 + r, cy, r - 5, -Math.PI / 2, Math.PI / 3); ctx.stroke();
    } else {
      ctx.fillStyle = sc;
      ctx.beginPath(); ctx.arc(x0 + r, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = status === 'needs_input' ? '#1c1917' : '#fff';
      ctx.font = '800 40px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(GLYPH[status], x0 + r, cy + 2);
    }
    ctx.font = '700 58px ui-sans-serif, -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = status === 'needs_input' ? sc : status === 'crashed' ? '#fca5a5' : status === 'idle' ? '#cbd5e1' : '#f9fafb';
    let label = name;
    while (label.length > 1 && ctx.measureText(label).width > textW) label = label.slice(0, -2) + '…';
    ctx.fillText(label, x0 + r * 2 + gap, cy + 2);
    if (status === 'crashed') ctx.fillRect(x0 + r * 2 + gap, cy, ctx.measureText(label).width, 5);
  }, [name, status, kindColor]);
}

/** Glowing material for a seat's desk screen in its agent's status colour; pulses while the agent needs you. */
export function useStatusGlow(status: AgentState['status']) {
  const mat = useMemo(() => new MeshStandardMaterial({ color: FRAME, emissiveIntensity: 0.9 }), []);
  useEffect(() => {
    const c = new Color(STATUS_COLOR[status]);
    mat.color.copy(c);
    mat.emissive.copy(c);
    mat.emissiveIntensity = status === 'crashed' ? 0.5 : status === 'idle' ? 0.15 : 0.7;
  }, [mat, status]);
  useFrame(({ clock }) => {
    if (status === 'needs_input') mat.emissiveIntensity = 0.5 + (Math.sin(clock.elapsedTime * 5) + 1) * 0.5;
  });
  useEffect(() => () => mat.dispose(), [mat]);
  return mat;
}

