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
