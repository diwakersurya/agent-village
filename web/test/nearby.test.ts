import { beforeEach, describe, expect, it } from 'vitest';
import { nearestAgent } from '../src/scene/walk';
import { useAgents } from '../src/store/agents';

describe('nearestAgent', () => {
  // you at the origin looking towards -z (yaw 0)
  it('picks the closest agent in front within reach', () => {
    expect(nearestAgent(0, 0, 0, [['a', 0, -2], ['b', 0, -1.2]])).toBe('b');
    expect(nearestAgent(0, 0, 0, [['a', 0, -3]])).toBeUndefined();
  });
  it('ignores agents behind you, unless you are right next to them', () => {
    expect(nearestAgent(0, 0, 0, [['a', 0, 2]])).toBeUndefined();
    expect(nearestAgent(0, 0, 0, [['a', 0, 0.6]])).toBe('a');
  });
  it('keeps the current one until you are further away (no flicker at the edge)', () => {
    expect(nearestAgent(0, 0, 0, [['a', 0, -3]], 'a')).toBe('a');
    expect(nearestAgent(0, 0, 0, [['a', 0, 3]], 'a')).toBe('a'); // turned around: still with them
    expect(nearestAgent(0, 0, 0, [['a', 0, -4]], 'a')).toBeUndefined();
  });
});

describe('setNearby', () => {
  beforeEach(() => useAgents.setState({ selectedId: undefined, nearbyId: undefined, monitor: 'closed', greet: undefined }));
  it('walking up focuses and greets once; walking away releases', () => {
    const s = () => useAgents.getState();
    s().setNearby('a');
    expect(s()).toMatchObject({ selectedId: 'a', nearbyId: 'a', greet: { id: 'a', n: 1 } });
    s().setNearby('a');
    expect(s().greet!.n).toBe(1); // still there: no second smile
    s().setNearby(undefined);
    expect(s().selectedId).toBeUndefined();
    s().setNearby('a');
    expect(s().greet!.n).toBe(2); // came back: smiles again
  });
  it('never overrides a selection you made, or an open monitor', () => {
    const s = () => useAgents.getState();
    s().select('mine');
    s().setNearby('a');
    expect(s().selectedId).toBe('mine');
    s().setNearby(undefined);
    expect(s().selectedId).toBe('mine');
    s().select(undefined);
    s().setNearby('a');
    s().openMonitor('a');
    s().setNearby(undefined);
    expect(s().selectedId).toBe('a'); // monitor open: stays
  });
});
