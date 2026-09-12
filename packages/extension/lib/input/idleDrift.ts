/**
 * Gerak menganggur: saat tidak ada yang dimainkan, kursor tetap hidup.
 *
 * Mode auto membuat papan bergerak seperti manusia, tapi di antara langkah-langkahnya
 * kursornya diam sempurna — kadang diam berpuluh detik selagi lawan berpikir, lalu
 * tiba-tiba muncul tepat di atas bidak yang benar. Pola "diam total, lalu langsung
 * tepat sasaran" justru lebih mencolok daripada kliknya sendiri.
 *
 * Jadi selama menganggur kursor berjalan pelan dari bidak yang direkomendasikan ke
 * kotak tujuannya — persis kebiasaan pemain yang sedang menimbang langkah berikutnya —
 * tanpa pernah menekan tombol. Tidak ada satu pun event tekan di sini; yang terkirim
 * hanya gerak, jadi mode ini tidak bisa memainkan langkah apa pun sekalipun ia salah
 * menyala.
 */

import { glide } from './cursor';
import { findBoard } from '../board/selectors';
import { randomPointIn, type Point } from './path';
import { squarePoint, squareSize, squareClass } from './playMove';

/** Jeda antar gerak menganggur. Diacak; irama yang tetap adalah irama mesin. */
export const REST_MIN_MS = 1_800;
export const REST_MAX_MS = 6_000;

/** Lama satu perjalanan menganggur — santai, jauh lebih lambat dari gerak saat bergerak. */
const TRAVEL_MIN_MS = 450;
const TRAVEL_MAX_MS = 1_100;

export function restMs(random: () => number = Math.random): number {
  return REST_MIN_MS + random() * (REST_MAX_MS - REST_MIN_MS);
}

export function travelMs(random: () => number = Math.random): number {
  return TRAVEL_MIN_MS + random() * (TRAVEL_MAX_MS - TRAVEL_MIN_MS);
}

/**
 * Langkah mana yang "dilihat-lihat" kali ini.
 *
 * Bukan selalu yang terbaik: pemain yang sedang berpikir menyusuri beberapa calon
 * langkah, bukan menunjuk jawaban akhirnya berulang kali. Diambil acak dari beberapa
 * rekomendasi teratas — kalau hanya ada satu, ya itu yang dipakai.
 */
export function pickDriftMove(ucis: string[], random: () => number = Math.random): string | undefined {
  const pool = ucis.filter((uci) => uci.length >= 4).slice(0, 4);
  if (pool.length === 0) return undefined;
  return pool[Math.floor(random() * pool.length)];
}

/**
 * Satu perjalanan menganggur: dari bidak asal ke kotak tujuan sebuah langkah.
 *
 * Dua tahap terpisah dengan jeda kecil di antaranya, bukan satu jalur lurus dari posisi
 * kursor sekarang langsung ke tujuan: mampir dulu ke bidaknya adalah bagian yang membuat
 * gerakan ini terbaca sebagai "sedang menimbang langkah ini", bukan sekadar kursor yang
 * melintas.
 */
export async function driftAlong(uci: string, random: () => number = Math.random): Promise<void> {
  const board = findBoard();
  if (!board) return;
  const size = squareSize(board);
  if (size === 0) return;

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  // Bidaknya harus memang ada di sana. Papan bisa sudah berubah sejak rekomendasi
  // dihitung, dan melayang di atas kotak kosong tidak menyerupai apa pun.
  if (!board.querySelector(`.piece.${squareClass(from)}`)) return;

  const point = (square: string): Point => randomPointIn(squarePoint(board, square), size, random);

  if (!(await glide(point(from), { durationMs: travelMs(random), random }))) return;
  // Jeda singkat di atas bidaknya — tangan berhenti sebentar sebelum memutuskan.
  await sleep(120 + random() * 280);
  await glide(point(to), { durationMs: travelMs(random), random });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface IdleDriftOptions {
  /** Boleh bergerak sekarang? Salah kalau mode auto sedang memainkan langkah. */
  idle: () => boolean;
  /** Rekomendasi terkini dalam UCI, urut dari yang terbaik. */
  moves: () => string[];
  random?: () => number;
}

/**
 * Denyut gerak menganggur.
 *
 * `tick` dipanggil dari interval milik content script supaya ikut mati bersama konteks
 * ekstensi — timer sendiri di sini akan tetap hidup setelah ekstensi dimuat ulang, dan
 * kursor yang bergerak sendiri tanpa ada yang mengendalikannya adalah hal terakhir yang
 * boleh ditinggalkan di halaman orang.
 */
export function createIdleDrift(options: IdleDriftOptions): { tick: () => void } {
  const random = options.random ?? Math.random;
  let nextAt = 0;
  let running = false;

  return {
    tick(): void {
      if (running) return;
      if (!options.idle()) {
        // Selagi langkah sungguhan berjalan, kursornya bukan milik kita. Jadwal
        // berikutnya digeser supaya gerak menganggur tidak menyusul persis sesudahnya.
        nextAt = Date.now() + restMs(random);
        return;
      }

      const now = Date.now();
      if (now < nextAt) return;

      const uci = pickDriftMove(options.moves(), random);
      if (!uci) {
        nextAt = now + restMs(random);
        return;
      }

      running = true;
      void driftAlong(uci, random).finally(() => {
        running = false;
        nextAt = Date.now() + restMs(random);
      });
    },
  };
}
