import type { AgentEvent, AgentKind, Reply } from '../types';

const answer = (r: Reply) => [r.option, r.text?.trim()].filter(Boolean).join(' — ');

/**
 * Hook stdout JSON that releases a held hook with the user's reply.
 * Claude format verified in docs/superpowers/spikes/2026-09-28-hook-hold.md; Codex assumed identical;
 * Gemini assumed {decision, reason}. Returns null to release without injecting anything.
 */
export function formatDecision(kind: AgentKind, ev: AgentEvent['t'], reply: Reply): object | null {
  if (kind === 'gemini') {
    const a = answer(reply);
    if (!a) return null;
    return { decision: 'deny', reason: ev === 'turn_end' ? a : `The user answered via Agents Village: ${a}` };
  }
  switch (ev) {
    case 'permission': {
      if (reply.option === 'Allow') return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } };
      const message = reply.text?.trim() || 'Denied from Agents Village';
      return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message } } };
    }
    case 'question':
      if (reply.option === 'Approve' && !reply.text?.trim()) return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse', permissionDecision: 'deny',
          permissionDecisionReason: `The user answered via Agents Village: ${answer(reply)}`,
        },
      };
    case 'turn_end': {
      const text = answer(reply);
      return text ? { decision: 'block', reason: text } : null;
    }
    default:
      return null;
  }
}
