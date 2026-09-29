import type { Camera } from 'three';
import { Vector3 } from 'three';
import type { Status } from '../../../daemon/src/types';

/**
 * Synthesised sound effects (Web Audio, no asset files). Everything is a no-op until the first user gesture
 * unlocks the AudioContext, while muted, or where Web Audio doesn't exist (tests, old browsers).
 * Positional sounds go through a PannerNode; SceneAudio keeps the listener on the camera.
 */
type P3 = [number, number, number];
const MUTE_KEY = 'village.muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = readMuted();
const subs = new Set<() => void>();

function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

function audio(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof AudioContext === 'undefined') return null;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
  return ctx;
}

/** Browsers only allow audio after a gesture; call from pointerdown / keydown. */
export function unlockAudio() { void audio()?.resume(); }

const live = () => (ctx && ctx.state === 'running' && !muted ? ctx : null);

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* storage blocked */ }
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
  subs.forEach((f) => f());
  // audible confirmation when you switch sound on
  if (!m) { unlockAudio(); setTimeout(() => sfx.done(), 60); }
}
export function subscribeMuted(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }

/** Where a sound comes out: a panner at `pos` (near = loud), or straight to master. */
function out(c: AudioContext, pos?: P3, near?: number): AudioNode {
  if (!pos) return master!;
  const p = new PannerNode(c, near
    // short-range ambience (typing): silent beyond `near` units
    ? { panningModel: 'HRTF', distanceModel: 'linear', refDistance: 1, maxDistance: near, rolloffFactor: 1, positionX: pos[0], positionY: pos[1], positionZ: pos[2] }
    // alerts: audible anywhere, but you can hear which way
    : { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 4, rolloffFactor: 0.6, positionX: pos[0], positionY: pos[1], positionZ: pos[2] });
  p.connect(master!);
  return p;
}

function tone(c: AudioContext, dest: AudioNode, o: { f: number; f2?: number; t?: number; dur: number; gain: number; type?: OscillatorType }) {
  const t = c.currentTime + (o.t ?? 0);
  const osc = new OscillatorNode(c, { type: o.type ?? 'sine', frequency: o.f });
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  const g = new GainNode(c, { gain: 0 });
  g.gain.linearRampToValueAtTime(o.gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
}

function noise(c: AudioContext, dest: AudioNode, o: { dur: number; gain: number; type: BiquadFilterType; f: number; f2?: number; q?: number; t?: number }) {
  const t = c.currentTime + (o.t ?? 0);
  const src = new AudioBufferSourceNode(c, { buffer: noiseBuf, playbackRate: 0.8 + Math.random() * 0.4 });
  const flt = new BiquadFilterNode(c, { type: o.type, frequency: o.f, Q: o.q ?? 1 });
  if (o.f2) flt.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  const g = new GainNode(c, { gain: 0 });
  g.gain.linearRampToValueAtTime(o.gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(flt).connect(g).connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(t + o.dur + 0.02);
}

export const sfx = {
  /** Agent asks for input: rising two-note chime from its desk. */
  needsYou(pos?: P3) {
    const c = live(); if (!c) return;
    const d = out(c, pos);
    tone(c, d, { f: 784, dur: 0.35, gain: 0.3 });
    tone(c, d, { f: 1175, t: 0.16, dur: 0.5, gain: 0.3 });
  },
  /** An agent notices you (focused / walked up to): a soft, bubbly "hm-hm!" — `pitch` varies it per agent. */
  greet(pos?: P3, pitch = 1) {
    const c = live(); if (!c) return;
    const d = out(c, pos);
    tone(c, d, { f: 480 * pitch, f2: 640 * pitch, dur: 0.12, gain: 0.4 });
    tone(c, d, { f: 620 * pitch, f2: 900 * pitch, t: 0.13, dur: 0.2, gain: 0.4 });
  },
  /** Teleport dash: a rushing whoosh. */
  whoosh() {
    const c = live(); if (!c) return;
    noise(c, master!, { dur: 0.45, gain: 0.35, type: 'bandpass', f: 300, f2: 4000, q: 1.2 });
    tone(c, master!, { f: 200, f2: 900, dur: 0.35, gain: 0.08, type: 'sawtooth' });
  },
  /** Agent finished its turn. */
  done(pos?: P3) {
    const c = live(); if (!c) return;
    const d = out(c, pos);
    tone(c, d, { f: 660, dur: 0.45, gain: 0.16, type: 'triangle' });
  },
  /** Agent crashed / exited. */
  crashed(pos?: P3) {
    const c = live(); if (!c) return;
    const d = out(c, pos);
    tone(c, d, { f: 220, f2: 70, dur: 0.45, gain: 0.25, type: 'square' });
  },
  /** Your reply was delivered. */
  sent() {
    const c = live(); if (!c) return;
    noise(c, master!, { dur: 0.35, gain: 0.18, type: 'bandpass', f: 400, f2: 3500, q: 2 });
  },
  /** One keystroke from a working agent's keyboard (short range). */
  key(pos: P3) {
    const c = live(); if (!c) return;
    noise(c, out(c, pos, 6), { dur: 0.035, gain: 0.25, type: 'highpass', f: 1800 + Math.random() * 1500 });
  },
  /** Your own footstep in walk mode. */
  footstep(run: boolean) {
    const c = live(); if (!c) return;
    noise(c, master!, { dur: run ? 0.07 : 0.09, gain: 0.12, type: 'lowpass', f: 380 });
    tone(c, master!, { f: 75, f2: 50, dur: 0.07, gain: 0.12 });
  },
  /** Water cooler: a few glugs (bubbles rising in the bottle). */
  glug(pos: P3) {
    const c = live(); if (!c) return;
    const d = out(c, pos);
    for (let i = 0; i < 4; i++) tone(c, d, { f: 180 + Math.random() * 60, f2: 420, t: i * 0.28 + Math.random() * 0.05, dur: 0.14, gain: 0.25 });
  },
  /** Coffee machine: grinding/brewing hiss, then a ding. */
  brew(pos: P3, secs: number) {
    const c = live(); if (!c) return;
    const d = out(c, pos);
    noise(c, d, { dur: 0.6, gain: 0.22, type: 'bandpass', f: 900, q: 1.5 });
    noise(c, d, { t: 0.6, dur: secs - 0.8, gain: 0.08, type: 'highpass', f: 2500 });
    tone(c, d, { f: 1320, t: secs, dur: 0.5, gain: 0.15 });
  },
  /** Microwave: hum while it runs, then a ding. */
  microwave(pos: P3, secs: number) {
    const c = live(); if (!c) return;
    const d = out(c, pos);
    tone(c, d, { f: 120, dur: secs, gain: 0.09, type: 'sawtooth' });
    tone(c, d, { f: 1760, t: secs, dur: 0.6, gain: 0.18 });
  },
  /** Vacuum gets kicked: plastic bonk + an indignant little beep. */
  bonk(pos: P3) {
    const c = live(); if (!c) return;
    const d = out(c, pos);
    noise(c, d, { dur: 0.08, gain: 0.3, type: 'bandpass', f: 900, q: 2 });
    tone(c, d, { f: 1400, f2: 700, t: 0.12, dur: 0.18, gain: 0.12, type: 'square' });
  },
  /** Billiard balls knocking together (louder for harder hits); `soft` = a cushion. */
  clack(pos: P3, speed: number, soft = false) {
    const c = live(); if (!c) return;
    const d = out(c, pos);
    const g = Math.min(0.35, 0.05 + speed * 0.1);
    if (soft) tone(c, d, { f: 140, f2: 90, dur: 0.08, gain: g * 0.6 });
    else { tone(c, d, { f: 2600, f2: 1800, dur: 0.04, gain: g }); noise(c, d, { dur: 0.03, gain: g * 0.6, type: 'highpass', f: 3000 }); }
  },
  /** A ball drops into a pocket: hollow knock and a roll. */
  pocket(pos: P3) {
    const c = live(); if (!c) return;
    const d = out(c, pos);
    tone(c, d, { f: 320, f2: 180, dur: 0.12, gain: 0.25 });
    noise(c, d, { t: 0.08, dur: 0.35, gain: 0.08, type: 'lowpass', f: 700 });
  },
  /** Table tennis: bat (`hit`) or table bounce. */
  pong(pos: P3, hit: boolean) {
    const c = live(); if (!c) return;
    const d = out(c, pos);
    tone(c, d, { f: hit ? 900 : 1500, f2: hit ? 600 : 1100, dur: hit ? 0.05 : 0.04, gain: hit ? 0.3 : 0.2 });
  },
  /** Fridge door: a soft thunk. */
  thunk(pos: P3) {
    const c = live(); if (!c) return;
    const d = out(c, pos);
    tone(c, d, { f: 110, f2: 60, dur: 0.18, gain: 0.3 });
    noise(c, d, { dur: 0.12, gain: 0.12, type: 'lowpass', f: 500 });
  },
  /** Vacuum sucks up a dirt patch. */
  slurp(pos: P3) {
    const c = live(); if (!c) return;
    const d = out(c, pos, 9);
    tone(c, d, { f: 250, f2: 900, dur: 0.18, gain: 0.25, type: 'triangle' });
    noise(c, d, { dur: 0.2, gain: 0.15, type: 'bandpass', f: 1500, q: 3 });
  },
};

/** The status change worth a sound, if any. First sighting (prev undefined) is silent. */
export function soundFor(prev: Status | undefined, next: Status): 'needsYou' | 'done' | 'crashed' | null {
  if (!prev || prev === next) return null;
  if (next === 'needs_input') return 'needsYou';
  if (next === 'crashed') return 'crashed';
  if (next === 'idle' && prev === 'working') return 'done';
  return null;
}

/** Continuous vacuum hum that follows it (short range). Created lazily once audio is live. */
let hum: { panner: PannerNode; gain: GainNode } | null = null;
export function vacuumHum(x: number, z: number) {
  const c = live();
  if (!c) { if (hum && ctx) hum.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1); return; }
  if (!hum) {
    const panner = out(c, [x, 0.2, z], 8) as PannerNode;
    const gain = new GainNode(c, { gain: 0 });
    const motor = new OscillatorNode(c, { type: 'sawtooth', frequency: 92 });
    const lp = new BiquadFilterNode(c, { type: 'lowpass', frequency: 420 });
    const air = new AudioBufferSourceNode(c, { buffer: noiseBuf, loop: true });
    const bp = new BiquadFilterNode(c, { type: 'bandpass', frequency: 1100, Q: 0.7 });
    const airGain = new GainNode(c, { gain: 0.5 });
    motor.connect(lp).connect(gain);
    air.connect(bp).connect(airGain).connect(gain);
    gain.connect(panner);
    motor.start(); air.start();
    hum = { panner, gain };
  }
  hum.gain.gain.setTargetAtTime(0.06, c.currentTime, 0.2);
  hum.panner.positionX.value = x;
  hum.panner.positionZ.value = z;
}

/** Silence the hum when the vacuum leaves the scene (e.g. village view). */
export function stopVacuumHum() {
  if (hum && ctx) hum.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
}

const fwd = new Vector3();
/** Puts the listener's ears where the camera is, facing where it looks. */
export function syncListener(camera: Camera) {
  if (!ctx) return;
  const l = ctx.listener;
  camera.getWorldDirection(fwd);
  const { x, y, z } = camera.position;
  if (l.positionX) {
    l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
    l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
    l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
  } else {
    l.setPosition(x, y, z);
    l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
  }
}
