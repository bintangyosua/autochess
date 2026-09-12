import { describe, expect, it } from 'vitest';
import { DEFAULT_CLOCK_STYLE, capByClock, clockFactor, parseClock, pickOwnClock } from './clock';

const style = DEFAULT_CLOCK_STYLE;

describe('parseClock', () => {
  it('membaca bentuk-bentuk yang dipakai chess.com', () => {
    // Bentuknya berubah mengikuti sisa waktu: menit di awal game, desimal saat menipis.
    expect(parseClock('10:00')).toBe(600);
    expect(parseClock('1:23')).toBe(83);
    expect(parseClock('0:09.4')).toBe(9.4);
    expect(parseClock('1:00:00')).toBe(3600);
  });

  it('menolak teks yang bukan jam', () => {
    for (const text of ['', null, undefined, 'Menang', '1234', '12:', 'x:yz']) {
      expect(parseClock(text)).toBeUndefined();
    }
  });
});

describe('pickOwnClock', () => {
  // Alasan yang sama seperti rating: papan selalu menghadap pemain, jadi jam-mu di bawah.
  it('memilih jam di bawah papan', () => {
    expect(
      pickOwnClock(
        [
          { seconds: 300, centerY: 100 },
          { seconds: 120, centerY: 700 },
        ],
        400,
      ),
    ).toBe(120);
  });

  it('memakai satu-satunya jam yang ada', () => {
    expect(pickOwnClock([{ seconds: 55, centerY: 10 }], 400)).toBe(55);
  });

  it('menyerah kalau tidak ada jam sama sekali', () => {
    // Permainan daily atau papan analisis tidak punya jam; itu bukan kerusakan.
    expect(pickOwnClock([], 400)).toBeUndefined();
  });
});

describe('clockFactor', () => {
  it('tidak mengubah apa pun saat waktu masih longgar', () => {
    expect(clockFactor(300, style)).toBe(1);
    expect(clockFactor(style.panicSeconds, style)).toBe(1);
  });

  it('turun mulus, bukan melompat di satu ambang', () => {
    // Lompatan mendadak justru pola tersendiri: tempo seragam, lalu tiba-tiba seragam
    // di kecepatan lain.
    const half = clockFactor(style.panicSeconds / 2, style);
    expect(half).toBeGreaterThan(style.panicFactor);
    expect(half).toBeLessThan(1);
    expect(clockFactor(style.panicSeconds * 0.25, style)).toBeLessThan(half);
  });

  it('paling cepat saat waktu habis', () => {
    expect(clockFactor(0, style)).toBe(style.panicFactor);
  });

  it('tidak berlaku kalau jamnya tidak terbaca atau fiturnya mati', () => {
    expect(clockFactor(undefined, style)).toBe(1);
    expect(clockFactor(3, { ...style, enabled: false })).toBe(1);
  });
});

describe('capByClock', () => {
  it('satu langkah tidak boleh menelan sebagian besar sisa waktu', () => {
    // Tanpa pagar ini, rentang jeda 3 detik akan menghabiskan sisa waktu 4 detik.
    expect(capByClock(3_000, 4, style)).toBeLessThan(1_000);
  });

  it('tidak mengganggu saat waktu masih banyak', () => {
    expect(capByClock(1_500, 600, style)).toBe(1_500);
  });

  it('menyisakan lantai supaya langkahnya tetap sempat dikirim', () => {
    // Nol milidetik berarti dua klik dalam satu frame; papan sering tidak mendaftarkannya
    // sebagai langkah sama sekali.
    expect(capByClock(1_500, 0.1, style)).toBeGreaterThanOrEqual(120);
  });
});
