import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import type { AddressInfo } from 'node:net';
import { createServer } from '../src/server';
import { Registry } from '../src/core/registry';
import { Holds } from '../src/core/holds';
import type { AgentState } from '../src/types';

const TOKEN = 'secret';
let srv: ReturnType<typeof createServer>;
let url: string;
let registry: Registry;
let sent: { a: AgentState; text: string }[];
let canSend = false;

beforeEach(async () => {
  sent = [];
  canSend = false;
  const channels = {
    canSend: (_a: AgentState) => canSend,
    send: async (a: AgentState, text: string) => { sent.push({ a, text }); },
    focus: async () => {},
  };
  registry = new Registry({ canReply: (a) => channels.canSend(a) });
  srv = createServer({ registry, holds: new Holds(), token: TOKEN, holdTimeoutMs: 2000, channels, history: async () => [] });
  await new Promise<void>((r) => srv.http.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(srv.http.address() as AddressInfo).port}`;
});
afterEach(async () => { await srv.close(); });

const hook = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${url}/hook?agent=claude`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', 'x-village-pid': '77', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const api = (path: string, init: RequestInit = {}) =>
  fetch(`${url}/api${path}`, { ...init, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...(init.headers as any) } });
const openWs = () =>
  new Promise<{ ws: WebSocket; msgs: any[] }>((resolve) => {
    const ws = new WebSocket(`${url.replace('http', 'ws')}/ws?token=${TOKEN}`);
    const msgs: any[] = [];
    ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
    ws.on('open', () => resolve({ ws, msgs }));
  });
const until = async (fn: () => boolean) => { for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 10)); };

const perm = { session_id: 's1', cwd: '/w/p', hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf dist' } };

describe('auth & validation', () => {
  it('401 without token', async () => {
    expect((await fetch(`${url}/api/agents`)).status).toBe(401);
    expect((await hook(perm, { authorization: 'Bearer nope' })).status).toBe(401);
  });
  it('403 on foreign origin', async () => {
    expect((await api('/agents', { headers: { origin: 'https://evil.example' } })).status).toBe(403);
  });
  it('400 on malformed JSON, 413 on huge body', async () => {
    expect((await hook('{not json')).status).toBe(400);
    expect((await hook('"' + 'x'.repeat(1_100_000) + '"')).status).toBe(413);
  });
  it('204 for unknown event', async () => {
    expect((await hook({ session_id: 's1', hook_event_name: 'Weird' })).status).toBe(204);
  });
});

describe('hook hold + reply', () => {
  it('no UI clients → no hold, agent is recorded', async () => {
    const r = await hook(perm);
    expect(r.status).toBe(204);
    const agents = await (await api('/agents')).json();
    expect(agents[0]).toMatchObject({ id: 's1', status: 'needs_input', pid: 77, canReply: false });
  });

  it('UI connected → hold until reply, returns decision', async () => {
    const { ws, msgs } = await openWs();
    const pending = hook(perm);
    await until(() => msgs.some((m) => m.type === 'upsert' && m.agent.canReply));
    const agent = msgs.filter((m) => m.type === 'upsert').pop().agent;
    expect(msgs[0].type).toBe('snapshot');
    const rep = await api(`/agents/s1/reply`, { method: 'POST', body: JSON.stringify({ askId: agent.ask.id, option: 'Allow' }) });
    expect(await rep.json()).toEqual({ ok: true, via: 'hook' });
    const r = await pending;
    expect(await r.json()).toEqual({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
    await until(() => registry.get('s1')?.status === 'working');
    expect(registry.get('s1')?.ask).toBeUndefined();
    ws.close();
  });

  it('stale askId → 409, unknown agent → 404', async () => {
    await hook(perm);
    expect((await api(`/agents/s1/reply`, { method: 'POST', body: JSON.stringify({ askId: 'old', text: 'x' }) })).status).toBe(409);
    expect((await api(`/agents/nope/reply`, { method: 'POST', body: JSON.stringify({ askId: 'x', text: 'x' }) })).status).toBe(404);
  });

  it('no hold and no channel → 409 no-channel', async () => {
    await hook({ ...perm, hook_event_name: 'Stop' });
    const a = registry.get('s1')!;
    const r = await api(`/agents/s1/reply`, { method: 'POST', body: JSON.stringify({ askId: a.ask!.id, text: 'go' }) });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: 'no-channel' });
  });

  it('turn_end on host with channel → not held; reply goes through channel', async () => {
    canSend = true;
    const { ws } = await openWs();
    const r = await hook({ ...perm, hook_event_name: 'Stop' }, { 'x-village-tmux-pane': '%1' });
    expect(r.status).toBe(204);
    const a = registry.get('s1')!;
    expect(a.host).toBe('tmux');
    const rep = await api(`/agents/s1/reply`, { method: 'POST', body: JSON.stringify({ askId: a.ask!.id, text: 'run tests' }) });
    expect(await rep.json()).toEqual({ ok: true, via: 'tmux' });
    expect(sent[0].text).toBe('run tests');
    ws.close();
  });

  it('hold times out → 204 and canReply falls back', async () => {
    await srv.close();
    const channels = { canSend: () => false, send: async () => {}, focus: async () => {} };
    registry = new Registry({ canReply: () => false });
    srv = createServer({ registry, holds: new Holds(), token: TOKEN, holdTimeoutMs: 50, channels, history: async () => [] });
    await new Promise<void>((r) => srv.http.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(srv.http.address() as AddressInfo).port}`;
    const { ws } = await openWs();
    const r = await hook(perm);
    expect(r.status).toBe(204);
    expect(registry.get('s1')).toMatchObject({ status: 'needs_input', canReply: false });
    ws.close();
  });
});
