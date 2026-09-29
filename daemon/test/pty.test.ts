import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { join, resolve } from 'node:path';

const BIN = resolve(__dirname, '../../bin/village');

describe('village run (pty wrapper)', () => {
  it('types text received on its socket into the agent, then Enter', async () => {
    const home = mkdtempSync('/tmp/vp-'); // short: unix socket path limit
    const child = spawn(BIN, ['run', 'sh', '-c', 'read -r L; echo "GOT:$L"; sleep 0.3'], { env: { ...process.env, HOME: home } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    try {
      const dir = join(home, '.agents-village', 'pty');
      let sock = '';
      for (let i = 0; i < 100 && !sock; i++) {
        await new Promise((r) => setTimeout(r, 50));
        try { sock = readdirSync(dir).find((f) => f.endsWith('.sock')) ?? ''; } catch {}
      }
      expect(sock).not.toBe('');
      const payload = `it's "fine" $(nope)`;
      await new Promise<void>((res, rej) => { const s = connect(join(dir, sock), () => { s.end(payload); res(); }); s.on('error', rej); });
      const code = await new Promise((r) => child.on('exit', r));
      expect(out).toContain(`GOT:${payload}`);
      expect(code).toBe(0);
      expect(readdirSync(dir)).toEqual([]); // socket cleaned up
    } finally {
      child.kill();
      rmSync(home, { recursive: true, force: true });
    }
  }, 15_000);
});
