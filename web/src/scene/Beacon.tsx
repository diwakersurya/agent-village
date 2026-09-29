import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import type { Group } from 'three';
import type { AgentState } from '../../../daemon/src/types';
import { useAgents } from '../store/agents';
import { STATUS_COLOR } from './characters';
import { beaconObjs } from './beaconAnchor';

export type BeaconKind = AgentState['status'] | 'sent';
const SENT = '#16a34a';

/** What the beacon over an agent's head shows: their status, or ✓ once you've answered their question. */
export function beaconKind(status: AgentState['status'], sent: boolean): BeaconKind {
  return status === 'needs_input' && sent ? 'sent' : status;
}

/**
 * Status beacon over an agent's head: a coloured disc with a glyph, always facing you.
 * gear = working, ! = needs you (drawn through walls so you can find it from anywhere), Zz = idle, ✕ = exited, ✓ = answered.
 * Click it to focus the agent; the focused agent's beacon extends into a menu (ui/BeaconMenu).
 */
export function Beacon({ agent, height, scale = 1 }: { agent: AgentState; height: number; scale?: number }) {
  const sent = useAgents((s) => !!agent.ask && s.sent[agent.id] === agent.ask.id);
  const focusAgent = useAgents((s) => s.focusAgent);
  const focused = useAgents((s) => s.selectedId === agent.id);
  const kind = beaconKind(agent.status, sent);
  const g = useRef<Group>(null);
  const glyph = useRef<Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (g.current) {
      const bob = kind === 'needs_input' ? 0.12 : 0.04;
      g.current.position.y = height + Math.sin(t * (kind === 'needs_input' ? 3 : 1.5)) * bob;
      const pulse = kind === 'needs_input' ? 1 + Math.sin(t * 5) * 0.08 : 1;
      g.current.scale.setScalar(scale * pulse);
    }
    if (glyph.current) glyph.current.rotation.z = kind === 'working' ? -t * 2 : kind === 'idle' ? Math.sin(t) * 0.1 : 0;
  });
  const onTop = kind === 'needs_input'; // the one you must never miss
  const color = kind === 'sent' ? SENT : STATUS_COLOR[kind];
  const ink = kind === 'needs_input' ? '#1c1917' : '#ffffff';
  return (
    <group ref={(o) => { g.current = o; if (o) beaconObjs.set(agent.id, o); else beaconObjs.delete(agent.id); }} position={[0, height, 0]} userData={{ beaconOf: agent.id }}
      onClick={(e) => { e.stopPropagation(); if (!focused) focusAgent(agent.id); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = ''; }}>
      <Billboard>
        <mesh renderOrder={onTop ? 10 : 0}>
          <circleGeometry args={[0.36, 40]} />
          <meshBasicMaterial color={color} toneMapped={false} depthTest={!onTop} />
        </mesh>
        <mesh position={[0, 0, -0.002]} renderOrder={onTop ? 9 : 0}>
          <ringGeometry args={[0.36, 0.42, 40]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} depthTest={!onTop} />
        </mesh>
        {/* invisible, wider hit area: far-off beacons are tiny to click */}
        <mesh position={[0, 0, -0.004]}>
          <circleGeometry args={[0.8, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <group ref={glyph} position={[0, 0, 0.01]}>
          <Glyph kind={kind} ink={ink} onTop={onTop} />
        </group>
      </Billboard>
    </group>
  );
}

function Bar({ w, h, x = 0, y = 0, r = 0, ink, onTop }: { w: number; h: number; x?: number; y?: number; r?: number; ink: string; onTop: boolean }) {
  return (
    <mesh position={[x, y, 0]} rotation={[0, 0, r]} renderOrder={onTop ? 11 : 1}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial color={ink} toneMapped={false} depthTest={!onTop} transparent />
    </mesh>
  );
}

function Glyph({ kind, ink, onTop }: { kind: BeaconKind; ink: string; onTop: boolean }): ReactNode {
  const p = { ink, onTop };
  switch (kind) {
    case 'needs_input':
      return <><Bar w={0.1} h={0.3} y={0.07} {...p} /><Bar w={0.1} h={0.1} y={-0.19} {...p} /></>;
    case 'working': // gear: hub ring + 8 teeth (the group spins)
      return (
        <>
          <mesh renderOrder={1}><ringGeometry args={[0.07, 0.16, 24]} /><meshBasicMaterial color={ink} toneMapped={false} /></mesh>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <Bar key={i} w={0.08} h={0.09} x={Math.cos(a) * 0.19} y={Math.sin(a) * 0.19} r={a} {...p} />;
          })}
        </>
      );
    case 'idle': // big Z + small z
      return (
        <>
          <Z x={-0.05} y={-0.03} s={1} {...p} />
          <Z x={0.15} y={0.16} s={0.55} {...p} />
        </>
      );
    case 'crashed':
      return <><Bar w={0.42} h={0.09} r={Math.PI / 4} {...p} /><Bar w={0.42} h={0.09} r={-Math.PI / 4} {...p} /></>;
    case 'sent':
      return <><Bar w={0.16} h={0.08} x={-0.1} y={-0.03} r={-Math.PI / 4} {...p} /><Bar w={0.32} h={0.08} x={0.06} y={0.03} r={Math.PI / 4} {...p} /></>;
  }
}

function Z({ x, y, s, ink, onTop }: { x: number; y: number; s: number; ink: string; onTop: boolean }) {
  const p = { ink, onTop };
  return (
    <group position={[x, y, 0]} scale={s}>
      <Bar w={0.22} h={0.06} y={0.1} {...p} />
      <Bar w={0.22} h={0.06} y={-0.1} {...p} />
      <Bar w={0.27} h={0.06} r={Math.atan2(0.2, 0.22)} {...p} />
    </group>
  );
}
