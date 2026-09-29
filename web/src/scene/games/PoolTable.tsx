import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group, type Mesh, type MeshStandardMaterial } from 'three';
import { sfx } from '../../audio/sfx';
import { useHold } from '../../hooks/useInteract';
import { useAgents } from '../../store/agents';
import { usePlaymate } from '../../hooks/usePlaymate';
import { positions } from '../positions';
import { spotAt } from './PingPongTable';
import { BALL_R, POOL_L, POOL_W, moving, rack, settle, shoot, step } from './pool';

const Y = 0.85, TOP = Y + BALL_R;
const W = POOL_W, L = POOL_L;
const CHARGE_SECS = 1.2; // hold this long for a full-power shot
const PLAY_NEAR = 3.5;
const THINK_SECS = 1.5; // your playmate lines up their shot
const _cam = new Vector3(), _w = new Vector3();

/**
 * Playable billiards (snooker) table: press on it and hold to charge, release to strike the cue ball
 * away from you (you aim by where you stand). An idle agent comes over while you're here and you take turns.
 * Mahogany frame, blue baize like the office's, lamp overhead.
 */
export function PoolTable() {
  const root = useRef<Group>(null);
  const balls = useRef(rack());
  const meshes = useRef<(Mesh | null)[]>([]);
  const cue = useRef<Group>(null);
  const charge = useRef<number | null>(null); // press time while charging
  const aim = useRef<[number, number]>([0, -1]);
  const playmate = usePlaymate('pool');
  const turn = useRef<'you' | 'mate'>('you');
  const think = useRef(0);
  const shotBy = useRef<'you' | 'mate' | null>(null);
  const world = (x: number, z: number): [number, number, number] => { root.current!.localToWorld(_w.set(x, TOP, z)); return [_w.x, _w.y, _w.z]; };

  const hold = useHold({
    down: () => {
      if (moving(balls.current)) return useAgents.getState().showToast('🎱 Wait for the balls to stop');
      if (turn.current === 'mate') return useAgents.getState().showToast('🎱 Not your turn yet');
      charge.current = performance.now();
    },
    up: () => {
      if (charge.current === null) return;
      const power = Math.min(1, (performance.now() - charge.current) / 1000 / CHARGE_SECS);
      charge.current = null;
      shoot(balls.current, aim.current[0], aim.current[1], power);
      shotBy.current = 'you';
      const c = balls.current.find((b) => b.cue)!;
      sfx.clack(world(c.x, c.z), power * 3);
    },
  });

  useFrame(({ camera, clock }, dt) => {
    const g = root.current;
    if (!g) return;
    const bs = balls.current;
    g.worldToLocal(_cam.copy(camera.position));
    // an idle agent comes over and stands across the table from you
    const near = useAgents.getState().walk && Math.hypot(_cam.x, _cam.z) < PLAY_NEAR;
    const id = playmate(near, spotAt(g, (_cam.x >= 0 ? -1 : 1) * (W / 2 + 0.6), 0), clock.elapsedTime);
    const mp = id ? positions.get(id) : undefined;
    const arrived = !!mp && !!useAgents.getState().playmate && Math.hypot(mp.x - useAgents.getState().playmate!.x, mp.z - useAgents.getState().playmate!.z) < 0.3;
    if (!id) turn.current = 'you';
    // turns: once the table is still after a shot, it's the other player's go
    if (shotBy.current && !moving(bs)) {
      turn.current = shotBy.current === 'you' && arrived ? 'mate' : 'you';
      if (turn.current === 'mate') { think.current = THINK_SECS; } else if (shotBy.current === 'mate') useAgents.getState().showToast('🎱 Your turn');
      shotBy.current = null;
    }
    if (turn.current === 'mate' && !shotBy.current && arrived) {
      think.current -= dt;
      if (think.current <= 0) {
        // they go for a random ball, with a random amount of welly
        const c = bs.find((b) => b.cue)!;
        const targets = bs.filter((b) => !b.cue && !b.potted);
        const t = targets[Math.floor(Math.random() * targets.length)];
        if (t && !c.potted) { shoot(bs, t.x - c.x, t.z - c.z, 0.35 + Math.random() * 0.45); sfx.clack(world(c.x, c.z), 2); }
        shotBy.current = 'mate';
      }
    } else if (turn.current === 'mate' && !arrived && !shotBy.current) turn.current = 'you';
    // aim: from you, through the cue ball
    const c = bs.find((b) => b.cue)!;
    const ax = c.x - _cam.x, az = c.z - _cam.z, d = Math.hypot(ax, az) || 1;
    aim.current = [ax / d, az / d];
    let loud = 0;
    for (const e of step(bs, Math.min(dt, 0.05))) {
      if (e.type === 'pot') { sfx.pocket(world(e.x, e.z)); if (e.cue) useAgents.getState().showToast('🎱 Scratch! Cue ball back on its spot'); }
      else if (e.speed > loud) { loud = e.speed; if (loud > 0.15) sfx.clack(world(e.x, e.z), e.speed, e.type === 'cushion'); }
    }
    const cleared = !moving(bs) && bs.every((b) => b.cue || b.potted);
    if (settle(bs) && cleared) useAgents.getState().showToast('🎱 Table cleared — re-racked');
    bs.forEach((b, i) => {
      const m = meshes.current[i];
      if (!m) return;
      m.visible = !b.potted;
      m.position.set(b.x, TOP, b.z);
      (m.material as MeshStandardMaterial).color.set(b.color);
    });
    // the cue: drawn back behind the cue ball while charging (further = harder)
    if (cue.current) {
      const on = charge.current !== null && !c.potted;
      cue.current.visible = on;
      if (on) {
        const p = Math.min(1, (performance.now() - charge.current!) / 1000 / CHARGE_SECS);
        const back = 0.08 + p * 0.3;
        cue.current.position.set(c.x - aim.current[0] * (back + 0.72), TOP + 0.03, c.z - aim.current[1] * (back + 0.72));
        cue.current.rotation.set(0, Math.atan2(aim.current[0], aim.current[1]), 0);
      }
    }
  });

  return (
    <group ref={root}>
      <group {...hold}>
        <mesh position={[0, Y - 0.1, 0]} castShadow receiveShadow><boxGeometry args={[W + 0.2, 0.2, L + 0.2]} /><meshStandardMaterial color="#5b2a16" roughness={0.5} /></mesh>
        <mesh position={[0, Y + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[W, L]} /><meshStandardMaterial color="#1d4a8a" roughness={0.9} /></mesh>
        {/* cushions */}
        {[[0, -(L / 2) - 0.03, W, 0.06], [0, L / 2 + 0.03, W, 0.06], [-(W / 2) - 0.03, 0, 0.06, L], [W / 2 + 0.03, 0, 0.06, L]].map(([x, z, w, d], i) => (
          <mesh key={i} position={[x, Y + 0.025, z]}><boxGeometry args={[w, 0.05, d]} /><meshStandardMaterial color="#173d73" /></mesh>
        ))}
      </group>
      {/* six pockets */}
      {[[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={`p${i}`} position={[sx * (W / 2 + 0.02), Y + 0.004, sz * (L / 2 + 0.02)]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.07, 16]} /><meshBasicMaterial color="#050505" /></mesh>
      ))}
      {[[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={`g${i}`} position={[sx * (W / 2 - 0.05), (Y - 0.2) / 2, sz * (L / 2 - 0.1)]} castShadow><boxGeometry args={[0.14, Y - 0.2, 0.14]} /><meshStandardMaterial color="#4a2212" /></mesh>
      ))}
      {/* one mesh per ball slot (a re-rack reuses them) */}
      {rack().map((b, i) => (
        <mesh key={i} ref={(m) => { meshes.current[i] = m; }} position={[b.x, TOP, b.z]} castShadow>
          <sphereGeometry args={[BALL_R, 14, 14]} /><meshStandardMaterial color={b.color} roughness={0.25} />
        </mesh>
      ))}
      <group ref={cue} visible={false}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.008, 0.014, 1.45, 8]} /><meshStandardMaterial color="#d6b98c" /></mesh>
      </group>
      {/* long snooker lamp */}
      <group position={[0, 2.25, 0]}>
        <mesh><boxGeometry args={[0.6, 0.14, 2.4]} /><meshStandardMaterial color="#111111" /></mesh>
        <mesh position={[0, -0.075, 0]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[0.5, 2.3]} /><meshStandardMaterial color="#fff7d6" emissive="#fff3c4" emissiveIntensity={1.4} /></mesh>
        {[-0.9, 0.9].map((z) => <mesh key={z} position={[0, 0.5, z]}><cylinderGeometry args={[0.006, 0.006, 0.9, 6]} /><meshStandardMaterial color="#111827" /></mesh>)}
        <pointLight position={[0, -0.3, 0]} intensity={4} distance={4} decay={2} color="#fff3c4" />
      </group>
    </group>
  );
}
