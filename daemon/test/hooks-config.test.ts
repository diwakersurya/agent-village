import { describe, it, expect } from 'vitest';
import { addHooks, removeHooks, hookCommand, EVENTS, TAG } from '../src/hooks-config';

const orcaEntry = { hooks: [{ type: 'command', command: "if [ -x '/o/claude-hook.sh' ]; then /bin/sh '/o/claude-hook.sh'; fi" }] };
const existing = { model: 'x', hooks: { Stop: [orcaEntry], PreToolUse: [orcaEntry] } };
const SCRIPT = '/home/u/.agents-village/village-hook.sh';

const ours = (cfg: any, ev: string) => (cfg.hooks[ev] ?? []).filter((e: any) => JSON.stringify(e).includes(TAG));

describe('hooks-config', () => {
  it('keeps foreign entries and appends ours for every event', () => {
    const out = addHooks(structuredClone(existing), 'claude', SCRIPT);
    expect(out.model).toBe('x');
    expect(out.hooks.Stop[0]).toEqual(orcaEntry);
    for (const ev of EVENTS.claude) expect(ours(out, ev)).toHaveLength(1);
  });

  it('is idempotent', () => {
    const once = addHooks(structuredClone(existing), 'claude', SCRIPT);
    const twice = addHooks(structuredClone(once), 'claude', SCRIPT);
    expect(twice).toEqual(once);
  });

  it('remove(add(x)) deep-equals x', () => {
    expect(removeHooks(addHooks(structuredClone(existing), 'claude', SCRIPT))).toEqual(existing);
    expect(removeHooks(addHooks({}, 'gemini', SCRIPT))).toEqual({});
  });

  it('works on empty config', () => {
    const out = addHooks({}, 'codex', SCRIPT);
    expect(Object.keys(out.hooks).sort()).toEqual([...EVENTS.codex].sort());
  });

  it('command is guarded, tagged and passes kind', () => {
    const c = hookCommand('gemini', SCRIPT);
    expect(c).toBe(`if [ -x '${SCRIPT}' ]; then /bin/sh '${SCRIPT}' gemini; fi # ${TAG}`);
  });

  it('timeouts use seconds for claude/codex, ms for gemini', () => {
    expect(addHooks({}, 'claude', SCRIPT).hooks.Stop[0].hooks[0].timeout).toBe(900);
    expect(addHooks({}, 'gemini', SCRIPT).hooks.AfterAgent[0].hooks[0].timeout).toBe(900_000);
  });
});
