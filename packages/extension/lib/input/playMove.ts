import { debug, warn } from '../log';
import { findBoard, readOrientation } from '../board/selectors';
import { cancelGlide, glide } from './cursor';
import { randomPointIn } from './path';
import { send, withoutPointerCapture, type Point } from './mouse';

/**
 * Mainkan langkah di papan chess.com dengan menggerakkan tetikus seperti pengguna.
 *
 * Kenapa tetikus dan bukan API internal papan: `wc-chess-board` memang punya objek game
 * di dalamnya, tapi bentuknya tidak stabil antar rilis dan tidak bisa disentuh dari
 * dunia content script (isolated world) tanpa menyuntik skrip ke halaman. Tetikus adalah
 * jalur yang sama persis dengan yang dipakai manusia: apa pun yang berlaku untuk
 * pemain — giliran, langkah ilegal, premove — berlaku sama untuk kita, dan tidak ada
 * keadaan internal yang bisa jadi tidak sinkron.
 *
 * Chess.com mendukung klik-asal lalu klik-tujuan, jadi dua ketukan sudah cukup dan
 * tidak perlu meniru seluruh gerakan drag. Jeda di antara keduanya ditentukan pemanggil
 * (`clickDelayMs`) karena ia harus muat di dalam anggaran waktu satu langkah utuh.
 *
 * Ketukannya tidak muncul begitu saja di kotak tujuan: kursor maya benar-benar berjalan
 * ke sana lebih dulu (lihat `cursor.ts`), dan mendarat di titik acak di dalam kotak,
 * bukan tepat di pusatnya. Dua klik yang muncul dari ketiadaan pada koordinat yang
 * presisi sempurna adalah pola yang tidak pernah dihasilkan tangan manusia.
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
  point: Point,
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
export function squarePoint(board: Element, square: string): Point {
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
 * Bidak apa yang berdiri di sebuah kotak, dalam kode chess.com ("wp", "bq"), atau
 * `undefined` kalau kotaknya kosong.
 *
 * Dibaca dari kelas elemennya, sumber yang sama dengan pembaca papan — bukan dari FEN
 * hasil tebakan kita, supaya keputusan yang bergantung padanya tidak ikut salah kalau
 * rantai langkah sedang meleset.
 */
export function pieceAt(board: Element, square: string): string | undefined {
  const piece = board.querySelector(`.piece.${squareClass(square)}`);
  if (!piece) return undefined;
  return Array.from(piece.classList).find((name) => /^[wb][kqrbnp]$/.test(name));
}

/** Panjang sisi satu kotak papan — dasar ukuran kotak acak untuk titik klik. */
export function squareSize(board: Element): number {
  return board.getBoundingClientRect().width / 8;
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
function targetAt(board: Element, point: Point): Element {
  const found = document.elementFromPoint(point.x, point.y);
  return found && board.contains(found) ? found : board;
}

/**
 * Tekan lalu lepas di satu titik.
 *
 * Perjalanan menuju titik ini sudah dilakukan `glide` sebelum pemanggilan, jadi di sini
 * tinggal satu pointermove sebagai penegasan posisi — beberapa penangan membaca posisi
 * terakhir yang dilaporkan, bukan posisi di event pointerdown — lalu ketukannya.
 */
function tap(board: Element, point: Point): void {
  const target = targetAt(board, point);
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
function press(board: Element, point: Point): void {
  const target = targetAt(board, point);
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
function release(board: Element, point: Point): void {
  const dropTarget = targetAt(board, point);
  withoutPointerCapture(() => {
    send(dropTarget, 'pointerup', point, 0);
    send(dropTarget, 'mouseup', point, 0);
    send(document.documentElement, 'pointerup', point, 0);
    send(document.documentElement, 'mouseup', point, 0);
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
 * Bagian dari jeda antar-klik yang dipakai untuk mendekati kotak asal.
 *
 * Sisanya untuk perjalanan dari kotak asal ke kotak tujuan. Perjalanan kedua dapat porsi
 * lebih besar karena biasanya lebih jauh — dan karena bagian itulah yang terlihat
 * sebagai "memindahkan bidak".
 */
const APPROACH_SHARE = 0.35;

/**
 * Mainkan satu langkah. Mengembalikan `undefined` kalau langkahnya berhasil dimulai —
 * sisanya berjalan asinkron sementara kursor berjalan, jadi nilai kembalinya menandai
 * langkah yang sudah dimulai, bukan yang sudah selesai: kalau papan menolak (bukan
 * giliranmu, papan hanya-baca), tidak ada yang berubah dan pembaca papan tetap
 * melaporkan posisi lama.
 */
export function playMove(
  move: { from: string; to: string; promotion?: string },
  options: { clickDelayMs: number; style?: 'click' | 'drag' },
): PlayFailure | undefined {
  const board = findBoard();
  if (!board) return { error: 'papan tidak ditemukan' };

  const rect = board.getBoundingClientRect();
  if (rect.width === 0) return { error: 'papan belum punya ukuran' };

  // Bidak yang mau digerakkan harus benar-benar ada di kotak asal. Kalau tidak, yang
  // salah adalah posisi yang terbaca, bukan kliknya — dan mengklik kotak kosong lalu
  // kotak lain bisa memainkan langkah yang sama sekali tidak dimaksud.
  if (!board.querySelector(`.piece.${squareClass(move.from)}`)) {
    return { error: `tidak ada bidak di ${move.from}` };
  }

  const style = options.style ?? 'click';
  const raw = squarePoint(board, move.from);
  const offset = pointOffset(board, move.from, raw);
  if (Math.abs(offset.dx) > 2 || Math.abs(offset.dy) > 2) {
    warn(
      `[cmr] koordinat digeser ${offset.dx.toFixed(1)},${offset.dy.toFixed(1)}px ` +
        'agar pas ke bidaknya',
    );
  }
  // Titik klik diacak di dalam kotak dulu, baru digeser dengan koreksi geometri, supaya
  // sebaran acaknya tetap terhitung relatif terhadap kotaknya.
  const fromPoint = randomPointIn({ x: raw.x + offset.dx, y: raw.y + offset.dy }, squareSize(board));

  debug(`[cmr] ${style} ${move.from}->${move.to}`);

  const approachMs = options.clickDelayMs * APPROACH_SHARE;
  const transferMs = options.clickDelayMs - approachMs;

  void (async () => {
    // Perjalanan mendekati bidak. Kalau dibatalkan di tengah — gerak menganggur atau
    // langkah lain mengambil alih kursor — jangan mengklik dari posisi yang tidak
    // pernah sampai.
    if (!(await glide(fromPoint, { durationMs: approachMs }))) return;

    if (style === 'click') tap(board, fromPoint);
    else press(board, fromPoint);

    // Titik tujuan dihitung setelah perjalanan pertama, bukan di awal: dalam ratusan
    // milidetik itu halaman bisa bergulir atau papan berubah ukuran, dan koordinat lama
    // akan meleset ke kotak yang salah.
    const live = findBoard();
    if (!live) return;
    const toRaw = squarePoint(live, move.to);
    const toPoint = randomPointIn(
      { x: toRaw.x + offset.dx, y: toRaw.y + offset.dy },
      squareSize(live),
    );

    // Saat menyeret, event gerak dikirim ke document: begitu bidak terangkat, elemen di
    // bawah kursor berubah, dan penangan drag mendengarkan di level document persis
    // karena alasan itu.
    const arrived = await glide(toPoint, {
      durationMs: transferMs,
      buttons: style === 'drag' ? 1 : 0,
      target: style === 'drag' ? document.documentElement : undefined,
    });
    // Seretan yang dibatalkan tetap harus dilepas tombolnya; kalau tidak, halaman
    // ditinggal dalam keadaan bidak terangkat selamanya.
    if (!arrived && style === 'click') return;

    if (style === 'click') tap(live, toPoint);
    else release(live, toPoint);

    // Jendela promosi baru muncul setelah kotak tujuan diklik, dan tidak selalu di
    // frame yang sama — jadi coba beberapa kali sebentar sebelum menyerah.
    if (move.promotion) {
      let tries = 0;
      const timer = setInterval(() => {
        if (pickPromotion(move.promotion!) || ++tries > 20) clearInterval(timer);
      }, 25);
    }
  })();

  return undefined;
}

/** Hentikan gerak kursor yang sedang berjalan — dipakai sebelum langkah sungguhan. */
export { cancelGlide };
