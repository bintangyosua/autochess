/**
 * Apakah sebuah langkah memakan bidak?
 *
 * Mode auto punya dua anggaran waktu, dan ini yang memilih di antaranya. Alasannya
 * bukan sekadar selera: langkah memakan adalah langkah yang paling jelas terlihat dari
 * posisi — bidak lawan berdiri di sana, dan pemain manusia hampir tidak pernah butuh
 * waktu lama untuk menemukannya. Jeda panjang sebelum memakan justru terbaca aneh,
 * sementara jeda panjang sebelum langkah tenang terbaca sebagai berpikir.
 */

/** Kode bidak chess.com: warna + jenis, mis. "wp", "bq". */
export type PieceCode = string;

/**
 * Inti keputusannya, tanpa DOM: `pieceAt` menjawab bidak apa yang ada di sebuah kotak.
 */
export function isCapture(
  move: { from: string; to: string },
  pieceAt: (square: string) => PieceCode | undefined,
): boolean {
  const target = pieceAt(move.to);
  const mover = pieceAt(move.from);
  if (!mover) return false;

  // Kotak tujuan berisi bidak lawan. Bidak sendiri di sana berarti langkahnya bukan
  // makan melainkan rokade yang ditulis "raja makan benteng" — bentuk yang dipakai
  // sebagian engine, dan yang jelas bukan langkah memakan.
  if (target) return target[0] !== mover[0];

  // En passant: pion berpindah kolom ke kotak yang kosong. Satu-satunya cara sebuah
  // pion mengubah kolom adalah dengan memakan, jadi kotak kosong di sini tetap berarti
  // ada bidak yang hilang dari papan.
  return mover[1] === 'p' && move.from[0] !== move.to[0];
}
