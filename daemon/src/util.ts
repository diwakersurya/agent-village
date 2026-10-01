import { open } from 'node:fs/promises';

/** ISO timestamp → ms; `fallback` for missing/invalid. */
export const ts = (v: unknown, fallback = 0) => (typeof v === 'string' ? Date.parse(v) || fallback : fallback);
export const parse = (line: string) => { try { return JSON.parse(line); } catch { return null; } };
export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
export const projectOf = (cwd: string) => cwd.split('/').filter(Boolean).pop() ?? cwd;

/** Last `maxBytes` of a file, minus the partial first line when cut. */
export async function readTail(path: string, maxBytes: number): Promise<{ text: string; size: number; mtimeMs: number }> {
  const fh = await open(path, 'r');
  try {
    const { size, mtimeMs } = await fh.stat();
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    await fh.read(buf, 0, buf.length, start);
    let text = buf.toString('utf8');
    if (start > 0) text = text.slice(text.indexOf('\n') + 1);
    return { text, size, mtimeMs };
  } finally {
    await fh.close();
  }
}

export const isEnoent = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT';

/** `village run` ids: 12 hex chars (pty-run.ts); anything else never reaches a socket path. */
export const PTY_ID = /^[0-9a-f]{12}$/;
