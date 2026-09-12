import { describe, expect, it } from 'vitest';
import { REST_MAX_MS, REST_MIN_MS, pickDriftMove, restMs, travelMs } from './idleDrift';

describe('pickDriftMove', () => {
  it('memilih dari beberapa teratas, bukan selalu yang terbaik', () => {
    // Kursor yang selalu menuju bidak yang sama persis adalah pola yang lebih mencolok
    // daripada tidak bergerak sama sekali.
    const moves = ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'b1c3'];
    expect(pickDriftMove(moves, () => 0)).toBe('e2e4');
    expect(pickDriftMove(moves, () => 0.99)).toBe('c2c4');
  });

  it('membuang yang bukan langkah dan menyerah kalau tidak ada yang tersisa', () => {
    expect(pickDriftMove(['', 'e2'], () => 0)).toBeUndefined();
    expect(pickDriftMove([], () => 0)).toBeUndefined();
  });
});

describe('jeda menganggur', () => {
  it('selalu di dalam rentangnya', () => {
    expect(restMs(() => 0)).toBe(REST_MIN_MS);
    expect(restMs(() => 1)).toBe(REST_MAX_MS);
  });

  it('bergerak jauh lebih santai daripada jeda antar kliknya', () => {
    expect(travelMs(() => 0)).toBeGreaterThan(300);
    expect(travelMs(() => 1)).toBeLessThan(2_000);
  });
});
