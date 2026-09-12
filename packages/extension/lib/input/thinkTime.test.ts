import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THINK_STYLE,
  isRecapture,
  spreadOf,
  thinkFactor,
  type ThinkContext,
} from './thinkTime';

const style = DEFAULT_THINK_STYLE;

/** Posisi tengah permainan biasa: tidak jelas, tidak sulit. */
const plain = (over: Partial<ThinkContext> = {}): ThinkContext => ({
  lines: 3,
  requested: 3,
  ply: 30,
  recapture: false,
  mate: false,
  spreadCp: 120,
  ...over,
});

describe('thinkFactor', () => {
  it('tidak mengubah apa pun saat dimatikan', () => {
    expect(thinkFactor(plain({ lines: 1 }), { ...style, enabled: false })).toBe(1);
  });

  it('langkah satu-satunya dimainkan secepat mungkin', () => {
    // Tidak ada yang bisa dipikirkan, jadi ini mengalahkan sebab lain — termasuk skor
    // yang berdekatan, yang tidak punya arti saat tidak ada pilihan.
    expect(thinkFactor(plain({ lines: 1, spreadCp: 0 }), style)).toBe(style.easy);
  });

  it('tapi satu baris tidak berarti apa-apa kalau memang cuma satu yang diminta', () => {
    // MultiPV 1 selalu mengembalikan satu baris, di posisi apa pun. Menafsirkannya
    // sebagai "cuma satu langkah legal" akan membuat seluruh permainan dimainkan
    // secepat kilat.
    expect(thinkFactor(plain({ lines: 1, requested: 1 }), style)).toBeGreaterThan(style.easy);
  });

  it('skakmat justru mempercepat, bukan memperlambat', () => {
    expect(thinkFactor(plain({ mate: true }), style)).toBeLessThan(1);
  });

  it('balasan makan lebih cepat daripada langkah biasa', () => {
    expect(thinkFactor(plain({ recapture: true }), style)).toBeLessThan(thinkFactor(plain(), style));
  });

  it('pembukaan cepat, dan makin dekat langkah pertama makin cepat', () => {
    const first = thinkFactor(plain({ ply: 0 }), style);
    const later = thinkFactor(plain({ ply: 8 }), style);
    expect(first).toBeLessThan(later);
    expect(later).toBeLessThan(thinkFactor(plain({ ply: 30 }), style));
  });

  it('posisi dengan pilihan berdekatan bikin lama', () => {
    // Inilah posisi yang benar-benar sulit: beberapa langkah terlihat sama bagusnya.
    expect(thinkFactor(plain({ spreadCp: 5 }), style)).toBeGreaterThan(1);
  });

  it('langkah yang unggul telak dimainkan lebih cepat', () => {
    expect(thinkFactor(plain({ spreadCp: 600 }), style)).toBeLessThan(1);
  });

  it('tidak pernah keluar dari batas yang diatur pengguna', () => {
    const extreme: ThinkContext[] = [
      plain({ spreadCp: 0, ply: 0, recapture: true, mate: true }),
      plain({ spreadCp: 0 }),
      plain({ ply: 0, recapture: true, mate: true, spreadCp: 900 }),
    ];
    for (const context of extreme) {
      const factor = thinkFactor(context, style);
      expect(factor).toBeGreaterThanOrEqual(style.easy);
      expect(factor).toBeLessThanOrEqual(style.hard);
    }
  });
});

describe('isRecapture', () => {
  it('mengenali balasan di kotak yang barusan dipakai lawan', () => {
    expect(isRecapture('d8d5', 'c4d5')).toBe(true);
  });

  it('memakan di kotak lain bukan balasan', () => {
    expect(isRecapture('d8d7', 'c4d5')).toBe(false);
  });

  it('langkah pertama tidak punya langkah lawan untuk dibalas', () => {
    expect(isRecapture('e2e4', undefined)).toBe(false);
  });
});

describe('spreadOf', () => {
  it('selisih dua baris teratas', () => {
    expect(spreadOf([{ scoreCp: 120 }, { scoreCp: 40 }])).toBe(80);
  });

  it('menyerah kalau salah satunya skakmat', () => {
    // Mate tidak punya skala centipawn yang berarti; dipaksa jadi angka, selisihnya
    // akan terbaca sebagai "unggul telak" atau "berdekatan" secara acak.
    expect(spreadOf([{ mateIn: 3 }, { scoreCp: 200 }])).toBeUndefined();
  });

  it('menyerah kalau cuma ada satu baris atau skornya tidak ada', () => {
    expect(spreadOf([{ scoreCp: 10 }])).toBeUndefined();
    expect(spreadOf([{ policy: 0.4 } as never, { policy: 0.2 } as never])).toBeUndefined();
  });
});
