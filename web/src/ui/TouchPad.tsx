import { useRef, useState, type PointerEvent } from 'react';
import { useAgents } from '../store/agents';
import { touchMove } from '../scene/touchMove';
import styles from './TouchPad.module.css';

const RADIUS = 48; // px the knob can travel from the centre

const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

/**
 * On-screen joystick for touch devices in walk mode (bottom-left, under your left thumb): push to walk, push to the
 * edge to run. Looking around stays a one-finger drag anywhere else on the scene.
 */
export function TouchPad() {
  const walk = useAgents((s) => s.walk);
  const overlay = useAgents((s) => s.monitor !== 'closed');
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const centre = useRef<[number, number] | null>(null);
  if (!walk || overlay || !coarse()) return null;

  const move = (e: PointerEvent) => {
    if (!centre.current) return;
    let dx = e.clientX - centre.current[0], dy = e.clientY - centre.current[1];
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
    setKnob([dx, dy]);
    touchMove.fwd = -dy / RADIUS;
    touchMove.strafe = dx / RADIUS;
  };
  const end = () => { centre.current = null; setKnob([0, 0]); touchMove.fwd = 0; touchMove.strafe = 0; };

  return (
    <div className={styles.pad} aria-label="walk joystick" role="application"
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        centre.current = [r.left + r.width / 2, r.top + r.height / 2];
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <div className={styles.knob} style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }} />
    </div>
  );
}
