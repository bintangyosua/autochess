import { describe, expect, it } from 'vitest';
import { cleanSan, crossCheck, replaySan, STANDARD_START_FEN } from './replay';

// Baris French Defense dari panel analisis: 1. e4 e6 2. c3 d6
const FRENCH = ['e4', 'e6', 'c3', 'd6'];
const FRENCH_FEN = 'rnbqkbnr/ppp2ppp/3pp3/8/4P3/2P5/PP1P1PPP/RNBQKBNR w KQkq - 0 3';

describe('replaySan', () => {
  it('menghasilkan FEN utuh 6 field dari daftar SAN', () => {
    const result = replaySan(FRENCH);
    expect(result.problems).toEqual([]);
    expect(result.fen).toBe(FRENCH_FEN);
  });

  it('memberi keempat field yang tidak ada di DOM bidak', () => {
    const [, turn, castling, enPassant, halfmove, fullmove] = replaySan(FRENCH).fen!.split(' ');
    expect(turn).toBe('w');
    expect(castling).toBe('KQkq');
    expect(enPassant).toBe('-');
    expect(halfmove).toBe('0'); // d6 langkah pion -> clock reset
    expect(fullmove).toBe('3');
  });

  it('mencatat en passant hanya saat tangkapannya benar-benar mungkin', () => {
    // chess.js memakai konvensi FEN yang lebih baru: target ep diisi hanya kalau ada
    // pion lawan yang bisa menangkap. Setelah 1.e4 belum ada, jadi field-nya "-".
    expect(replaySan(['e4']).fen!.split(' ')[3]).toBe('-');

    // 1.e4 e6 2.e5 d5 — pion putih di e5 bisa menangkap d6 en passant.
    expect(replaySan(['e4', 'e6', 'e5', 'd5']).fen!.split(' ')[3]).toBe('d6');
  });

  it('mencabut hak rokade setelah raja bergerak', () => {
    const fen = replaySan(['e4', 'e5', 'Ke2']).fen!;
    expect(fen.split(' ')[2]).toBe('kq');
  });

  it('mengembalikan posisi awal untuk daftar kosong', () => {
    expect(replaySan([]).fen).toBe(STANDARD_START_FEN);
  });

  it('berhenti dan melapor saat ketemu move ilegal', () => {
    const result = replaySan(['e4', 'e5', 'Qxf9']);
    expect(result.fen).toBeUndefined();
    expect(result.movesApplied).toBe(2);
    expect(result.problems[0]).toContain('move ke-3');
  });

  it('menolak posisi awal yang tidak valid', () => {
    expect(replaySan(['e4'], 'ngawur').problems[0]).toContain('posisi awal tidak valid');
  });
});

describe('cleanSan', () => {
  it('membuang nomor langkah dan anotasi', () => {
    expect(cleanSan('1. e4')).toBe('e4');
    expect(cleanSan('1... e5')).toBe('e5');
    expect(cleanSan('Nf3!?')).toBe('Nf3');
    expect(cleanSan(' 12. Qxd6 ')).toBe('Qxd6');
  });

  it('mempertahankan tanda skak dan mat', () => {
    expect(cleanSan('Qxf7#')).toBe('Qxf7#');
    expect(cleanSan('Ra8+')).toBe('Ra8+');
    expect(cleanSan('O-O-O')).toBe('O-O-O');
  });
});

describe('crossCheck', () => {
  const board = FRENCH_FEN.split(' ')[0]!;

  it('percaya penuh saat riwayat dan bidak papan sepakat', () => {
    const result = crossCheck(replaySan(FRENCH), board);
    expect(result.confidence).toBe('high');
    expect(result.fen).toBe(FRENCH_FEN);
  });

  it('menolak mengirim apa pun saat keduanya berbeda', () => {
    // Kasus nyata: pengguna sedang menelusuri cabang variasi di papan analisis.
    const result = crossCheck(replaySan(['e4', 'e5']), board);
    expect(result.confidence).toBe('none');
    expect(result.fen).toBeUndefined();
    expect(result.problems[0]).toContain('tidak cocok');
  });

  it('memakai bidak papan dengan metadata tebakan saat riwayat kosong (puzzle)', () => {
    const result = crossCheck(replaySan(['Qxf9']), board);
    expect(result.confidence).toBe('low');
    expect(result.fen).toBe(`${board} w KQkq - 0 1`);
    expect(result.problems.join(' ')).toContain('ditebak');
  });

  it('tetap memakai riwayat saat papan sedang tidak terbaca', () => {
    const result = crossCheck(replaySan(FRENCH), undefined);
    expect(result.confidence).toBe('low');
    expect(result.fen).toBe(FRENCH_FEN);
  });
});
