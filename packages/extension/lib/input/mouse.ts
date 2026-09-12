/**
 * Lapisan paling bawah dari simulasi tetikus: satu kursor maya yang punya posisi, dan
 * cara mengirim event mentah ke halaman.
 *
 * Dipisah dari `playMove` karena sekarang ada dua hal yang memakainya — langkah mode
 * auto dan gerak menganggur saat menunggu giliran — dan keduanya harus memakai kursor
 * yang SAMA. Kalau masing-masing menyimpan posisinya sendiri, jalur yang terlihat oleh
 * halaman akan meloncat-loncat antara dua titik yang tidak berhubungan, dan itu justru
 * pola yang paling tidak menyerupai tangan manusia.
 */

/**
 * Posisi kursor maya terakhir dalam koordinat viewport.
 *
 * `undefined` berarti belum pernah digerakkan; gerakan pertama tidak punya titik awal
 * dan langsung mendarat di tujuan, bukan menyeret dari pojok kiri atas layar.
 */
let cursor: { x: number; y: number } | undefined;

export interface Point {
  x: number;
  y: number;
}

/**
 * Yang ingin tahu ke mana kursor maya berpindah.
 *
 * Ada karena kursor ini tidak kelihatan: tidak ada panah di layar yang ikut bergerak,
 * jadi satu-satunya cara melihat prosesnya adalah menggambar sendiri penandanya
 * (`cursorDot.ts`). Dibuat sebagai langganan, bukan panggilan langsung ke penggambarnya,
 * supaya lapisan paling bawah ini tidak perlu tahu apa-apa soal tampilan — dan tetap
 * bisa jalan tanpa DOM di dalam tes.
 */
const listeners = new Set<(point: Point) => void>();

export function onCursorMove(listener: (point: Point) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function cursorPoint(): Point | undefined {
  return cursor;
}

export function setCursor(point: Point): void {
  cursor = { ...point };
  for (const listener of listeners) listener(cursor);
}

function eventInit(point: Point, buttons: number) {
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: point.x,
    clientY: point.y,
    view: window,
    buttons,
    button: 0,
  };
}

/**
 * Kirim satu event di satu titik.
 *
 * Keluarga pointer dan mouse dikirim sesuai nama eventnya karena chess.com memakai
 * pointer event di browser yang mendukungnya dan jatuh ke mouse event kalau tidak —
 * memakai keduanya membuat kita tidak perlu menebak yang mana yang sedang dipasang.
 */
export function send(target: Element, type: string, point: Point, buttons: number): void {
  const init = eventInit(point, buttons);
  const pointer = {
    ...init,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    width: 1,
    height: 1,
  };
  if (type.startsWith('pointer')) target.dispatchEvent(new PointerEvent(type, pointer));
  else target.dispatchEvent(new MouseEvent(type, init));
  setCursor(point);
}

/**
 * Jalankan rentetan event dengan `setPointerCapture` dilumpuhkan sementara.
 *
 * Ini bukan kehati-hatian spekulatif, melainkan penyebab paling umum dari "event
 * terkirim tapi papan diam". Penangan drag umumnya memanggil
 * `el.setPointerCapture(e.pointerId)` tepat di dalam handler pointerdown-nya. Untuk
 * pointer sintetis, id itu bukan pointer aktif mana pun, jadi panggilan tersebut
 * melempar NotFoundError — dan lemparan itu terjadi DI DALAM kode chess.com, yang
 * membatalkan sisa penangannya tanpa jejak apa pun di sisi kita.
 */
export function withoutPointerCapture<T>(fn: () => T): T {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  const original = {
    set: proto.setPointerCapture,
    release: proto.releasePointerCapture,
    has: proto.hasPointerCapture,
  };
  proto.setPointerCapture = function () {};
  proto.releasePointerCapture = function () {};
  proto.hasPointerCapture = function () {
    return false;
  };
  try {
    return fn();
  } finally {
    proto.setPointerCapture = original.set;
    proto.releasePointerCapture = original.release;
    proto.hasPointerCapture = original.has;
  }
}
