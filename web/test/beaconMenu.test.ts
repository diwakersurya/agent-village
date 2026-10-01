import { describe, expect, it } from 'vitest';
import { menuItems } from '../src/ui/menuItems';
import type { AgentState } from '../../daemon/src/types';

const a = (p: Partial<AgentState>) => ({ status: 'working', canFocus: false, ...p }) as AgentState;
const keys = (x: AgentState) => menuItems(x).map((i) => i.key);
const off = (x: AgentState) => menuItems(x).filter((i) => i.disabled).map((i) => i.key);

describe('beacon menu', () => {
  it('needs-you leads with the answer', () => {
    expect(keys(a({ status: 'needs_input', ask: { id: '1', type: 'permission', text: 'Bash' } as never }))).toEqual(['reply', 'live', 'history', 'terminal']);
    expect(menuItems(a({ status: 'needs_input', ask: { id: '1', type: 'question', text: '?' } as never }))[0].label).toBe('Reply');
  });
  it('keeps unusable items in place, disabled with a reason', () => {
    expect(keys(a({ canFocus: true }))).toEqual(['live', 'history', 'terminal']);
    expect(off(a({ canFocus: true }))).toEqual([]);
    expect(off(a({ canFocus: false }))).toEqual(['terminal']);
    expect(keys(a({ status: 'crashed', canFocus: true }))).toEqual(['live', 'history', 'terminal']);
    expect(off(a({ status: 'crashed', canFocus: true }))).toEqual(['live', 'terminal']);
    expect(menuItems(a({ status: 'crashed' }))[0].disabled).toMatch(/Exited/);
  });
});
