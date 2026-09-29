import { describe, it, expect } from 'vitest';
import { enterReply } from '../src/ui/replyKeys';

describe('I9: Enter in the reply box', () => {
  it('never sends a bare note for asks with options (would Deny a permission)', () => {
    expect(enterReply({ id: 'a', type: 'permission', text: '', options: ['Allow', 'Deny'] }, 'yes go ahead')).toBeNull();
    expect(enterReply({ id: 'a', type: 'question', text: '', options: ['A', 'B'] }, 'A')).toBeNull();
  });
  it('sends free text for idle/error asks, ignores blank', () => {
    expect(enterReply({ id: 'a', type: 'idle', text: '' }, 'run tests')).toEqual({ text: 'run tests' });
    expect(enterReply({ id: 'a', type: 'idle', text: '' }, '   ')).toBeNull();
  });
});
