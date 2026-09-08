import { Chess } from 'chess.js';

/**
 * Menyimpulkan langkah yang terjadi di antara dua pembacaan papan.
 *
 * Ekstensi tidak pernah melihat langkah, hanya susunan bidak sebelum dan sesudah. Tapi
 * dari sebuah posisi hanya ada satu langkah legal yang menghasilkan susunan tertentu —
 * dua kuda yang sama-sama bisa ke d2 meninggalkan kotak asal yang berbeda, dan promosi ke
 * menteri berbeda dari promosi ke benteng — jadi susunan bidak sudah cukup untuk
 * mengenalinya kembali.
 *
 * Nilainya bukan langkahnya itu sendiri, melainkan FEN hasilnya: hak rokade, target en
 * passant, dan halfmove clock di sana adalah hasil perhitungan, bukan tebakan dari
 * sorotan kotak seperti di `inferState`.
 */

export interface DerivedMove {
  /** Langkah dalam koordinat UCI, mis. "e2e4" atau "e7e8q". */
  uci: string;
  /** FEN utuh sesudah langkah ini. */
  fen: string;
  /**
   * Langkah tak-terbalikkan: tangkapan atau langkah pion. Pengulangan posisi tidak
   * mungkin melewati batas ini, jadi rantai langkah boleh dipotong di sini.
   */
  irreversible: boolean;
}

/** Susunan bidak saja — field pertama FEN. */
function boardOf(fen: string): string {
  return fen.split(' ', 1)[0] ?? '';
}

/**
 * Cari langkah tunggal dari `fromFen` yang menghasilkan susunan `targetBoard`.
 *
 * Mengembalikan undefined kalau tidak ada yang cocok, atau — untuk berjaga-jaga — kalau
 * ada lebih dari satu. Tebakan yang salah di sini akan merusak seluruh rantai sesudahnya,
 * jadi ambiguitas lebih baik diperlakukan sebagai kegagalan.
 */
export function deriveMove(fromFen: string, targetBoard: string): DerivedMove | undefined {
  let chess: Chess;
  try {
    chess = new Chess(fromFen);
  } catch {
    return undefined;
  }

  let found: DerivedMove | undefined;
  for (const candidate of chess.moves({ verbose: true })) {
    const move = chess.move(candidate);
    const fen = chess.fen();
    chess.undo();
    if (boardOf(fen) !== targetBoard) continue;
    if (found) return undefined;
    found = {
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      fen,
      irreversible: move.piece === 'p' || move.captured !== undefined,
    };
  }
  return found;
}

/**
 * Cari dua langkah berurutan yang menghasilkan `targetBoard`.
 *
 * Dibutuhkan karena satu pembacaan bisa melewatkan satu langkah: premove chess.com
 * membalas nyaris seketika, dan debounce papan dengan sengaja menunggu — jadi langkah
 * lawan dan balasan premove bisa mendarat di antara dua pembacaan yang sama.
 *
 * Di sini ambiguitas tidak ditolak melainkan dihindari sejak awal: hanya dicari dari
 * langkah-langkah yang belum tentu benar satu per satu, dan begitu ada dua pasangan
 * berbeda yang sama-sama cocok, seluruh pencarian dianggap gagal.
 */
export function deriveTwoMoves(
  fromFen: string,
  targetBoard: string,
): [DerivedMove, DerivedMove] | undefined {
  let chess: Chess;
  try {
    chess = new Chess(fromFen);
  } catch {
    return undefined;
  }

  let found: [DerivedMove, DerivedMove] | undefined;
  for (const first of chess.moves({ verbose: true })) {
    const move = chess.move(first);
    const midFen = chess.fen();
    chess.undo();

    const second = deriveMove(midFen, targetBoard);
    if (!second) continue;
    if (found) return undefined;
    found = [
      {
        uci: `${move.from}${move.to}${move.promotion ?? ''}`,
        fen: midFen,
        irreversible: move.piece === 'p' || move.captured !== undefined,
      },
      second,
    ];
  }
  return found;
}
