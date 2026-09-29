import { useMemo } from 'react';
import { DoubleSide, RepeatWrapping } from 'three';
import { useCanvasTexture } from '../../hooks/useTextTexture';
import { Pantry, RobotVacuum, WaterCooler } from './Amenities';
import { Lounge, ValuePillar } from './Lounge';
import { AMENITY_SCALE, PLANT_SCALE, WALL_H, WALL_T, type OfficePlan } from './officePlan';
import { Stage, ViewpointMarkers } from './Viewpoints';

const WALL = '#e9e9e5';
const YELLOW = '#e8c33a';
const FRAME = '#1f2125';
const CARPET = '#4b4e55';

/**
 * The office shell, after the real one: grey carpet under the benches, zigzag carpet in the billiards lounge,
 * glass meeting rooms down the left, the curved window wall on the right, the yellow photo wall at the back,
 * value pillars, and (walk mode only) the exposed ceiling and the front wall with the entrance.
 */
export function Room({ plan: p, closed = false }: { plan: OfficePlan; closed?: boolean }) {
  const right = p.windowX((p.backZ + p.frontZ) / 2) + 0.4; // widest point of the window bow
  const width = right - p.leftX, depth = p.frontZ - p.backZ;
  const cx = (p.leftX + right) / 2, cz = (p.backZ + p.frontZ) / 2;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} receiveShadow>
        <planeGeometry args={[width, depth]} /><meshStandardMaterial color={CARPET} roughness={1} />
      </mesh>
      <LoungeCarpet plan={p} right={right} />

      {/* left outer wall + back yellow wall */}
      <mesh position={[p.leftX, WALL_H / 2, cz]} receiveShadow><boxGeometry args={[WALL_T, WALL_H, depth]} /><meshStandardMaterial color={WALL} /></mesh>
      <BackWall plan={p} right={right} />
      <MeetingRooms plan={p} />
      <WindowWall plan={p} />
      {closed && <FrontWall plan={p} right={right} />}
      {closed && <Ceiling plan={p} cx={cx} cz={cz} width={width} depth={depth} />}

      {p.pillars.map((q) => <ValuePillar key={q.value} x={q.x} z={q.z} value={q.value} />)}
      <Lounge plan={p} />
      <Pantry position={p.pantry.pos} rotationY={p.pantry.rotY} scale={AMENITY_SCALE} />
      <WaterCooler position={p.cooler.pos} rotationY={p.cooler.rotY} scale={AMENITY_SCALE} />
      {p.plants.map((q, i) => <Plant key={i} position={q} />)}
      <Stage position={p.stage} />
      {closed && <ViewpointMarkers points={p.viewpoints} />}
      <RobotVacuum cx={p.vacuum.cx} cz={p.vacuum.cz} halfX={p.vacuum.hx} halfZ={p.vacuum.hz} />
    </group>
  );
}

/** Yellow / charcoal zigzag carpet tiles, like the lounge in the photos. */
function LoungeCarpet({ plan: p, right }: { plan: OfficePlan; right: number }) {
  const w = right - p.leftX, d = p.frontZ - p.loungeZ0;
  const tex = useCanvasTexture(1024, 512, (g) => {
    g.fillStyle = '#3a3d44'; g.fillRect(0, 0, 1024, 512);
    for (let row = -2; row < 10; row++) for (let col = -1; col < 9; col++) {
      const x = col * 150, y = row * 60 + (col % 2) * 30;
      g.fillStyle = (row + col) % 3 === 0 ? '#2b2d33' : '#e2b520';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 75, y + 30); g.lineTo(x + 150, y); g.lineTo(x + 150, y + 26); g.lineTo(x + 75, y + 56); g.lineTo(x, y + 26); g.closePath(); g.fill();
    }
    let seed = 7; // deterministic "brushed" texture
    for (let i = 0; i < 9000; i++) { seed = (seed * 16807) % 2147483647; g.fillStyle = `rgba(0,0,0,${(seed % 100) / 900})`; g.fillRect(seed % 1024, (seed >> 10) % 512, 3, 1); }
  }, []);
  useMemo(() => { tex.wrapS = tex.wrapT = RepeatWrapping; tex.repeat.set(w / 7, d / 4.5); }, [tex, w, d]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(p.leftX + right) / 2, 0.005, (p.loungeZ0 + p.frontZ) / 2]} receiveShadow>
      <planeGeometry args={[w, d]} /><meshStandardMaterial map={tex} roughness={1} />
    </mesh>
  );
}

/** Yellow back wall: employee photo grid on the left, black triangle mural on the right. */
function BackWall({ plan: p, right }: { plan: OfficePlan; right: number }) {
  const grid = useCanvasTexture(1024, 384, (g) => {
    g.fillStyle = YELLOW; g.fillRect(0, 0, 1024, 384);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) {
      g.fillStyle = '#3f3a2e'; g.fillRect(24 + c * 98, 30 + r * 86, 86, 70);
      g.fillStyle = `hsl(${205 + ((r * 7 + c * 13) % 30)},45%,${35 + ((r * 11 + c * 5) % 20)}%)`; g.fillRect(30 + c * 98, 36 + r * 86, 74, 58);
    }
  }, []);
  const tri = useCanvasTexture(512, 256, (g) => {
    g.fillStyle = YELLOW; g.fillRect(0, 0, 512, 256); g.fillStyle = '#16171a';
    for (let i = 0; i < 14; i++) { const x = i * 38, y = (i % 3) * 60 + 20; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 50, y + 40); g.lineTo(x, y + 80); g.fill(); }
  }, []);
  const z = p.backZ + WALL_T / 2 + 0.01;
  return (
    <group>
      <mesh position={[(p.leftX + right) / 2, WALL_H / 2, p.backZ]} receiveShadow><boxGeometry args={[right - p.leftX, WALL_H, WALL_T]} /><meshStandardMaterial color={YELLOW} /></mesh>
      <mesh position={[p.minX + 4.5, 1.7, z]}><planeGeometry args={[8, 3]} /><meshStandardMaterial map={grid} /></mesh>
      <mesh position={[p.maxX - 3.5, 1.8, z]}><planeGeometry args={[6, 3]} /><meshStandardMaterial map={tri} /></mesh>
    </group>
  );
}

/** Glass-fronted meeting rooms along the left: black frames, a door gap each, table + chairs + a wall screen. */
function MeetingRooms({ plan: p }: { plan: OfficePlan }) {
  const g = p.glassX;
  const midX = (p.leftX + g) / 2;
  const end = p.rooms.at(-1)?.z1 ?? p.backZ;
  return (
    <group>
      {p.rooms.map((r) => {
        const cz = (r.z0 + r.z1) / 2;
        const glass: [number, number][] = [[r.z0, r.doorZ - 0.5], [r.doorZ + 0.5, r.z1]];
        return (
          <group key={r.z0}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[midX, 0.004, cz]}><planeGeometry args={[g - p.leftX, r.z1 - r.z0]} /><meshStandardMaterial color="#6b7079" roughness={1} /></mesh>
            {glass.map(([a, b]) => (
              <mesh key={a} position={[g, (WALL_H - 0.4) / 2, (a + b) / 2]}>
                <boxGeometry args={[0.04, WALL_H - 0.4, b - a]} />
                <meshStandardMaterial color="#b9d3e3" transparent opacity={0.28} roughness={0.05} depthWrite={false} />
              </mesh>
            ))}
            {[r.z0, r.doorZ - 0.5, r.doorZ + 0.5].map((fz) => <mesh key={fz} position={[g, (WALL_H - 0.4) / 2, fz]}><boxGeometry args={[0.08, WALL_H - 0.4, 0.08]} /><meshStandardMaterial color={FRAME} /></mesh>)}
            <mesh position={[midX, WALL_H / 2, r.z1]} castShadow><boxGeometry args={[g - p.leftX, WALL_H, 0.12]} /><meshStandardMaterial color={WALL} /></mesh>
            <mesh position={[midX, 0.74, cz]} castShadow><boxGeometry args={[1.2, 0.05, 2.2]} /><meshStandardMaterial color="#f4f4f2" /></mesh>
            {[-0.8, 0, 0.8].flatMap((dz) => [-0.85, 0.85].map((dx) => (
              <mesh key={`${dz}${dx}`} position={[midX + dx, 0.45, cz + dz]} castShadow><boxGeometry args={[0.45, 0.08, 0.45]} /><meshStandardMaterial color={FRAME} /></mesh>
            )))}
            <mesh position={[p.leftX + WALL_T / 2 + 0.03, 1.5, cz]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[1.6, 0.9]} /><meshStandardMaterial color="#111827" emissive="#1e3a5f" emissiveIntensity={0.4} /></mesh>
          </group>
        );
      })}
      {/* soffit over the rooms */}
      {p.rooms.length > 0 && (
        <mesh position={[midX, WALL_H - 0.2, (p.backZ + end) / 2]}><boxGeometry args={[g - p.leftX + 0.1, 0.4, end - p.backZ]} /><meshStandardMaterial color={WALL} /></mesh>
      )}
    </group>
  );
}

/** Curved floor-to-ceiling windows with half-drawn blinds and a white ledge seat, bowing out mid-floor. */
function WindowWall({ plan: p }: { plan: OfficePlan }) {
  const panels = useMemo(() => {
    const out = [];
    for (let z = p.frontZ; z > p.backZ + 1e-6; z -= 1.4) {
      const za = z, zb = Math.max(p.backZ, z - 1.4);
      const xa = p.windowX(za), xb = p.windowX(zb);
      out.push({ x: (xa + xb) / 2, z: (za + zb) / 2, len: Math.hypot(xb - xa, zb - za), ang: Math.atan2(xb - xa, zb - za) + Math.PI / 2 });
    }
    return out;
  }, [p]);
  return (
    <group>
      {/* local +z points into the room: blinds and the ledge seat are on that side */}
      {panels.map((q, i) => (
        <group key={i} position={[q.x, 0, q.z]} rotation={[0, q.ang, 0]}>
          <mesh position={[0, 1.75, -0.02]}><planeGeometry args={[q.len - 0.05, 2.3]} /><meshStandardMaterial color="#cfe0ff" emissive="#b9ccff" emissiveIntensity={0.9} side={DoubleSide} /></mesh>
          <mesh position={[0, 2.45, 0.03]}><boxGeometry args={[q.len - 0.1, 0.9, 0.02]} /><meshStandardMaterial color="#eef0f5" /></mesh>
          <mesh position={[q.len / 2, WALL_H / 2, 0]}><boxGeometry args={[0.05, WALL_H, 0.1]} /><meshStandardMaterial color={FRAME} /></mesh>
          <mesh position={[0, 0.28, 0.3]} castShadow receiveShadow><boxGeometry args={[q.len + 0.02, 0.55, 0.55]} /><meshStandardMaterial color="#f1f1ee" /></mesh>
          <mesh position={[0, WALL_H - 0.3, 0]}><boxGeometry args={[q.len + 0.02, 0.6, 0.1]} /><meshStandardMaterial color="#2b2d33" /></mesh>
        </group>
      ))}
      {/* beanbag by the windows in the lounge */}
      <mesh position={[p.beanbag[0], 0.3, p.beanbag[2]]} scale={[1.2, 0.55, 1]} castShadow><sphereGeometry args={[0.5, 20, 14]} /><meshStandardMaterial color="#1f2a44" roughness={1} /></mesh>
    </group>
  );
}

const ENTRANCE_W = 2.2;
const DOOR_H = 2.4;

/** Front wall (walk mode only; the overview camera looks in over it): glass double doors at the entrance. */
function FrontWall({ plan: p, right }: { plan: OfficePlan; right: number }) {
  const ex = p.spawn[0];
  const spans: [number, number][] = [[p.leftX, ex - ENTRANCE_W / 2], [ex + ENTRANCE_W / 2, right]];
  return (
    <group position={[0, 0, p.frontZ]}>
      {spans.map(([a, b]) => <mesh key={a} position={[(a + b) / 2, WALL_H / 2, 0]} receiveShadow><boxGeometry args={[b - a, WALL_H, WALL_T]} /><meshStandardMaterial color={WALL} /></mesh>)}
      <mesh position={[ex, (DOOR_H + WALL_H) / 2, 0]}><boxGeometry args={[ENTRANCE_W, WALL_H - DOOR_H, WALL_T]} /><meshStandardMaterial color={WALL} /></mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[ex + (s * ENTRANCE_W) / 4, DOOR_H / 2, 0]}>
          <mesh><boxGeometry args={[ENTRANCE_W / 2 - 0.04, DOOR_H, 0.04]} /><meshStandardMaterial color="#cfe7f5" transparent opacity={0.35} depthWrite={false} /></mesh>
          <mesh position={[-s * (ENTRANCE_W / 4 - 0.12), 0, -0.04]}><boxGeometry args={[0.03, 0.5, 0.03]} /><meshStandardMaterial color="#9ca3af" metalness={0.7} /></mesh>
        </group>
      ))}
    </group>
  );
}

/** Exposed ceiling (walk mode only): dark concrete slab and beams, red sprinkler pipes, grey ducts, LED strip lights. */
function Ceiling({ plan: p, cx, cz, width, depth }: { plan: OfficePlan; cx: number; cz: number; width: number; depth: number }) {
  const beams = useMemo(() => { const out = []; for (let z = p.backZ + 1; z < p.frontZ; z += 3.2) out.push(z); return out; }, [p]);
  const strips = useMemo(() => { const out = []; for (let z = p.backZ + 2; z < p.frontZ - 1; z += 3.5) out.push(z); return out; }, [p]);
  const ducts = [p.minX + 2.5, (p.minX + p.maxX) / 2, p.maxX - 2.5];
  return (
    <group>
      <mesh position={[cx, WALL_H, cz]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[width, depth]} /><meshStandardMaterial color="#3c3f45" roughness={1} side={DoubleSide} /></mesh>
      {beams.map((z) => <mesh key={z} position={[cx, WALL_H - 0.17, z]}><boxGeometry args={[width, 0.35, 0.3]} /><meshStandardMaterial color="#34373c" /></mesh>)}
      {[p.minX + 1, (p.minX + p.maxX) / 2 + 1.5, p.maxX - 1].map((x) => (
        <mesh key={x} position={[x, WALL_H - 0.45, cz]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.06, 0.06, depth, 10]} /><meshStandardMaterial color="#c0262d" roughness={0.5} /></mesh>
      ))}
      {beams.filter((_, i) => i % 2 === 0).map((z) => (
        <mesh key={z} position={[cx, WALL_H - 0.4, z + 0.5]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.04, 0.04, width - 1, 8]} /><meshStandardMaterial color="#c0262d" roughness={0.5} /></mesh>
      ))}
      {ducts.map((x) => (
        <group key={x}>
          <mesh position={[x, WALL_H - 0.7, cz]}><boxGeometry args={[0.9, 0.5, depth - 3]} /><meshStandardMaterial color="#8d9299" metalness={0.4} roughness={0.5} /></mesh>
          {strips.map((z) => <mesh key={z} position={[x, WALL_H - 0.96, z]}><boxGeometry args={[0.6, 0.02, 0.35]} /><meshStandardMaterial color="#e5e7eb" /></mesh>)}
        </group>
      ))}
      {strips.flatMap((z) => [(p.minX + ducts[1]) / 2, (ducts[1] + p.maxX) / 2].map((x) => (
        <mesh key={`${x}${z}`} position={[x, WALL_H - 1.05, z]}><boxGeometry args={[4, 0.04, 0.08]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} /></mesh>
      )))}
    </group>
  );
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} scale={PLANT_SCALE}>
      <mesh position={[0, 0.2, 0]} castShadow><cylinderGeometry args={[0.22, 0.17, 0.4, 16]} /><meshStandardMaterial color="#c0c4c9" /></mesh>
      <mesh position={[0, 0.75, 0]} castShadow><sphereGeometry args={[0.38, 14, 14]} /><meshStandardMaterial color="#3f7d3a" /></mesh>
      <mesh position={[0.12, 1.05, 0.05]} castShadow><sphereGeometry args={[0.24, 12, 12]} /><meshStandardMaterial color="#4d8f45" /></mesh>
    </group>
  );
}
