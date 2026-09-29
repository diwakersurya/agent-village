import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group, type Mesh } from 'three';
import { sfx } from '../../audio/sfx';
import { useHold } from '../../hooks/useInteract';
import { useCanvasTexture } from '../../hooks/useTextTexture';
import { useAgents } from '../../store/agents';
import { usePlaymate } from '../../hooks/usePlaymate';
import { TT_L, TT_TOP, TT_W, WIN_AT, newRally, stepRally, type Who } from './pingpong';

type V3 = [number, number, number];
const Y = 0.76;
const PLAY_NEAR = 4; // the game runs while you're this close
const _cam = new Vector3(), _w = new Vector3(), _spot = new Vector3(), _mid = new Vector3();

/** World spot (and facing) `back` metres behind the given end of a table-frame group. */
export function spotAt(g: Group, lx: number, lz: number) {
  g.localToWorld(_spot.set(lx, 0, lz));
  g.localToWorld(_mid.set(0, 0, 0));
  return { x: _spot.x, z: _spot.z, face: Math.atan2(_mid.x - _spot.x, _mid.z - _spot.z) };
}

/**
 * Playable table tennis vs a bot bat at the far end: press on the table (or Space, when close) to serve / swing.
 * Swing early → the ball goes to your left, late → right. First to 11. You play whichever end you walked up to.
 */
export function PingPongTable() {
  const root = useRef<Group>(null);
  const ball = useRef<Mesh>(null);
  const mine = useRef<Group>(null);
  const bot = useRef<Group>(null);
  const rally = useRef(newRally());
  const side = useRef<1 | -1>(1); // which end you're at: +1 = the rally's +z end
  const swung = useRef(false);
  const swingT = useRef(0);
  const near = useRef(false);
  const [score, setScore] = useState<Record<Who, number>>({ you: 0, bot: 0 });
  const playmate = usePlaymate('tt');
  const [mateName, setMateName] = useState<string>();
  const rival = () => mateName ?? 'Bot';
  const world = (): V3 => { ball.current!.getWorldPosition(_w); return [_w.x, _w.y, _w.z]; };

  const hit = () => { swung.current = true; swingT.current = 0.18; };
  const hold = useHold({ down: hit, up: () => {} });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== ' ' || !near.current || t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || useAgents.getState().monitor !== 'closed') return;
      e.preventDefault(); hit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useFrame(({ camera, clock }, dt) => {
    const g = root.current, b = ball.current;
    if (!g || !b) return;
    g.worldToLocal(_cam.copy(camera.position));
    near.current = Math.hypot(_cam.x, _cam.z) < PLAY_NEAR;
    const r = rally.current;
    // between points you can swap ends just by walking round
    if (r.phase === 'serve') side.current = _cam.z >= 0 ? 1 : -1;
    const s = side.current;
    // an idle agent comes to hold the far bat while you're here
    const id = playmate(near.current && useAgents.getState().walk, spotAt(g, 0, -s * (TT_L / 2 + 0.75)), clock.elapsedTime);
    const a = id ? useAgents.getState().agents[id] : undefined;
    const name = a ? a.project || a.kind : undefined;
    if (name !== mateName) setMateName(name);
    if (near.current || r.phase !== 'serve') {
      for (const e of stepRally(r, Math.min(dt, 0.05), swung.current)) {
        if (e === 'hit' || e === 'bounce') sfx.pong(world(), e === 'hit');
        else {
          setScore({ ...r.score });
          const who = e.endsWith('you') ? 'you' : 'bot';
          const msg = e.startsWith('game')
            ? (who === 'you' ? `🏓 You win ${r.score.you}–${r.score.bot}!` : `🏓 ${rival()} wins ${r.score.bot}–${r.score.you}. Rematch?`)
            : `🏓 ${who === 'you' ? 'Your point' : `${rival()}’s point`} · ${r.score.you}–${r.score.bot}`;
          useAgents.getState().showToast(msg);
        }
      }
    }
    swung.current = false;
    if (r.phase === 'serve' && r.score.you === 0 && r.score.bot === 0 && (score.you || score.bot)) setScore({ you: 0, bot: 0 });
    // rally frame → table frame (mirrored when you're at the -z end)
    const { x, y, z } = r.ball;
    b.position.set(s * x, y, s * z);
    swingT.current = Math.max(0, swingT.current - dt);
    if (mine.current) {
      mine.current.position.set(s * Math.max(-0.9, Math.min(0.9, x)), TT_TOP + 0.18, s * (TT_L / 2 + 0.3));
      mine.current.rotation.set(0, (s > 0 ? 0 : Math.PI) + (swingT.current > 0 ? -1.2 * Math.sin((swingT.current / 0.18) * Math.PI) : 0), 0);
    }
    if (bot.current) {
      const bp = bot.current.position;
      bp.x += (s * x - bp.x) * Math.min(1, dt * 6); // tracks the ball, a bit late
      bp.y = TT_TOP + 0.18; bp.z = -s * (TT_L / 2 + 0.3);
      bot.current.rotation.y = s > 0 ? Math.PI : 0;
    }
  });

  const tex = useCanvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#f9fafb'; ctx.font = '700 56px ui-sans-serif, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${rival().length > 10 ? 40 : 56}px ui-sans-serif, system-ui`;
    ctx.fillText(`You ${score.you} : ${score.bot} ${rival()}`, 256, 52);
    ctx.font = '500 26px ui-sans-serif, system-ui'; ctx.fillStyle = '#9ca3af';
    ctx.fillText(`click the table or Space to serve / swing · first to ${WIN_AT}`, 256, 104);
  }, [score.you, score.bot, mateName]);

  const W = TT_W, L = TT_L;
  return (
    <group ref={root}>
      <group {...hold}>
        <mesh position={[0, Y - 0.02, 0]} castShadow receiveShadow><boxGeometry args={[W, 0.04, L]} /><meshStandardMaterial color="#1d4f91" roughness={0.6} /></mesh>
        {/* white edge + centre lines */}
        {[-L / 2 + 0.01, L / 2 - 0.01].map((z, i) => (
          <mesh key={`e${i}`} position={[0, Y + 0.001, z]}><boxGeometry args={[W, 0.002, 0.02]} /><meshBasicMaterial color="#f9fafb" /></mesh>
        ))}
        {[-W / 2 + 0.01, W / 2 - 0.01, 0].map((x) => (
          <mesh key={`l${x}`} position={[x, Y + 0.001, 0]}><boxGeometry args={[x === 0 ? 0.006 : 0.02, 0.002, L]} /><meshBasicMaterial color="#f9fafb" /></mesh>
        ))}
      </group>
      {/* net + posts */}
      <mesh position={[0, Y + 0.076, 0]}><boxGeometry args={[W + 0.3, 0.152, 0.01]} /><meshStandardMaterial color="#111827" transparent opacity={0.75} /></mesh>
      <mesh position={[0, Y + 0.15, 0]}><boxGeometry args={[W + 0.3, 0.012, 0.014]} /><meshBasicMaterial color="#f9fafb" /></mesh>
      {[-(W / 2 + 0.15), W / 2 + 0.15].map((x) => (
        <mesh key={x} position={[x, Y + 0.08, 0]}><cylinderGeometry args={[0.012, 0.012, 0.16, 8]} /><meshStandardMaterial color="#6b7280" /></mesh>
      ))}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (W / 2 - 0.12), (Y - 0.04) / 2, sz * (L / 2 - 0.25)]} castShadow><boxGeometry args={[0.05, Y - 0.04, 0.05]} /><meshStandardMaterial color="#374151" /></mesh>
      ))}
      {/* scoreboard on a stand beside the net */}
      <group position={[W / 2 + 0.55, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 0.6, 0]}><cylinderGeometry args={[0.02, 0.02, 1.2, 8]} /><meshStandardMaterial color="#374151" /></mesh>
        {[0, Math.PI].map((r) => (
          <mesh key={r} position={[0, 1.35, 0]} rotation={[0, r, 0]}><planeGeometry args={[0.9, 0.225]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
        ))}
      </group>
      <Bat ref={mine} color="#111827" />
      <Bat ref={bot} color="#dc2626" />
      <mesh ref={ball} castShadow><sphereGeometry args={[0.025, 12, 12]} /><meshStandardMaterial color="#fb923c" /></mesh>
    </group>
  );
}

function Bat({ ref, color }: { ref: React.Ref<Group>; color: string }) {
  return (
    <group ref={ref}>
      {/* blade upright, facing along z */}
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.08, 0.08, 0.012, 20]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, -0.12, 0]}><boxGeometry args={[0.03, 0.1, 0.02]} /><meshStandardMaterial color="#b45309" /></mesh>
    </group>
  );
}
