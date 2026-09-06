/**
 * Semua ketergantungan pada DOM chess.com dikumpulkan di sini.
 * Kalau ekstensi tiba-tiba berhenti membaca papan, file inilah yang pertama dicurigai.
 */

/** Elemen papan. Chess.com memakai custom element; `.board` dipakai di layout lama. */
export const BOARD_SELECTORS = ['wc-chess-board', 'chess-board', '.board'] as const;

/**
 * Bidak. Harus dipersempit ke `.piece` — elemen highlight, panah, dan hint
 * juga memakai kelas `square-XY` yang sama.
 */
export const PIECE_SELECTOR = '.piece';

/** Papan dibalik (pemain bermain sebagai hitam). */
export const FLIPPED_CLASS = 'flipped';

/**
 * Kotak asal dan tujuan langkah terakhir (yang disorot kuning). Ini sumber satu-satunya
 * untuk menyimpulkan giliran selama move list belum terbaca.
 */
export const HIGHLIGHT_SELECTOR = '.highlight';

const SQUARE_CLASS = /^square-([1-8])([1-8])$/;

export function readHighlights(board: Element): { file: number; rank: number }[] {
  const squares: { file: number; rank: number }[] = [];
  for (const el of board.querySelectorAll(HIGHLIGHT_SELECTOR)) {
    for (const name of el.classList) {
      const match = SQUARE_CLASS.exec(name);
      if (match) squares.push({ file: Number(match[1]), rank: Number(match[2]) });
    }
  }
  return squares;
}

export function findBoard(root: ParentNode = document): Element | undefined {
  for (const selector of BOARD_SELECTORS) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return undefined;
}

/**
 * Orientasi tampilan. Ini TIDAK mempengaruhi `square-XY` — koordinat di kelas selalu
 * absolut (1=a..8=h, 1..8 dari sisi putih). Orientasi hanya dipakai saat menggambar
 * overlay di atas papan.
 */
export function readOrientation(board: Element): 'white' | 'black' {
  return board.classList.contains(FLIPPED_CLASS) ? 'black' : 'white';
}
