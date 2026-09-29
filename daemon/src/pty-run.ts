import { randomUUID } from 'node:crypto';
import { chmod, mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import pty from 'node-pty';

/**
 * `village run <agent> [args]` — runs the agent inside a PTY we own, so the daemon can type into it.
 * The daemon connects to ~/.agents-village/pty/<id>.sock and sends the reply text; we type it, then Enter.
 */
export async function runAgent(args: string[], vdir: string, _port: number) {
  const [cmd, ...rest] = args;
  if (!cmd) throw new Error('usage: village run <claude|codex|gemini> [args...]');
  const id = randomUUID().replace(/-/g, '').slice(0, 12); // unix socket paths max out at 104 chars on macOS
  const dir = join(vdir, 'pty');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const sockPath = join(dir, `${id}.sock`);

  const term = pty.spawn(cmd, rest, {
    name: process.env.TERM ?? 'xterm-256color',
    cols: process.stdout.columns ?? 100,
    rows: process.stdout.rows ?? 30,
    cwd: process.cwd(),
    env: { ...process.env, VILLAGE_PTY_ID: id } as Record<string, string>,
  });

  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on('data', (d) => term.write(d.toString()));
  term.onData((d) => process.stdout.write(d));
  process.stdout.on('resize', () => term.resize(process.stdout.columns, process.stdout.rows));

  const server = createServer((sock) => {
    let text = '';
    sock.setEncoding('utf8');
    sock.on('data', (d) => { text += d; if (text.length > 20_000) sock.destroy(); });
    sock.on('end', () => {
      if (!text) return;
      term.write(text);
      setTimeout(() => term.write('\r'), 150); // separate Enter so TUIs don't treat it as part of a paste
    });
  });
  await new Promise<void>((r) => server.listen(sockPath, r));
  await chmod(sockPath, 0o600);

  const cleanup = async () => { server.close(); await rm(sockPath, { force: true }); };
  term.onExit(async ({ exitCode }) => {
    await cleanup();
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.exit(exitCode);
  });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => term.kill(sig));
}
