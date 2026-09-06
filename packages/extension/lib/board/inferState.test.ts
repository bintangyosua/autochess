import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { parsePieceClasses } from './parsePieces';
import { buildFenFromDom, inferCastling, inferEnPassant, inferTurn } from './inferState';
import { replaySan } from './replay';

const cls = (...lines: string[]) => lines.map((l) => l.split(/\s+/));

/** Bangun daftar bidak dari FEN supaya tes tidak perlu menulis kelas satu per satu. */
function piecesFromFen(fen: string) {
  const chess = new Chess(fen);
  return chess
    .board()
    .flatMap((row, rankIndex) =>
      row.flatMap((sq, fileIndex) =>
        sq ? [{ file: fileIndex + 1, rank: 8 - rankIndex, color: sq.color, type: sq.type }] : [],
      ),
    );
}

const START = piecesFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
const AFTER_E4 = piecesFromFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');

describe('inferTurn', () => {
  it('menyimpulkan giliran hitam dari sorotan e2-e4', () => {
    // e2 kosong, e4 berisi pion putih -> putih baru jalan.
    const highlights = [{ file: 5, rank: 2 }, { file: 5, rank: 4 }];
    expect(inferTurn(AFTER_E4, highlights)).toEqual({ turn: 'b' });
  });

  it('menyimpulkan giliran putih setelah langkah hitam', () => {
    const pieces = piecesFromFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    const highlights = [{ file: 5, rank: 7 }, { file: 5, rank: 5 }];
    expect(inferTurn(pieces, highlights)).toEqual({ turn: 'w' });
  });

  it('menganggap giliran putih saat belum ada langkah', () => {
    const result = inferTurn(START, []);
    expect(result.turn).toBe('w');
    expect(result.assumption).toContain('belum ada langkah');
  });

  it('melaporkan tebakan saat sorotan tidak jelas', () => {
    const result = inferTurn(AFTER_E4, [{ file: 5, rank: 4 }]);
    expect(result.assumption).toContain('tidak terbaca jelas');
  });
});

describe('inferCastling', () => {
  it('memberi hak penuh di posisi awal', () => {
    expect(inferCastling(START).castling).toBe('KQkq');
  });

  it('mencabut hak saat raja tidak di kotak asal', () => {
    const pieces = piecesFromFen('rnbq1bnr/pppkpppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQ - 0 1');
    // Raja hitam pindah ke d7 -> hak hitam hilang; kedua benteng putih masih di kotak asal.
    expect(inferCastling(pieces).castling).toBe('KQ');
  });

  it('mencabut sisi yang bentengnya hilang', () => {
    const pieces = piecesFromFen('1nbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN1 w Qq - 0 1');
    // a8 hilang -> hitam kehilangan sisi queenside; h1 hilang -> putih kehilangan kingside.
    expect(inferCastling(pieces).castling).toBe('Qk');
  });

  it('menandai bahwa hasilnya tebakan', () => {
    expect(inferCastling(START).assumption).toContain('bukan dari riwayat');
  });
});

describe('inferEnPassant', () => {
  it('mencatat target ep saat tangkapannya mungkin', () => {
    // 1.e4 e6 2.e5 d5 -> pion putih e5 bisa menangkap d6.
    const pieces = piecesFromFen('rnbqkbnr/ppp2ppp/4p3/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    const highlights = [{ file: 4, rank: 7 }, { file: 4, rank: 5 }];
    expect(inferEnPassant(pieces, highlights, 'w')).toBe('d6');
  });

  it('tidak mencatat ep kalau tidak ada yang bisa menangkap', () => {
    const highlights = [{ file: 5, rank: 2 }, { file: 5, rank: 4 }];
    expect(inferEnPassant(AFTER_E4, highlights, 'b')).toBe('-');
  });

  it('mengabaikan langkah non-pion', () => {
    const pieces = piecesFromFen('rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1');
    const highlights = [{ file: 7, rank: 1 }, { file: 6, rank: 3 }];
    expect(inferEnPassant(pieces, highlights, 'b')).toBe('-');
  });
});

describe('buildFenFromDom', () => {
  it('menghasilkan FEN yang sama dengan hasil replay riwayat', () => {
    // Kedua jalur harus sepakat, karena crossCheck akan membandingkannya.
    const highlights = [{ file: 5, rank: 2 }, { file: 5, rank: 4 }];
    const fromDom = buildFenFromDom(AFTER_E4, highlights).fen;
    const fromHistory = replaySan(['e4']).fen!;

    const [board, turn, castling, ep] = fromDom.split(' ');
    const [hBoard, hTurn, hCastling, hEp] = fromHistory.split(' ');
    expect([board, turn, castling, ep]).toEqual([hBoard, hTurn, hCastling, hEp]);
  });

  it('menghasilkan FEN yang diterima chess.js', () => {
    const { fen } = buildFenFromDom(AFTER_E4, [{ file: 5, rank: 2 }, { file: 5, rank: 4 }]);
    expect(() => new Chess(fen)).not.toThrow();
  });

  it('bekerja langsung dari kelas DOM chess.com', () => {
    const parsed = parsePieceClasses(
      cls(
        'piece br square-88', 'piece bn square-78', 'piece bb square-68', 'piece bk square-58',
        'piece bq square-48', 'piece bb square-38', 'piece bn square-28', 'piece br square-18',
        'piece bp square-87', 'piece bp square-77', 'piece bp square-67', 'piece bp square-57',
        'piece bp square-47', 'piece bp square-37', 'piece bp square-27', 'piece bp square-17',
        'piece wp square-82', 'piece wp square-72', 'piece wp square-62', 'piece wp square-54',
        'piece wp square-42', 'piece wp square-32', 'piece wp square-22', 'piece wp square-12',
        'piece wr square-81', 'piece wn square-71', 'piece wb square-61', 'piece wk square-51',
        'piece wq square-41', 'piece wb square-31', 'piece wn square-21', 'piece wr square-11',
      ),
    );
    const { fen } = buildFenFromDom(parsed.pieces, [{ file: 5, rank: 2 }, { file: 5, rank: 4 }]);
    expect(fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  });
});
