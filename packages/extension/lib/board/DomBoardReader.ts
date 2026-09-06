import { PIECE_SELECTOR, findBoard, readHighlights, readOrientation } from './selectors';
import { parsePieceClasses, type BoardParseResult } from './parsePieces';
import { buildFenFromDom, type Highlight } from './inferState';

export interface BoardSnapshot extends BoardParseResult {
  /** Orientasi tampilan saja; tidak mempengaruhi fen. */
  orientation: 'white' | 'black';
  highlights: Highlight[];
  /** FEN utuh 6 field. Kosong kalau susunan bidak belum konsisten. */
  fen?: string;
  /** Field FEN yang terpaksa ditebak karena riwayat belum dibaca. */
  assumptions: string[];
  /** false kalau giliran hanya tebakan. */
  turnKnown: boolean;
}

export function readBoard(root: ParentNode = document): BoardSnapshot | undefined {
  const board = findBoard(root);
  if (!board) return undefined;

  const classLists = [...board.querySelectorAll(PIECE_SELECTOR)].map((el) => [...el.classList]);
  const parsed = parsePieceClasses(classLists);
  const highlights = readHighlights(board);
  const orientation = readOrientation(board);

  if (!parsed.fenBoard) return { ...parsed, orientation, highlights, assumptions: [], turnKnown: false };

  const { fen, assumptions, turnKnown } = buildFenFromDom(parsed.pieces, highlights);
  return { ...parsed, orientation, highlights, fen, assumptions, turnKnown };
}

export interface WatchOptions {
  /** Tunggu sejenak setelah perubahan terakhir; animasi chess.com memicu banyak mutasi. */
  debounceMs?: number;
  /**
   * Batas atas penundaan. Debounce murni bisa kelaparan: selama mutasi terus datang
   * dengan jeda di bawah `debounceMs` — jam yang berjalan, iklan, animasi panel —
   * timer-nya di-reset terus dan pembacaan tidak pernah jalan. Setelah tenggat ini
   * terlampaui, baca paksa.
   */
  maxWaitMs?: number;
  /**
   * Jaring pengaman terakhir: baca ulang berkala walau tidak ada mutasi yang terpantau.
   * Pembacaan yang posisinya sama berhenti di dedupe fen, jadi ini murah.
   */
  pollMs?: number;
  onChange: (snapshot: BoardSnapshot) => void;
  onBoardMissing?: () => void;
}

/**
 * Pantau papan dan panggil `onChange` hanya saat posisinya benar-benar berubah.
 * Mengembalikan fungsi untuk berhenti memantau.
 */
export function watchBoard(options: WatchOptions): () => void {
  const { debounceMs = 120, maxWaitMs = 600, pollMs = 1_000, onChange, onBoardMissing } = options;
  let lastFen: string | undefined;
  let missingReported = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Kapan rentetan mutasi yang sedang ditunda ini dimulai; undefined = tidak ada. */
  let pendingSince: number | undefined;

  const evaluate = () => {
    clearTimeout(timer);
    pendingSince = undefined;
    const snapshot = readBoard();
    if (!snapshot) {
      if (!missingReported) {
        missingReported = true;
        onBoardMissing?.();
      }
      return;
    }
    missingReported = false;

    // Selama papan belum konsisten (bidak sedang di-drag, animasi belum selesai)
    // fen sengaja kosong — jangan kirim apa pun ke engine.
    if (!snapshot.fen || snapshot.fen === lastFen) return;
    lastFen = snapshot.fen;
    onChange(snapshot);
  };

  const schedule = () => {
    const now = Date.now();
    if (pendingSince === undefined) pendingSince = now;
    else if (now - pendingSince >= maxWaitMs) {
      evaluate();
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(evaluate, debounceMs);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  const poll = setInterval(evaluate, pollMs);
  schedule();

  return () => {
    clearTimeout(timer);
    clearInterval(poll);
    observer.disconnect();
  };
}
