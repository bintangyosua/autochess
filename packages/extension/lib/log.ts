/**
 * Log yang bisa dimatikan.
 *
 * Ekstensi ini berjalan di tab yang sedang dipakai orang bermain, dan console-nya bukan
 * milik kita: tiap langkah dulu menuliskan posisi, keputusan mode auto, dan koordinat
 * kliknya, sampai log halaman sendiri tenggelam. Semua itu berguna saat membetulkan
 * sesuatu dan hanya kebisingan di saat lain.
 *
 * Jadi `debug` mati secara bawaan dan dinyalakan per-tab lewat localStorage:
 *
 *     localStorage['cmr:debug'] = '1'   // nyalakan, lalu muat ulang halaman
 *     delete localStorage['cmr:debug']  // matikan lagi
 *
 * `warn` dan `error` tidak pernah ikut dimatikan. Keduanya menandai keadaan yang tidak
 * seharusnya terjadi — bridge tidak menjawab, papan menolak langkah — dan kalau itu
 * disembunyikan juga, ekstensi yang rusak jadi tidak bisa dibedakan dari yang diam.
 */

const KEY = 'cmr:debug';

/**
 * Dibaca sekali saat modul dimuat, bukan tiap panggilan.
 *
 * Panggilan `debug` terjadi beberapa kali per detik, dan `localStorage` itu sinkron —
 * membacanya tiap kali berarti menyentuh disk di jalur yang seharusnya nyaris gratis.
 * Ongkosnya: perubahan baru berlaku setelah halaman dimuat ulang.
 */
const enabled = readFlag();

function readFlag(): boolean {
  // Service worker (background) tidak punya localStorage sama sekali, dan halaman
  // tertentu bisa memblokir aksesnya. Keduanya berarti "tidak dinyalakan", bukan error.
  try {
    return globalThis.localStorage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Catatan jalannya keadaan — hanya muncul kalau debug dinyalakan. */
export function debug(...args: unknown[]): void {
  if (enabled) console.log(...args);
}

/** Keadaan yang tidak seharusnya terjadi. Selalu muncul. */
export function warn(...args: unknown[]): void {
  console.warn(...args);
}
