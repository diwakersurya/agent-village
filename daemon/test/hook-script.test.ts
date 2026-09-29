import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { hookCommand } from '../src/hooks-config';

const SCRIPT = resolve(__dirname, '../village-hook.sh');
let home: string, server: http.Server, port: number;
let respond: (req: http.IncomingMessage, res: http.ServerResponse) => void = (_q, s) => s.end();
const seen: http.IncomingHttpHeaders[] = [];

beforeAll(async () => {
  home = mkdtempSync('/tmp/vh-');
  mkdirSync(join(home, '.agents-village'));
  writeFileSync(join(home, '.agents-village/token'), 'tok\n');
  server = http.createServer((req, res) => { seen.push(req.headers); req.resume(); req.on('end', () => respond(req, res)); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => { server.close(); rmSync(home, { recursive: true, force: true }); });

/** Runs the hook exactly like an agent would: a process named `claude` running the installed command via a shell. */
function runAsAgent(payload: object): Promise<{ out: string; ms: number; agentPid: number; code: number | null }> {
  const agent = join(home, 'claude');
  writeFileSync(agent, `#!/bin/sh\nprintf '%s' "$PAYLOAD" | sh -c "$HOOK_CMD"\n`);
  chmodSync(agent, 0o755);
  const t0 = Date.now();
  const child = spawn(agent, [], { env: { ...process.env, HOME: home, VILLAGE_PORT: String(port), WARP_FOCUS_URL: 'warp://session/test', PAYLOAD: JSON.stringify(payload), HOOK_CMD: hookCommand('claude', SCRIPT) } });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  return new Promise((r) => child.on('exit', (code) => r({ out, ms: Date.now() - t0, agentPid: child.pid!, code })));
}

const stop = { session_id: 's', hook_event_name: 'Stop' };
const tool = { session_id: 's', hook_event_name: 'PreToolUse', tool_name: 'Read' };

describe('village-hook.sh', () => {
  it('reports the agent pid, not the intermediate shell', async () => {
    respond = (_q, s) => { s.writeHead(204); s.end(); };
    const r = await runAsAgent(tool);
    expect(Number(seen.at(-1)!['x-village-pid'])).toBe(r.agentPid);
    expect(seen.at(-1)!['x-village-warp']).toBe('warp://session/test');
  });

  it('prints nothing for error responses or foreign servers', async () => {
    respond = (_q, s) => { s.writeHead(401, { 'content-type': 'application/json' }); s.end('{"error":"unauthorized"}'); };
    expect((await runAsAgent(stop)).out).toBe('');
    respond = (_q, s) => { s.writeHead(200); s.end('<html>some other dev server</html>'); };
    expect((await runAsAgent(stop)).out).toBe('');
  });

  it('prints the decision when villaged marks it', async () => {
    respond = (_q, s) => { s.writeHead(200, { 'x-village': '1' }); s.end('{"decision":"block","reason":"go"}'); };
    const r = await runAsAgent(stop);
    expect(r.out).toBe('{"decision":"block","reason":"go"}');
    expect(r.code).toBe(0);
  });

  it('non-holdable events give up fast on a stuck daemon', async () => {
    respond = () => {}; // never answers
    const r = await runAsAgent(tool);
    expect(r.code).toBe(0);
    expect(r.ms).toBeLessThan(6000);
  }, 15_000);
});
