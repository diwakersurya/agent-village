import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer } from '../src/server';
import { Registry } from '../src/core/registry';
import { Holds } from '../src/core/holds';
import type { AgentState } from '../src/types';

const TOKEN = 'secret';
let srv: ReturnType<typeof createServer> | undefined;
afterEach(async () => { await srv?.close(); srv = undefined; });

async function setup(opts: { canSend?: boolean; holdTimeoutMs?: number; devOrigins?: boolean } = {}) {
  const sent: string[] = [];
  const channels = {
    canSend: (_a: AgentState) => !!opts.canSend,
    send: async (_a: AgentState, t: string) => { sent.push(t); },
    focus: async () => {},
  };
  const registry = new Registry({ canReply: (a) => channels.canSend(a) });
  srv = createServer({ registry, holds: new Holds(), token: TOKEN, holdTimeoutMs: opts.holdTimeoutMs ?? 5000, channels, history: async () => [], devOrigins: opts.devOrigins });
  await new Promise<void>((r) => srv!.http.listen(0, '127.0.0.1', r));
  const port = (srv.http.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;
  const hook = (body: object, headers: Record<string, string> = {}, signal?: AbortSignal) =>
    fetch(`${url}/hook?agent=claude`, { method: 'POST', signal, body: JSON.stringify(body), headers: { authorization: `Bearer ${TOKEN}`, 'x-village-pid': '77', ...headers } });
  const reply = (id: string, askId: string, r: object) =>
    fetch(`${url}/api/agents/${id}/reply`, { method: 'POST', body: JSON.stringify({ askId, ...r }), headers: { authorization: `Bearer ${TOKEN}` } });
  const openWs = () => new Promise<WebSocket>((res) => { const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TOKEN}`); ws.on('open', () => res(ws)); });
  return { registry, sent, hook, reply, openWs, url, port };
}

const until = async (fn: () => boolean) => { for (let i = 0; i < 200 && !fn(); i++) await new Promise((r) => setTimeout(r, 10)); };
const perm = { session_id: 's1', cwd: '/w/p', hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf x' }, tool_use_id: 't1' };

describe('C2: permission/question asks are hook-only', () => {
  it('unheld permission ask on a tmux host is not replyable and never typed', async () => {
    const t = await setup({ canSend: true });
    await t.hook(perm, { 'x-village-tmux-pane': '%1' }); // no UI → not held
    const a = t.registry.get('s1')!;
    expect(a.canReply).toBe(false);
    const r = await t.reply('s1', a.ask!.id, { option: 'Deny' });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: 'terminal-only' });
    expect(t.sent).toEqual([]);
  });

  it('after a hold times out the permission ask becomes terminal-only', async () => {
    const t = await setup({ canSend: true, holdTimeoutMs: 50 });
    const ws = await t.openWs();
    expect((await t.hook(perm, { 'x-village-tmux-pane': '%1' })).status).toBe(204);
    const a = t.registry.get('s1')!;
    expect(a.canReply).toBe(false);
    expect((await t.reply('s1', a.ask!.id, { option: 'Allow' })).status).toBe(409);
    expect(t.sent).toEqual([]);
    ws.close();
  });

  it('idle asks on a channel host still go through the channel', async () => {
    const t = await setup({ canSend: true });
    await t.hook({ ...perm, hook_event_name: 'Stop' }, { 'x-village-tmux-pane': '%1' });
    const a = t.registry.get('s1')!;
    expect(a.canReply).toBe(true);
    expect((await t.reply('s1', a.ask!.id, { text: 'next' })).status).toBe(200);
    expect(t.sent).toEqual(['next']);
  });
});

describe('I1: unrelated events do not release a held ask', () => {
  it('parallel PostToolUse / Notification keep the hold and the ask', async () => {
    const t = await setup();
    const ws = await t.openWs();
    const pending = t.hook(perm);
    await until(() => !!t.registry.get('s1')?.canReply);
    const askId = t.registry.get('s1')!.ask!.id;
    await t.hook({ session_id: 's1', hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: {}, tool_use_id: 't2' });
    await t.hook({ session_id: 's1', hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' });
    const a = t.registry.get('s1')!;
    expect(a).toMatchObject({ status: 'needs_input', canReply: true });
    expect(a.ask?.id).toBe(askId);
    expect((await t.reply('s1', askId, { option: 'Allow' })).status).toBe(200);
    const res = await pending;
    expect(res.status).toBe(200);
    ws.close();
  });

  it('a resolving event (same tool_use_id) releases the hold', async () => {
    const t = await setup();
    const ws = await t.openWs();
    const pending = t.hook(perm);
    await until(() => !!t.registry.get('s1')?.canReply);
    await t.hook({ session_id: 's1', hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: {}, tool_use_id: 't1' });
    expect((await pending).status).toBe(204);
    expect(t.registry.get('s1')!.ask).toBeUndefined();
    ws.close();
  });
});

describe('I2: hook client disconnect releases the hold', () => {
  it('aborted hook → not replyable any more', async () => {
    const t = await setup();
    const ws = await t.openWs();
    const ac = new AbortController();
    const pending = t.hook({ ...perm, hook_event_name: 'Stop' }, {}, ac.signal).catch(() => null);
    await until(() => !!t.registry.get('s1')?.canReply);
    ac.abort();
    await pending;
    await until(() => !t.registry.get('s1')?.canReply);
    const a = t.registry.get('s1')!;
    expect(a.canReply).toBe(false);
    expect((await t.reply('s1', a.ask!.id, { text: 'hi' })).status).toBe(409);
    ws.close();
  });
});

describe('I3: holds need a visible UI', () => {
  it('hidden tab → no hold', async () => {
    const t = await setup();
    const ws = await t.openWs();
    ws.send(JSON.stringify({ type: 'visibility', visible: false }));
    await new Promise((r) => setTimeout(r, 30));
    expect((await t.hook(perm)).status).toBe(204);
    ws.close();
  });

  it('last UI closing releases pending holds', async () => {
    const t = await setup();
    const ws = await t.openWs();
    const pending = t.hook(perm);
    await until(() => !!t.registry.get('s1')?.canReply);
    ws.close();
    expect((await pending).status).toBe(204);
  });
});

describe('decision marker + crash', () => {
  it('decisions carry x-village: 1', async () => {
    const t = await setup();
    const ws = await t.openWs();
    const pending = t.hook(perm);
    await until(() => !!t.registry.get('s1')?.canReply);
    await t.reply('s1', t.registry.get('s1')!.ask!.id, { option: 'Allow' });
    expect((await pending).headers.get('x-village')).toBe('1');
    ws.close();
  });

  it('agent crashing releases its hold', async () => {
    const t = await setup();
    const ws = await t.openWs();
    const pending = t.hook(perm);
    await until(() => !!t.registry.get('s1')?.canReply);
    t.registry.syncProcs([], Date.now()); // pid 77 gone
    expect((await pending).status).toBe(204);
    ws.close();
  });
});

describe('I7: origin + host hardening', () => {
  const raw = (port: number, headers: Record<string, string>) =>
    new Promise<number>((res) => {
      http.get({ host: '127.0.0.1', port, path: '/api/agents', headers: { authorization: `Bearer ${TOKEN}`, ...headers } }, (r) => { r.resume(); res(r.statusCode!); });
    });

  it('dev origins rejected unless enabled', async () => {
    const t = await setup();
    expect(await raw(t.port, { origin: 'http://localhost:5173' })).toBe(403);
    await srv!.close();
    const d = await setup({ devOrigins: true });
    expect(await raw(d.port, { origin: 'http://localhost:5173', host: 'localhost:5173' })).toBe(200);
  });

  it('foreign Host header (DNS rebinding) rejected', async () => {
    const t = await setup();
    expect(await raw(t.port, { host: 'evil.example:4777' })).toBe(403);
    expect(await raw(t.port, { host: `localhost:${t.port}` })).toBe(200);
  });
});

describe('GET /screen', () => {
  it('falls back to the command feed when the host has no screen', async () => {
    const t = await setup();
    await t.hook({ session_id: 's1', cwd: '/w/p', hook_event_name: 'UserPromptSubmit', prompt: 'hi' });
    const r = await fetch(`${t.url}/api/agents/s1/screen`, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ source: 'commands', commands: [] });
  });
});
