import { describe, expect, it } from 'vitest';
import { parsePieceClasses, toFenBoard } from './parsePieces';

/** Ubah "piece br square-88" jadi daftar kelas, meniru element.classList. */
const cls = (...lines: string[]) => lines.map((line) => line.split(/\s+/));

const START_PIECES = cls(
  'piece br square-88', 'piece bn square-78', 'piece bb square-68', 'piece bk square-58',
  'piece bq square-48', 'piece bb square-38', 'piece bn square-28', 'piece br square-18',
  'piece bp square-87', 'piece bp square-77', 'piece bp square-67', 'piece bp square-57',
  'piece bp square-47', 'piece bp square-37', 'piece bp square-27', 'piece bp square-17',
  'piece wp square-82', 'piece wp square-72', 'piece wp square-62', 'piece wp square-52',
  'piece wp square-42', 'piece wp square-32', 'piece wp square-22', 'piece wp square-12',
  'piece wr square-81', 'piece wn square-71', 'piece wb square-61', 'piece wk square-51',
  'piece wq square-41', 'piece wb square-31', 'piece wn square-21', 'piece wr square-11',
);

/** Persis DOM dari screenshot: posisi setelah 1.e4 (wp di square-54, bukan square-52). */
const AFTER_E4 = START_PIECES.map((c) => (c.includes('square-52') ? ['piece', 'wp', 'square-54'] : c));

describe('parsePieceClasses', () => {
  it('membaca posisi awal', () => {
    const result = parsePieceClasses(START_PIECES);
    expect(result.problems).toEqual([]);
    expect(result.fenBoard).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  });

  it('membaca posisi setelah 1.e4 dari DOM asli chess.com', () => {
    const result = parsePieceClasses(AFTER_E4);
    expect(result.problems).toEqual([]);
    expect(result.fenBoard).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
  });

  it('tidak terpengaruh urutan elemen di DOM', () => {
    const shuffled = [...AFTER_E4].reverse();
    expect(parsePieceClasses(shuffled).fenBoard).toBe(parsePieceClasses(AFTER_E4).fenBoard);
  });

  it('memetakan file dan rank dengan benar, bukan tertukar', () => {
    // square-18 = file a, rank 8. Kalau tertukar hasilnya akan muncul di rank 1.
    const result = parsePieceClasses(cls('piece br square-18', 'piece wk square-51', 'piece bk square-58'));
    expect(result.fenBoard).toBe('r3k3/8/8/8/8/8/8/4K3');
  });

  it('melaporkan dua bidak di kotak yang sama', () => {
    const result = parsePieceClasses(cls('piece wk square-51', 'piece bk square-58', 'piece wq square-51'));
    expect(result.problems.join(' ')).toContain('kotak yang sama (e1)');
    expect(result.fenBoard).toBeUndefined();
  });

  it('melaporkan raja yang hilang, bukan mengembalikan FEN cacat', () => {
    const result = parsePieceClasses(cls('piece wk square-51'));
    expect(result.problems.join(' ')).toContain('jumlah raja b = 0');
    expect(result.fenBoard).toBeUndefined();
  });

  it('melaporkan bidak tanpa kelas square (mis. sedang di-drag)', () => {
    const result = parsePieceClasses(cls('piece wk square-51', 'piece bk square-58', 'piece wq dragging'));
    expect(result.problems.join(' ')).toContain('tanpa kelas lengkap');
  });

  it('mengabaikan kelas tambahan yang tidak dikenal', () => {
    const result = parsePieceClasses(cls('piece wk square-51 selected', 'piece bk square-58 hover'));
    expect(result.fenBoard).toBe('4k3/8/8/8/8/8/8/4K3');
  });
});

describe('toFenBoard', () => {
  it('menghitung kotak kosong di ujung baris', () => {
    expect(toFenBoard([{ file: 1, rank: 8, color: 'b', type: 'r' }])).toBe('r7/8/8/8/8/8/8/8');
    expect(toFenBoard([{ file: 8, rank: 1, color: 'w', type: 'r' }])).toBe('8/8/8/8/8/8/8/7R');
  });
});
