import { describe, expect, it } from 'vitest';
import { DEFAULT_OFFSET, effectiveElo, pickOffset, sanitizeOffset } from './dynamicElo';

describe('pickOffset', () => {
  it('tetap di dalam rentangnya, dan bulat', () => {
    expect(pickOffset({ minOffset: 50, maxOffset: 150 }, () => 0)).toBe(50);
    expect(pickOffset({ minOffset: 50, maxOffset: 150 }, () => 1)).toBe(150);
    expect(pickOffset({ minOffset: 50, maxOffset: 150 }, () => 0.333)).toBe(83);
  });

  it('min sama dengan maks berarti offset tetap', () => {
    // Jalan keluar buat yang memang mau satu angka pasti, tanpa perlu sakelar kedua.
    expect(pickOffset({ minOffset: 100, maxOffset: 100 }, Math.random)).toBe(100);
  });
});

describe('effectiveElo', () => {
  const stockfish = { min: 1320, max: 3190 };

  it('menambahkan offset ke rating', () => {
    expect(effectiveElo(1500, 100, stockfish)).toBe(1600);
  });

  it('dijepit ke lantai engine, dan itu bukan kerusakan', () => {
    // Stockfish tidak bisa turun di bawah UCI_Elo 1320. Pemain 800 yang menyalakan mode
    // ini akan melihat 1320, dan angka itulah yang harus ditampilkan — bukan 900 yang
    // tidak pernah benar-benar dipakai.
    expect(effectiveElo(800, 100, stockfish)).toBe(1320);
  });

  it('dijepit ke langit-langit engine', () => {
    expect(effectiveElo(3000, 500, stockfish)).toBe(3190);
  });

  it('dipakai apa adanya untuk engine tanpa rentang kekuatan', () => {
    expect(effectiveElo(1500, 100, undefined)).toBe(1600);
  });
});

describe('sanitizeOffset', () => {
  it('membalik rentang yang terbalik', () => {
    expect(sanitizeOffset({ minOffset: 300, maxOffset: 100 })).toEqual({
      minOffset: 100,
      maxOffset: 300,
    });
  });

  it('jatuh ke bawaan untuk bentuk yang tidak terduga', () => {
    for (const value of [undefined, null, 'naik', { minOffset: 'x' }]) {
      expect(sanitizeOffset(value)).toEqual(DEFAULT_OFFSET);
    }
  });
});
