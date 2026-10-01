import { chmod, copyFile, mkdir, readFile, rename, stat, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from 'node:net';
import type { AgentKind } from './types';
import { addHooks, removeHooks, EVENTS, TAG } from './hooks-config';
import { PTY_ID } from './util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HOME = homedir();
const VDIR = join(HOME, '.agents-village');
const TOKEN_FILE = join(VDIR, 'token');
const HEADER_FILE = join(VDIR, 'auth-header');
const HOOK_SCRIPT = join(VDIR, 'village-hook.sh');
const PORT = Number(process.env.VILLAGE_PORT) || 4777;
const MAX_HOLD_S = 900; // curl --max-time and the agents' hook timeout (hooks-config.ts)
const CURL_MIN = [7, 84]; // -w %header{}
const BAK = '.bak-agents-village';

const CONFIGS: Record<AgentKind, { file: string; dir: string }> = {
  claude: { file: join(HOME, '.claude/settings.json'), dir: join(HOME, '.claude') },
  codex: { file: join(HOME, '.codex/hooks.json'), dir: join(HOME, '.codex') },
  gemini: { file: join(HOME, '.gemini/settings.json'), dir: join(HOME, '.gemini') },
};
const configs = () => Object.entries(CONFIGS) as [AgentKind, { file: string; dir: string }][];

const exists = (p: string) => access(p).then(() => true, () => false);
const readJson = async (p: string) => JSON.parse(await readFile(p, 'utf8').catch(() => '{}') || '{}');
/** Parses a settings file, or prints why not and returns undefined so the other agents still go ahead. */
const readConfig = (kind: AgentKind, file: string) => readJson(file).catch((e: Error) => {
  console.log(`✗ ${kind}: cannot parse ${file}: ${e.message}`);
  return undefined;
});
/** tmp + rename: a crash mid-write never leaves the agent with a half-written settings file. */
async function writeAtomic(file: string, data: string) {
  const mode = (await stat(file).catch(() => null))?.mode ?? 0o644;
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, data, { mode: mode & 0o777 });
  await rename(tmp, file);
}
const writeJson = (file: string, v: unknown) => writeAtomic(file, JSON.stringify(v, null, 2) + '\n');

async function ensureToken(): Promise<string> {
  await mkdir(VDIR, { recursive: true, mode: 0o700 });
  let token = (await readFile(TOKEN_FILE, 'utf8').catch(() => '')).trim();
  if (!token) {
    token = randomBytes(24).toString('hex');
    await writeFile(TOKEN_FILE, token + '\n', { mode: 0o600 });
  }
  // The hook passes this to curl as a header file, so the token never shows up in `ps`.
  const header = `Authorization: Bearer ${token}\n`;
  if ((await readFile(HEADER_FILE, 'utf8').catch(() => '')) !== header) await writeFile(HEADER_FILE, header, { mode: 0o600 });
  await chmod(HEADER_FILE, 0o600);
  return token;
}

function holdTimeoutS(): number {
  const v = Number(process.env.VILLAGE_HOLD_TIMEOUT_S);
  if (!(v > 0)) return 600;
  if (v > MAX_HOLD_S) console.warn(`VILLAGE_HOLD_TIMEOUT_S=${v} is above the ${MAX_HOLD_S}s hook timeout; using ${MAX_HOLD_S}`);
  return Math.min(v, MAX_HOLD_S);
}

async function start() {
  const token = await ensureToken();
  const [{ Registry }, { Holds }, { createServer }, { createChannels }, { createScanner }, { startTailers }, { readHistory, readCommands }] = await Promise.all([
    import('./core/registry'), import('./core/holds'), import('./server'), import('./respond/channels'),
    import('./ingest/procscan'), import('./ingest/logs'), import('./history'),
  ]);
  const staticDir = join(ROOT, 'web/dist');
  if (!(await exists(join(staticDir, 'index.html')))) console.warn('web UI not built — run `npm run build:web` (the page shows this hint until then)');
  const channels = createChannels(undefined, ptyWrite);
  const registry = new Registry({ canReply: (a) => channels.canSend(a) });
  const scanner = createScanner();
  const srv = createServer({
    registry, holds: new Holds(), token, channels, history: (a) => readHistory(a), commands: (a) => readCommands(a), devOrigins: process.env.VILLAGE_DEV === '1',
    holdTimeoutMs: holdTimeoutS() * 1000, staticDir, resolvePid: scanner.resolvePid,
  });

  const hasTranscript = (pid: number) => registry.all().some((a) => a.pid === pid && a.transcriptPath);
  const scanTick = () => scanner.scan((pid) => !hasTranscript(pid))
    .then((procs) => { registry.syncProcs(procs, Date.now()); registry.sweep(Date.now()); })
    .catch((e) => console.error('[scan]', e.message));
  let scanTimer: NodeJS.Timeout | undefined;
  let stopTailers = () => {};

  srv.http.once('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') console.error(`port ${PORT} busy: villaged already running? (set VILLAGE_PORT=…)`);
    else console.error(e.message);
    process.exit(1);
  });
  srv.http.listen(PORT, '127.0.0.1', async () => {
    console.log(`villaged listening on 127.0.0.1:${PORT}`);
    console.log(`open: http://127.0.0.1:${PORT}/?token=${token}`);
    console.log(`demo: http://127.0.0.1:${PORT}/?demo=1`);
    await scanTick();
    scanTimer = setInterval(scanTick, 2000);
    stopTailers = startTailers((env) => registry.applyLog(env));
  });
  const shutdown = async () => { clearInterval(scanTimer); stopTailers(); await srv.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function ptyWrite(id: string, text: string): Promise<void> {
  if (!PTY_ID.test(id)) return Promise.reject(new Error('bad pty id'));
  return new Promise((res, rej) => {
    const sock = connect(join(VDIR, 'pty', `${id}.sock`), () => { sock.end(text); res(); });
    sock.on('error', rej);
  });
}

async function installHooks() {
  await ensureToken();
  await copyFile(join(ROOT, 'daemon/village-hook.sh'), HOOK_SCRIPT);
  await chmod(HOOK_SCRIPT, 0o755);
  for (const [kind, { file, dir }] of configs()) {
    if (!(await exists(dir))) { console.log(`- ${kind}: not installed, skipped`); continue; }
    const had = await exists(file);
    const cfg = await readConfig(kind, file);
    if (!cfg) continue;
    const backup = file + BAK;
    if (had && !(await exists(backup))) await copyFile(file, backup);
    await writeJson(file, addHooks(cfg, kind, HOOK_SCRIPT));
    console.log(`✓ ${kind}: ${EVENTS[kind].length} hooks in ${file}${had ? ` (backup: ${backup})` : ''}`);
  }
  console.log('Restart running agents to pick up the hooks.');
}

async function uninstallHooks() {
  for (const [kind, { file }] of configs()) {
    if (!(await exists(file))) continue;
    const cfg = await readConfig(kind, file);
    if (!cfg) continue;
    const out = removeHooks(cfg);
    if (JSON.stringify(out) === JSON.stringify(cfg)) { console.log(`- ${kind}: no ${TAG} hooks in ${file}`); continue; }
    await writeJson(file, out);
    console.log(`✓ ${kind}: removed ${TAG} hooks from ${file}`);
  }
  console.log(`Original settings backups (if any) are next to each file as *${BAK}.`);
  console.log(`Token and hook script stay in ${VDIR}; delete that folder to remove everything.`);
}

function curlVersion(): Promise<string | null> {
  return new Promise((r) => execFile('curl', ['--version'], (err, out) => r(err ? null : out.match(/^curl (\d+\.\d+(?:\.\d+)?)/)?.[1] ?? null)));
}
const versionAtLeast = (v: string, min: number[]) => {
  const [a = 0, b = 0] = v.split('.').map(Number);
  return a > min[0] || (a === min[0] && b >= min[1]);
};

async function doctor() {
  console.log(`token:       ${(await exists(TOKEN_FILE)) ? 'ok' : 'missing (run install-hooks)'}`);
  console.log(`auth header: ${(await exists(HEADER_FILE)) ? 'ok' : 'missing (run install-hooks)'}`);
  console.log(`hook script: ${(await exists(HOOK_SCRIPT)) ? HOOK_SCRIPT : 'missing (run install-hooks)'}`);
  const cv = await curlVersion();
  console.log(`curl:        ${!cv ? 'not found (hooks need curl)' : versionAtLeast(cv, CURL_MIN) ? cv : `${cv} — too old, hooks need >= ${CURL_MIN.join('.')}`}`);
  for (const [kind, { file }] of configs()) {
    if (!(await exists(file))) { console.log(`${kind.padEnd(12)} no config`); continue; }
    const cfg = await readConfig(kind, file);
    if (!cfg) continue;
    const hooks = cfg.hooks ?? {};
    const wired = EVENTS[kind].filter((ev) => JSON.stringify(hooks[ev] ?? []).includes(`# ${TAG}`));
    console.log(`${kind.padEnd(12)} ${wired.length}/${EVENTS[kind].length} events wired${wired.length < EVENTS[kind].length ? ` (missing: ${EVENTS[kind].filter((e) => !wired.includes(e)).join(', ')})` : ''}`);
  }
  const token = (await readFile(TOKEN_FILE, 'utf8').catch(() => '')).trim();
  const r = await fetch(`http://127.0.0.1:${PORT}/api/agents`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(2000) }).catch(() => null);
  const daemon = !r ? `not reachable on 127.0.0.1:${PORT} (run village start)`
    : r.ok ? `running, ${(await r.json()).length} agents`
    : r.status === 401 ? 'running but rejected token (401) — restart it so it reads the current token'
    : `running but returned ${r.status}`;
  console.log(`daemon:      ${daemon}`);
}

const HELP = `usage: village <command>

  start              run the daemon and serve the web UI on 127.0.0.1
  install-hooks      add tagged hooks to Claude / Codex / Gemini settings (backs them up once)
  uninstall-hooks    remove those hooks again
  doctor             check token, hook script, curl, wired events and the daemon
  run <agent> [args] run an agent in a village-owned PTY so replies can be typed in

env:
  VILLAGE_PORT            daemon port (default 4777)
  VILLAGE_HOLD_TIMEOUT_S  how long a held hook waits for your answer (default 600, max ${MAX_HOLD_S})
  VILLAGE_DEV=1           also accept the Vite dev server origin (localhost:5173)`;

const [cmd, ...rest] = process.argv.slice(2);
const commands: Record<string, () => Promise<unknown>> = {
  start, doctor,
  'install-hooks': installHooks,
  'uninstall-hooks': uninstallHooks,
  run: async () => (await import('./pty-run')).runAgent(rest, VDIR),
};
if (!cmd || !commands[cmd]) {
  const asked = !cmd || ['--help', '-h', 'help'].includes(cmd);
  if (!asked) console.error(`unknown command: ${cmd}\n`);
  console.log(HELP);
  process.exit(asked ? 0 : 1);
}
commands[cmd]().catch((e) => { console.error(e.message ?? e); process.exit(1); });
