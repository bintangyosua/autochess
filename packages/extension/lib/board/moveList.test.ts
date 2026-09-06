import { describe, expect, it } from 'vitest';
import { composeSan, parseMoveCells, toPieceLetter } from './moveList';
import { replaySan } from './replay';

// Van 't Kruijs Opening dari panel live: 1. e3 b6  2. c3 Bb7  3. h3 g6
// Move hitam ke-2 dirender sebagai ikon gajah + teks "b7".
const LIVE_GAME = [
  { text: 'e3' },
  { text: 'b6' },
  { text: 'c3' },
  { text: 'b7', figurine: 'bishop' },
  { text: 'h3' },
  { text: 'g6' },
];

describe('composeSan', () => {
  it('mengembalikan huruf bidak yang hilang dari teks', () => {
    expect(composeSan('bishop', 'b7')).toBe('Bb7');
    expect(composeSan('knight', 'f3')).toBe('Nf3');
    expect(composeSan('B', 'b7')).toBe('Bb7');
  });

  it('tidak menggandakan huruf yang sudah ada di teks', () => {
    expect(composeSan('bishop', 'Bb7')).toBe('Bb7');
    expect(composeSan(undefined, 'Nf3')).toBe('Nf3');
  });

  it('membiarkan langkah pion dan rokade apa adanya', () => {
    expect(composeSan(undefined, 'e4')).toBe('e4');
    expect(composeSan(undefined, 'exd5')).toBe('exd5');
    expect(composeSan(undefined, 'O-O')).toBe('O-O');
    expect(composeSan(undefined, 'e8=Q')).toBe('e8=Q');
  });

  it('mengenali nama bidak dari kelas ikon chess.com', () => {
    expect(toPieceLetter('icon-font-chess bishop-white')).toBe('B');
    expect(toPieceLetter('queen')).toBe('Q');
    expect(toPieceLetter('')).toBeUndefined();
    expect(toPieceLetter('tidak-dikenal')).toBeUndefined();
  });
});

describe('parseMoveCells', () => {
  it('membaca game live dan menghasilkan posisi yang benar', () => {
    const { san, problems } = parseMoveCells(LIVE_GAME);
    expect(problems).toEqual([]);
    expect(san).toEqual(['e3', 'b6', 'c3', 'Bb7', 'h3', 'g6']);

    const fen = replaySan(san).fen!;
    expect(fen.split(' ')[0]).toBe('rn1qkbnr/pbpppp1p/1p4p1/8/8/2P1P2P/PP1P1PP1/RNBQKBNR');
    expect(fen.split(' ')[1]).toBe('w');
  });

  it('melapor saat ikon bidak tidak terbaca, bukan meneruskan SAN terpotong', () => {
    // "d4" tanpa ikon: bentuknya sah sebagai langkah pion, jadi lolos ke replay.
    // Kasus yang bisa ditangkap di sini adalah yang bentuknya jelas bukan SAN pion.
    const { problems } = parseMoveCells([{ text: 'xd5' }]);
    expect(problems[0]).toContain('ikon bidak kemungkinan tidak terbaca');
  });

  it('ikon yang hilang pada langkah gajah terdeteksi sebagai move ilegal saat replay', () => {
    // Ini pertahanan lapis kedua: figurine hilang -> "b7" -> pion hitam mundur -> ilegal.
    const withoutIcon = LIVE_GAME.map((c) => ({ text: c.text }));
    const { san } = parseMoveCells(withoutIcon);
    expect(san).toEqual(['e3', 'b6', 'c3', 'b7', 'h3', 'g6']);

    const result = replaySan(san);
    expect(result.fen).toBeUndefined();
    expect(result.problems[0]).toContain('move ke-4');
  });
});
