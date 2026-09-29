import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { Box3, Color, Quaternion, Vector3, type Mesh, type Group, type Material, type MeshStandardMaterial, type Object3D } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AgentState } from '../../../daemon/src/types';
import { useAgents } from '../store/agents';
import { useAgentAnimation, type Place } from '../hooks/useAgentAnimation';
import { CHARACTER, MODELS, PERSON_HEIGHT, STATUS_COLOR, lookFor } from './characters';
import { Beacon } from './Beacon';
import type { Vec3 } from './village/placement';
import { positions } from './positions';

interface Props {
  agent: AgentState; target: Vec3; facing: number; place: Place; seatHeight?: number;
  /** Waypoints to walk through before `target` (e.g. down the aisles); a new array starts a new walk. */
  route?: Vec3[];
  speed?: number;
}

const SPEED = 3; // units / s

export function Person({ agent, target, facing, place, seatHeight = 0, route, speed = SPEED }: Props) {
  const group = useRef<Group>(null);
  const movingRef = useRef(false);
  const [moving, setMoving] = useState(false);
  const [start] = useState(target); // spawn in place instead of walking in from the origin
  const leg = useRef(0);
  useEffect(() => { leg.current = 0; }, [route]);
  const selected = useAgents((s) => s.selectedId === agent.id);
  // walking, your eyes are at 1.6: hang the beacon lower so it's in view without looking up
  const walk = useAgents((s) => s.walk);
  const { select } = useAgents.getState();
  // gone from the scene (removed, or filtered out): no longer a body to bump into or walk up to
  useEffect(() => () => { positions.delete(agent.id); }, [agent.id]);

  useFrame(({ camera }, dt) => {
    const g = group.current;
    if (!g) return;
    // follow the route's waypoints in order, then the final target
    let goal = target;
    if (route) {
      while (leg.current < route.length && Math.hypot(route[leg.current][0] - g.position.x, route[leg.current][2] - g.position.z) < 0.08) leg.current++;
      if (leg.current < route.length) goal = route[leg.current];
    }
    const dx = goal[0] - g.position.x, dz = goal[2] - g.position.z;
    const d = Math.hypot(dx, dz);
    const isMoving = d > 0.05;
    if (isMoving) {
      const step = Math.min(d, speed * dt);
      g.position.x += (dx / d) * step;
      g.position.z += (dz / d) * step;
      g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(dx, dz), Math.min(1, 10 * dt));
    } else {
      // the focused person turns to look at you (the camera); others face their desk/door
      const face = selected ? Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z) : facing;
      g.rotation.y = lerpAngle(g.rotation.y, face, Math.min(1, 6 * dt));
    }
    const sitting = !isMoving && place === 'desk' && agent.status === 'working';
    g.position.y += ((sitting ? seatHeight : 0) - g.position.y) * Math.min(1, 10 * dt);
    positions.set(agent.id, g.position);
    if (isMoving !== movingRef.current) { movingRef.current = isMoving; setMoving(isMoving); }
  });

  const { color } = CHARACTER[agent.kind];
  return (
    <group
      ref={group}
      position={start}
      rotation={[0, facing, 0]}
      userData={{ agentId: agent.id }}
      onClick={(e) => { e.stopPropagation(); select(agent.id); }}
      onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = ''; }}
    >
      <ModelBoundary fallback={<Capsule color={color} />}>
        <Suspense fallback={<Capsule color={color} />}>
          <Model agent={agent} moving={moving} place={place} lookAtCamera={selected && !moving} seated={!moving && place === 'desk' && (agent.status === 'working' || agent.status === 'idle')} />
        </Suspense>
      </ModelBoundary>
      <StatusRing status={agent.status} selected={selected} kindColor={color} />
      {/* status beacon replaces the old speech bubble: readable at a glance, from any distance */}
      <Beacon agent={agent} height={place === 'field' ? 3 : 2.45} scale={place === 'field' ? 2.2 : walk ? 0.8 : 1.1} />
    </group>
  );
}

function Model({ agent, moving, place, lookAtCamera, seated }: { agent: AgentState; moving: boolean; place: Place; lookAtCamera: boolean; seated: boolean }) {
  const look = lookFor(agent);
  const { scene, animations } = useGLTF(look.url);
  const root = useRef<Group>(null);
  const clone = useMemo(() => {
    const c = cloneSkinned(scene);
    const tint = new Color(look.tint);
    c.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      // Materials are shared between clones; copy before tinting this one person.
      m.material = Array.isArray(m.material) ? m.material.map((x) => tinted(x, tint)) : tinted(m.material, tint);
    });
    return c;
  }, [scene, look.tint]);
  const scale = useMemo(() => {
    const box = new Box3().setFromObject(scene);
    const h = box.max.y - box.min.y;
    return (h > 0 ? PERSON_HEIGHT / h : 1) * look.scale;
  }, [scene, look.scale]);
  const { actions } = useAnimations(animations, root);
  useAgentAnimation(actions, agent.status, moving, place);
  const nod = useGreetNod(agent.id); // before the head look, which applies the nod
  useHeadLook(clone, lookAtCamera, nod);
  return (
    <group ref={root} scale={scale}>
      <primitive object={clone} />
      {seated && <SitChair />}
    </group>
  );
}

function tinted(m: Material, tint: Color): Material {
  const c = m.clone() as MeshStandardMaterial;
  if (c.color) c.color.multiply(tint);
  return c;
}

function Capsule({ color }: { color: string }) {
  return (
    <mesh position={[0, 0.85, 0]} castShadow>
      <capsuleGeometry args={[0.3, 1, 8, 16]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function StatusRing({ status, selected, kindColor }: { status: AgentState['status']; selected: boolean; kindColor: string }) {
  const ring = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const s = status === 'needs_input' ? 1 + Math.sin(clock.elapsedTime * 5) * 0.12 : 1;
    ring.current.scale.set(s, s, s);
  });
  return (
    <group position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={ring}>
        <ringGeometry args={[0.55, 0.7, 40]} />
        <meshBasicMaterial color={STATUS_COLOR[status]} transparent opacity={0.9} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.5, 40]} />
        <meshBasicMaterial color={kindColor} transparent opacity={0.35} />
      </mesh>
      {selected && (
        <mesh>
          <ringGeometry args={[0.78, 0.86, 40]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}
    </group>
  );
}

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function lerpAngle(a: number, b: number, t: number) {
  const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

for (const url of MODELS) useGLTF.preload(url);

const MAX_PITCH = 0.55; // rad; beyond this the neck looks broken
const _head = new Vector3(), _right = new Vector3(), _q = new Quaternion(), _hq = new Quaternion(), _parent = new Quaternion();

export interface HeadLookState { base: Quaternion; out: Quaternion | null }

/**
 * One frame of head tilt towards `cam`, on top of whatever pose the clip set this frame.
 * Not every clip animates the head, so if the head still holds last frame's output the mixer didn't touch it:
 * re-apply from the saved base pose, never from our own output (that compounds into a spin).
 */
export function tiltHead(head: Object3D, root: Object3D, cam: Vector3, weight: number, st: HeadLookState, nod = 0) {
  if (!st.out || !head.quaternion.equals(st.out)) st.base.copy(head.quaternion); // fresh pose from the mixer
  else head.quaternion.copy(st.base);
  if (weight < 0.01 && !nod) { st.out = null; return; }
  head.getWorldPosition(_head);
  const flat = Math.hypot(cam.x - _head.x, cam.z - _head.z);
  const pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, Math.atan2(cam.y - _head.y, flat))) * weight - nod; // nod = chin down
  // rotate about the body's right axis in world space (-pitch = chin up), then back into the head's local space
  _right.set(1, 0, 0).applyQuaternion(root.getWorldQuaternion(_q));
  _q.setFromAxisAngle(_right, -pitch).multiply(head.getWorldQuaternion(_hq));
  head.parent!.getWorldQuaternion(_parent);
  head.quaternion.copy(_parent.invert().multiply(_q));
  (st.out ??= new Quaternion()).copy(head.quaternion);
}

/** Tilts the focused person's head towards the camera; runs after the mixer (same component, subscribed later). */
function useHeadLook(root: Object3D, active: boolean, nod?: { current: number }) {
  const head = useMemo(() => root.getObjectByName('head') ?? null, [root]);
  const weight = useRef(0);
  const st = useRef<HeadLookState>({ base: new Quaternion(), out: null });
  useFrame(({ camera }, dt) => {
    weight.current += ((active ? 1 : 0) - weight.current) * Math.min(1, 4 * dt);
    if (head) tiltHead(head, root, camera.position, weight.current, st.current, nod?.current ?? 0);
  });
}

const NOD_SECS = 0.6;

/** A quick nod each time this agent notices you (store.greet: walked up to, clicked or Tabbed to). */
function useGreetNod(agentId: string) {
  const greet = useAgents((s) => (s.greet?.id === agentId ? s.greet.n : 0));
  const since = useRef(Infinity);
  const nod = useRef(0);
  useEffect(() => { if (greet) since.current = performance.now(); }, [greet]);
  useFrame(() => {
    const t = (performance.now() - since.current) / 1000;
    // applied by tiltHead (never rotate the head here: it would be mistaken for a fresh clip pose)
    nod.current = t >= 0 && t < NOD_SECS ? Math.sin((t / NOD_SECS) * Math.PI) * 0.18 : 0;
  });
  return nod;
}

const CHAIR = '#1b1c1f', CHAIR_LEG = '#5e626a';

/**
 * The office chair of a seated agent, in model units inside the scaled model, so it sits exactly under the
 * Sit_Chair_Idle pose (hips at y 0.48, z -0.40) and turns with the body: it can never cut through the sitter.
 */
function SitChair() {
  return (
    <group position={[0, 0, -0.42]}>
      <mesh position={[0, 0.36, 0]} castShadow><boxGeometry args={[0.66, 0.1, 0.62]} /><meshStandardMaterial color={CHAIR} roughness={0.8} /></mesh>
      <mesh position={[0, 0.9, -0.36]} rotation={[0.1, 0, 0]} castShadow><boxGeometry args={[0.62, 0.84, 0.06]} /><meshStandardMaterial color={CHAIR} roughness={0.8} /></mesh>
      {[-0.36, 0.36].map((x) => <mesh key={x} position={[x, 0.58, -0.02]}><boxGeometry args={[0.05, 0.05, 0.44]} /><meshStandardMaterial color="#2a2b2f" /></mesh>)}
      <mesh position={[0, 0.16, 0]}><cylinderGeometry args={[0.045, 0.045, 0.3]} /><meshStandardMaterial color={CHAIR_LEG} /></mesh>
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2;
        return <mesh key={i} position={[Math.cos(a) * 0.19, 0.03, Math.sin(a) * 0.19]} rotation={[0, -a, 0]}><boxGeometry args={[0.38, 0.04, 0.05]} /><meshStandardMaterial color={CHAIR_LEG} /></mesh>;
      })}
    </group>
  );
}
