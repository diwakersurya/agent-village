import type { AgentKind } from './types';

export const TAG = 'agents-village';

export const EVENTS: Record<AgentKind, string[]> = {
  claude: ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'Notification', 'SessionEnd'],
  codex: ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'Stop'],
  gemini: ['BeforeAgent', 'BeforeTool', 'AfterTool', 'AfterAgent'],
};

// Held hooks may wait for the user; the agent must not kill them first.
const TIMEOUT: Record<AgentKind, number> = { claude: 900, codex: 900, gemini: 900_000 };

export function hookCommand(kind: AgentKind, script: string): string {
  return `if [ -x '${script}' ]; then /bin/sh '${script}' ${kind}; fi # ${TAG}`;
}

const isOurs = (entry: unknown) => JSON.stringify(entry).includes(`# ${TAG}`);

/** Pure + idempotent: returns cfg with exactly one tagged entry per event; foreign entries untouched. */
export function addHooks(cfg: any, kind: AgentKind, script: string): any {
  const out = removeHooks(cfg);
  out.hooks ??= {};
  for (const ev of EVENTS[kind]) {
    const entry = { hooks: [{ type: 'command', command: hookCommand(kind, script), timeout: TIMEOUT[kind] }] };
    out.hooks[ev] = [...(out.hooks[ev] ?? []), entry];
  }
  return out;
}

/** Pure: strips tagged entries; drops event keys / hooks object that we emptied. */
export function removeHooks(cfg: any): any {
  const out = structuredClone(cfg ?? {});
  if (!out.hooks || typeof out.hooks !== 'object') return out;
  for (const [ev, list] of Object.entries<any[]>(out.hooks)) {
    if (!Array.isArray(list)) continue;
    const kept = list.filter((e) => !isOurs(e));
    if (kept.length) out.hooks[ev] = kept;
    else if (kept.length !== list.length) delete out.hooks[ev];
  }
  if (Object.keys(out.hooks).length === 0 && !(cfg.hooks && Object.keys(cfg.hooks).length === 0)) delete out.hooks;
  return out;
}
