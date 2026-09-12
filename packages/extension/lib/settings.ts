import { DEFAULT_THINK_STYLE, type ThinkStyle } from './input/thinkTime';
import { DEFAULT_CLOCK_STYLE, type ClockStyle } from './board/clock';
import { DEFAULT_OFFSET, sanitizeOffset, type OffsetRange } from './dynamicElo';
import { browser } from 'wxt/browser';

/**
 * Kunci storage untuk override depth per engine.
 *
 * `engines.config.json` tetap satu-satunya sumber daftar engine dan nilai bawaannya.
 * Yang disimpan di sini hanya selisihnya: id engine -> depth pilihan pengguna. Engine
 * yang tidak ada di peta ini memakai `defaults` dari berkas config apa adanya, jadi
 * menghapus setelan sama dengan mengembalikannya ke bawaan.
 */
export const DEPTH_KEY = 'engineDepth';

export type DepthOverrides = Record<string, number>;

/** Batas yang masuk akal untuk pencarian di mesin lokal. */
export const DEPTH_MIN = 1;
export const DEPTH_MAX = 30;

function sanitize(value: unknown): DepthOverrides {
  if (typeof value !== 'object' || value === null) return {};
  const out: DepthOverrides = {};
  for (const [id, depth] of Object.entries(value as Record<string, unknown>)) {
    if (typeof depth !== 'number' || !Number.isFinite(depth)) continue;
    const rounded = Math.round(depth);
    if (rounded < DEPTH_MIN || rounded > DEPTH_MAX) continue;
    out[id] = rounded;
  }
  return out;
}

export async function loadDepths(): Promise<DepthOverrides> {
  const stored = await browser.storage.local.get(DEPTH_KEY);
  return sanitize(stored[DEPTH_KEY]);
}

export async function saveDepths(depths: DepthOverrides): Promise<void> {
  await browser.storage.local.set({ [DEPTH_KEY]: sanitize(depths) });
}

/** Ubah nilai mentah dari storage.onChanged jadi peta yang aman dipakai. */
export function readDepthChange(value: unknown): DepthOverrides {
  return sanitize(value);
}

/**
 * Kunci storage untuk rentang jeda mode auto, dalam milidetik.
 *
 * Tidak seperti depth, ini tidak punya bawaan di `engines.config.json` — timing adalah
 * urusan cara ekstensi berperilaku, bukan urusan engine. Jadi nilainya disimpan utuh di
 * sini, dengan bawaan yang sama seperti sebelum setelan ini ada.
 */
export const AUTO_TIMING_KEY = 'autoTiming';

/** Satu rentang waktu acak, dalam milidetik. */
export interface TimingRange {
  /** Total waktu satu langkah, dari hasil engine sampai bidak mendarat. */
  minMs: number;
  maxMs: number;
}

/**
 * Dua anggaran waktu, bukan satu.
 *
 * Bentuknya sengaja meletakkan rentang tenang di tingkat atas, bukan di dalam `quiet`:
 * dengan begitu nilai yang sudah tersimpan dari versi sebelumnya tetap terbaca apa
 * adanya, dan pengguna tidak mendapati jedanya diam-diam kembali ke bawaan setelah
 * ekstensi diperbarui.
 */
export interface AutoTiming extends TimingRange {
  /**
   * Jeda untuk langkah yang memakan bidak.
   *
   * Biasanya lebih pendek: bidak lawan sudah berdiri di kotak tujuan, jadi langkah itu
   * tidak butuh dicari — dan jeda panjang sebelum memakan justru terbaca lebih aneh
   * daripada jeda pendek.
   */
  capture: TimingRange;
}

/** Batas yang masuk akal: di bawah 100 ms tidak lagi menyerupai tangan manusia. */
export const TIMING_MIN_MS = 100;
export const TIMING_MAX_MS = 10_000;
export const TIMING_STEP_MS = 100;

export const DEFAULT_TIMING: AutoTiming = {
  minMs: 500,
  maxMs: 1_500,
  capture: { minMs: 200, maxMs: 700 },
};

function clampMs(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(TIMING_MAX_MS, Math.max(TIMING_MIN_MS, Math.round(value)));
}

/**
 * Nilai yang tersimpan bisa berasal dari versi lama atau tab lain, jadi bentuknya tidak
 * dijamin. Yang penting dijaga adalah min <= max: rentang terbalik akan membuat
 * perhitungan jeda menghasilkan angka negatif, dan langkah dimainkan seketika.
 */
function sanitizeRange(value: unknown, fallback: TimingRange): TimingRange {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const minMs = clampMs(raw.minMs, fallback.minMs);
  const maxMs = clampMs(raw.maxMs, fallback.maxMs);
  return minMs <= maxMs ? { minMs, maxMs } : { minMs: maxMs, maxMs: minMs };
}

export function sanitizeTiming(value: unknown): AutoTiming {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  // Nilai tersimpan dari versi sebelum ada rentang kedua tidak punya `capture` sama
  // sekali; itu bukan nilai rusak, melainkan setelan lama yang lengkap menurut zamannya,
  // jadi bagian yang hilang diisi bawaan dan sisanya dipakai apa adanya.
  return {
    ...sanitizeRange(raw, DEFAULT_TIMING),
    capture: sanitizeRange(raw.capture, DEFAULT_TIMING.capture),
  };
}

export async function loadTiming(): Promise<AutoTiming> {
  const stored = await browser.storage.local.get(AUTO_TIMING_KEY);
  return sanitizeTiming(stored[AUTO_TIMING_KEY]);
}

export async function saveTiming(timing: AutoTiming): Promise<void> {
  await browser.storage.local.set({ [AUTO_TIMING_KEY]: sanitizeTiming(timing) });
}

/**
 * Kunci storage untuk target Elo dan kepribadian per engine.
 *
 * Polanya sama seperti depth: yang disimpan hanya selisih dari `engines.config.json`,
 * id engine -> nilai. Engine tanpa entri memakai `defaultElo`/`defaultPersona` dari
 * berkas config, jadi menghapus setelan berarti kembali ke bawaan.
 *
 * Rentang Elo yang sah berbeda-beda per engine dan datang dari bridge (`strength.min`
 * dan `strength.max`), bukan dari konstanta di sini — Stockfish tidak bisa turun di
 * bawah 1320, sementara Komodo dan Dragon dipetakan ke skala `Skill` yang lain lagi.
 */
export const ELO_KEY = 'engineElo';
export const PERSONA_KEY = 'enginePersona';

export type EloOverrides = Record<string, number>;
export type PersonaOverrides = Record<string, string>;

function sanitizeElo(value: unknown): EloOverrides {
  if (typeof value !== 'object' || value === null) return {};
  const out: EloOverrides = {};
  for (const [id, elo] of Object.entries(value as Record<string, unknown>)) {
    if (typeof elo !== 'number' || !Number.isFinite(elo)) continue;
    out[id] = Math.round(elo);
  }
  return out;
}

function sanitizePersona(value: unknown): PersonaOverrides {
  if (typeof value !== 'object' || value === null) return {};
  const out: PersonaOverrides = {};
  for (const [id, persona] of Object.entries(value as Record<string, unknown>)) {
    if (typeof persona === 'string' && persona.length > 0) out[id] = persona;
  }
  return out;
}

export async function loadElos(): Promise<EloOverrides> {
  const stored = await browser.storage.local.get(ELO_KEY);
  return sanitizeElo(stored[ELO_KEY]);
}

export async function saveElos(elos: EloOverrides): Promise<void> {
  await browser.storage.local.set({ [ELO_KEY]: sanitizeElo(elos) });
}

export async function loadPersonas(): Promise<PersonaOverrides> {
  const stored = await browser.storage.local.get(PERSONA_KEY);
  return sanitizePersona(stored[PERSONA_KEY]);
}

export async function savePersonas(personas: PersonaOverrides): Promise<void> {
  await browser.storage.local.set({ [PERSONA_KEY]: sanitizePersona(personas) });
}

export function readEloChange(value: unknown): EloOverrides {
  return sanitizeElo(value);
}

export function readPersonaChange(value: unknown): PersonaOverrides {
  return sanitizePersona(value);
}

/**
 * Depth hanya bermakna untuk engine pencari. Mode policy (Maia) selalu `go nodes 1`
 * — satu node tidak punya kedalaman untuk diatur — jadi jangan tawarkan setelannya.
 */
export function supportsDepth(kind: string): boolean {
  return kind === 'strength';
}

/**
 * Kunci storage untuk jumlah panah per engine.
 *
 * Angka ini sekaligus jadi `multipv` yang diminta ke engine, bukan sekadar pemotong di
 * sisi tampilan. Meminta lima baris lalu menggambar satu berarti membayar penuh biaya
 * pencarian MultiPV untuk empat baris yang langsung dibuang — dan MultiPV memang tidak
 * gratis: makin banyak baris yang harus dijaga, makin sedikit cabang yang boleh dipangkas
 * engine, jadi tiap barisnya lebih dangkal pada waktu yang sama.
 *
 * Polanya sama seperti depth: yang disimpan cuma selisih dari `engines.config.json`.
 * Engine tanpa entri memakai `defaults.multipv` dari berkas itu.
 */
export const ARROW_COUNT_KEY = 'engineArrows';

export type ArrowOverrides = Record<string, number>;

export const ARROWS_MIN = 1;
/** Di atas ini papan lebih banyak tertutup panah daripada terbaca. */
export const ARROWS_MAX = 5;

function sanitizeArrows(value: unknown): ArrowOverrides {
  if (typeof value !== 'object' || value === null) return {};
  const out: ArrowOverrides = {};
  for (const [id, count] of Object.entries(value as Record<string, unknown>)) {
    if (typeof count !== 'number' || !Number.isFinite(count)) continue;
    const rounded = Math.round(count);
    if (rounded < ARROWS_MIN || rounded > ARROWS_MAX) continue;
    out[id] = rounded;
  }
  return out;
}

export async function loadArrows(): Promise<ArrowOverrides> {
  const stored = await browser.storage.local.get(ARROW_COUNT_KEY);
  return sanitizeArrows(stored[ARROW_COUNT_KEY]);
}

export async function saveArrows(arrows: ArrowOverrides): Promise<void> {
  await browser.storage.local.set({ [ARROW_COUNT_KEY]: sanitizeArrows(arrows) });
}

export function readArrowChange(value: unknown): ArrowOverrides {
  return sanitizeArrows(value);
}

/**
 * Berapa panah yang digambar untuk sebuah engine: pilihan pengguna kalau ada, kalau
 * tidak `defaults.multipv` dari config, kalau tidak juga satu.
 */
export function arrowsFor(
  arrows: ArrowOverrides,
  id: string,
  configMultipv: number | undefined,
): number {
  return arrows[id] ?? configMultipv ?? 1;
}

/**
 * Kunci storage untuk engine yang dimatikan dari halaman pengaturan.
 *
 * Ini saudara dekat `enabled: false` di `engines.config.json`, tapi di sisi ekstensi:
 * di sana engine dimatikan permanen dan bridge tidak pernah menjalankannya, di sini
 * engine yang sudah siap dilewati begitu saja — tidak diminta analisis dan tidak
 * muncul di overlay. Bedanya cuma butuh satu klik untuk dibalik, tanpa menyentuh
 * berkas config dan tanpa restart bridge.
 *
 * Polanya sama seperti setelan lain: yang disimpan hanya selisihnya. Engine tanpa entri
 * dianggap menyala, jadi menghapus setelan berarti kembali ke bawaan (aktif).
 */
export const ENGINE_ENABLED_KEY = 'engineEnabled';

export type EnabledOverrides = Record<string, boolean>;

function sanitizeEnabled(value: unknown): EnabledOverrides {
  if (typeof value !== 'object' || value === null) return {};
  const out: EnabledOverrides = {};
  for (const [id, on] of Object.entries(value as Record<string, unknown>)) {
    if (typeof on === 'boolean') out[id] = on;
  }
  return out;
}

export async function loadEnabled(): Promise<EnabledOverrides> {
  const stored = await browser.storage.local.get(ENGINE_ENABLED_KEY);
  return sanitizeEnabled(stored[ENGINE_ENABLED_KEY]);
}

export async function saveEnabled(enabled: EnabledOverrides): Promise<void> {
  await browser.storage.local.set({ [ENGINE_ENABLED_KEY]: sanitizeEnabled(enabled) });
}

export function readEnabledChange(value: unknown): EnabledOverrides {
  return sanitizeEnabled(value);
}

/** Menyala kecuali dimatikan eksplisit — engine baru langsung ikut tanpa perlu setelan. */
export function engineEnabled(enabled: EnabledOverrides, id: string): boolean {
  return enabled[id] !== false;
}

/**
 * Kunci storage untuk sorotan kotak yang terancam.
 *
 * Tidak seperti setelan di atasnya, ini satu nilai untuk seluruh ekstensi, bukan peta
 * per engine — perhitungannya sama sekali tidak melibatkan engine. Ancaman dibaca dari
 * posisi itu sendiri, jadi ia tidak punya id engine untuk dikaitkan.
 *
 * Bawaannya menyala: hanya `false` eksplisit yang mematikan. Pola yang sama dipakai
 * panel dan panah, dan artinya sama — nilai yang belum pernah ditulis, atau tersisa
 * dari versi lama dalam bentuk yang tak terduga, jatuh ke perilaku bawaan.
 */
export const THREATS_KEY = 'threatHighlight';

export const DEFAULT_THREATS = true;

export function sanitizeThreats(value: unknown): boolean {
  return value !== false;
}

export async function loadThreats(): Promise<boolean> {
  const stored = await browser.storage.local.get(THREATS_KEY);
  return sanitizeThreats(stored[THREATS_KEY]);
}

export async function saveThreats(on: boolean): Promise<void> {
  await browser.storage.local.set({ [THREATS_KEY]: on === true });
}

/**
 * Kunci storage untuk penanda kursor maya.
 *
 * Bawaannya MATI, kebalikan dari setelan tampilan lain di berkas ini. Titik merah yang
 * melayang di atas papan adalah alat pemeriksa, bukan bagian dari cara ekstensi ini
 * dipakai sehari-hari: ia satu-satunya cara melihat jalur yang dipercaya halaman, dan
 * tidak ada gunanya selain untuk itu. Menyalakannya harus jadi keputusan sadar.
 */
export const CURSOR_DOT_KEY = 'cursorDot';

export function sanitizeCursorDot(value: unknown): boolean {
  return value === true;
}

export async function loadCursorDot(): Promise<boolean> {
  const stored = await browser.storage.local.get(CURSOR_DOT_KEY);
  return sanitizeCursorDot(stored[CURSOR_DOT_KEY]);
}

export async function saveCursorDot(on: boolean): Promise<void> {
  await browser.storage.local.set({ [CURSOR_DOT_KEY]: on === true });
}

/**
 * Kunci storage untuk mode Elo dinamis: `{ enabled, minOffset, maxOffset }`.
 *
 * Satu nilai untuk seluruh ekstensi, bukan peta per engine — yang diikuti adalah rating
 * MU, dan itu satu angka berapa pun jumlah engine yang menyala. Yang berbeda per engine
 * hanyalah penjepitannya ke rentang yang didukung engine itu, dan itu dihitung saat
 * permintaan dikirim, bukan disimpan.
 *
 * Mati secara bawaan: menyalakannya mengubah arti slider kekuatan yang sudah kamu atur,
 * dan setelan yang diam-diam melumpuhkan setelan lain harus jadi pilihan sadar.
 */
export const DYNAMIC_ELO_KEY = 'dynamicElo';

export interface DynamicEloSetting extends OffsetRange {
  enabled: boolean;
}

export const DEFAULT_DYNAMIC_ELO: DynamicEloSetting = { enabled: false, ...DEFAULT_OFFSET };

export function sanitizeDynamicElo(value: unknown): DynamicEloSetting {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return { enabled: raw.enabled === true, ...sanitizeOffset(raw) };
}

export async function loadDynamicElo(): Promise<DynamicEloSetting> {
  const stored = await browser.storage.local.get(DYNAMIC_ELO_KEY);
  return sanitizeDynamicElo(stored[DYNAMIC_ELO_KEY]);
}

export async function saveDynamicElo(value: DynamicEloSetting): Promise<void> {
  await browser.storage.local.set({ [DYNAMIC_ELO_KEY]: sanitizeDynamicElo(value) });
}

/**
 * Kunci storage untuk mode "game baru otomatis".
 *
 * Terpisah dari mode auto, bukan menyatu dengannya, karena keduanya dipakai dalam
 * keadaan yang berbeda: mode auto kamu awasi sambil duduk di depan layar, sedangkan yang
 * ini justru gunanya saat kamu tidak mengawasi. Fitur yang dipakai tanpa diawasi harus
 * punya batas yang kamu tentukan di depan — karena itu `maxGames` bukan opsional.
 */
export const AUTO_NEW_GAME_KEY = 'autoNewGame';

export interface AutoNewGameSetting {
  enabled: boolean;
  /** Jeda sebelum tombol diklik, dalam milidetik. */
  minMs: number;
  maxMs: number;
  /**
   * Teks tombol yang boleh diklik, persis seperti yang tertulis di modal.
   *
   * Bukan daftar menit: waktu kontrol chess.com bisa berbentuk apa saja — "New 10 min",
   * "New 10 sec + 0.1", atau custom yang kamu buat sendiri — dan memaksanya jadi angka
   * berarti menutup pintu untuk yang tidak terduga. Yang disimpan di sini adalah teks
   * yang kamu centang dari daftar tombol yang benar-benar pernah muncul di layarmu.
   *
   * Kosong berarti pakai pola bawaan ("New ..."), bukan berarti tidak ada yang boleh.
   */
  labels: string[];
  /** Berhenti sendiri setelah sekian game dalam satu sesi tab. */
  maxGames: number;
}

/** Batas jeda: di bawah 2 detik berarti menekan tombol sebelum hasilnya sempat dibaca. */
export const NEW_GAME_MIN_MS = 2_000;
export const NEW_GAME_MAX_MS = 120_000;

export const MAX_GAMES_MIN = 1;
export const MAX_GAMES_MAX = 100;

/**
 * Kunci storage untuk teks tombol yang pernah terlihat di modal hasil.
 *
 * Bukan setelan melainkan catatan: content script yang mengisinya, halaman pengaturan
 * yang membacanya untuk ditawarkan sebagai pilihan. Dipisah dari setelannya sendiri
 * supaya menulis catatan tidak pernah bisa mengubah apa yang kamu pilih.
 */
export const NEW_GAME_SEEN_KEY = 'newGameSeenLabels';

/** Batas jumlah teks yang diingat. Cukup untuk beberapa bentuk modal, tidak menumpuk. */
export const SEEN_LIMIT = 24;

export function sanitizeSeen(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const texts = value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 60,
  );
  return [...new Set(texts)].slice(-SEEN_LIMIT);
}

export async function loadSeenLabels(): Promise<string[]> {
  const stored = await browser.storage.local.get(NEW_GAME_SEEN_KEY);
  return sanitizeSeen(stored[NEW_GAME_SEEN_KEY]);
}

/**
 * Catat teks tombol yang baru terlihat.
 *
 * Yang sudah ada tidak ditulis ulang: penulisan ke storage memicu `onChanged` di semua
 * tab, dan modal yang terbuka beberapa detik akan mengirimkan kejutan itu tiap denyut.
 */
export async function rememberSeenLabels(labels: string[]): Promise<void> {
  const known = await loadSeenLabels();
  const merged = sanitizeSeen([...known, ...labels]);
  if (merged.length === known.length && merged.every((text, i) => text === known[i])) return;
  await browser.storage.local.set({ [NEW_GAME_SEEN_KEY]: merged });
}

export const DEFAULT_AUTO_NEW_GAME: AutoNewGameSetting = {
  enabled: false,
  minMs: 6_000,
  maxMs: 25_000,
  labels: [],
  maxGames: 10,
};

export function sanitizeAutoNewGame(value: unknown): AutoNewGameSetting {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const clamp = (input: unknown, fallback: number, min: number, max: number): number => {
    if (typeof input !== 'number' || !Number.isFinite(input)) return fallback;
    return Math.min(max, Math.max(min, Math.round(input)));
  };

  const minMs = clamp(raw.minMs, DEFAULT_AUTO_NEW_GAME.minMs, NEW_GAME_MIN_MS, NEW_GAME_MAX_MS);
  const maxMs = clamp(raw.maxMs, DEFAULT_AUTO_NEW_GAME.maxMs, NEW_GAME_MIN_MS, NEW_GAME_MAX_MS);
  return {
    enabled: raw.enabled === true,
    minMs: Math.min(minMs, maxMs),
    maxMs: Math.max(minMs, maxMs),
    labels: sanitizeSeen(raw.labels),
    maxGames: clamp(raw.maxGames, DEFAULT_AUTO_NEW_GAME.maxGames, MAX_GAMES_MIN, MAX_GAMES_MAX),
  };
}

export async function loadAutoNewGame(): Promise<AutoNewGameSetting> {
  const stored = await browser.storage.local.get(AUTO_NEW_GAME_KEY);
  return sanitizeAutoNewGame(stored[AUTO_NEW_GAME_KEY]);
}

export async function saveAutoNewGame(value: AutoNewGameSetting): Promise<void> {
  await browser.storage.local.set({ [AUTO_NEW_GAME_KEY]: sanitizeAutoNewGame(value) });
}

/** Buang catatan tombol yang pernah terlihat. */
export async function clearSeenLabels(): Promise<void> {
  await browser.storage.local.set({ [NEW_GAME_SEEN_KEY]: [] });
}

/**
 * Kunci storage untuk gaya berpikir: waktu yang mengikuti posisi, dan kesadaran jam.
 *
 * Keduanya disimpan bersama karena keduanya mengubah hal yang sama — lama jeda mode auto
 * — dan memisahnya berarti dua tempat yang harus dibaca untuk menjawab "kenapa langkah
 * ini cepat sekali".
 */
export const THINK_STYLE_KEY = 'thinkStyle';

export interface ThinkSetting {
  think: ThinkStyle;
  clock: ClockStyle;
}

export const DEFAULT_THINK_SETTING: ThinkSetting = {
  think: DEFAULT_THINK_STYLE,
  clock: DEFAULT_CLOCK_STYLE,
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function sanitizeThinkSetting(value: unknown): ThinkSetting {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const think =
    typeof raw.think === 'object' && raw.think !== null
      ? (raw.think as Record<string, unknown>)
      : {};
  const clock =
    typeof raw.clock === 'object' && raw.clock !== null
      ? (raw.clock as Record<string, unknown>)
      : {};

  // `easy` dijaga tidak melebihi `hard`: kalau terbalik, penjepitan di `thinkFactor`
  // akan saling bertabrakan dan hasilnya jeda yang tidak mengikuti aturan mana pun.
  const easy = clampNumber(think.easy, DEFAULT_THINK_STYLE.easy, 0.1, 1);
  const hard = clampNumber(think.hard, DEFAULT_THINK_STYLE.hard, 1, 5);

  return {
    think: {
      enabled: think.enabled !== false,
      easy: Math.min(easy, hard),
      hard: Math.max(easy, hard),
      openingPlies: Math.round(
        clampNumber(think.openingPlies, DEFAULT_THINK_STYLE.openingPlies, 0, 40),
      ),
    },
    clock: {
      enabled: clock.enabled !== false,
      panicSeconds: Math.round(
        clampNumber(clock.panicSeconds, DEFAULT_CLOCK_STYLE.panicSeconds, 5, 300),
      ),
      panicFactor: clampNumber(clock.panicFactor, DEFAULT_CLOCK_STYLE.panicFactor, 0.05, 1),
      maxShare: clampNumber(clock.maxShare, DEFAULT_CLOCK_STYLE.maxShare, 0.01, 0.5),
    },
  };
}

export async function loadThinkSetting(): Promise<ThinkSetting> {
  const stored = await browser.storage.local.get(THINK_STYLE_KEY);
  return sanitizeThinkSetting(stored[THINK_STYLE_KEY]);
}

export async function saveThinkSetting(value: ThinkSetting): Promise<void> {
  await browser.storage.local.set({ [THINK_STYLE_KEY]: sanitizeThinkSetting(value) });
}
