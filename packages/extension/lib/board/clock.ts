/**
 * Sisa waktu di jam-mu sendiri.
 *
 * Tanpa ini, mode auto memakai tempo yang sama di detik pertama dan di detik terakhir.
 * Akibatnya dua-duanya buruk: dari luar terlihat aneh — tidak ada manusia yang tenang
 * berpikir 1,5 detik per langkah dengan sisa 8 detik — dan dari sisi hasilnya, kamu
 * kalah karena kehabisan waktu di blitz padahal posisinya menang.
 *
 * Mana jam milikmu ditentukan lewat geometri, alasan yang sama seperti rating: papan
 * chess.com selalu menghadap pemain, jadi jam-mu selalu yang paling bawah. Nama kelas
 * boleh berganti; sisi bawah tidak.
 */

export interface ClockEntry {
  seconds: number;
  centerY: number;
}

/**
 * Ubah teks jam jadi detik.
 *
 * Bentuknya berubah mengikuti sisa waktu: "10:00", "1:23", "0:09.4", dan kadang
 * "12:34:56" untuk permainan panjang. Satu pola yang menampung semuanya lebih baik
 * daripada beberapa pola yang saling menutupi — yang terakhir selalu detik, yang di
 * depannya menit, dan yang paling depan (kalau ada) jam.
 */
export function parseClock(text: string | null | undefined): number | undefined {
  const trimmed = (text ?? '').trim();
  if (!/^\d{1,2}(:\d{1,2}){1,2}(\.\d+)?$/.test(trimmed)) return undefined;

  const parts = trimmed.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return undefined;

  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** Jam yang mana milikmu: yang paling bawah di layar. */
export function pickOwnClock(entries: ClockEntry[], boardCenterY: number): number | undefined {
  const usable = entries.filter((entry) => Number.isFinite(entry.seconds));
  if (usable.length === 0) return undefined;
  if (usable.length === 1) return usable[0]!.seconds;

  const below = usable.filter((entry) => entry.centerY > boardCenterY);
  const pool = below.length > 0 ? below : usable;
  return pool.reduce((lowest, entry) => (entry.centerY > lowest.centerY ? entry : lowest)).seconds;
}

const CLOCK_SELECTOR = '[class*="clock-time"], [class*="clock-component"] [class*="time"]';

/**
 * Sisa waktumu dalam detik, atau `undefined` kalau tidak terbaca — permainan tanpa jam
 * (daily, analisis), atau chess.com mengubah strukturnya.
 */
export function readOwnClock(board: Element | undefined): number | undefined {
  if (!board) return undefined;
  const rect = board.getBoundingClientRect();
  if (rect.width === 0) return undefined;

  const entries: ClockEntry[] = [];
  for (const element of document.querySelectorAll(CLOCK_SELECTOR)) {
    const seconds = parseClock(element.textContent);
    if (seconds === undefined) continue;
    const box = element.getBoundingClientRect();
    if (box.height === 0) continue;
    entries.push({ seconds, centerY: box.top + box.height / 2 });
  }

  return pickOwnClock(entries, rect.top + rect.height / 2);
}

export interface ClockStyle {
  enabled: boolean;
  /** Di bawah sisa waktu ini, tempo mulai dipercepat. */
  panicSeconds: number;
  /** Pengali tercepat, dipakai saat waktu hampir habis. */
  panicFactor: number;
  /**
   * Bagian terbesar dari sisa waktu yang boleh dihabiskan untuk satu langkah.
   *
   * Ini pagar yang berdiri sendiri, terpisah dari pengali di atas: berapa pun tempo yang
   * kamu atur, satu langkah tidak boleh menelan sebagian besar jam yang tersisa. Tanpa
   * pagar ini, rentang jeda yang kamu set 3 detik akan menghabiskan sisa waktu 4 detik.
   */
  maxShare: number;
}

export const DEFAULT_CLOCK_STYLE: ClockStyle = {
  enabled: true,
  panicSeconds: 30,
  panicFactor: 0.2,
  maxShare: 0.06,
};

/**
 * Pengali tempo menurut sisa waktu.
 *
 * Turun mulus dari 1 di `panicSeconds` sampai `panicFactor` saat waktu habis, bukan
 * melompat di satu ambang: lompatan mendadak justru pola tersendiri — tempo yang
 * seragam, lalu tiba-tiba seragam di kecepatan lain.
 */
export function clockFactor(remainingSec: number | undefined, style: ClockStyle): number {
  if (!style.enabled || remainingSec === undefined) return 1;
  if (remainingSec >= style.panicSeconds) return 1;
  if (remainingSec <= 0) return style.panicFactor;

  const share = remainingSec / style.panicSeconds;
  return style.panicFactor + (1 - style.panicFactor) * share;
}

/** Batas keras: satu langkah tidak boleh menelan terlalu banyak sisa waktu. */
export function capByClock(
  delayMs: number,
  remainingSec: number | undefined,
  style: ClockStyle,
): number {
  if (!style.enabled || remainingSec === undefined) return delayMs;
  return Math.min(delayMs, Math.max(120, remainingSec * 1000 * style.maxShare));
}
