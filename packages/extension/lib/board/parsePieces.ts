/**
 * Ubah daftar kelas `.piece` chess.com menjadi bagian papan dari FEN.
 *
 * Bentuk kelasnya: `piece br square-88`
 *   - `br`        = warna (w|b) + jenis (k|q|r|b|n|p)
 *   - `square-XY` = X file 1..8 (a..h), Y rank 1..8, selalu absolut dari sisi putih
 *
 * Fungsi di file ini sengaja murni (hanya menerima daftar string kelas) supaya bisa
 * diuji tanpa DOM.
 */

export interface ParsedPiece {
  file: number; // 1..8
  rank: number; // 1..8
  color: 'w' | 'b';
  type: 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
}

export interface BoardParseResult {
  /** Bagian pertama FEN, mis. "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR". */
  fenBoard?: string;
  pieces: ParsedPiece[];
  /** Kosong berarti hasilnya bisa dipercaya. */
  problems: string[];
}

const PIECE_CLASS = /^([wb])([kqrbnp])$/;
const SQUARE_CLASS = /^square-([1-8])([1-8])$/;

export function parsePieceClasses(classLists: readonly (readonly string[])[]): BoardParseResult {
  const pieces: ParsedPiece[] = [];
  const problems: string[] = [];
  const occupied = new Map<number, ParsedPiece>();

  for (const classes of classLists) {
    let square: { file: number; rank: number } | undefined;
    let piece: { color: 'w' | 'b'; type: ParsedPiece['type'] } | undefined;

    for (const name of classes) {
      const squareMatch = SQUARE_CLASS.exec(name);
      if (squareMatch) {
        square = { file: Number(squareMatch[1]), rank: Number(squareMatch[2]) };
        continue;
      }
      const pieceMatch = PIECE_CLASS.exec(name);
      if (pieceMatch) {
        piece = { color: pieceMatch[1] as 'w' | 'b', type: pieceMatch[2] as ParsedPiece['type'] };
      }
    }

    if (!square || !piece) {
      // Bidak yang sedang di-drag sempat kehilangan kelas square-XY; itu wajar dan
      // bukan alasan menggagalkan pembacaan, tapi hasilnya jadi tidak lengkap.
      problems.push(`elemen .piece tanpa kelas lengkap: "${classes.join(' ')}"`);
      continue;
    }

    const parsed: ParsedPiece = { ...square, ...piece };
    const key = square.file * 10 + square.rank;
    const clash = occupied.get(key);
    if (clash) {
      problems.push(
        `dua bidak di kotak yang sama (${squareName(square.file, square.rank)}): ` +
          `${clash.color}${clash.type} dan ${parsed.color}${parsed.type}`,
      );
      continue;
    }
    occupied.set(key, parsed);
    pieces.push(parsed);
  }

  for (const color of ['w', 'b'] as const) {
    const kings = pieces.filter((p) => p.color === color && p.type === 'k').length;
    if (kings !== 1) problems.push(`jumlah raja ${color} = ${kings}, seharusnya 1`);
  }

  if (problems.length > 0) return { pieces, problems };
  return { fenBoard: toFenBoard(pieces), pieces, problems };
}

/** Susun bidak jadi bagian papan FEN: rank 8 lebih dulu, file a -> h. */
export function toFenBoard(pieces: readonly ParsedPiece[]): string {
  const grid = new Map<number, ParsedPiece>();
  for (const piece of pieces) grid.set(piece.file * 10 + piece.rank, piece);

  const ranks: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 1; file <= 8; file++) {
      const piece = grid.get(file * 10 + rank);
      if (!piece) {
        empty++;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      row += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
    }
    if (empty > 0) row += String(empty);
    ranks.push(row);
  }
  return ranks.join('/');
}

export function squareName(file: number, rank: number): string {
  return `${'abcdefgh'[file - 1] ?? '?'}${rank}`;
}
