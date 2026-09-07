import { findBoard, readOrientation } from '../board/selectors';

/**
 * Mainkan langkah di papan chess.com dengan mensimulasikan klik pengguna.
 *
 * Kenapa klik dan bukan API internal papan: `wc-chess-board` memang punya objek game
 * di dalamnya, tapi bentuknya tidak stabil antar rilis dan tidak bisa disentuh dari
 * dunia content script (isolated world) tanpa menyuntik skrip ke halaman. Klik adalah
 * jalur yang sama persis dengan yang dipakai manusia: apa pun yang berlaku untuk
 * pemain — giliran, langkah ilegal, premove — berlaku sama untuk kita, dan tidak ada
 * keadaan internal yang bisa jadi tidak sinkron.
 *
 * Chess.com mendukung klik-asal lalu klik-tujuan, jadi dua ketukan sudah cukup dan
 * tidak perlu meniru seluruh gerakan drag. Jeda di antara keduanya ditentukan pemanggil
 * (`clickDelayMs`) karena ia harus muat di dalam anggaran waktu satu langkah utuh.
 */

export interface PlayFailure {
  error: string;
}

/** Kelas kotak chess.com untuk sebuah nama kotak: "d3" -> "square-43". */
export function squareClass(square: string): string {
  return `square-${square.charCodeAt(0) - 96}${square[1]}`;
}

/**
 * Selisih antara titik hasil hitungan dan posisi bidak yang sebenarnya di layar.
 *
 * Elemen bidak tahu persis di mana dirinya berada, dan itu kebenaran yang lebih kuat
 * daripada perhitungan kita dari kotak papan: ia sudah memperhitungkan padding, border,
 * koordinat pinggir, atau apa pun yang mungkin membuat rumus kita meleset setengah
 * kotak. Jadi selisihnya tidak dipakai untuk menolak langkah — itu pernah dicoba, dan
 * hasilnya pemeriksaan yang seharusnya menjelaskan kegagalan malah menjadi
 * penyebabnya — melainkan untuk menggeser titik klik ke tempat yang benar.
 *
 * Kotak tujuan tidak bisa diperiksa dengan cara yang sama karena biasanya kosong (tidak
 * ada elemen di sana untuk ditanya), jadi ia digeser dengan selisih yang sama:
 * kesalahan geometri bersifat sistematis, sama untuk seluruh papan.
 */
export function pointOffset(
  board: Element,
  square: string,
  point: { x: number; y: number },
): { dx: number; dy: number } {
  const piece = board.querySelector(`.piece.${squareClass(square)}`);
  if (!piece) return { dx: 0, dy: 0 };

  const rect = piece.getBoundingClientRect();
  if (rect.width === 0) return { dx: 0, dy: 0 };

  return {
    dx: rect.left + rect.width / 2 - point.x,
    dy: rect.top + rect.height / 2 - point.y,
  };
}

/** Ubah nama kotak jadi titik tengahnya dalam koordinat viewport. */
function squarePoint(board: Element, square: string): { x: number; y: number } {
  const rect = board.getBoundingClientRect();
  const file = square.charCodeAt(0) - 96; // a=1
  const rank = Number(square[1]);
  const flipped = readOrientation(board) === 'black';
  const col = flipped ? 8 - file : file - 1;
  const row = flipped ? rank - 1 : 8 - rank;
  const size = rect.width / 8;
  return {
    x: rect.left + (col + 0.5) * size,
    y: rect.top + (row + 0.5) * (rect.height / 8),
  };
}

/**
 * Satu ketukan penuh di satu titik.
 *
 * Urutannya ditiru dari input asli, dan seluruh keluarga event dikirim karena
 * chess.com memakai pointer event di browser yang mendukungnya dan jatuh ke mouse
 * event kalau tidak — mengirim keduanya membuat kita tidak perlu menebak yang mana
 * yang sedang dipasang.
 */
function eventInit(point: { x: number; y: number }, buttons: number) {
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
 * Elemen di bawah titik itu, tapi hanya kalau ia bagian dari papan.
 *
 * Panel overlay kita sendiri menempel di pojok kanan atas papan dan sengaja menerima
 * klik (tombolnya harus bisa ditekan), jadi untuk kotak-kotak di baliknya
 * `elementFromPoint` mengembalikan panel itu — dan langkah yang melewati kotak
 * tersebut akan "diklik" ke overlay sendiri, bukan ke papan. Apa pun yang bukan bagian
 * dari papan diganti dengan elemen papan; koordinatnya tetap dikirim apa adanya, dan
 * dari situlah chess.com menghitung kotaknya.
 */
function targetAt(board: Element, point: { x: number; y: number }): Element {
  const found = document.elementFromPoint(point.x, point.y);
  return found && board.contains(found) ? found : board;
}

function send(target: Element, type: string, point: { x: number; y: number }, buttons: number) {
  const init = eventInit(point, buttons);
  const pointer = { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true, width: 1, height: 1 };
  // Kirim keduanya karena chess.com memakai pointer event di browser yang
  // mendukungnya dan jatuh ke mouse event kalau tidak.
  if (type.startsWith('pointer')) target.dispatchEvent(new PointerEvent(type, pointer));
  else target.dispatchEvent(new MouseEvent(type, init));
}

/**
 * Jalankan rentetan event dengan `setPointerCapture` dilumpuhkan sementara.
 *
 * Ini bukan kehati-hatian spekulatif, melainkan penyebab paling umum dari "event
 * terkirim tapi papan diam". Penangan drag umumnya memanggil
 * `el.setPointerCapture(e.pointerId)` tepat di dalam handler pointerdown-nya. Untuk
 * pointer sintetis, id itu bukan pointer aktif mana pun, jadi panggilan tersebut
 * melempar NotFoundError — dan lemparan itu terjadi DI DALAM kode chess.com, yang
 * membatalkan sisa penangannya tanpa jejak apa pun di sisi kita: bidak tidak pernah
 * terangkat, dan kita tidak pernah tahu kenapa.
 *
 * Yang dilumpuhkan hanya selama satu rentetan event, lalu dikembalikan persis seperti
 * semula — halaman tidak dibiarkan dalam keadaan tertambal.
 */
function withoutPointerCapture<T>(fn: () => T): T {
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

function tap(board: Element, point: { x: number; y: number }): void {
  const target = targetAt(board, point);
  withoutPointerCapture(() => {
    // Papan perlu tahu pointer ada di kotak ini sebelum ditekan; beberapa penangan
    // membaca posisi terakhir yang dilaporkan, bukan posisi di event pointerdown.
    send(target, 'pointerover', point, 0);
    send(target, 'pointerenter', point, 0);
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

/**
 * Seret bidak dari satu kotak ke kotak lain.
 *
 * Ini bukan sekadar cara kedua yang lebih rumit: chess.com punya setelan "move method",
 * dan kalau pemiliknya memilih drag saja, klik-asal-klik-tujuan tidak menghasilkan apa
 * pun — papan diam total tanpa error. Jadi drag dipakai sebagai cadangan saat klik
 * ternyata tidak direspons.
 *
 * Gerakannya dipecah jadi beberapa langkah kecil karena implementasi drag umumnya baru
 * mulai mengangkat bidak setelah pointer bergerak melewati ambang tertentu; satu
 * lompatan langsung ke tujuan bisa terlewat begitu saja.
 */
function drag(board: Element, from: { x: number; y: number }, to: { x: number; y: number }): void {
  const target = targetAt(board, from);
  withoutPointerCapture(() => {
    send(target, 'pointerover', from, 0);
    send(target, 'pointerenter', from, 0);
    send(target, 'mouseover', from, 0);
    send(target, 'pointermove', from, 0);
    send(target, 'mousemove', from, 0);
    send(target, 'pointerdown', from, 1);
    send(target, 'mousedown', from, 1);

    // Gerakan sementara dikirim ke document, bukan ke elemen asal: begitu bidak
    // terangkat, elemen di bawah kursor berubah, dan penangan drag mendengarkan di
    // level document persis karena alasan itu.
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const point = {
        x: from.x + ((to.x - from.x) * i) / steps,
        y: from.y + ((to.y - from.y) * i) / steps,
      };
      send(document.documentElement, 'pointermove', point, 1);
      send(document.documentElement, 'mousemove', point, 1);
    }

    const dropTarget = targetAt(board, to);
    send(dropTarget, 'pointerup', to, 0);
    send(dropTarget, 'mouseup', to, 0);
    send(document.documentElement, 'pointerup', to, 0);
    send(document.documentElement, 'mouseup', to, 0);
  });
}

/** Bidak promosi yang dipilih di jendela promosi chess.com. */
function pickPromotion(piece: string): boolean {
  const board = findBoard();
  const window_ = board?.querySelector('.promotion-window, .promotion-menu');
  if (!window_) return false;
  const option = window_.querySelector(`.piece.w${piece}, .piece.b${piece}, [data-type="${piece}"]`);
  if (!option) return false;
  const rect = option.getBoundingClientRect();
  tap(board!, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  return true;
}

/**
 * Klik kotak asal lalu kotak tujuan. Mengembalikan `undefined` kalau ketukan pertama
 * berhasil dikirim — klik tujuan menyusul setelah jeda, jadi nilai kembalinya menandai
 * langkah yang sudah dimulai, bukan yang sudah selesai:
 * kalau papan menolak (bukan giliranmu, papan hanya-baca), tidak ada yang berubah dan
 * pembaca papan tetap melaporkan posisi lama.
 */
export function playMove(
  move: { from: string; to: string; promotion?: string },
  options: { clickDelayMs: number; style?: 'click' | 'drag' },
): PlayFailure | undefined {
  const board = findBoard();
  if (!board) return { error: 'papan tidak ditemukan' };

  const rect = board.getBoundingClientRect();
  if (rect.width === 0) return { error: 'papan belum punya ukuran' };

  // Drag harus utuh dalam satu rentetan event, jadi jedanya ditaruh sebelum gerakan
  // dimulai — bukan di tengah, yang justru akan membatalkan angkatannya.
  const style = options.style ?? 'click';
  const raw = squarePoint(board, move.from);

  // Bidak yang mau digerakkan harus benar-benar ada di kotak asal. Kalau tidak, yang
  // salah adalah posisi yang terbaca, bukan kliknya — dan mengklik kotak kosong lalu
  // kotak lain bisa memainkan langkah yang sama sekali tidak dimaksud.
  if (!board.querySelector(`.piece.${squareClass(move.from)}`)) {
    return { error: `tidak ada bidak di ${move.from}` };
  }

  const offset = pointOffset(board, move.from, raw);
  if (Math.abs(offset.dx) > 2 || Math.abs(offset.dy) > 2) {
    console.warn(
      `[cmr] koordinat digeser ${offset.dx.toFixed(1)},${offset.dy.toFixed(1)}px ` +
        'agar pas ke bidaknya',
    );
  }
  const fromPoint = { x: raw.x + offset.dx, y: raw.y + offset.dy };

  console.log(`[cmr] ${style} ${move.from}->${move.to}`);
  if (style === 'click') tap(board, fromPoint);

  // Titik tujuan dihitung ulang setelah jeda, bukan sekarang: dalam setengah detik itu
  // halaman bisa bergulir atau papan berubah ukuran, dan koordinat lama akan meleset
  // ke kotak yang salah.
  setTimeout(() => {
    const live = findBoard();
    if (!live) return;
    const shift = (point: { x: number; y: number }) => ({
      x: point.x + offset.dx,
      y: point.y + offset.dy,
    });
    const toPoint = shift(squarePoint(live, move.to));
    if (style === 'click') tap(live, toPoint);
    else drag(live, shift(squarePoint(live, move.from)), toPoint);

    // Jendela promosi baru muncul setelah kotak tujuan diklik, dan tidak selalu di
    // frame yang sama — jadi coba beberapa kali sebentar sebelum menyerah.
    if (move.promotion) {
      let tries = 0;
      const timer = setInterval(() => {
        if (pickPromotion(move.promotion!) || ++tries > 20) clearInterval(timer);
      }, 25);
    }
  }, options.clickDelayMs);

  return undefined;
}
