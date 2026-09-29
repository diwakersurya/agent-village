import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import { loopPoint, spawnDirt, sweep, type Dirt } from './vacuumPath';
import { sfx, stopVacuumHum, vacuumHum } from '../../audio/sfx';
import { useInteract } from '../../hooks/useInteract';
import { useTimedAction } from '../../hooks/useTimedAction';
import { useAgents } from '../../store/agents';

type V3 = [number, number, number];

/** Office water cooler: cabinet, blue bottle, taps, cup stack. Faces +z. Use it: bubbles glug up the bottle and a cup fills. */
export function WaterCooler({ position, rotationY = 0, scale = 1 }: { position: V3; rotationY?: number; scale?: number }) {
  const [pouring, pour] = useTimedAction(2.2);
  const use = useInteract(() => {
    if (!pour()) return;
    sfx.glug([position[0], 1.2, position[2]]);
    useAgents.getState().showToast('💧 Ahh, refreshing');
  });
  const bubbles = useRef<Group>(null);
  const water = useRef<Mesh>(null);
  const fill = useRef(0);
  useFrame(({ clock }, dt) => {
    fill.current = pouring ? Math.min(1, fill.current + dt / 1.8) : Math.max(0, fill.current - dt / 3);
    if (water.current) { water.current.scale.y = Math.max(0.01, fill.current); water.current.visible = fill.current > 0.02; }
    bubbles.current?.children.forEach((b, i) => {
      b.visible = pouring;
      b.position.y = 1.05 + (((clock.elapsedTime * 0.9 + i * 0.27) % 1) * 0.42);
    });
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale} {...use}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow><boxGeometry args={[0.42, 1, 0.42]} /><meshStandardMaterial color="#f3f4f6" /></mesh>
      <mesh position={[0, 0.72, 0.215]}><boxGeometry args={[0.3, 0.16, 0.02]} /><meshStandardMaterial color="#d1d5db" /></mesh>
      <mesh position={[-0.07, 0.72, 0.235]}><boxGeometry args={[0.05, 0.05, 0.04]} /><meshStandardMaterial color="#3b82f6" /></mesh>
      <mesh position={[0.07, 0.72, 0.235]}><boxGeometry args={[0.05, 0.05, 0.04]} /><meshStandardMaterial color="#ef4444" /></mesh>
      <mesh position={[0, 0.6, 0.22]}><boxGeometry args={[0.24, 0.02, 0.08]} /><meshStandardMaterial color="#9ca3af" /></mesh>
      <mesh position={[0, 1.27, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.17, 0.5, 24]} />
        <meshStandardMaterial color="#60a5fa" transparent opacity={0.65} roughness={0.1} />
      </mesh>
      <mesh position={[0, 1.54, 0]}><cylinderGeometry args={[0.07, 0.1, 0.06, 16]} /><meshStandardMaterial color="#3b82f6" transparent opacity={0.7} /></mesh>
      <group ref={bubbles}>
        {[-0.06, 0.05, -0.02, 0.07].map((x, i) => (
          <mesh key={i} position={[x, 1.1, (i % 2 ? 0.05 : -0.04)]} visible={false}><sphereGeometry args={[0.022 + (i % 2) * 0.01, 10, 10]} /><meshStandardMaterial color="#dbeafe" transparent opacity={0.9} /></mesh>
        ))}
      </group>
      {/* the cup you fill, under the blue tap */}
      <group position={[-0.07, 0.61, 0.24]} visible={pouring}>
        <mesh position={[0, 0.045, 0]}><cylinderGeometry args={[0.035, 0.028, 0.09, 12, 1, true]} /><meshStandardMaterial color="#fafafa" side={2} /></mesh>
        <mesh ref={water} position={[0, 0.005, 0]} scale={[1, 0.01, 1]}><cylinderGeometry args={[0.03, 0.026, 0.08, 12]} /><meshStandardMaterial color="#93c5fd" /></mesh>
      </group>
      {/* paper cups */}
      <mesh position={[0.3, 0.9, 0]}><cylinderGeometry args={[0.035, 0.03, 0.22, 12]} /><meshStandardMaterial color="#fafafa" /></mesh>
    </group>
  );
}

/** Small pantry against a wall: counter + cabinets, sink, coffee machine, microwave, fridge, fruit bowl. Faces +z. */
export function Pantry({ position, rotationY = 0, scale = 1 }: { position: V3; rotationY?: number; scale?: number }) {
  const at: V3 = [position[0], 1.1, position[2]];
  const toast = (t: string) => useAgents.getState().showToast(t);
  const [brewing, brew] = useTimedAction(3, () => toast("☕ Coffee's ready"));
  const [heating, heat] = useTimedAction(3, () => toast('🍿 Ding! Snack time'));
  const [open, openDoor] = useTimedAction(2, () => sfx.thunk(at));
  const coffee = useInteract(() => { if (brew()) { sfx.brew(at, 3); toast('☕ Brewing…'); } });
  const micro = useInteract(() => { if (heat()) sfx.microwave(at, 3); });
  const fridge = useInteract(() => { if (openDoor()) { sfx.thunk(at); toast('🧃 Grabbed a juice'); } });
  const door = useRef<Group>(null);
  useFrame((_, dt) => {
    if (door.current) door.current.rotation.y += ((open ? 1.7 : 0) - door.current.rotation.y) * Math.min(1, dt * 6);
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {/* base cabinets + counter */}
      <mesh position={[0, 0.43, 0]} castShadow receiveShadow><boxGeometry args={[2.2, 0.86, 0.6]} /><meshStandardMaterial color="#e7e0d3" /></mesh>
      {[-0.8, -0.27, 0.27, 0.8].map((x) => (
        <mesh key={x} position={[x, 0.45, 0.305]}><boxGeometry args={[0.48, 0.7, 0.01]} /><meshStandardMaterial color="#d6ccbb" /></mesh>
      ))}
      <mesh position={[0, 0.89, 0]} receiveShadow><boxGeometry args={[2.26, 0.06, 0.64]} /><meshStandardMaterial color="#4b5563" roughness={0.4} /></mesh>
      {/* sink */}
      <mesh position={[0.55, 0.915, 0.02]}><boxGeometry args={[0.5, 0.01, 0.36]} /><meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.3} /></mesh>
      <mesh position={[0.55, 1.05, -0.2]}><cylinderGeometry args={[0.015, 0.015, 0.26, 8]} /><meshStandardMaterial color="#d1d5db" metalness={0.8} /></mesh>
      {/* coffee machine (usable: steam, brew, ding) */}
      <group position={[-0.25, 0.92, -0.05]} {...coffee}>
        <Steam on={brewing} />
        <mesh position={[0, 0.2, 0]} castShadow><boxGeometry args={[0.3, 0.4, 0.3]} /><meshStandardMaterial color="#1f2937" /></mesh>
        <mesh position={[0, 0.1, 0.16]}><boxGeometry args={[0.16, 0.12, 0.02]} /><meshStandardMaterial color="#111827" /></mesh>
        <mesh position={[0.08, 0.32, 0.155]}><circleGeometry args={[0.025, 12]} /><meshBasicMaterial color="#22c55e" /></mesh>
        <mesh position={[0, 0.05, 0.12]}><cylinderGeometry args={[0.04, 0.035, 0.08, 12]} /><meshStandardMaterial color="#fafafa" /></mesh>
      </group>
      {/* microwave (usable: glows and hums, then dings) */}
      <group position={[-0.8, 0.92, -0.02]} {...micro}>
        <mesh position={[0, 0.15, 0]} castShadow><boxGeometry args={[0.5, 0.3, 0.36]} /><meshStandardMaterial color="#e5e7eb" /></mesh>
        <mesh position={[-0.06, 0.15, 0.185]}>
          <planeGeometry args={[0.32, 0.2]} />
          <meshStandardMaterial color={heating ? '#fde68a' : '#111827'} emissive={heating ? '#fbbf24' : '#000000'} emissiveIntensity={heating ? 1.2 : 0} />
        </mesh>
        <mesh position={[0.18, 0.15, 0.185]}><planeGeometry args={[0.08, 0.2]} /><meshStandardMaterial color="#9ca3af" /></mesh>
      </group>
      {/* fruit bowl */}
      <group position={[0.1, 0.94, 0.12]}>
        <mesh><cylinderGeometry args={[0.13, 0.08, 0.06, 16]} /><meshStandardMaterial color="#f5f5f4" /></mesh>
        {[[-0.04, '#ef4444'], [0.04, '#f59e0b'], [0, '#84cc16']].map(([x, c], i) => (
          <mesh key={i} position={[x as number, 0.06, i === 2 ? 0.04 : 0]}><sphereGeometry args={[0.045, 12, 12]} /><meshStandardMaterial color={c as string} /></mesh>
        ))}
      </group>
      {/* wall cabinets */}
      <mesh position={[0, 1.95, -0.12]} castShadow><boxGeometry args={[2.2, 0.6, 0.36]} /><meshStandardMaterial color="#e7e0d3" /></mesh>
      {/* fridge (usable: the door swings open, then shuts) */}
      <group position={[1.5, 0, 0]} {...fridge}>
        <mesh position={[0, 0.95, -0.02]} castShadow receiveShadow><boxGeometry args={[0.7, 1.9, 0.62]} /><meshStandardMaterial color="#d1d5db" metalness={0.3} roughness={0.4} /></mesh>
        {/* lit interior, hidden behind the door until it opens */}
        <mesh position={[0, 0.95, 0.291]}><planeGeometry args={[0.62, 1.8]} /><meshStandardMaterial color="#f8fafc" emissive="#e0f2fe" emissiveIntensity={0.5} /></mesh>
        {[0.55, 1.05, 1.5].map((y) => <mesh key={y} position={[0, y, 0.2]}><boxGeometry args={[0.6, 0.015, 0.18]} /><meshStandardMaterial color="#cbd5e1" /></mesh>)}
        {[[-0.18, '#f97316'], [0, '#22c55e'], [0.16, '#ef4444']].map(([x, c]) => (
          <mesh key={c as string} position={[x as number, 1.15, 0.2]}><cylinderGeometry args={[0.035, 0.035, 0.18, 10]} /><meshStandardMaterial color={c as string} /></mesh>
        ))}
        <group ref={door} position={[0.35, 0, 0.3]}>
          <mesh position={[-0.35, 0.95, 0.02]} castShadow><boxGeometry args={[0.7, 1.9, 0.04]} /><meshStandardMaterial color="#d1d5db" metalness={0.3} roughness={0.4} /></mesh>
          <mesh position={[-0.35, 1.3, 0.042]}><boxGeometry args={[0.68, 0.01, 0.01]} /><meshStandardMaterial color="#9ca3af" /></mesh>
          <mesh position={[-0.63, 1.0, 0.06]}><boxGeometry args={[0.03, 0.4, 0.03]} /><meshStandardMaterial color="#6b7280" /></mesh>
          <mesh position={[-0.63, 1.55, 0.06]}><boxGeometry args={[0.03, 0.2, 0.03]} /><meshStandardMaterial color="#6b7280" /></mesh>
        </group>
      </group>
      {/* bar stools */}
      {[-0.5, 0.3].map((x) => (
        <group key={x} position={[x, 0, 0.75]}>
          <mesh position={[0, 0.62, 0]}><cylinderGeometry args={[0.17, 0.17, 0.05, 16]} /><meshStandardMaterial color="#b45309" /></mesh>
          <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.025, 0.025, 0.6, 8]} /><meshStandardMaterial color="#374151" /></mesh>
          <mesh position={[0, 0.01, 0]}><cylinderGeometry args={[0.14, 0.14, 0.02, 16]} /><meshStandardMaterial color="#374151" /></mesh>
        </group>
      ))}
    </group>
  );
}

/** Steam puffs rising from the coffee machine while it brews. */
function Steam({ on }: { on: boolean }) {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    g.current?.children.forEach((p, i) => {
      const t = (clock.elapsedTime * 0.7 + i / 3) % 1;
      p.visible = on;
      p.position.set(Math.sin(t * 6 + i) * 0.03, 0.42 + t * 0.4, 0.05);
      p.scale.setScalar(0.5 + t);
      ((p as Mesh).material as MeshStandardMaterial).opacity = 0.6 * (1 - t);
    });
  });
  return (
    <group ref={g}>
      {[0, 1, 2].map((i) => <mesh key={i} visible={false}><sphereGeometry args={[0.05, 10, 10]} /><meshStandardMaterial color="#ffffff" transparent opacity={0.5} depthWrite={false} /></mesh>)}
    </group>
  );
}

const VAC_SPEED = 0.55; // units/s
const KICK_SPEED = 3.5; // slides ~1.2 m before friction stops it
const BUMP = 0.8; // walk into it this close and you kick it
const VAC_SCALE = 1.4;
const PICKUP = 0.3 * VAC_SCALE;
const DIRT_EVERY = 5; // s between new patches
const DIRT_MAX = 10;

/** A small patch of dirt: a smudge plus a few crumbs. */
function DirtPatch({ d }: { d: Dirt }) {
  return (
    <group position={[d.x, 0.012, d.z]} rotation={[0, d.spin, 0]} scale={1.7}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.16, 10]} /><meshStandardMaterial color="#6b4f33" transparent opacity={0.55} /></mesh>
      {[[0.07, 0.03], [-0.05, 0.06], [0.02, -0.08], [-0.09, -0.03], [0.1, -0.06]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.012, z]}><boxGeometry args={[0.035, 0.022, 0.03]} /><meshStandardMaterial color={i % 2 ? '#4b3621' : '#7c5c3b'} /></mesh>
      ))}
    </group>
  );
}

/** Robot vacuum that patrols the corridor around the cabins, pausing to spin at corners, LED blinking. */
/** Loop is centred on (cx, cz); dirt and the vacuum live in that local frame, sounds get world positions. */
export function RobotVacuum({ halfX, halfZ, cx = 0, cz = 0 }: { halfX: number; halfZ: number; cx?: number; cz?: number }) {
  const g = useRef<Group>(null);
  const led = useRef<Mesh>(null);
  const brush = useRef<Group>(null);
  const s = useRef(0);
  const pause = useRef(0);
  const [dirt, setDirt] = useState<Dirt[]>(() => Array.from({ length: 5 }, () => spawnDirt(halfX, halfZ)));
  const live = useRef(dirt); // frame loop reads/writes this; React state only changes on spawn/pickup
  const spawnIn = useRef(DIRT_EVERY);
  useEffect(() => stopVacuumHum, []);
  // knocked off its track by a kick: slides and spins, then drives itself back
  const knock = useRef({ x: 0, z: 0, vx: 0, vz: 0, spin: 0, cool: 0 });
  const camPos = useRef<[number, number]>([0, 0]);
  const kick = (fx: number, fz: number) => {
    const k = knock.current, p = g.current!.position;
    if (k.cool > 0) return;
    const dx = p.x + cx - fx, dz = p.z + cz - fz, d = Math.hypot(dx, dz) || 1;
    k.vx = (dx / d) * KICK_SPEED; k.vz = (dz / d) * KICK_SPEED; k.spin = 14; k.cool = 1;
    sfx.bonk([p.x + cx, 0.1, p.z + cz]);
  };
  const kickable = useInteract(() => kick(...camPos.current));
  useFrame(({ clock, camera }, dt) => {
    if (!g.current) return;
    camPos.current = [camera.position.x, camera.position.z];
    const k = knock.current;
    k.cool -= dt;
    if (useAgents.getState().walk && Math.hypot(g.current.position.x + cx - camera.position.x, g.current.position.z + cz - camera.position.z) < BUMP) kick(camera.position.x, camera.position.z);
    const sliding = Math.hypot(k.vx, k.vz) > 0.05;
    if (sliding) {
      k.x += k.vx * dt; k.z += k.vz * dt;
      const f = Math.exp(-3 * dt); k.vx *= f; k.vz *= f;
    } else {
      const d = Math.hypot(k.x, k.z), step = Math.min(d, 0.8 * dt);
      if (d > 1e-4) { k.x -= (k.x / d) * step; k.z -= (k.z / d) * step; }
    }
    k.spin *= Math.exp(-2 * dt);
    spawnIn.current -= dt;
    if (spawnIn.current <= 0) {
      spawnIn.current = DIRT_EVERY * (0.6 + Math.random() * 0.8);
      if (live.current.length < DIRT_MAX) setDirt((live.current = [...live.current, spawnDirt(halfX, halfZ)]));
    }
    const { x, z } = g.current.position;
    vacuumHum(x + cx, z + cz);
    const left = sweep(live.current, x, z, PICKUP);
    if (left !== live.current) { sfx.slurp([x + cx, 0.1, z + cz]); setDirt((live.current = left)); }
    const before = loopPoint(s.current, halfX, halfZ);
    if (sliding || Math.hypot(k.x, k.z) > 1e-3) {
      g.current.position.set(before.x + k.x, 0, before.z + k.z); // off track: the loop waits
      g.current.rotation.y += k.spin * dt;
    } else if (pause.current > 0) {
      pause.current -= dt;
      g.current.rotation.y += dt * 3; // little celebratory spin at corners
    } else {
      s.current += VAC_SPEED * dt;
      const p = loopPoint(s.current, halfX, halfZ);
      if (p.heading !== before.heading) pause.current = 1.2;
      g.current.position.set(p.x, 0, p.z);
      const d = ((p.heading - g.current.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      g.current.rotation.y += d * Math.min(1, dt * 6);
    }
    if (brush.current) brush.current.rotation.y += dt * 12;
    if (led.current) (led.current.material as MeshStandardMaterial).emissiveIntensity = 0.6 + Math.sin(clock.elapsedTime * 4) * 0.5;
  });
  return (
    <group position={[cx, 0, cz]}>
    {dirt.map((d) => <DirtPatch key={d.id} d={d} />)}
    <group ref={g} {...kickable}>
    <group scale={VAC_SCALE}>
      <mesh position={[0, 0.05, 0]} castShadow><cylinderGeometry args={[0.28, 0.28, 0.08, 32]} /><meshStandardMaterial color="#e5e7eb" roughness={0.35} /></mesh>
      <mesh position={[0, 0.092, 0]}><cylinderGeometry args={[0.2, 0.2, 0.01, 32]} /><meshStandardMaterial color="#111827" roughness={0.2} /></mesh>
      <mesh position={[0, 0.1, -0.05]}><cylinderGeometry args={[0.05, 0.05, 0.02, 16]} /><meshStandardMaterial color="#374151" /></mesh>
      <mesh ref={led} position={[0, 0.1, 0.14]}><sphereGeometry args={[0.018, 8, 8]} /><meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={1} /></mesh>
      {/* front bumper */}
      <mesh position={[0, 0.05, 0.2]} rotation={[0, 0, 0]}><boxGeometry args={[0.36, 0.05, 0.06]} /><meshStandardMaterial color="#9ca3af" /></mesh>
      {/* side brush */}
      <group ref={brush} position={[0.2, 0.012, 0.16]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, (i * Math.PI * 2) / 3, 0]} position={[0, 0, 0]}>
            <boxGeometry args={[0.16, 0.004, 0.012]} />
            <meshStandardMaterial color="#6b7280" />
          </mesh>
        ))}
      </group>
    </group>
    </group>
    </group>
  );
}
