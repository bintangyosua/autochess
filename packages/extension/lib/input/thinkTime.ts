/**
 * Waktu berpikir yang mengikuti posisinya, bukan acak merata.
 *
 * Ini lubang terbesar yang tersisa dari mode auto. Jeda acak merata 0,5–1,5 detik untuk
 * semua langkah adalah bentuk sebaran yang tidak pernah dihasilkan manusia: manusia
 * melangkah nyaris refleks saat cuma ada satu langkah legal atau saat membalas makan di
 * kotak yang sama, dan berpikir lama justru ketika beberapa langkah terlihat sama
 * bagusnya. Sebaran waktu adalah hal yang paling mudah diuji secara statistik — jauh
 * lebih mudah daripada apa pun soal tetikus.
 *
 * Semua bahannya sudah ada tanpa perhitungan tambahan: jumlah baris MultiPV, selisih
 * skor antar baris, nomor langkah, dan kotak tujuan langkah terakhir lawan.
 */

/** Apa yang diketahui tentang posisi saat memutuskan lama berpikir. */
export interface ThinkContext {
  /**
   * Jumlah langkah yang dilaporkan engine. Kalau engine diminta 5 baris dan hanya
   * mengirim 1, berarti memang cuma satu langkah legal — cara mengetahuinya tanpa
   * menghitung ulang langkah legal sendiri.
   */
  lines: number;
  /** Berapa baris yang diminta. Tanpa ini, `lines` tidak bisa ditafsirkan. */
  requested: number;
  /** Nomor setengah-langkah yang sudah dimainkan; dipakai untuk mengenali pembukaan. */
  ply: number;
  /** Langkah ini membalas makan di kotak yang barusan dipakai lawan. */
  recapture: boolean;
  /** Engine melihat skakmat paksa. */
  mate: boolean;
  /** Selisih centipawn antara langkah terbaik dan kedua; undefined kalau tak terukur. */
  spreadCp?: number;
}

export interface ThinkStyle {
  enabled: boolean;
  /** Pengali untuk langkah yang jelas. Di bawah 1 berarti lebih cepat dari biasanya. */
  easy: number;
  /** Pengali untuk posisi sulit. Di atas 1 berarti lebih lama. */
  hard: number;
  /** Sampai setengah-langkah keberapa dihitung pembukaan (hafalan, jadi cepat). */
  openingPlies: number;
}

export const DEFAULT_THINK_STYLE: ThinkStyle = {
  enabled: true,
  easy: 0.35,
  hard: 1.9,
  openingPlies: 10,
};

/** Selisih skor di bawah ini berarti langkahnya benar-benar sulit dipilih. */
const CLOSE_CP = 35;
/** Di atas ini, satu langkah menang telak dan manusia pun melihatnya cepat. */
const OBVIOUS_CP = 250;

/** Geser sebuah pengali sebagian jalan menuju target. */
function toward(value: number, target: number, amount: number): number {
  return value + (target - value) * amount;
}

/**
 * Pengali waktu berpikir untuk sebuah posisi.
 *
 * Hasilnya dikalikan ke jeda acak yang sudah ada, bukan menggantikannya: rentang yang
 * kamu atur tetap menentukan tempo dasarmu, dan ini yang membuatnya naik-turun mengikuti
 * posisi. Selalu dijepit ke [easy, hard] supaya menumpuknya beberapa sebab tidak pernah
 * menghasilkan jeda yang absurd.
 */
export function thinkFactor(context: ThinkContext, style: ThinkStyle): number {
  if (!style.enabled) return 1;

  // Satu langkah legal: tidak ada yang bisa dipikirkan. Ini yang paling kuat dan
  // mengalahkan sebab lain — termasuk posisi yang skornya berdekatan, karena "berdekatan"
  // tidak punya arti saat tidak ada pilihan.
  if (context.requested > 1 && context.lines === 1) return style.easy;

  let factor = 1;

  // Skakmat paksa: manusia justru makin cepat begitu melihatnya, bukan makin lambat.
  if (context.mate) factor = toward(factor, style.easy, 0.8);

  // Membalas makan di kotak yang sama. Berbeda dari "memakan" biasa: yang ini sudah
  // diantisipasi sejak lawan mengangkat bidaknya.
  if (context.recapture) factor = toward(factor, style.easy, 0.65);

  // Pembukaan dimainkan dari hafalan. Makin dekat ke langkah pertama, makin cepat.
  if (context.ply < style.openingPlies) {
    const depth = 1 - context.ply / Math.max(1, style.openingPlies);
    factor = toward(factor, style.easy, 0.7 * depth);
  }

  if (context.spreadCp !== undefined) {
    if (context.spreadCp <= CLOSE_CP) {
      // Beberapa langkah terlihat sama bagusnya — di sinilah manusia benar-benar diam.
      const closeness = 1 - context.spreadCp / CLOSE_CP;
      factor = toward(factor, style.hard, 0.8 * closeness);
    } else if (context.spreadCp >= OBVIOUS_CP) {
      factor = toward(factor, style.easy, 0.45);
    }
  }

  return Math.min(style.hard, Math.max(style.easy, factor));
}

/**
 * Apakah langkah ini membalas makan di kotak yang barusan dipakai lawan.
 *
 * Kotak tujuan langkah terakhir lawan diambil dari rantai langkah yang sudah dipegang
 * content script, jadi tidak ada pembacaan papan tambahan.
 */
export function isRecapture(uci: string, opponentLastUci: string | undefined): boolean {
  if (!opponentLastUci || uci.length < 4 || opponentLastUci.length < 4) return false;
  return uci.slice(2, 4) === opponentLastUci.slice(2, 4);
}

/** Selisih skor antara dua langkah teratas, dalam centipawn. */
export function spreadOf(
  suggestions: readonly { scoreCp?: number; mateIn?: number }[],
): number | undefined {
  const first = suggestions[0];
  const second = suggestions[1];
  // Mate tidak punya skala centipawn yang berarti; kalau salah satunya mate, selisihnya
  // ditangani lewat bendera `mate`, bukan dipaksa jadi angka.
  if (!first || !second) return undefined;
  if (first.mateIn !== undefined || second.mateIn !== undefined) return undefined;
  if (first.scoreCp === undefined || second.scoreCp === undefined) return undefined;
  return Math.abs(first.scoreCp - second.scoreCp);
}
