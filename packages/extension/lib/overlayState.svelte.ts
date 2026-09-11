import type { AnalysisResult, ProviderInfo, Suggestion } from '@cmr/shared';

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
  /**
   * Berapa langkah teratas yang digambar sebagai panah.
   *
   * Ini juga `multipv` yang diminta ke engine, jadi `suggestions` biasanya sudah persis
   * sepanjang ini. Pemotongan tetap dilakukan saat menggambar karena hasil yang sedang
   * streaming bisa memuat sisa dari permintaan sebelumnya yang angkanya berbeda.
   */
  arrowCount: number;
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
   * Panel angka di pojok papan. Ini murni tampilan — analisisnya tetap jalan dan panah
   * tetap digambar saat panel disembunyikan, jadi mematikannya tidak mengubah apa pun
   * selain seberapa banyak papan yang tertutup.
   */
  panelVisible: true,

  /**
   * Panel daftar rekomendasi di luar papan.
   *
   * Terpisah dari `panelVisible` dan bukan kembarannya: yang di dalam papan menutupi
   * kotak sehingga sering ditutup di tengah permainan, sedangkan yang ini justru dipakai
   * untuk mengklik langkah. Menjadikannya satu tombol berarti menutup salah satunya
   * memaksa menutup yang lain.
   */
  movesPanelVisible: true,

  /**
   * Sorotan kotak untuk bidak sendiri yang terancam.
   *
   * Berdiri sendiri dari panah dan panel karena sumbernya juga berbeda: sorotan ini
   * dihitung dari posisi, tanpa engine sama sekali. Mematikannya tidak menghemat apa
   * pun di sisi engine — yang dihemat cuma kotak yang tertutup warna.
   */
  threatsVisible: true,

  /**
   * Umpan balik untuk langkah yang diklik dari daftar: nama langkahnya kalau berhasil,
   * atau alasannya kalau tidak. Mengklik lalu tidak terjadi apa-apa adalah kegagalan
   * yang paling membingungkan, jadi selalu ada yang dikatakan.
   */
  manualPlay: {
    message: '',
  },

  /**
   * Kotak papan dalam koordinat viewport. Overlay memposisikan dirinya sendiri dari sini
   * alih-alih menumpang ukuran shadow host — host-nya tidak pernah punya ukuran, dan
   * itu membuat SVG meregang sepenuh layar.
   */
  rect: { left: 0, top: 0, width: 0, height: 0 },

  /** Hasil per provider, supaya Stockfish dan Maia tampil berdampingan. */
  providers: {} as Record<string, ProviderView>,

  /** FEN pembacaan terakhir yang diterima; acuan mode auto. */
  fen: undefined as string | undefined,

  /**
   * Mode auto: langkah terbaik dimainkan sendiri saat giliranmu.
   *
   * `providerId` menentukan engine mana yang dituruti — panel bisa menampilkan tiga
   * engine sekaligus dan mereka sering tidak sepakat, jadi "langkah terbaik" tidak
   * punya arti sampai satu engine dipilih. Kosong berarti belum dipilih dan yang
   * pertama siap yang dipakai.
   */
  autoPlay: {
    enabled: false,
    providerId: '' as string,
    /** Langkah yang sedang menunggu jeda, untuk ditampilkan di panel. */
    message: '',
  },

  /** true kalau giliran berhasil dibaca dari sorotan, bukan ditebak. */
  turnKnown: true,
  assumptions: [] as string[],
  note: '' as string,
});

/**
 * Terapkan jumlah panah pilihan pengguna.
 *
 * Dipisah dari `syncProviders` karena sumbernya berbeda dan berubah pada waktu yang
 * berbeda: daftar provider datang dari bridge, sedangkan angka ini dari storage — dan
 * mengubahnya di halaman pengaturan tidak boleh menunggu bridge mengirim apa pun.
 */
export function applyArrowCounts(counts: Record<string, number>, fallback: (id: string) => number): void {
  for (const [id, view] of Object.entries(overlay.providers)) {
    view.arrowCount = counts[id] ?? fallback(id);
  }
}

/**
 * Selaraskan daftar provider dengan yang dilaporkan bridge.
 *
 * Daftar engine tidak lagi ditulis di ekstensi — semuanya berasal dari
 * `engines.config.json`. Provider yang sudah ada dipertahankan beserta hasil dan
 * pilihan panahnya, supaya reconnect ke bridge tidak mengosongkan panel.
 */
export function syncProviders(
  infos: readonly ProviderInfo[],
  isArrowVisible: (id: string) => boolean,
): void {
  for (const id of Object.keys(overlay.providers)) {
    if (!infos.some((info) => info.id === id)) delete overlay.providers[id];
  }

  for (const info of infos) {
    const existing = overlay.providers[info.id];
    const color = info.color ?? (info.kind === 'human-like' ? '#ea7317' : '#2563eb');
    if (existing) {
      existing.label = info.label;
      existing.kind = info.kind;
      existing.color = color;
      continue;
    }
    overlay.providers[info.id] = {
      label: info.label,
      kind: info.kind,
      color,
      arrowVisible: isArrowVisible(info.id),
      arrowCount: info.defaults?.multipv ?? 1,
      suggestions: [],
      status: 'idle',
    };
  }
}

/**
 * Dipasang content script untuk menyimpan pilihan panah ke storage. Dipisah begini
 * supaya file state ini tetap bisa diuji tanpa API browser.
 */
let persistArrows: ((visibleIds: string[]) => void) | undefined;

export function onArrowsChanged(fn: (visibleIds: string[]) => void): void {
  persistArrows = fn;
}

let persistPanel: ((visible: boolean) => void) | undefined;

export function onPanelChanged(fn: (visible: boolean) => void): void {
  persistPanel = fn;
}

export function togglePanel(): void {
  overlay.panelVisible = !overlay.panelVisible;
  persistPanel?.(overlay.panelVisible);
}

let persistMovesPanel: ((visible: boolean) => void) | undefined;

export function onMovesPanelChanged(fn: (visible: boolean) => void): void {
  persistMovesPanel = fn;
}

export function toggleMovesPanel(): void {
  overlay.movesPanelVisible = !overlay.movesPanelVisible;
  persistMovesPanel?.(overlay.movesPanelVisible);
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

let persistAutoPlay: ((state: { enabled: boolean; providerId: string }) => void) | undefined;

export function onAutoPlayChanged(
  fn: (state: { enabled: boolean; providerId: string }) => void,
): void {
  persistAutoPlay = fn;
}

function saveAutoPlay(): void {
  persistAutoPlay?.({
    enabled: overlay.autoPlay.enabled,
    providerId: overlay.autoPlay.providerId,
  });
}

export function toggleAutoPlay(): void {
  overlay.autoPlay.enabled = !overlay.autoPlay.enabled;
  overlay.autoPlay.message = '';
  saveAutoPlay();
}

export function setAutoPlayProvider(id: string): void {
  overlay.autoPlay.providerId = id;
  overlay.autoPlay.message = '';
  saveAutoPlay();
}

/**
 * Engine yang benar-benar dituruti mode auto. Pilihan yang menunjuk engine yang sudah
 * tidak ada (config berubah, engine dimatikan) jatuh ke engine pertama alih-alih diam
 * tanpa penjelasan.
 */
export function autoPlayProviderId(): string | undefined {
  const ids = Object.keys(overlay.providers);
  const chosen = overlay.autoPlay.providerId;
  if (chosen && ids.includes(chosen)) return chosen;
  return ids[0];
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

/**
 * Tandai engine sedang berpikir. Tanpa `only`, seluruh papan direset — itu yang dipakai
 * saat posisi berubah. Dengan `only`, cuma satu engine yang ditandai: engine yang baru
 * dinyalakan di tengah giliran ikut menghitung posisi yang sama, dan hasil engine lain
 * yang sudah tergambar tidak ada alasan untuk dihapus.
 */
export function markThinking(only?: string): void {
  for (const [id, timer] of timers) {
    if (only !== undefined && id !== only) continue;
    clearTimeout(timer);
    timers.delete(id);
    pending.delete(id);
  }
  for (const [id, view] of Object.entries(overlay.providers)) {
    if (only !== undefined && id !== only) continue;
    view.suggestions = [];
    view.depth = undefined;
    view.status = 'thinking';
  }
  if (only === undefined) overlay.note = '';
}

export function markProblem(status: OverlayStatus, note = ''): void {
  for (const view of Object.values(overlay.providers)) {
    view.suggestions = [];
    view.depth = undefined;
    view.status = status;
  }
  overlay.note = note;
}
