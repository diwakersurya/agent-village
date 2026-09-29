import { describe, it, expect } from 'vitest';
import { formatDecision } from '../src/respond/decisions';

describe('formatDecision', () => {
  it('claude permission allow / deny', () => {
    expect(formatDecision('claude', 'permission', { option: 'Allow' })).toEqual({
      hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } },
    });
    expect(formatDecision('claude', 'permission', { option: 'Deny' })).toEqual({
      hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'Denied from Agents Village' } },
    });
    expect(formatDecision('codex', 'permission', { text: 'use yarn instead' })).toEqual({
      hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'use yarn instead' } },
    });
  });

  it('question → PreToolUse deny with answer reason', () => {
    expect(formatDecision('claude', 'question', { option: 'Postgres' })).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse', permissionDecision: 'deny',
        permissionDecisionReason: 'The user answered via Agents Village: Postgres',
      },
    });
  });

  it('plan approve → allow', () => {
    expect(formatDecision('claude', 'question', { option: 'Approve' })).toEqual({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
    });
  });

  it('turn_end → block with reason; empty → null', () => {
    expect(formatDecision('claude', 'turn_end', { text: 'now run tests' })).toEqual({ decision: 'block', reason: 'now run tests' });
    expect(formatDecision('claude', 'turn_end', { text: '  ' })).toBeNull();
  });

  it('gemini formats', () => {
    expect(formatDecision('gemini', 'turn_end', { text: 'more' })).toEqual({ decision: 'deny', reason: 'more' });
    expect(formatDecision('gemini', 'question', { option: 'A' })).toEqual({ decision: 'deny', reason: 'The user answered via Agents Village: A' });
  });

  it('text + option combine for question', () => {
    expect((formatDecision('claude', 'question', { option: 'B', text: 'but hurry' }) as any).hookSpecificOutput.permissionDecisionReason)
      .toBe('The user answered via Agents Village: B — but hurry');
  });
});
