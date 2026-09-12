/**
 * Ketukan di satu titik, untuk elemen apa pun — bukan cuma papan.
 *
 * Dipisah dari `playMove` saat klik "game baru" butuh jalur yang sama: tombol di modal
 * hasil harus diklik dengan cara yang persis sama dengan bidak, lewat kursor maya yang
 * sama, bukan lewat `element.click()`. Alasannya bukan kerapian — `element.click()`
 * tidak mengirim satu pun event pointer, jadi ia terlihat sama sekali berbeda dari
 * tangan manusia, dan halaman yang menolak klik sintetis akan menolak yang itu lebih
 * dulu.
 */

import { send, withoutPointerCapture, type Point } from './mouse';

/**
 * Elemen di bawah titik itu, tapi hanya kalau ia masih bagian dari `root`.
 *
 * Panel overlay kita sendiri menempel di atas papan dan sengaja menerima klik (tombolnya
 * harus bisa ditekan), jadi untuk kotak di baliknya `elementFromPoint` mengembalikan
 * panel itu — dan klik yang melewati kotak tersebut akan mendarat di overlay sendiri.
 * Apa pun yang di luar `root` diganti dengan `root`; koordinatnya tetap dikirim apa
 * adanya, dan dari situlah halaman menghitung sasarannya.
 */
export function targetAt(root: Element, point: Point): Element {
  const found = document.elementFromPoint(point.x, point.y);
  return found && root.contains(found) ? found : root;
}

/**
 * Tekan lalu lepas.
 *
 * Perjalanan menuju titik ini sudah dilakukan `glide` sebelum pemanggilan, jadi di sini
 * tinggal satu pointermove sebagai penegasan posisi — beberapa penangan membaca posisi
 * terakhir yang dilaporkan, bukan posisi di event pointerdown — lalu ketukannya.
 */
export function tap(root: Element, point: Point): void {
  const target = targetAt(root, point);
  withoutPointerCapture(() => {
    send(target, 'pointerover', point, 0);
    send(target, 'mouseover', point, 0);
    send(target, 'pointermove', point, 0);
    send(target, 'mousemove', point, 0);
    send(target, 'pointerdown', point, 1);
    send(target, 'mousedown', point, 1);
    send(target, 'pointerup', point, 0);
    send(target, 'mouseup', point, 0);
    send(target, 'click', point, 0);
  });
}

/** Tekan tombol — awal sebuah seretan. */
export function press(root: Element, point: Point): void {
  const target = targetAt(root, point);
  withoutPointerCapture(() => {
    send(target, 'pointerover', point, 0);
    send(target, 'mouseover', point, 0);
    send(target, 'pointermove', point, 0);
    send(target, 'mousemove', point, 0);
    send(target, 'pointerdown', point, 1);
    send(target, 'mousedown', point, 1);
  });
}

/** Lepas tombol — akhir sebuah seretan. */
export function release(root: Element, point: Point): void {
  const dropTarget = targetAt(root, point);
  withoutPointerCapture(() => {
    send(dropTarget, 'pointerup', point, 0);
    send(dropTarget, 'mouseup', point, 0);
    send(document.documentElement, 'pointerup', point, 0);
    send(document.documentElement, 'mouseup', point, 0);
  });
}
