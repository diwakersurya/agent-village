import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer, type ServerDeps } from '../src/server';
import { Registry } from '../src/core/registry';
import { Holds } from '../src/core/holds';

const TOKEN = 'secret';
let srv: ReturnType<typeof createServer> | undefined;
const dirs: string[] = [];
afterEach(async () => { await srv?.close(); srv = undefined; for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

async function setup(extra: Partial<ServerDeps> = {}) {
  const channels = { canSend: () => false, send: async () => {}, focus: async () => {} };
  const registry = new Registry({ canReply: () => false });
  srv = createServer({ registry, holds: new Holds(), token: TOKEN, holdTimeoutMs: 2000, channels, history: async () => [], ...extra });
  await new Promise<void>((r) => srv!.http.listen(0, '127.0.0.1', r));
  const port = (srv.http.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;
  const post = (path: string, body: string, headers: Record<string, string> = {}) =>
    fetch(url + path, { method: 'POST', body, headers: { authorization: `Bearer ${TOKEN}`, ...headers } });
  return { registry, url, port, post };
}

const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'vsrv-')); dirs.push(d); return d; };

describe('static files', () => {
  it('encoded ../ cannot escape into a sibling dir sharing the prefix', async () => {
    const d = tmp();
    mkdirSync(join(d, 'dist')); mkdirSync(join(d, 'dist-x'));
    writeFileSync(join(d, 'dist/index.html'), 'INDEX');
    writeFileSync(join(d, 'dist-x/a'), 'SECRET');
    const t = await setup({ staticDir: join(d, 'dist') });
    const r = await fetch(`${t.url}/..%2Fdist-x%2Fa`);
    expect(r.status).toBe(403);
    expect(await (await fetch(`${t.url}/some/route`)).text()).toBe('INDEX');
  });
  it('malformed percent-encoding → 400, not 500', async () => {
    const d = tmp();
    const t = await setup({ staticDir: d });
    expect((await fetch(`${t.url}/%E0%A4%A`)).status).toBe(400);
  });
  it('web UI not built → HTML hint instead of JSON 404', async () => {
    const t = await setup({ staticDir: join(tmp(), 'missing') });
    const r = await fetch(`${t.url}/`);
    expect(r.headers.get('content-type')).toBe('text/html');
    expect(await r.text()).toContain('npm run build:web');
  });
});

describe('request validation', () => {
  const perm = { session_id: 's1', hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'ls' } };
  it('null / non-object reply body → 400 bad body', async () => {
    const t = await setup();
    await t.post('/hook?agent=claude', JSON.stringify(perm));
    for (const b of ['null', '[]', '3']) {
      const r = await t.post('/api/agents/s1/reply', b);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: 'bad body' });
    }
  });
  it('reply option must be one of the ask options', async () => {
    const t = await setup();
    await t.post('/hook?agent=claude', JSON.stringify(perm));
    const askId = t.registry.get('s1')!.ask!.id;
    const r = await t.post('/api/agents/s1/reply', JSON.stringify({ askId, option: 'Yolo' }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'bad option' });
    // a valid option gets past validation (no hold/channel here → terminal-only)
    expect((await t.post('/api/agents/s1/reply', JSON.stringify({ askId, option: 'Deny' }))).status).toBe(409);
  });
  it('drops a malformed X-Village-Pty', async () => {
    const t = await setup();
    await t.post('/hook?agent=claude', JSON.stringify(perm), { 'x-village-pty': '../../evil' });
    expect(t.registry.get('s1')!.hostRef.ptyId).toBeUndefined();
    await t.post('/hook?agent=claude', JSON.stringify({ ...perm, session_id: 's2' }), { 'x-village-pty': '0123456789ab' });
    expect(t.registry.get('s2')).toMatchObject({ host: 'pty', hostRef: { ptyId: '0123456789ab' } });
  });
});

describe('websocket keepalive', () => {
  it('terminates clients that stop answering pings', async () => {
    const t = await setup({ pingMs: 40 });
    const ws = new WebSocket(`ws://127.0.0.1:${t.port}/ws?token=${TOKEN}`, { autoPong: false });
    await new Promise((r) => ws.on('open', r));
    expect(srv!.uiClients()).toBe(1);
    await new Promise((r) => ws.on('close', r));
    for (let i = 0; i < 50 && srv!.uiClients(); i++) await new Promise((r) => setTimeout(r, 10));
    expect(srv!.uiClients()).toBe(0);
  });
  it('keeps clients that answer', async () => {
    const t = await setup({ pingMs: 40 });
    const ws = new WebSocket(`ws://127.0.0.1:${t.port}/ws?token=${TOKEN}`);
    await new Promise((r) => ws.on('open', r));
    await new Promise((r) => setTimeout(r, 200));
    expect(srv!.uiClients()).toBe(1);
    ws.close();
  });
});
