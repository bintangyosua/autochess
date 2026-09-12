import { describe, expect, it } from 'vitest';
import { parseRating, pickOwnRating } from './rating';

describe('parseRating', () => {
  it('menerima bentuk-bentuk yang dipakai chess.com', () => {
    // "?" menandai rating yang belum mapan; itu tetap rating yang sah untuk tujuan kita.
    expect(parseRating('1234')).toBe(1234);
    expect(parseRating('(1234)')).toBe(1234);
    expect(parseRating('1234?')).toBe(1234);
    expect(parseRating(' 987 ')).toBe(987);
  });

  it('menyerah untuk teks yang tidak memuat angka rating', () => {
    for (const text of ['', null, undefined, 'Unrated', '12']) {
      expect(parseRating(text)).toBeUndefined();
    }
  });
});

describe('pickOwnRating', () => {
  // Papan chess.com selalu diputar ke sisi pemain, jadi kamu selalu di bawah. Itu
  // kebenaran geometris yang tidak ikut berubah saat nama kelas chess.com berganti.
  const boardCenterY = 400;

  it('memilih rating di bawah papan, bukan di atasnya', () => {
    const mine = pickOwnRating(
      [
        { value: 1800, centerY: 120 },
        { value: 1250, centerY: 690 },
      ],
      boardCenterY,
    );
    expect(mine).toBe(1250);
  });

  it('memilih yang paling bawah kalau keduanya di bawah titik tengah', () => {
    // Di layar sempit kedua komponen pemain bisa sama-sama jatuh di bawah papan.
    expect(
      pickOwnRating(
        [
          { value: 1800, centerY: 420 },
          { value: 1250, centerY: 560 },
        ],
        boardCenterY,
      ),
    ).toBe(1250);
  });

  it('memakai satu-satunya angka yang ada apa adanya', () => {
    expect(pickOwnRating([{ value: 1400, centerY: 100 }], boardCenterY)).toBe(1400);
  });

  it('menyerah kalau tidak ada angka yang masuk akal', () => {
    expect(pickOwnRating([], boardCenterY)).toBeUndefined();
    expect(pickOwnRating([{ value: 0, centerY: 500 }], boardCenterY)).toBeUndefined();
  });
});
