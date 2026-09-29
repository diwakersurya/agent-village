import { chmod, copyFile, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from 'node:net';
import type { AgentKind } from './types';
import { addHooks, removeHooks, EVENTS, TAG } from './hooks-config';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HOME = homedir();
const VDIR = join(HOME, '.agents-village');
const TOKEN_FILE = join(VDIR, 'token');
const HOOK_SCRIPT = join(VDIR, 'village-hook.sh');
const PORT = Number(process.env.VILLAGE_PORT) || 4777;

const CONFIGS: Record<AgentKind, { file: string; dir: string }> = {
  claude: { file: join(HOME, '.claude/settings.json'), dir: join(HOME, '.claude') },
  codex: { file: join(HOME, '.codex/hooks.json'), dir: join(HOME, '.codex') },
  gemini: { file: join(HOME, '.gemini/settings.json'), dir: join(HOME, '.gemini') },
};

const exists = (p: string) => access(p).then(() => true, () => false);
const readJson = async (p: string) => JSON.parse(await readFile(p, 'utf8').catch(() => '{}') || '{}');

async function ensureToken(): Promise<string> {
  await mkdir(VDIR, { recursive: true, mode: 0o700 });
  const t = (await readFile(TOKEN_FILE, 'utf8').catch(() => '')).trim();
  if (t) return t;
  const token = randomBytes(24).toString('hex');
  await writeFile(TOKEN_FILE, token + '\n', { mode: 0o600 });
  return token;
}

async function start() {
  const token = await ensureToken();
  const [{ Registry }, { Holds }, { createServer }, { createChannels }, { createScanner }, { startTailers }, { readHistory, readCommands }] = await Promise.all([
    import('./core/registry'), import('./core/holds'), import('./server'), import('./respond/channels'),
    import('./ingest/procscan'), import('./ingest/logs'), import('./history'),
  ]);
  const channels = createChannels(undefined, ptyWrite);
  const registry = new Registry({ canReply: (a) => channels.canSend(a) });
  const scanner = createScanner();
  const srv = createServer({
    registry, holds: new Holds(), token, channels, history: (a) => readHistory(a), commands: (a) => readCommands(a), devOrigins: process.env.VILLAGE_DEV === '1',
    holdTimeoutMs: (Number(process.env.VILLAGE_HOLD_TIMEOUT_S) || 600) * 1000,
    staticDir: join(ROOT, 'web/dist'), resolvePid: scanner.resolvePid,
  });

  const scanTick = () => scanner.scan()
    .then((procs) => { registry.syncProcs(procs, Date.now()); registry.sweep(Date.now()); })
    .catch((e) => console.error('[scan]', e.message));
  await scanTick();
  const scanTimer = setInterval(scanTick, 2000);
  const stopTailers = startTailers((env) => registry.applyLog(env));

  srv.http.listen(PORT, '127.0.0.1', () => {
    console.log(`villaged listening on 127.0.0.1:${PORT}`);
    console.log(`open: http://127.0.0.1:${PORT}/?token=${token}`);
    console.log(`demo: http://127.0.0.1:${PORT}/?demo=1`);
  });
  const shutdown = async () => { clearInterval(scanTimer); stopTailers(); await srv.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function ptyWrite(id: string, text: string): Promise<void> {
  return new Promise((res, rej) => {
    const sock = connect(join(VDIR, 'pty', `${id}.sock`), () => { sock.end(text); res(); });
    sock.on('error', rej);
  });
}

async function installHooks() {
  await ensureToken();
  await copyFile(join(ROOT, 'daemon/village-hook.sh'), HOOK_SCRIPT);
  await chmod(HOOK_SCRIPT, 0o755);
  for (const [kind, { file, dir }] of Object.entries(CONFIGS) as [AgentKind, { file: string; dir: string }][]) {
    if (!(await exists(dir))) { console.log(`- ${kind}: not installed, skipped`); continue; }
    const had = await exists(file);
    const cfg = await readJson(file);
    const backup = `${file}.bak-agents-village`;
    if (had && !(await exists(backup))) await copyFile(file, backup);
    await writeFile(file, JSON.stringify(addHooks(cfg, kind, HOOK_SCRIPT), null, 2) + '\n');
    console.log(`✓ ${kind}: ${EVENTS[kind].length} hooks in ${file}${had ? ` (backup: ${backup})` : ''}`);
  }
  console.log('Restart running agents to pick up the hooks.');
}

async function uninstallHooks() {
  for (const [kind, { file }] of Object.entries(CONFIGS)) {
    if (!(await exists(file))) continue;
    await writeFile(file, JSON.stringify(removeHooks(await readJson(file)), null, 2) + '\n');
    console.log(`✓ ${kind}: removed ${TAG} hooks from ${file}`);
  }
}

async function doctor() {
  console.log(`token:       ${(await exists(TOKEN_FILE)) ? 'ok' : 'missing (run install-hooks)'}`);
  console.log(`hook script: ${(await exists(HOOK_SCRIPT)) ? HOOK_SCRIPT : 'missing (run install-hooks)'}`);
  for (const [kind, { file }] of Object.entries(CONFIGS) as [AgentKind, { file: string }][]) {
    if (!(await exists(file))) { console.log(`${kind.padEnd(12)} no config`); continue; }
    const hooks = (await readJson(file)).hooks ?? {};
    const wired = EVENTS[kind].filter((ev) => JSON.stringify(hooks[ev] ?? []).includes(`# ${TAG}`));
    console.log(`${kind.padEnd(12)} ${wired.length}/${EVENTS[kind].length} events wired${wired.length < EVENTS[kind].length ? ` (missing: ${EVENTS[kind].filter((e) => !wired.includes(e)).join(', ')})` : ''}`);
  }
  const token = (await readFile(TOKEN_FILE, 'utf8').catch(() => '')).trim();
  const r = await fetch(`http://127.0.0.1:${PORT}/api/agents`, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
  console.log(`daemon:      ${r?.ok ? `running, ${(await r.json()).length} agents` : 'not reachable'}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const commands: Record<string, () => Promise<unknown>> = {
  start, doctor,
  'install-hooks': installHooks,
  'uninstall-hooks': uninstallHooks,
  run: async () => (await import('./pty-run')).runAgent(rest, VDIR, PORT),
};
if (!cmd || !commands[cmd]) {
  console.log('usage: village <start | install-hooks | uninstall-hooks | doctor | run <agent> [args...]>');
  process.exit(cmd ? 1 : 0);
}
commands[cmd]().catch((e) => { console.error(e.message ?? e); process.exit(1); });
