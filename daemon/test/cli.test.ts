import { describe, it, expect, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';

const ROOT = resolve(__dirname, '../..');
const TSX = join(ROOT, 'node_modules/.bin/tsx');
const CLI = join(ROOT, 'daemon/src/cli.ts');
const home = mkdtempSync(join(tmpdir(), 'vcli-'));
afterAll(() => rmSync(home, { recursive: true, force: true }));

const village = (args: string[], env: Record<string, string> = {}) =>
  new Promise<{ code: number; out: string }>((r) =>
    execFile(TSX, [CLI, ...args], { env: { ...process.env, HOME: home, ...env } }, (err, stdout, stderr) =>
      r({ code: err ? (err as any).code ?? 1 : 0, out: stdout + stderr })));
const read = (p: string) => readFileSync(join(home, p), 'utf8');

describe('village cli', () => {
  it('--help exits 0, unknown command exits 1', async () => {
    const h = await village(['--help']);
    expect(h.code).toBe(0);
    expect(h.out).toContain('VILLAGE_HOLD_TIMEOUT_S');
    expect((await village(['nope'])).code).toBe(1);
  });

  it('install-hooks: malformed settings are reported and skipped, others still installed; backup made once', async () => {
    mkdirSync(join(home, '.claude')); mkdirSync(join(home, '.codex'));
    writeFileSync(join(home, '.claude/settings.json'), '{ not json');
    writeFileSync(join(home, '.codex/hooks.json'), '{"keep":1}\n');
    const r = await village(['install-hooks']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/✗ claude: cannot parse .*settings\.json/);
    expect(r.out).toContain('- gemini: not installed');
    expect(read('.claude/settings.json')).toBe('{ not json');
    expect(JSON.parse(read('.codex/hooks.json'))).toMatchObject({ keep: 1, hooks: { Stop: expect.any(Array) } });
    expect(read('.codex/hooks.json.bak-agents-village')).toBe('{"keep":1}\n');
    expect(read('.agents-village/auth-header')).toMatch(/^Authorization: Bearer [0-9a-f]{48}\n$/);
    expect(statSync(join(home, '.agents-village/auth-header')).mode & 0o777).toBe(0o600);

    await village(['install-hooks']);
    expect(read('.codex/hooks.json.bak-agents-village')).toBe('{"keep":1}\n');
  });

  it('uninstall-hooks only rewrites files that had our hooks', async () => {
    const r = await village(['uninstall-hooks']);
    expect(r.out).toContain('✓ codex: removed');
    expect(r.out).toContain('.bak-agents-village');
    expect(JSON.parse(read('.codex/hooks.json'))).toEqual({ keep: 1 });
    const before = statSync(join(home, '.codex/hooks.json')).mtimeMs;
    const again = await village(['uninstall-hooks']);
    expect(again.out).toContain('- codex: no agents-village hooks');
    expect(statSync(join(home, '.codex/hooks.json')).mtimeMs).toBe(before);
    expect(existsSync(join(home, '.codex/hooks.json.tmp-' + process.pid))).toBe(false);
  });

  it('doctor reports a daemon that rejects the token', async () => {
    const srv = http.createServer((_q, s) => { s.writeHead(401); s.end(); });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const r = await village(['doctor'], { VILLAGE_PORT: String((srv.address() as AddressInfo).port) });
    srv.close();
    expect(r.out).toContain('rejected token (401)');
    expect(r.out).toMatch(/curl: +\d/);
  });

  it('start on a busy port exits 1 with a hint', async () => {
    const srv = http.createServer();
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const port = String((srv.address() as AddressInfo).port);
    const r = await village(['start'], { VILLAGE_PORT: port, VILLAGE_HOLD_TIMEOUT_S: '5000' });
    srv.close();
    expect(r.code).toBe(1);
    expect(r.out).toContain(`port ${port} busy: villaged already running?`);
    expect(r.out).toContain('using 900');
  });
}, 30_000);
