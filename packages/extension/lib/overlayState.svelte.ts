import type { AnalysisResult, Suggestion } from '@cmr/shared';

export type OverlayStatus = 'idle' | 'thinking' | 'ready' | 'offline' | 'blocked';

export interface ProviderView {
  label: string;
  /** Warna panah dan penanda di panel. */
  color: string;
  /** 'strength' menampilkan centipawn, 'human-like' menampilkan persentase policy. */
  kind: 'strength' | 'human-like';
  /**
   * Panahnya digambar atau tidak. Ini murni soal tampilan — analisisnya tetap jalan
   * dan angkanya tetap muncul di panel, supaya mematikan panah tidak diam-diam
   * menyembunyikan informasi. Untuk benar-benar menghemat CPU, matikan engine-nya
   * di engines.config.json.
   */
  arrowVisible: boolean;
  suggestions: Suggestion[];
  depth?: number;
  status: OverlayStatus;
}

/**
 * State bersama antara content script dan komponen overlay.
 * Runes bisa dipakai di file `.svelte.ts`, jadi tidak perlu library state terpisah.
 */
export const overlay = $state({
  visible: true,
  orientation: 'white' as 'white' | 'black',

  /**
   * Kotak papan dalam koordinat viewport. Overlay memposisikan dirinya sendiri dari sini
   * alih-alih menumpang ukuran shadow host — host-nya tidak pernah punya ukuran, dan
   * itu membuat SVG meregang sepenuh layar.
   */
  rect: { left: 0, top: 0, width: 0, height: 0 },

  /** Hasil per provider, supaya Stockfish dan Maia tampil berdampingan. */
  providers: {} as Record<string, ProviderView>,

  /** true kalau giliran berhasil dibaca dari sorotan, bukan ditebak. */
  turnKnown: true,
  assumptions: [] as string[],
  note: '' as string,
});

export function registerProvider(
  id: string,
  label: string,
  kind: ProviderView['kind'],
  color: string,
  arrowVisible = true,
): void {
  overlay.providers[id] = { label, kind, color, arrowVisible, suggestions: [], status: 'idle' };
}

/**
 * Dipasang content script untuk menyimpan pilihan panah ke storage. Dipisah begini
 * supaya file state ini tetap bisa diuji tanpa API browser.
 */
let persistArrows: ((visibleIds: string[]) => void) | undefined;

export function onArrowsChanged(fn: (visibleIds: string[]) => void): void {
  persistArrows = fn;
}

export function toggleArrow(id: string): void {
  const view = overlay.providers[id];
  if (!view) return;
  view.arrowVisible = !view.arrowVisible;
  persistArrows?.(
    Object.entries(overlay.providers)
      .filter(([, v]) => v.arrowVisible)
      .map(([key]) => key),
  );
}

/**
 * Hasil `partial` dari Stockfish datang puluhan kali per detik. Tanpa throttle, panel
 * dan panah akan patah-patah — jadi commit ke state paling sering 10x per detik.
 */
const COMMIT_INTERVAL_MS = 100;
const pending = new Map<string, AnalysisResult>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function applyResult(result: AnalysisResult, final: boolean): void {
  const id = result.providerId;
  pending.set(id, result);
  if (final) {
    flush(id);
    return;
  }
  if (!timers.has(id)) timers.set(id, setTimeout(() => flush(id), COMMIT_INTERVAL_MS));
}

function flush(id: string): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);

  const result = pending.get(id);
  pending.delete(id);
  const view = overlay.providers[id];
  if (!result || !view) return;

  view.suggestions = result.suggestions;
  view.depth = result.depth;
  view.status = 'ready';
}

export function markThinking(): void {
  for (const [id, timer] of timers) {
    clearTimeout(timer);
    timers.delete(id);
    pending.delete(id);
  }
  for (const view of Object.values(overlay.providers)) {
    view.suggestions = [];
    view.depth = undefined;
    view.status = 'thinking';
  }
  overlay.note = '';
}

export function markProblem(status: OverlayStatus, note = ''): void {
  for (const view of Object.values(overlay.providers)) {
    view.suggestions = [];
    view.depth = undefined;
    view.status = status;
  }
  overlay.note = note;
}
