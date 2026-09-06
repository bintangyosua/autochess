import type { ParsedPiece } from './parsePieces';
import { squareName, toFenBoard } from './parsePieces';

/**
 * Menyimpulkan field FEN yang tidak ada di DOM bidak, tanpa bantuan riwayat.
 *
 * Chess.com menyorot kotak asal dan tujuan langkah terakhir. Dari situ:
 *   - kotak tujuan (satu-satunya yang berisi bidak) menentukan siapa yang baru jalan,
 *     jadi giliran = warna lawannya;
 *   - selisih rank dua pada langkah pion berarti ada target en passant.
 *
 * Ini jembatan sampai pembacaan move list siap. Hak rokade tetap tidak bisa disimpulkan
 * dengan pasti — lihat catatan di `inferCastling`.
 */

export interface Highlight {
  file: number;
  rank: number;
}

export interface InferredState {
  turn: 'w' | 'b';
  /** false kalau giliran tidak bisa dibaca dari sorotan dan terpaksa ditebak. */
  turnKnown: boolean;
  castling: string;
  enPassant: string;
  /** Alasan kalau ada yang terpaksa ditebak. */
  assumptions: string[];
}

export function inferTurn(
  pieces: readonly ParsedPiece[],
  highlights: readonly Highlight[],
): { turn: 'w' | 'b'; assumption?: string } {
  const occupied = highlights
    .map((h) => pieces.find((p) => p.file === h.file && p.rank === h.rank))
    .filter((p): p is ParsedPiece => p !== undefined);

  // Tepat satu kotak sorot yang terisi = kotak tujuan langkah terakhir.
  if (highlights.length === 2 && occupied.length === 1) {
    const mover = occupied[0]!;
    return { turn: mover.color === 'w' ? 'b' : 'w' };
  }

  if (highlights.length === 0) {
    return { turn: 'w', assumption: 'belum ada langkah tersorot, dianggap giliran putih' };
  }

  return {
    turn: 'w',
    assumption: `sorotan langkah terakhir tidak terbaca jelas (${highlights.length} kotak, ${occupied.length} terisi)`,
  };
}

/**
 * Hak rokade ditebak dari posisi raja dan benteng di kotak asalnya.
 *
 * Ini bisa terlalu longgar: benteng yang pernah bergerak lalu kembali ke a1 akan dianggap
 * masih punya hak rokade, padahal tidak. Akibatnya engine bisa menyarankan rokade yang
 * sebenarnya ilegal. Riwayat move list adalah satu-satunya sumber yang benar; fungsi ini
 * hanya dipakai selama riwayat belum terbaca.
 */
export function inferCastling(pieces: readonly ParsedPiece[]): {
  castling: string;
  assumption?: string;
} {
  const at = (file: number, rank: number, color: 'w' | 'b', type: ParsedPiece['type']) =>
    pieces.some((p) => p.file === file && p.rank === rank && p.color === color && p.type === type);

  let rights = '';
  if (at(5, 1, 'w', 'k')) {
    if (at(8, 1, 'w', 'r')) rights += 'K';
    if (at(1, 1, 'w', 'r')) rights += 'Q';
  }
  if (at(5, 8, 'b', 'k')) {
    if (at(8, 8, 'b', 'r')) rights += 'k';
    if (at(1, 8, 'b', 'r')) rights += 'q';
  }

  return {
    castling: rights || '-',
    assumption: rights
      ? 'hak rokade ditebak dari posisi raja/benteng, bukan dari riwayat'
      : undefined,
  };
}

export function inferEnPassant(
  pieces: readonly ParsedPiece[],
  highlights: readonly Highlight[],
  turn: 'w' | 'b',
): string {
  if (highlights.length !== 2) return '-';

  const to = highlights.find((h) => pieces.some((p) => p.file === h.file && p.rank === h.rank));
  const from = highlights.find((h) => h !== to);
  if (!to || !from || to.file !== from.file) return '-';

  const moved = pieces.find((p) => p.file === to.file && p.rank === to.rank);
  if (moved?.type !== 'p' || Math.abs(to.rank - from.rank) !== 2) return '-';

  // Ikuti konvensi chess.js: target ep hanya dicatat kalau ada pion lawan yang
  // benar-benar bisa menangkap. Kalau tidak, FEN hasil inferensi tidak akan cocok
  // dengan hasil replay riwayat nanti.
  const canCapture = pieces.some(
    (p) =>
      p.type === 'p' &&
      p.color === turn &&
      p.rank === to.rank &&
      Math.abs(p.file - to.file) === 1,
  );
  if (!canCapture) return '-';

  return squareName(to.file, (to.rank + from.rank) / 2);
}

export function inferState(
  pieces: readonly ParsedPiece[],
  highlights: readonly Highlight[],
): InferredState {
  const assumptions: string[] = [];

  const { turn, assumption: turnAssumption } = inferTurn(pieces, highlights);
  if (turnAssumption) assumptions.push(turnAssumption);
  const turnKnown = turnAssumption === undefined;

  const { castling, assumption: castlingAssumption } = inferCastling(pieces);
  if (castlingAssumption) assumptions.push(castlingAssumption);

  return { turn, turnKnown, castling, enPassant: inferEnPassant(pieces, highlights, turn), assumptions };
}

/**
 * FEN utuh dari DOM saja.
 *
 * Halfmove clock dan nomor langkah tidak bisa disimpulkan dari susunan bidak, jadi diisi
 * `0 1`. Keduanya hanya mempengaruhi aturan 50 langkah dan penomoran — tidak mengubah
 * langkah terbaik yang dicari engine. Riwayat move list nanti mengisinya dengan benar.
 */
export function buildFenFromDom(
  pieces: readonly ParsedPiece[],
  highlights: readonly Highlight[],
): { fen: string; assumptions: string[]; turnKnown: boolean } {
  const state = inferState(pieces, highlights);
  return {
    fen: `${toFenBoard(pieces)} ${state.turn} ${state.castling} ${state.enPassant} 0 1`,
    assumptions: state.assumptions,
    turnKnown: state.turnKnown,
  };
}
