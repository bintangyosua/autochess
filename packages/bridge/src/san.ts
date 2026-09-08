import { Chess } from 'chess.js';

/** Validasi FEN. Mengembalikan pesan masalah, atau undefined kalau valid. */
export function fenProblem(fen: string): string | undefined {
  try {
    new Chess(fen);
    return undefined;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Ubah deretan move UCI menjadi SAN, dijalankan dari `fen`.
 * Berhenti diam-diam saat ketemu move ilegal — PV dari engine bisa terpotong
 * di tengah, dan itu bukan alasan menggagalkan seluruh hasil analisis.
 */
export function uciLineToSan(fen: string, uciMoves: string[]): string[] {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return [];
  }

  const san: string[] = [];
  for (const uci of uciMoves) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    try {
      const move = chess.move({ from, to, promotion });
      san.push(move.san);
    } catch {
      break;
    }
  }
  return san;
}

/**
 * Konverter SAN yang memakai ulang satu papan untuk banyak move dari FEN yang sama.
 *
 * Jalur panas engine memanggil ini ratusan kali per detik (tiap baris `info ... pv`),
 * dan membangun `new Chess(fen)` tiap kali berarti mem-parse FEN berulang untuk hasil
 * yang itu-itu juga. Papannya dipakai ulang lewat move/undo, dan hasilnya di-cache per
 * langkah — first move dari sebuah pv nyaris selalu berulang antar-iterasi depth.
 */
export function createSanner(fen: string): (uci: string) => string | undefined {
  let chess: Chess | undefined;
  try {
    chess = new Chess(fen);
  } catch {
    chess = undefined;
  }

  const cache = new Map<string, string | undefined>();
  return (uci) => {
    if (!chess) return undefined;
    const hit = cache.get(uci);
    if (hit !== undefined || cache.has(uci)) return hit;

    let san: string | undefined;
    try {
      san = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      }).san;
      chess.undo();
    } catch {
      san = undefined;
    }
    cache.set(uci, san);
    return san;
  };
}

/**
 * Jalankan rantai langkah UCI dari `startFen`. Mengembalikan FEN akhirnya, atau undefined
 * kalau ada satu saja langkah yang tidak legal.
 *
 * Dipakai bridge untuk memeriksa rantai dari ekstensi sebelum diteruskan ke engine.
 * Rantai itu hasil menyimpulkan langkah dari susunan bidak yang terbaca di DOM, dan
 * rantai yang meleset lebih buruk daripada tidak ada rantai sama sekali: engine akan
 * mencari pada posisi yang bukan posisi di layar, tanpa satu pun tanda bahwa ada yang
 * salah. Jadi di sini tidak ada toleransi — cocok seluruhnya, atau dibuang.
 */
export function replayUci(startFen: string, moves: readonly string[]): string | undefined {
  let chess: Chess;
  try {
    chess = new Chess(startFen);
  } catch {
    return undefined;
  }

  for (const uci of moves) {
    try {
      chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      });
    } catch {
      return undefined;
    }
  }
  return chess.fen();
}
