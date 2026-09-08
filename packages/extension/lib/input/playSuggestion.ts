import { overlay } from '../overlayState.svelte';
import { playMove } from './playMove';

/**
 * Mainkan satu langkah yang diklik pengguna dari daftar rekomendasi.
 *
 * Bedanya dengan mode auto bukan cuma pemicunya. Mode auto sengaja menunda langkahnya
 * supaya menyerupai tangan manusia; di sini pengguna sudah memutuskan dan sedang
 * menunggu, jadi menundanya hanya terasa seperti ekstensi yang lambat.
 */

/** Cukup untuk chess.com mendaftarkan dua ketukan sebagai langkah, tanpa terasa menunggu. */
const CLICK_DELAY_MS = 80;

/**
 * Berapa lama menunggu papan berubah sebelum menyimpulkan klik tidak mempan.
 *
 * Harus lebih lama dari debounce pembacaan papan (120 ms) plus animasi chess.com,
 * kalau tidak kita akan menyimpulkan gagal padahal langkahnya baru saja mendarat.
 */
const CONFIRM_MS = 500;

/** Langkah yang sedang menunggu konfirmasi; menahan klik beruntun pada baris yang sama. */
let pending: ReturnType<typeof setTimeout> | undefined;

export function playSuggestion(uci: string, san?: string): void {
  const move = {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
  const name = san ?? uci;
  const before = overlay.fen;

  clearTimeout(pending);

  const failure = playMove(move, { clickDelayMs: CLICK_DELAY_MS, style: 'click' });
  if (failure) {
    overlay.manualPlay.message = failure.error;
    return;
  }
  overlay.manualPlay.message = name;

  // Chess.com punya setelan "move method" yang bisa disetel drag saja, dan di papan
  // seperti itu klik tidak menghasilkan apa pun tanpa error — persis pelajaran yang
  // sudah didapat mode auto. Jadi kalau papan tidak bergerak, coba sekali lagi dengan
  // drag.
  //
  // Mencoba ulang aman meski ternyata kliknya berhasil: bidaknya sudah tidak ada di
  // kotak asal, dan `playMove` menolak langkah dari kotak kosong. Jadi yang paling
  // buruk terjadi hanyalah pesan kesalahan, bukan langkah kedua yang tak diminta.
  pending = setTimeout(() => {
    pending = undefined;
    if (overlay.fen !== before) return;

    const retry = playMove(move, { clickDelayMs: CLICK_DELAY_MS, style: 'drag' });
    overlay.manualPlay.message = retry ? retry.error : name;
  }, CONFIRM_MS);
}
