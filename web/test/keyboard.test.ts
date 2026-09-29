import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { keyAction, nextAgentId, pan, zoom, orbit } from '../src/scene/keyboard';
import type { AgentState } from '../../daemon/src/types';

const key = (k: string, extra: Partial<KeyboardEvent> = {}) => ({ key: k, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, target: null, ...extra }) as unknown as KeyboardEvent;

describe('keyAction', () => {
  it('maps navigation keys', () => {
    expect(keyAction(key('ArrowLeft'))).toEqual({ type: 'pan', dx: -1, dz: 0 });
    expect(keyAction(key('w'))).toEqual({ type: 'pan', dx: 0, dz: -1 });
    expect(keyAction(key('ArrowDown'))).toEqual({ type: 'pan', dx: 0, dz: 1 });
    expect(keyAction(key('p'))).toEqual({ type: 'walk' });
    expect(keyAction(key('P'))).toEqual({ type: 'walk' });
    expect(keyAction(key('+'))).toEqual({ type: 'zoom', dir: -1 });
    expect(keyAction(key('='))).toEqual({ type: 'zoom', dir: -1 });
    expect(keyAction(key('-'))).toEqual({ type: 'zoom', dir: 1 });
    expect(keyAction(key('q'))).toEqual({ type: 'orbit', dir: -1 });
    expect(keyAction(key('Tab'))).toEqual({ type: 'cycle', dir: 1, needsOnly: false });
    expect(keyAction(key('Tab', { shiftKey: true }))).toEqual({ type: 'cycle', dir: -1, needsOnly: false });
    expect(keyAction(key('n'))).toEqual({ type: 'cycle', dir: 1, needsOnly: true });
    expect(keyAction(key('f'))).toEqual({ type: 'focus' });
    expect(keyAction(key('0'))).toEqual({ type: 'reset' });
    expect(keyAction(key('Escape'))).toEqual({ type: 'escape' });
    expect(keyAction(key('?', { shiftKey: true }))).toEqual({ type: 'help' });
  });
  it('ignores keys while typing or with modifiers', () => {
    const ta = { tagName: 'TEXTAREA' } as unknown as EventTarget;
    expect(keyAction(key('w', { target: ta }))).toBeNull();
    expect(keyAction(key('ArrowLeft', { target: { tagName: 'INPUT' } as unknown as EventTarget }))).toBeNull();
    expect(keyAction(key('w', { metaKey: true }))).toBeNull();
    expect(keyAction(key('x'))).toBeNull();
  });
});

const a = (id: string, status: AgentState['status'] = 'working') => ({ id, status }) as AgentState;

describe('nextAgentId', () => {
  const list = [a('a'), a('b', 'needs_input'), a('c'), a('d', 'needs_input')];
  it('cycles forward/back with wrap-around', () => {
    expect(nextAgentId(list, undefined, 1, false)).toBe('a');
    expect(nextAgentId(list, 'a', 1, false)).toBe('b');
    expect(nextAgentId(list, 'd', 1, false)).toBe('a');
    expect(nextAgentId(list, 'a', -1, false)).toBe('d');
  });
  it('needsOnly jumps between agents that need you', () => {
    expect(nextAgentId(list, 'b', 1, true)).toBe('d');
    expect(nextAgentId(list, 'd', 1, true)).toBe('b');
    expect(nextAgentId(list, undefined, 1, true)).toBe('b');
    expect(nextAgentId([a('x')], undefined, 1, true)).toBeUndefined();
    expect(nextAgentId([], undefined, 1, false)).toBeUndefined();
  });
});

describe('camera math', () => {
  it('pan moves camera and target together along the ground, relative to the view', () => {
    const cam = new Vector3(0, 10, 10), target = new Vector3(0, 0, 0);
    pan(cam, target, 1, 0); // right
    expect(target.x).toBeGreaterThan(0);
    expect(target.y).toBe(0);
    expect(cam.x).toBeCloseTo(target.x);
    const before = cam.z;
    pan(cam, target, 0, -1); // forward (away from camera)
    expect(cam.z).toBeLessThan(before);
    expect(cam.y).toBe(10);
  });
  it('zoom dollies towards/away from the target within limits', () => {
    const cam = new Vector3(0, 0, 10), target = new Vector3();
    zoom(cam, target, -1);
    expect(cam.z).toBeCloseTo(8.5);
    for (let i = 0; i < 50; i++) zoom(cam, target, -1);
    expect(cam.distanceTo(target)).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 80; i++) zoom(cam, target, 1);
    expect(cam.distanceTo(target)).toBeLessThanOrEqual(80);
  });
  it('orbit rotates around the target keeping height and distance', () => {
    const cam = new Vector3(0, 5, 10), target = new Vector3();
    const d = cam.distanceTo(target);
    orbit(cam, target, 1);
    expect(cam.y).toBe(5);
    expect(cam.distanceTo(target)).toBeCloseTo(d);
    expect(cam.x).not.toBeCloseTo(0);
  });
});
