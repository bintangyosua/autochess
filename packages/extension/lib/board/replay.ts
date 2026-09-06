import { Chess } from 'chess.js';

export const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface ReplayResult {
  /** FEN utuh 6 field. Kosong kalau ada move yang tidak bisa diterapkan. */
  fen?: string;
  /** Jumlah move yang berhasil diterapkan sebelum berhenti. */
  movesApplied: number;
  problems: string[];
}

/**
 * Replay deretan SAN dari `startFen`. Berhenti pada move pertama yang ilegal dan
 * melaporkannya — jalur variasi yang salah telusur biasanya ketahuan di sini.
 */
export function replaySan(
  sanMoves: readonly string[],
  startFen: string = STANDARD_START_FEN,
): ReplayResult {
  let chess: Chess;
  try {
    chess = new Chess(startFen);
  } catch (err) {
    return {
      movesApplied: 0,
      problems: [`posisi awal tidak valid: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  for (const [index, raw] of sanMoves.entries()) {
    const san = cleanSan(raw);
    if (!san) continue;
    try {
      chess.move(san);
    } catch {
      return {
        movesApplied: index,
        problems: [`move ke-${index + 1} tidak legal di posisi ini: "${raw}"`],
      };
    }
  }

  return { fen: chess.fen(), movesApplied: sanMoves.length, problems: [] };
}

/**
 * Bersihkan teks move dari panel chess.com: nomor langkah, anotasi, dan simbol evaluasi.
 * Tanda `+` dan `#` dibiarkan — chess.js menerimanya.
 */
export function cleanSan(raw: string): string {
  return raw
    .replace(/\d+\.(\.\.)?/g, '') // "1." dan "1..."
    .replace(/[!?]+/g, '') // anotasi !, ?, !?, ??
    .replace(/[−∓±∞⩲⩱]/g, '') // simbol evaluasi ±, ∓, ∞, dst.
    .replace(/\s+/g, '')
    .trim();
}

export interface CrossCheckResult {
  fen?: string;
  confidence: 'high' | 'low' | 'none';
  problems: string[];
}

/**
 * Sepakatkan hasil replay riwayat dengan bidak yang benar-benar ada di papan.
 *
 * Riwayat memberi keenam field FEN, tapi bisa salah total tanpa error kalau posisi awalnya
 * bukan posisi standar (Chess960, puzzle yang mulai dari tengah) atau kalau penelusuran
 * cabang variasi meleset. Bidak DOM tidak bisa memberi giliran/rokade, tapi ia selalu
 * menggambarkan apa yang betul-betul di layar. Jadi keduanya saling menutup lubang.
 */
export function crossCheck(replay: ReplayResult, domFenBoard: string | undefined): CrossCheckResult {
  const replayBoard = replay.fen?.split(' ')[0];

  if (replay.fen && replayBoard === domFenBoard) {
    return { fen: replay.fen, confidence: 'high', problems: [] };
  }

  if (replay.fen && !domFenBoard) {
    // Papan tidak terbaca (bidak sedang animasi/drag). Riwayat sendiri sudah konsisten.
    return { fen: replay.fen, confidence: 'low', problems: ['bidak papan tidak terbaca'] };
  }

  if (!replay.fen && domFenBoard) {
    // Puzzle atau papan analisis tanpa riwayat: susunan bidak benar, sisanya tebakan.
    return {
      fen: `${domFenBoard} w KQkq - 0 1`,
      confidence: 'low',
      problems: [...replay.problems, 'giliran/rokade/en passant ditebak karena riwayat kosong'],
    };
  }

  if (replay.fen && domFenBoard && replayBoard !== domFenBoard) {
    return {
      confidence: 'none',
      problems: [
        'riwayat dan bidak papan tidak cocok — kemungkinan posisi awal non-standar atau cabang variasi salah telusur',
        `riwayat: ${replayBoard}`,
        `papan  : ${domFenBoard}`,
      ],
    };
  }

  return { confidence: 'none', problems: [...replay.problems, 'tidak ada sumber posisi yang bisa dipakai'] };
}
