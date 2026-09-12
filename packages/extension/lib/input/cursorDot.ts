/**
 * Penanda kursor maya yang bisa dilihat.
 *
 * Kursor asli di layar tidak bisa dipindahkan dari halaman web — itu batas keamanan
 * browser — jadi seluruh gerakan yang kita kirim ke chess.com tidak terlihat sama
 * sekali. Dari luar, "kursor berjalan pelan ke bidak lalu mengklik" dan "tidak terjadi
 * apa-apa" tampak identik, dan itu membuat setiap kesalahan geometri mustahil dilihat:
 * kliknya meleset setengah kotak dan yang kamu tahu hanya papan yang diam.
 *
 * Titik ini menggambar posisi yang DIPERCAYA halaman, bukan posisi kursor sistem. Ia
 * murni tampilan: `pointer-events: none` membuatnya tidak pernah tertabrak
 * `elementFromPoint`, jadi ia tidak bisa mencuri klik yang kita kirim sendiri —
 * pelajaran yang sama yang sudah didapat panel overlay.
 */

import { cursorPoint, onCursorMove, type Point } from './mouse';

const ID = 'cmr-cursor-dot';

let element: HTMLElement | undefined;
let unsubscribe: (() => void) | undefined;

function create(): HTMLElement {
  const dot = document.createElement('div');
  dot.id = ID;
  // Gaya ditulis inline, bukan lewat stylesheet: elemen ini menempel di `document.body`
  // (di luar shadow root overlay) supaya bisa berada di atas apa pun, dan di sana CSS
  // milik kita tidak berlaku.
  Object.assign(dot.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '14px',
    height: '14px',
    marginLeft: '-7px',
    marginTop: '-7px',
    borderRadius: '50%',
    border: '2px solid rgba(255, 90, 90, 0.95)',
    background: 'rgba(255, 90, 90, 0.25)',
    boxShadow: '0 0 6px rgba(0, 0, 0, 0.5)',
    pointerEvents: 'none',
    zIndex: '2147483647',
    // Tanpa transisi. Posisinya diperbarui puluhan kali per detik dan animasi CSS di
    // atasnya hanya akan tertinggal di belakang titik yang sebenarnya — persis hal yang
    // ingin diperiksa dengan penanda ini.
    transition: 'none',
    willChange: 'transform',
  });
  return dot;
}

function place(point: Point): void {
  if (element) element.style.transform = `translate(${point.x}px, ${point.y}px)`;
}

/**
 * Nyalakan atau matikan penandanya.
 *
 * Aman dipanggil berkali-kali dengan nilai yang sama, karena sumbernya adalah setelan
 * yang bisa berubah dari tab lain kapan saja.
 */
export function showCursorDot(on: boolean): void {
  if (on === Boolean(element)) return;

  if (!on) {
    unsubscribe?.();
    unsubscribe = undefined;
    element?.remove();
    element = undefined;
    return;
  }

  element = create();
  document.body.appendChild(element);
  // Kursor maya mungkin sudah berjalan sebelum penanda ini dinyalakan; tempatkan di
  // posisi terakhirnya supaya tidak nyangkut di pojok kiri atas sampai gerakan berikutnya.
  const current = cursorPoint();
  if (current) place(current);
  else element.style.display = 'none';

  unsubscribe = onCursorMove((point) => {
    if (!element) return;
    element.style.display = '';
    place(point);
  });
}
