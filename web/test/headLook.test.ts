import { describe, expect, it } from 'vitest';
import { Object3D, Quaternion, Vector3 } from 'three';
import { tiltHead, type HeadLookState } from '../src/scene/Person';

function rig() {
  const root = new Object3D();
  const head = new Object3D();
  head.name = 'head';
  head.position.set(0, 1.5, 0);
  root.add(head);
  return { root, head, st: { base: new Quaternion(), out: null } as HeadLookState };
}
const cam = new Vector3(0, 6, 5); // above and in front

describe('tiltHead', () => {
  it('holds a steady tilt when no clip animates the head (no compounding spin)', () => {
    const { root, head, st } = rig();
    tiltHead(head, root, cam, 1, st);
    const first = head.quaternion.clone();
    for (let i = 0; i < 200; i++) tiltHead(head, root, cam, 1, st);
    expect(head.quaternion.angleTo(first)).toBeLessThan(1e-6);
    expect(head.quaternion.angleTo(new Quaternion())).toBeCloseTo(0.55, 2); // clamped chin-up
  });
  it('adds on top of a fresh clip pose each frame', () => {
    const { root, head, st } = rig();
    const pose = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.3);
    for (let i = 0; i < 50; i++) { head.quaternion.copy(pose); tiltHead(head, root, cam, 1, st); }
    expect(head.quaternion.angleTo(pose)).toBeCloseTo(0.55, 2);
  });
  it('returns to the base pose when released', () => {
    const { root, head, st } = rig();
    for (let i = 0; i < 10; i++) tiltHead(head, root, cam, 1, st);
    tiltHead(head, root, cam, 0, st);
    expect(head.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6);
  });
});

describe('greeting nod', () => {
  it('nods and returns, never compounding (no clip animating the head)', () => {
    const root = new Object3D(), head = new Object3D(); head.position.set(0, 1.5, 0); root.add(head);
    const st = { base: new Quaternion(), out: null } as HeadLookState;
    const cam = new Vector3(0, 6, 5);
    for (let i = 0; i < 20; i++) tiltHead(head, root, cam, 1, st);
    const steady = head.quaternion.clone();
    for (let i = 0; i < 60; i++) tiltHead(head, root, cam, 1, st, Math.sin((i / 60) * Math.PI) * 0.18);
    tiltHead(head, root, cam, 1, st, 0);
    expect(head.quaternion.angleTo(steady)).toBeLessThan(1e-6);
  });
});
