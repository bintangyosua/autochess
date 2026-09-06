import type { AnalysisResult, Suggestion } from '@cmr/shared';

export type OverlayStatus = 'idle' | 'thinking' | 'ready' | 'offline' | 'blocked';

/**
 * State bersama antara content script dan komponen overlay.
 * Runes bisa dipakai di file `.svelte.ts`, jadi tidak perlu library state terpisah.
 */
export const overlay = $state({
  visible: true,
  status: 'idle' as OverlayStatus,
  orientation: 'white' as 'white' | 'black',
  suggestions: [] as Suggestion[],
  depth: undefined as number | undefined,
  /**
   * Kotak papan dalam koordinat viewport. Overlay memposisikan dirinya sendiri dari sini
   * alih-alih menumpang ukuran shadow host — host-nya tidak pernah punya ukuran, dan
   * itu membuat SVG meregang sepenuh layar.
   */
  rect: { left: 0, top: 0, width: 0, height: 0 },
  /** true kalau giliran berhasil dibaca dari sorotan, bukan ditebak. */
  turnKnown: true,
  /** Field FEN yang ditebak karena riwayat belum terbaca. */
  assumptions: [] as string[],
  note: '' as string,
});

/**
 * Hasil `partial` datang puluhan kali per detik. Tanpa throttle, panel dan panah
 * akan patah-patah — jadi commit ke state paling sering 10x per detik.
 */
const COMMIT_INTERVAL_MS = 100;
let pending: AnalysisResult | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

export function applyResult(result: AnalysisResult, final: boolean): void {
  pending = result;
  if (final) {
    flush();
    return;
  }
  timer ??= setTimeout(flush, COMMIT_INTERVAL_MS);
}

function flush(): void {
  clearTimeout(timer);
  timer = undefined;
  if (!pending) return;
  overlay.suggestions = pending.suggestions;
  overlay.depth = pending.depth;
  overlay.status = 'ready';
  pending = undefined;
}

export function clearSuggestions(status: OverlayStatus, note = ''): void {
  clearTimeout(timer);
  timer = undefined;
  pending = undefined;
  overlay.suggestions = [];
  overlay.depth = undefined;
  overlay.status = status;
  overlay.note = note;
}
