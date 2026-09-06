import type { Suggestion } from '@cmr/shared';
import { parseInfo } from './parseInfo.js';
import { uciLineToSan } from '../san.js';

export interface MultiPvCollector {
  /** Suapi tiap baris dari engine. Mengembalikan true kalau ada perubahan berarti. */
  feed(line: string): boolean;
  suggestions(): Suggestion[];
  depth(): number | undefined;
  nps(): number | undefined;
}

/**
 * Mengumpulkan baris `info ... multipv N ... pv ...` menjadi daftar saran.
 *
 * Dipakai bersama oleh Stockfish dan Leela — keduanya engine UCI dengan pencarian, dan
 * format baris info-nya sama persis.
 *
 * Aturan pentingnya: slot MultiPV tidak boleh dicampur antar-depth. Iterasi terakhir
 * sering tidak lengkap (slot 1 ditandai `upperbound` lalu dibuang), sehingga slot yang
 * belum ter-update menyisakan langkah dari depth sebelumnya dan hasilnya bisa memuat
 * langkah yang sama dua kali. Jadi tiap iterasi disimpan terpisah, dan yang dipakai
 * adalah iterasi terlengkap.
 */
export function createMultiPvCollector(fen: string): MultiPvCollector {
  let current = new Map<number, Suggestion>();
  let currentDepth: number | undefined;
  let completed = new Map<number, Suggestion>();
  let depth: number | undefined;
  let nps: number | undefined;

  const best = () => (current.size >= completed.size ? current : completed);

  return {
    feed(line) {
      const info = parseInfo(line);
      if (!info || info.string !== undefined) return false;
      // Skor lowerbound/upperbound berasal dari aspiration window dan akan direvisi.
      if (info.bound) return false;

      if (info.depth !== undefined) depth = info.depth;
      if (info.nps !== undefined) nps = info.nps;
      if (!info.pv?.length) return false;

      if (info.depth !== undefined && info.depth !== currentDepth) {
        if (current.size >= completed.size) completed = current;
        current = new Map();
        currentDepth = info.depth;
      }

      const pv = info.pv;
      current.set(info.multipv ?? 1, {
        uci: pv[0]!,
        san: uciLineToSan(fen, pv.slice(0, 6))[0],
        scoreCp: info.scoreCp,
        mateIn: info.mateIn,
        pv,
      });
      return true;
    },

    suggestions() {
      return [...best().entries()].sort(([a], [b]) => a - b).map(([, s]) => s);
    },
    depth: () => depth,
    nps: () => nps,
  };
}
