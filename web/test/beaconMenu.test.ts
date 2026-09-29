import { describe, expect, it } from 'vitest';
import { menuItems } from '../src/ui/menuItems';
import type { AgentState } from '../../daemon/src/types';

const a = (p: Partial<AgentState>) => ({ status: 'working', canFocus: false, ...p }) as AgentState;
const keys = (x: AgentState) => menuItems(x).map((i) => i.key);

describe('beacon menu', () => {
  it('needs-you leads with the answer', () => {
    expect(keys(a({ status: 'needs_input', ask: { id: '1', type: 'permission', text: 'Bash' } as never }))).toEqual(['reply', 'live', 'history']);
    expect(menuItems(a({ status: 'needs_input', ask: { id: '1', type: 'question', text: '?' } as never }))[0].label).toBe('Reply');
  });
  it('no reply without an ask; exited agents only have history', () => {
    expect(keys(a({ canFocus: true }))).toEqual(['live', 'history', 'terminal']);
    expect(keys(a({ status: 'crashed', canFocus: true }))).toEqual(['history']);
  });
});
