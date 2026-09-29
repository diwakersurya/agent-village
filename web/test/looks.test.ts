import { describe, it, expect } from 'vitest';
import { lookFor, MODELS } from '../src/scene/characters';
import type { AgentState } from '../../daemon/src/types';

const a = (id: string, pid: number, kind: AgentState['kind'] = 'claude') => ({ id, pid, kind }) as AgentState;

describe('lookFor', () => {
  it('is deterministic and survives the placeholder → session id change (same pid)', () => {
    expect(lookFor(a('pid:4242', 4242))).toEqual(lookFor(a('session-uuid', 4242)));
  });
  it('gives a crowd of same-kind agents varied looks', () => {
    const looks = Array.from({ length: 16 }, (_, i) => lookFor(a(`s${i}`, 1000 + i * 37)));
    expect(new Set(looks.map((l) => l.url)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(looks.map((l) => `${l.url}|${l.tint}`)).size).toBeGreaterThanOrEqual(10);
    for (const l of looks) {
      expect(MODELS).toContain(l.url);
      expect(l.scale).toBeGreaterThanOrEqual(0.94);
      expect(l.scale).toBeLessThanOrEqual(1.06);
    }
  });
  it('falls back to the id when there is no pid', () => {
    expect(lookFor(a('x', 0))).toEqual(lookFor(a('x', 0)));
  });
});
