import { describe, expect, it } from 'vitest';
import { squareClass } from './playMove';

describe('squareClass', () => {
  it('memakai konvensi chess.com: file dulu, lalu rank, keduanya 1..8', () => {
    // Ini konvensi yang sama dengan parsePieces — kalau keduanya tidak sepakat, papan
    // terbaca benar tapi kliknya mendarat di kotak lain.
    expect(squareClass('a1')).toBe('square-11');
    expect(squareClass('h8')).toBe('square-88');
    expect(squareClass('d3')).toBe('square-43');
    expect(squareClass('e4')).toBe('square-54');
  });
});
