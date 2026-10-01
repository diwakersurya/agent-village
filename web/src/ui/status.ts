import type { Ask, Status } from '../../../daemon/src/types';

/** Short status word(s) for lists and counts; `n` picks plural agreement ("2 need you" vs "needs you"). */
export function statusLabel(s: Status, n?: number): string {
  switch (s) {
    case 'needs_input': return n === undefined || n === 1 ? 'needs you' : 'need you';
    case 'crashed': return 'exited';
    default: return s;
  }
}

/** Heading for an agent's open ask in the reply panel. */
export function askLabel(type: Ask['type']): string {
  switch (type) {
    case 'permission': return 'Needs permission';
    case 'question': return 'Question';
    case 'error': return 'Error';
    default: return 'Waiting for you';
  }
}
