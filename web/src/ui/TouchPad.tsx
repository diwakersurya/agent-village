import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useAgents } from '../store/agents';
import { touchMove } from '../scene/touchMove';
import styles from './TouchPad.module.css';

/** How far the knob travels from the centre, as a share of the pad's width (sized by --size-joystick). */
const TRAVEL = 0.375;

const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const stop = () => { touchMove.fwd = 0; touchMove.strafe = 0; };

/**
 * On-screen joystick for touch devices in walk mode (bottom-left, under your left thumb): push to walk, push to the
 * edge to run. Looking around stays a one-finger drag anywhere else on the scene.
 */
export function TouchPad() {
  const walk = useAgents((s) => s.walk);
  const overlay = useAgents((s) => s.monitor !== 'closed');
  const active = walk && !overlay && coarse();
  // an overlay opening / walk mode ending mid-drag must not leave the player walking on their own
  useEffect(() => { if (!active) stop(); }, [active]);
  return active ? <Pad /> : null;
}

function Pad() {
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const centre = useRef<[number, number] | null>(null);
  const radius = useRef(1);
  useEffect(() => stop, []); // unmounted mid-drag: no pointerup will come

  const move = (e: PointerEvent) => {
    if (!centre.current) return;
    const R = radius.current;
    let dx = e.clientX - centre.current[0], dy = e.clientY - centre.current[1];
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    setKnob([dx, dy]);
    touchMove.fwd = -dy / R;
    touchMove.strafe = dx / R;
  };
  const end = () => { centre.current = null; setKnob([0, 0]); stop(); };

  return (
    <div className={styles.pad} aria-label="walk joystick" role="application"
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        centre.current = [r.left + r.width / 2, r.top + r.height / 2];
        radius.current = Math.max(1, r.width * TRAVEL);
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
      <div className={styles.knob} style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }} />
    </div>
  );
}
