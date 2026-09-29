import { useAgents } from '../../store/agents';
import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import type { AgentState } from '../../../../daemon/src/types';
import { Person } from '../Person';
import { BUILDINGS, BUILDING_LABEL, buildingFor, housePositions, personTarget, type Building, type Vec3 } from './placement';
import styles from './Village.module.css';

const BUILDING_COLOR: Record<Building, string> = { workshop: '#a8a29e', library: '#b45309', drafting: '#0f766e', post: '#be123c' };
const HOUSE_COLORS = ['#fde68a', '#dbeafe', '#fecaca', '#d9f99d', '#e9d5ff', '#fed7aa', '#ccfbf1'];

/** Projects are houses; agents walk to the building for the tool they are using right now. */
export function VillageLayout({ agents: all }: { agents: AgentState[] }) {
  const hidden = useAgents((s) => s.hiddenStatuses);
  const agents = useMemo(() => all.filter((a) => !hidden.includes(a.status)), [all, hidden]);
  const houses = useMemo(() => housePositions(agents.map((a) => a.project)), [agents]);
  const radius = Math.max(...Object.values(houses).map(([x, z]) => Math.hypot(x, z)), 10) + 8;

  const placed = useMemo(() => {
    const counts = new Map<string, number>();
    return agents.map((a) => {
      const b = a.status === 'working' ? buildingFor(a.activity.tool) : null;
      const spot = b ?? `house:${a.project}`;
      const index = counts.get(spot) ?? 0;
      counts.set(spot, index + 1);
      const target = personTarget(a, index, houses);
      const [fx, fz] = b ? BUILDINGS[b] : (houses[a.project] ?? [0, 0]);
      // needs you → turn towards the default camera (which sits south of the square)
      const facing = a.status === 'needs_input' ? Math.atan2(-target[0], 30 - target[2]) : Math.atan2(fx - target[0], fz - target[2]);
      return { a, target, facing };
    });
  }, [agents, houses]);

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[radius, 64]} />
        <meshStandardMaterial color="#a7c98f" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[9.5, 48]} />
        <meshStandardMaterial color="#e3d3a8" />
      </mesh>
      {(Object.keys(BUILDINGS) as Building[]).map((b) => (
        <House key={b} position={BUILDINGS[b]} color={BUILDING_COLOR[b]} roof="#57534e" label={BUILDING_LABEL[b]} size={2.6} />
      ))}
      {Object.entries(houses).map(([name, pos], i) => (
        <group key={name}>
          <Path to={pos} />
          <House position={pos} color={HOUSE_COLORS[i % HOUSE_COLORS.length]} roof="#9a3412" label={`🏠 ${name}`} size={2.2} />
        </group>
      ))}
      <Trees radius={radius} />
      {placed.map(({ a, target, facing }) => (
        <Person key={a.id} agent={a} target={target as Vec3} facing={facing} place="field" />
      ))}
    </>
  );
}

function House({ position, color, roof, label, size }: { position: [number, number]; color: string; roof: string; label: string; size: number }) {
  const [x, z] = position;
  const face = Math.atan2(-x, -z); // door faces the square
  return (
    <group position={[x, 0, z]} rotation={[0, face, 0]}>
      <mesh position={[0, size * 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[size, size * 0.8, size]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, size * 0.8 + size * 0.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[size * 0.85, size * 0.6, 4]} />
        <meshStandardMaterial color={roof} />
      </mesh>
      <mesh position={[0, size * 0.25, size / 2 + 0.01]}>
        <planeGeometry args={[size * 0.28, size * 0.5]} />
        <meshStandardMaterial color="#78350f" />
      </mesh>
      <Html position={[0, size * 1.5, 0]} center distanceFactor={22} zIndexRange={[1, 0]} pointerEvents="none">
        <div className={styles.label}>{label}</div>
      </Html>
    </group>
  );
}

function Path({ to }: { to: [number, number] }) {
  const [x, z] = to;
  const len = Math.hypot(x, z);
  return (
    <mesh position={[x / 2, 0.012, z / 2]} rotation={[-Math.PI / 2, 0, -Math.atan2(z, x)]}>
      <planeGeometry args={[len, 1.2]} />
      <meshStandardMaterial color="#e3d3a8" />
    </mesh>
  );
}

function Trees({ radius }: { radius: number }) {
  const trees = useMemo(() => Array.from({ length: 28 }, (_, i) => {
    const ang = (i / 28) * Math.PI * 2 + (i % 3) * 0.07;
    const r = radius - 2 - (i % 4) * 0.8;
    return [Math.cos(ang) * r, Math.sin(ang) * r, 1.3 + (i % 5) * 0.25] as const; // 1.3–2.3× so they read against the houses
  }), [radius]);
  return (
    <>
      {trees.map(([x, z, s], i) => (
        <group key={i} position={[x, 0, z]} scale={s}>
          <mesh position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.12, 0.15, 1]} /><meshStandardMaterial color="#78350f" /></mesh>
          <mesh position={[0, 1.4, 0]} castShadow><coneGeometry args={[0.7, 1.6, 7]} /><meshStandardMaterial color="#3f7d3a" /></mesh>
        </group>
      ))}
    </>
  );
}
