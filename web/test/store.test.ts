import { describe, it, expect, beforeEach } from 'vitest';
import { useAgents } from '../src/store/agents';
import type { AgentState } from '../../daemon/src/types';

const a = (id: string, p: Partial<AgentState> = {}): AgentState => ({
  id, kind: 'claude', pid: 1, cwd: '/w/p', project: 'p', host: 'tmux', hostRef: {}, status: 'working',
  activity: { summary: 'x' }, canReply: false, canFocus: true, lastEventAt: 0, ...p,
});

beforeEach(() => useAgents.setState({ agents: {}, selectedId: undefined, sent: {}, monitor: 'closed', listOpen: false }));

describe('agents store', () => {
  it('snapshot replaces all', () => {
    const s = useAgents.getState();
    s.apply({ type: 'upsert', agent: a('old') });
    s.apply({ type: 'snapshot', agents: [a('x'), a('y')] });
    expect(Object.keys(useAgents.getState().agents).sort()).toEqual(['x', 'y']);
  });

  it('upsert adds/updates, remove deletes and clears selection', () => {
    const s = useAgents.getState();
    s.apply({ type: 'upsert', agent: a('x') });
    s.apply({ type: 'upsert', agent: a('x', { status: 'idle' }) });
    expect(useAgents.getState().agents.x.status).toBe('idle');
    s.select('x');
    s.setMonitor('history');
    s.apply({ type: 'remove', id: 'x' });
    expect(useAgents.getState().agents.x).toBeUndefined();
    expect(useAgents.getState().selectedId).toBeUndefined();
    expect(useAgents.getState().monitor).toBe('closed');
  });

  it('sent marker clears when the ask changes', () => {
    const s = useAgents.getState();
    s.apply({ type: 'upsert', agent: a('x', { ask: { id: 'k1', type: 'idle', text: '?' } }) });
    s.markSent('x', 'k1');
    s.apply({ type: 'upsert', agent: a('x', { ask: { id: 'k1', type: 'idle', text: '?' }, activity: { summary: 'y' } }) });
    expect(useAgents.getState().sent.x).toBe('k1');
    s.apply({ type: 'upsert', agent: a('x', { ask: { id: 'k2', type: 'idle', text: '?' } }) });
    expect(useAgents.getState().sent.x).toBeUndefined();
  });
});

describe('monitor + agent list', () => {
  it('selecting an agent does not open its monitor; openMonitor does', () => {
    useAgents.getState().apply({ type: 'upsert', agent: a('x') });
    useAgents.getState().select('x');
    expect(useAgents.getState()).toMatchObject({ selectedId: 'x', monitor: 'closed' });
    useAgents.getState().openMonitor('x');
    expect(useAgents.getState()).toMatchObject({ selectedId: 'x', monitor: 'live' });
  });
  it('deselecting closes the monitor; minimise keeps the selection', () => {
    const s = useAgents.getState();
    s.apply({ type: 'upsert', agent: a('x') });
    s.openMonitor('x');
    s.setMonitor('closed');
    expect(useAgents.getState()).toMatchObject({ selectedId: 'x', monitor: 'closed' });
    s.openMonitor('x');
    s.select(undefined);
    expect(useAgents.getState().monitor).toBe('closed');
  });
  it('picking from the agent list focuses that agent (camera) without opening its monitor', () => {
    const s = useAgents.getState();
    s.apply({ type: 'upsert', agent: a('y') });
    s.toggleList();
    expect(useAgents.getState().listOpen).toBe(true);
    s.focusAgent('y');
    expect(useAgents.getState()).toMatchObject({ selectedId: 'y', monitor: 'closed', listOpen: false });
  });
  it('switching agents while a monitor is open keeps it closed for the new one', () => {
    const s = useAgents.getState();
    s.apply({ type: 'upsert', agent: a('y') });
    s.apply({ type: 'upsert', agent: a('z') });
    s.openMonitor('y');
    s.focusAgent('z');
    expect(useAgents.getState()).toMatchObject({ selectedId: 'z', monitor: 'closed' });
  });
});

describe('walk mode', () => {
  it('entering closes the list; leaving re-frames the orbit camera; repeat is a no-op', () => {
    useAgents.setState({ walk: false, listOpen: true });
    const n0 = useAgents.getState().resetNonce;
    useAgents.getState().setWalk(true);
    expect(useAgents.getState()).toMatchObject({ walk: true, listOpen: false, resetNonce: n0 });
    useAgents.getState().setWalk(true);
    expect(useAgents.getState().resetNonce).toBe(n0);
    useAgents.getState().setWalk(false);
    expect(useAgents.getState()).toMatchObject({ walk: false, resetNonce: n0 + 1 });
  });
});

import { clipKey } from '../src/hooks/useAgentAnimation';
describe('desk poses', () => {
  it('working and idle agents both sit in their chair; needs-you stands; walking walks', () => {
    expect(clipKey('working', false, 'desk')).toBe('sitWork');
    expect(clipKey('idle', false, 'desk')).toBe('idleSitChair');
    expect(clipKey('needs_input', false, 'desk')).toBe('needsYou');
    expect(clipKey('idle', true, 'desk')).toBe('walk');
    expect(clipKey('idle', false, 'spot')).toBe('standWork');
  });
});

describe('status filter', () => {
  it('toggles a status out and back in, and drops a selection it hides', () => {
    const s = () => useAgents.getState();
    s().apply({ type: 'snapshot', agents: [{ id: 'f1', status: 'working', project: 'p' } as never] });
    s().select('f1');
    s().toggleStatus('working');
    expect(s().hiddenStatuses).toEqual(['working']);
    expect(s().selectedId).toBeUndefined();
    s().toggleStatus('working');
    expect(s().hiddenStatuses).toEqual([]);
  });
});

describe('walk-mode focus', () => {
  it('picking an agent from the list in walk mode requests a teleport instead of selecting', () => {
    const s = () => useAgents.getState();
    s().setWalk(true);
    s().select(undefined);
    const n0 = s().teleportReq?.n ?? 0;
    s().focusAgent('t1');
    expect(s().teleportReq).toEqual({ id: 't1', n: n0 + 1 });
    expect(s().selectedId).toBeUndefined(); // selected on arrival
    s().setWalk(false);
    s().focusAgent('t1');
    expect(s().selectedId).toBe('t1');
    s().select(undefined);
  });
});
