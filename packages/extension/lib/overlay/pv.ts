import { Chess } from 'chess.js';

/**
 * Ubah principal variation dari engine (UCI) jadi deretan SAN yang bisa dibaca.
 *
 * Bridge sengaja hanya menghitung SAN untuk langkah pertama: baris `info` datang ratusan
 * kali per detik, dan menerjemahkan seluruh pv di sana berarti membangun ulang posisi
 * berkali-kali untuk hasil yang belum tentu ditampilkan. Di sini biayanya jauh lebih
 * murah — penggambaran panel dibatasi sepuluh kali per detik, dan hasilnya di-cache.
 */

export interface PvLine {
  /** SAN dari seluruh langkah yang ditampilkan, termasuk langkah pertama. */
  san: string[];
  /** Masih ada lanjutan yang tidak ikut ditampilkan. */
  truncated: boolean;
  /** Baris ini berakhir dengan skakmat. */
  mate: boolean;
}

const EMPTY: PvLine = { san: [], truncated: false, mate: false };

/**
 * Berapa langkah yang ditampilkan untuk garis biasa.
 *
 * Pv dari engine bisa sepanjang dua puluh langkah lebih, dan sesudah beberapa langkah
 * pertama isinya makin spekulatif — lawan tidak wajib menuruti garis itu. Menampilkan
 * semuanya membuat panel penuh oleh tebakan yang paling tidak bisa diandalkan.
 */
const DEFAULT_LIMIT = 8;

/** Cache per posisi. Diganti seluruhnya begitu posisinya berubah. */
let cacheFen: string | undefined;
let cache = new Map<string, PvLine>();

/**
 * Terjemahkan `uci` yang dijalankan dari `fen`.
 *
 * Baris yang berakhir skakmat ditampilkan utuh, berapa pun panjangnya: di situlah justru
 * seluruh urutannya yang penting — memotongnya di tengah menyisakan pertanyaan "lalu
 * bagaimana matinya?", padahal itu satu-satunya hal yang ingin dilihat. Alasan yang sama
 * berlaku untuk garis yang skornya mate walau pv-nya sendiri terpotong engine.
 */
export function pvLine(
  fen: string | undefined,
  uci: readonly string[] | undefined,
  options: { mateIn?: number; limit?: number } = {},
): PvLine {
  if (!fen || !uci?.length) return EMPTY;

  if (cacheFen !== fen) {
    cacheFen = fen;
    cache = new Map();
  }
  const limit = options.limit ?? DEFAULT_LIMIT;
  const key = `${limit}|${options.mateIn ?? ''}|${uci.join(' ')}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const line = compute(fen, uci, options.mateIn, limit);
  cache.set(key, line);
  return line;
}

function compute(
  fen: string,
  uci: readonly string[],
  mateIn: number | undefined,
  limit: number,
): PvLine {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return EMPTY;
  }

  const san: string[] = [];
  for (const move of uci) {
    try {
      san.push(
        chess.move({
          from: move.slice(0, 2),
          to: move.slice(2, 4),
          promotion: move.length > 4 ? move[4] : undefined,
        }).san,
      );
    } catch {
      // Pv dari engine bisa terpotong di tengah, dan langkah yang tidak bisa diterapkan
      // bukan alasan membuang bagian yang sudah benar.
      break;
    }
  }

  if (san.length === 0) return EMPTY;

  const mate = chess.isCheckmate();
  const showAll = mate || mateIn !== undefined;
  if (showAll || san.length <= limit) {
    return { san, truncated: false, mate };
  }
  return { san: san.slice(0, limit), truncated: true, mate: false };
}
