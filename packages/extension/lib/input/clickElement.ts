/**
 * Klik sebuah elemen — tombol, menu, apa saja — lewat kursor maya yang sama dengan
 * yang dipakai menggerakkan bidak.
 *
 * Bukan `element.click()`. Panggilan itu tidak mengirim satu pun event pointer: tidak
 * ada gerak, tidak ada pointerdown, tidak ada koordinat. Halaman yang membedakan klik
 * manusia dari klik skrip akan menolaknya lebih dulu daripada apa pun yang kita kirim
 * lewat jalur ini — dan di sisi kita, kursor maya jadi "meloncat" ke tempat yang tidak
 * pernah ia lewati, yang merusak keseluruhan alasan kursor itu ada.
 */

import { glide } from './cursor';
import { randomPointInRect } from './path';
import { tap } from './tap';

export interface ClickOptions {
  /** Lama perjalanan kursor menuju elemen. */
  durationMs: number;
  random?: () => number;
}

/**
 * Gerakkan kursor ke elemen, lalu ketuk.
 *
 * `false` berarti tidak jadi diklik: elemennya tidak punya ukuran (tersembunyi, atau
 * sudah lepas dari DOM), atau perjalanannya dibatalkan di tengah jalan oleh gerakan
 * lain. Keduanya harus dibedakan dari "sudah diklik" oleh pemanggil — mengira sudah
 * mengklik padahal belum akan membuatnya menunggu sesuatu yang tidak akan terjadi.
 */
export async function clickElement(element: Element, options: ClickOptions): Promise<boolean> {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  const point = randomPointInRect(rect, options.random);
  if (!(await glide(point, { durationMs: options.durationMs, random: options.random }))) {
    return false;
  }

  // Elemen bisa berpindah atau hilang selama perjalanan — modal yang menutup sendiri,
  // daftar yang tergeser. Diperiksa ulang di detik terakhir, karena mengetuk koordinat
  // lama berarti mengklik apa pun yang sekarang menempati tempat itu.
  const live = element.getBoundingClientRect();
  if (live.width === 0 || live.height === 0) return false;
  if (!element.isConnected) return false;

  tap(element, point);
  return true;
}
