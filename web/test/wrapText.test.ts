import { describe, expect, it } from 'vitest';
import { wrapText } from '../src/hooks/useTextTexture';

const mono = (s: string) => s.length * 10; // 10px per char

describe('wrapText', () => {
  it('wraps on word boundaries', () => {
    expect(wrapText('editing Table.tsx now', 100, mono)).toEqual(['editing', 'Table.tsx', 'now']);
  });
  it('breaks words longer than a line', () => {
    expect(wrapText('abcdefghijkl', 50, mono)).toEqual(['abcde', 'fghij', 'kl']);
  });
  it('caps at 4 lines with an ellipsis', () => {
    const lines = wrapText('a b c d e f g', 10, mono);
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe('…');
  });
});
