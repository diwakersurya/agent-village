import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize as normPath } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AgentKind, AgentState, Channels, CommandItem, HistoryItem, HostRef, Reply, ScreenResult, ServerMsg } from './types';
import type { Registry } from './core/registry';
import type { Holds } from './core/holds';
import { normalizeHook } from './ingest/normalize';
import { formatDecision } from './respond/decisions';

export interface ServerDeps {
  registry: Registry;
  holds: Holds;
  token: string;
  holdTimeoutMs: number;
  channels: Channels;
  history: (a: AgentState) => Promise<HistoryItem[]>;
  commands?: (a: AgentState) => Promise<CommandItem[]>;
  staticDir?: string;
  /** Resolve the real agent pid from the hook's $PPID (walks past intermediate shells). */
  resolvePid?: (pid: number) => number;
  /** Allow the Vite dev server origin (localhost:5173). Off by default: any app on that port would share the token. */
  devOrigins?: boolean;
}

const MAX_BODY = 1_000_000;
const KINDS = new Set<AgentKind>(['claude', 'codex', 'gemini']);
const DEV = ['localhost:5173', '127.0.0.1:5173'];
const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2',
};

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export function createServer(d: ServerDeps) {
  const clients = new Map<WebSocket, boolean>(); // ws → tab visible
  const visibleClients = () => [...clients.values()].filter(Boolean).length;
  const hostsFor = (req: http.IncomingMessage) => {
    const port = req.socket.localPort;
    return new Set([`127.0.0.1:${port}`, `localhost:${port}`, ...(d.devOrigins ? DEV : [])]);
  };

  const tokenOk = (given: string | null | undefined) => {
    if (!given) return false;
    const a = Buffer.from(given), b = Buffer.from(d.token);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const bearer = (req: http.IncomingMessage, u: URL) =>
    req.headers.authorization?.replace(/^Bearer /, '') ?? u.searchParams.get('token');
  // Host check blocks DNS rebinding; Origin check blocks other local pages. The token is still required on top.
  const originOk = (req: http.IncomingMessage) => {
    const hosts = hostsFor(req);
    if (!hosts.has(req.headers.host ?? '')) return false;
    const o = req.headers.origin;
    return !o || hosts.has(o.replace(/^https?:\/\//, ''));
  };

  const broadcast = (m: ServerMsg) => {
    const s = JSON.stringify(m);
    for (const c of clients.keys()) if (c.readyState === c.OPEN) c.send(s);
  };
  const onUpsert = (agent: AgentState) => {
    if (agent.status === 'crashed') d.holds.cancel(agent.id);
    broadcast({ type: 'upsert', agent });
  };
  const onRemove = (id: string) => broadcast({ type: 'remove', id });
  d.registry.on('upsert', onUpsert);
  d.registry.on('remove', onRemove);

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    try {
      if (u.pathname === '/hook' || u.pathname.startsWith('/api/')) {
        if (!originOk(req)) throw new HttpError(403, 'bad origin');
        if (!tokenOk(bearer(req, u))) throw new HttpError(401, 'unauthorized');
        if (u.pathname === '/hook' && req.method === 'POST') return await handleHook(req, res, u);
        return await handleApi(req, res, u);
      }
      if (req.method === 'GET' && d.staticDir) {
        if (!originOk(req)) throw new HttpError(403, 'bad host');
        return await serveStatic(res, u.pathname);
      }
      throw new HttpError(404, 'not found');
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error('[villaged]', e);
      if (!res.headersSent) json(res, status, { error: (e as Error).message });
    }
  });

  async function handleHook(req: http.IncomingMessage, res: http.ServerResponse, u: URL) {
    const kind = u.searchParams.get('agent') as AgentKind;
    if (!KINDS.has(kind)) throw new HttpError(400, 'bad agent');
    const payload = await readJson(req);
    const h = (k: string) => (req.headers[k] as string | undefined) || undefined;
    const rawPid = Number(h('x-village-pid')) || undefined;
    const hostRef: HostRef = {
      tty: h('x-village-tty'), tmuxPane: h('x-village-tmux-pane'), termProgram: h('x-village-term'),
      ptyId: h('x-village-pty'), orcaPane: h('x-village-orca'), warpFocusUrl: h('x-village-warp'),
    };
    const env = normalizeHook(kind, payload, { pid: rawPid && d.resolvePid ? d.resolvePid(rawPid) : rawPid, hostRef, at: Date.now() });
    if (!env) return end(res, 204);

    const id = d.registry.get(env.sessionId)?.id ?? env.sessionId;
    if (d.holds.has(id) && !resolvesHold(env, d.holds.toolUseId(id))) {
      // e.g. a parallel tool finishing or a Notification: record it, but the held ask stays open.
      d.registry.apply(env, { keepAsk: true });
      return end(res, 204);
    }
    d.holds.cancel(id); // the agent moved on, so a held ask was answered elsewhere
    const agent = d.registry.apply(env);
    if (!agent?.ask || !shouldHold(env.event.t, agent)) return end(res, 204);

    const wait = d.holds.wait(agent.id, agent.ask.id, d.holdTimeoutMs, env.toolUseId);
    d.registry.setHeld(agent.id, true);
    // req 'close' doesn't fire once the body was consumed; res 'close' does when the hook is killed.
    res.on('close', () => { if (!res.writableEnded) d.holds.cancel(agent.id); });
    const reply = await wait;
    d.registry.setHeld(agent.id, false);
    const decision = reply ? formatDecision(kind, env.event.t, reply) : null;
    if (reply) markAnswered(agent.id);
    if (res.destroyed) return;
    if (!decision) return end(res, 204);
    res.writeHead(200, { 'content-type': 'application/json', 'x-village': '1' });
    res.end(JSON.stringify(decision));
  }

  function resolvesHold(env: { event: { t: string }; toolUseId?: string }, heldTool?: string) {
    const t = env.event.t;
    if (t === 'notify') return false;
    if (t === 'tool') return !!heldTool && env.toolUseId === heldTool;
    return true; // prompt, turn_end, new permission/question, error, session_end
  }

  function shouldHold(t: string, a: AgentState) {
    if (visibleClients() === 0) return false;
    if (t === 'permission' || t === 'question') return true;
    return t === 'turn_end' && !d.channels.canSend(a);
  }

  function markAnswered(id: string) {
    d.registry.patch(id, { ask: undefined, status: 'working', activity: { summary: 'got your reply' } });
  }

  async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, u: URL) {
    if (req.method === 'GET' && u.pathname === '/api/agents') return json(res, 200, d.registry.all());
    const m = u.pathname.match(/^\/api\/agents\/([^/]+)\/(reply|focus|history|screen)$/);
    if (!m) throw new HttpError(404, 'not found');
    const agent = d.registry.get(decodeURIComponent(m[1]));
    if (!agent) throw new HttpError(404, 'unknown agent');

    if (m[2] === 'history' && req.method === 'GET') return json(res, 200, await d.history(agent));
    if (m[2] === 'screen' && req.method === 'GET') {
      const lines = await d.channels.screen?.(agent).catch(() => null);
      const body: ScreenResult = lines ? { source: 'screen', lines } : { source: 'commands', commands: (await d.commands?.(agent).catch(() => [])) ?? [] };
      return json(res, 200, body);
    }
    if (m[2] === 'focus' && req.method === 'POST') {
      await d.channels.focus(agent);
      return json(res, 200, { ok: true });
    }
    if (m[2] === 'reply' && req.method === 'POST') {
      const body = (await readJson(req)) as { askId?: string } & Reply;
      if (!agent.ask || agent.ask.id !== body.askId) return json(res, 409, { error: 'stale' });
      const reply: Reply = { option: str(body.option), text: str(body.text) };
      if (!reply.option && !reply.text?.trim()) throw new HttpError(400, 'empty reply');
      if (d.holds.resolve(agent.id, agent.ask.id, reply)) return json(res, 200, { ok: true, via: 'hook' });
      // Typing "Deny" into the agent's own menu would press Enter on its default ("Yes").
      if (agent.ask.type === 'permission' || agent.ask.type === 'question') return json(res, 409, { error: 'terminal-only' });
      if (!d.channels.canSend(agent)) return json(res, 409, { error: 'no-channel' });
      await d.channels.send(agent, [reply.option, reply.text].filter(Boolean).join('\n'));
      markAnswered(agent.id);
      return json(res, 200, { ok: true, via: agent.host });
    }
    throw new HttpError(405, 'method not allowed');
  }

  async function serveStatic(res: http.ServerResponse, pathname: string) {
    const root = d.staticDir!;
    let file = normPath(join(root, decodeURIComponent(pathname)));
    if (!file.startsWith(root)) throw new HttpError(403, 'forbidden');
    const s = await stat(file).catch(() => null);
    if (!s || s.isDirectory()) file = join(root, 'index.html');
    const body = await readFile(file).catch(() => null);
    if (!body) throw new HttpError(404, 'not found');
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  }

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const u = new URL(req.url ?? '/', 'http://x');
    if (u.pathname !== '/ws' || !originOk(req) || !tokenOk(u.searchParams.get('token'))) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.set(ws, true);
      ws.send(JSON.stringify({ type: 'snapshot', agents: d.registry.all() } satisfies ServerMsg));
      const releaseIfUnwatched = () => { if (visibleClients() === 0) d.holds.cancelAll(); };
      ws.on('message', (raw) => {
        try {
          const m = JSON.parse(String(raw));
          if (m?.type === 'visibility') { clients.set(ws, !!m.visible); releaseIfUnwatched(); }
        } catch { /* ignore */ }
      });
      ws.on('close', () => { clients.delete(ws); releaseIfUnwatched(); });
    });
  });

  return {
    http: server,
    uiClients: () => clients.size,
    close: async () => {
      d.registry.off('upsert', onUpsert);
      d.registry.off('remove', onRemove);
      d.holds.cancelAll();
      for (const c of clients.keys()) c.terminate();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}

const str = (v: unknown) => (typeof v === 'string' && v.length ? v.slice(0, 20_000) : undefined);

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function end(res: http.ServerResponse, status: number) {
  res.writeHead(status);
  res.end();
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'payload too large');
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
  } catch {
    throw new HttpError(400, 'invalid json');
  }
}
