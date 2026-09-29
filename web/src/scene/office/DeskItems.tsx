type V3 = [number, number, number];

/** Pen stand with pens + pencil. Sits on the desk top (position = desk surface). */
export function PenStand({ position }: { position: V3 }) {
  const pens: [number, number, string][] = [[-0.015, 0.2, '#1d4ed8'], [0.015, -0.18, '#dc2626'], [0, 0.05, '#eab308']];
  return (
    <group position={position}>
      <mesh position={[0, 0.06, 0]} castShadow><cylinderGeometry args={[0.045, 0.04, 0.12, 16, 1, true]} /><meshStandardMaterial color="#374151" side={2} /></mesh>
      <mesh position={[0, 0.002, 0]}><cylinderGeometry args={[0.04, 0.04, 0.004, 16]} /><meshStandardMaterial color="#374151" /></mesh>
      {pens.map(([x, tilt, c]) => (
        <mesh key={c} position={[x, 0.13, 0]} rotation={[0, 0, tilt]}><cylinderGeometry args={[0.006, 0.006, 0.17, 6]} /><meshStandardMaterial color={c} /></mesh>
      ))}
    </group>
  );
}

export function Mug({ position, color }: { position: V3; color: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.045, 0]} castShadow><cylinderGeometry args={[0.035, 0.032, 0.09, 16]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0.042, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.02, 0.006, 6, 12]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, 0.088, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.03, 16]} /><meshStandardMaterial color="#5b3a1e" /></mesh>
    </group>
  );
}

export function KeyboardMouse({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.01, 0]} castShadow><boxGeometry args={[0.5, 0.02, 0.16]} /><meshStandardMaterial color="#1f2937" /></mesh>
      <mesh position={[0, 0.021, 0]}><boxGeometry args={[0.46, 0.004, 0.12]} /><meshStandardMaterial color="#4b5563" /></mesh>
      <mesh position={[0.36, 0.012, 0.02]} castShadow><boxGeometry args={[0.06, 0.024, 0.1]} /><meshStandardMaterial color="#1f2937" /></mesh>
    </group>
  );
}
