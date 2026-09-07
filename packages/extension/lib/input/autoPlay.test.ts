import { describe, expect, it } from 'vitest';
import {
  MAX_ATTEMPTS,
  RETRY_AFTER_MS,
  autoPlayDecision,
  autoPlayDelayMs,
  shouldRetry,
  sideToMove,
  splitAutoDelay,
} from './autoPlay';

const WHITE_TO_MOVE = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BLACK_TO_MOVE = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

const base = {
  enabled: true,
  fen: WHITE_TO_MOVE,
  orientation: 'white' as const,
};

const RANGE = { minMs: 500, maxMs: 1_500 };

describe('autoPlayDelayMs', () => {
  it('memakai rentang yang diberikan, bukan angka tetap', () => {
    expect(autoPlayDelayMs(RANGE, () => 0)).toBe(500);
    expect(autoPlayDelayMs(RANGE, () => 1)).toBe(1_500);
    expect(autoPlayDelayMs({ minMs: 2_000, maxMs: 4_000 }, () => 0.5)).toBe(3_000);
  });
});

describe('sideToMove', () => {
  it('membaca field giliran dari FEN', () => {
    expect(sideToMove(WHITE_TO_MOVE)).toBe('white');
    expect(sideToMove(BLACK_TO_MOVE)).toBe('black');
    expect(sideToMove(undefined)).toBeUndefined();
    expect(sideToMove('bukan fen')).toBeUndefined();
  });
});

describe('autoPlayDecision', () => {
  it('jalan saat giliran sisi pemain', () => {
    expect(autoPlayDecision(base).play).toBe(true);
    expect(autoPlayDecision({ ...base, fen: BLACK_TO_MOVE, orientation: 'black' }).play).toBe(true);
  });

  it('diam saat giliran lawan', () => {
    expect(autoPlayDecision({ ...base, fen: BLACK_TO_MOVE })).toMatchObject({ play: false });
  });

  it('tetap jalan walau giliran cuma ditebak', () => {
    // Sebelum langkah pertama papan belum punya sorotan, jadi giliran selalu berstatus
    // tebakan — syarat lama membuat mode auto diam total di langkah pembuka.
    expect(autoPlayDecision(base).play).toBe(true);
  });

  it('tidak memainkan posisi yang sama dua kali', () => {
    expect(autoPlayDecision({ ...base, playedFen: WHITE_TO_MOVE }).play).toBe(false);
  });

  it('diam kalau mode mati atau posisi belum terbaca', () => {
    expect(autoPlayDecision({ ...base, enabled: false }).play).toBe(false);
    expect(autoPlayDecision({ ...base, fen: undefined }).play).toBe(false);
  });

  it('selalu memberi alasan saat menolak, bukan gagal dalam diam', () => {
    for (const input of [
      { ...base, enabled: false },
      { ...base, fen: undefined },
      { ...base, fen: BLACK_TO_MOVE },
      { ...base, playedFen: WHITE_TO_MOVE },
    ]) {
      expect(autoPlayDecision(input).reason).not.toBe('');
    }
  });
});

describe('splitAutoDelay', () => {
  it('membagi total tanpa menambah waktu di luarnya', () => {
    for (const share of [0, 0.5, 1]) {
      const { thinkMs, clickMs } = splitAutoDelay(1_200, () => share);
      expect(thinkMs + clickMs).toBeCloseTo(1_200);
      expect(thinkMs).toBeGreaterThan(0);
      expect(clickMs).toBeGreaterThan(0);
    }
  });

  it('menjaga langkah utuh tetap di dalam 0,5–1,5 detik', () => {
    // Inti perubahannya: total sudah termasuk jeda antar-klik, bukan di luarnya.
    for (let i = 0; i < 50; i++) {
      const total = autoPlayDelayMs(RANGE);
      const { thinkMs, clickMs } = splitAutoDelay(total);
      expect(thinkMs + clickMs).toBeGreaterThanOrEqual(RANGE.minMs);
      expect(thinkMs + clickMs).toBeLessThanOrEqual(RANGE.maxMs);
    }
  });
});

describe('shouldRetry', () => {
  it('mencoba lagi setelah jarak yang cukup', () => {
    expect(shouldRetry({ attempts: 1, sinceLastMs: RETRY_AFTER_MS })).toBe(true);
  });

  it('tidak mencoba lagi terlalu cepat', () => {
    // Percobaan beruntun akan saling menimpa sebelum papan sempat bereaksi.
    expect(shouldRetry({ attempts: 1, sinceLastMs: 200 })).toBe(false);
  });

  it('menyerah setelah batas percobaan', () => {
    // Papan yang memang tidak bisa dimainkan tidak akan pernah berubah oleh pengulangan.
    expect(shouldRetry({ attempts: MAX_ATTEMPTS, sinceLastMs: 60_000 })).toBe(false);
  });

  it('bukan jalur untuk percobaan pertama', () => {
    expect(shouldRetry({ attempts: 0, sinceLastMs: 60_000 })).toBe(false);
  });
});
