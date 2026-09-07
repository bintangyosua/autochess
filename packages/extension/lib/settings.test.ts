import { describe, expect, it, vi } from 'vitest';

vi.mock('wxt/browser', () => ({ browser: { storage: { local: {} } } }));

const { DEFAULT_TIMING, TIMING_MAX_MS, TIMING_MIN_MS, sanitizeTiming } = await import('./settings');

describe('sanitizeTiming', () => {
  it('menerima nilai yang wajar apa adanya', () => {
    expect(sanitizeTiming({ minMs: 800, maxMs: 2_000 })).toEqual({ minMs: 800, maxMs: 2_000 });
  });

  it('membalik rentang yang terbalik alih-alih menghasilkan jeda negatif', () => {
    // minMs > maxMs membuat perhitungan jeda negatif, dan langkah dimainkan seketika.
    expect(sanitizeTiming({ minMs: 3_000, maxMs: 500 })).toEqual({ minMs: 500, maxMs: 3_000 });
  });

  it('mengunci nilai ke dalam batas', () => {
    expect(sanitizeTiming({ minMs: 1, maxMs: 999_999 })).toEqual({
      minMs: TIMING_MIN_MS,
      maxMs: TIMING_MAX_MS,
    });
  });

  it('jatuh ke bawaan untuk nilai yang bentuknya tidak terduga', () => {
    for (const value of [undefined, null, 'cepat', { minMs: 'x' }, { maxMs: NaN }]) {
      expect(sanitizeTiming(value)).toEqual(DEFAULT_TIMING);
    }
  });
})
