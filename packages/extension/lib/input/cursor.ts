/**
 * Menggerakkan kursor maya melewati sebuah jalur, dalam waktu.
 *
 * `path.ts` menentukan bentuk jalurnya, `mouse.ts` mengirim eventnya; di sini keduanya
 * dijalankan bertahap sepanjang durasi tertentu. Bagian "dalam waktu" itulah intinya:
 * mengirim dua puluh pointermove dalam satu frame sama saja dengan tidak bergerak sama
 * sekali dari sudut pandang halaman.
 */

import { cursorPoint, send, setCursor, withoutPointerCapture, type Point } from './mouse';
import { cursorPath } from './path';

/**
 * Penanda gerakan yang sedang berjalan.
 *
 * Gerak menganggur bisa sedang di tengah jalan saat langkah sungguhan tiba, dan dua
 * jalur yang berjalan bersamaan akan saling menimpa koordinat — halaman melihat kursor
 * meloncat bolak-balik antara dua tujuan. Setiap gerakan baru menaikkan nomor ini, dan
 * gerakan lama berhenti sendiri begitu nomornya tidak lagi yang terbaru.
 */
let generation = 0;

/** Hentikan gerakan yang sedang berjalan, tanpa memulai yang baru. */
export function cancelGlide(): void {
  generation += 1;
}

export interface GlideOptions {
  /** Total waktu tempuh. Dipakai apa adanya; pemanggil yang punya anggaran waktunya. */
  durationMs: number;
  /** 1 kalau tombol sedang ditekan (sedang menyeret bidak), 0 kalau hanya melayang. */
  buttons?: number;
  /**
   * Elemen tujuan event gerak. Saat menyeret, ini harus `document.documentElement`:
   * begitu bidak terangkat, elemen di bawah kursor berubah, dan penangan drag
   * mendengarkan di level document persis karena alasan itu.
   */
  target?: Element;
  random?: () => number;
}

/**
 * Gerakkan kursor ke satu titik, mengikuti jalur melengkung, lalu selesai.
 *
 * Mengembalikan `false` kalau gerakannya dibatalkan di tengah jalan — pemanggil yang
 * punya langkah untuk dimainkan sesudahnya harus berhenti, bukan mengklik dari posisi
 * yang tidak pernah sampai.
 */
export async function glide(to: Point, options: GlideOptions): Promise<boolean> {
  const mine = ++generation;
  const from = cursorPoint();

  // Belum pernah ada kursor: tidak ada jalur yang masuk akal untuk ditempuh, jadi
  // langsung tempatkan di sana. Gerakan berikutnya sudah punya titik awal.
  if (!from) {
    setCursor(to);
    return true;
  }

  const buttons = options.buttons ?? 0;
  const points = cursorPath(from, to, { random: options.random });
  const stepMs = options.durationMs / points.length;

  for (const point of points) {
    if (generation !== mine) return false;
    const target = options.target ?? hoverTarget(point);
    withoutPointerCapture(() => {
      send(target, 'pointermove', point, buttons);
      send(target, 'mousemove', point, buttons);
    });
    if (stepMs > 0) await sleep(stepMs);
  }
  return generation === mine;
}

/** Elemen yang sedang dilewati kursor; ke situlah event gerak seharusnya mendarat. */
function hoverTarget(point: Point): Element {
  return document.elementFromPoint(point.x, point.y) ?? document.documentElement;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
