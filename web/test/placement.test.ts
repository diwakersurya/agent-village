import { describe, it, expect } from 'vitest';
import { housePositions, buildingFor, personTarget, BUILDINGS } from '../src/scene/village/placement';
import type { AgentState } from '../../daemon/src/types';

const a = (id: string, p: Partial<AgentState> = {}): AgentState => ({
  id, kind: 'claude', pid: 1, cwd: '/w/p', project: 'p', host: 'tmux', hostRef: {}, status: 'working',
  activity: { summary: 'x' }, canReply: false, canFocus: true, lastEventAt: 0, ...p,
});

describe('placement', () => {
  it('house positions are stable, unique and away from tool buildings', () => {
    const names = ['ui-server', 'api', 'docs', 'agents-village', 'x', 'y', 'z', 'w', 'q'];
    const one = housePositions(names);
    const two = housePositions([...names].reverse());
    expect(one).toEqual(two);
    const keys = Object.values(one).map((p) => p.join(','));
    expect(new Set(keys).size).toBe(names.length);
    for (const [x, z] of Object.values(one)) {
      for (const b of Object.values(BUILDINGS)) expect(Math.hypot(x - b[0], z - b[1])).toBeGreaterThan(3);
    }
  });

  it('maps tools to buildings', () => {
    expect(buildingFor('Bash')).toBe('workshop');
    expect(buildingFor('Grep')).toBe('library');
    expect(buildingFor('Edit')).toBe('drafting');
    expect(buildingFor('WebFetch')).toBe('post');
    expect(buildingFor('TodoWrite')).toBeNull();
    expect(buildingFor(undefined)).toBeNull();
  });

  it('two agents of one project get distinct targets; working agents go to buildings', () => {
    const houses = housePositions(['p']);
    const t1 = personTarget(a('1', { status: 'idle' }), 0, houses);
    const t2 = personTarget(a('2', { status: 'idle' }), 1, houses);
    expect(t1).not.toEqual(t2);
    const w = personTarget(a('3', { activity: { tool: 'Bash', summary: '' } }), 0, houses);
    expect(Math.hypot(w[0] - BUILDINGS.workshop[0], w[2] - BUILDINGS.workshop[1])).toBeLessThan(3);
  });

});
