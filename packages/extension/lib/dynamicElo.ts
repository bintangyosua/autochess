/**
 * Elo yang mengikuti rating-mu sendiri.
 *
 * Mode ini menggantikan slider kekuatan, bukan menemaninya: kalau menyala, angka yang
 * dikirim ke engine dihitung dari rating yang terbaca di halaman plus sebuah offset.
 *
 * Offsetnya sebuah rentang, bukan satu angka, dan diacak sekali per game. Alasannya sama
 * dengan jeda langkah: offset tetap menghasilkan kekuatan yang persis sama di tiap game,
 * dan keseragaman itulah yang jadi pola. Dipilih sekali per game — bukan tiap permintaan
 * analisis — karena kalau berubah di tengah game, tiap langkah dihitung oleh engine
 * dengan kekuatan berbeda, dan kualitas permainanmu jadi naik-turun tanpa sebab.
 */

export interface OffsetRange {
  minOffset: number;
  maxOffset: number;
}

/** Batas offset yang masuk akal: cukup untuk unggul, tidak sampai jadi mesin penuh. */
export const OFFSET_MIN = -500;
export const OFFSET_MAX = 1_000;

export const DEFAULT_OFFSET: OffsetRange = { minOffset: 50, maxOffset: 150 };

/** Satu offset acak dari rentangnya. Bulat, karena Elo memang bilangan bulat. */
export function pickOffset(range: OffsetRange, random: () => number = Math.random): number {
  return Math.round(range.minOffset + random() * (range.maxOffset - range.minOffset));
}

/**
 * Elo yang benar-benar dikirim ke sebuah engine.
 *
 * Dijepit ke rentang yang didukung engine itu, dan inilah bagian yang paling sering
 * mengejutkan: Stockfish tidak bisa turun di bawah `UCI_Elo` 1320. Kalau rating-mu 800,
 * hasil 800+100 tetap menjadi 1320 — mode dinamisnya terlihat "tidak berfungsi" padahal
 * sedang bekerja benar. Karena itu angka efektifnya yang ditampilkan ke pengguna, bukan
 * hasil penjumlahan mentahnya.
 */
export function effectiveElo(
  rating: number,
  offset: number,
  strength: { min: number; max: number } | undefined,
): number {
  const target = Math.round(rating + offset);
  if (!strength) return target;
  return Math.min(strength.max, Math.max(strength.min, target));
}

/** Nilai mentah dari storage tidak dijamin bentuknya; yang penting min <= max. */
export function sanitizeOffset(value: unknown): OffsetRange {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const clamp = (input: unknown, fallback: number): number => {
    if (typeof input !== 'number' || !Number.isFinite(input)) return fallback;
    return Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, Math.round(input)));
  };
  const minOffset = clamp(raw.minOffset, DEFAULT_OFFSET.minOffset);
  const maxOffset = clamp(raw.maxOffset, DEFAULT_OFFSET.maxOffset);
  return minOffset <= maxOffset ? { minOffset, maxOffset } : { minOffset: maxOffset, maxOffset: minOffset };
}
