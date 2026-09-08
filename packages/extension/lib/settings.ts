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

export interface AutoTiming {
  /** Total waktu satu langkah, dari hasil engine sampai bidak mendarat. */
  minMs: number;
  maxMs: number;
}

/** Batas yang masuk akal: di bawah 100 ms tidak lagi menyerupai tangan manusia. */
export const TIMING_MIN_MS = 100;
export const TIMING_MAX_MS = 10_000;
export const TIMING_STEP_MS = 100;

export const DEFAULT_TIMING: AutoTiming = { minMs: 500, maxMs: 1_500 };

function clampMs(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(TIMING_MAX_MS, Math.max(TIMING_MIN_MS, Math.round(value)));
}

/**
 * Nilai yang tersimpan bisa berasal dari versi lama atau tab lain, jadi bentuknya tidak
 * dijamin. Yang penting dijaga adalah min <= max: rentang terbalik akan membuat
 * perhitungan jeda menghasilkan angka negatif, dan langkah dimainkan seketika.
 */
export function sanitizeTiming(value: unknown): AutoTiming {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const minMs = clampMs(raw.minMs, DEFAULT_TIMING.minMs);
  const maxMs = clampMs(raw.maxMs, DEFAULT_TIMING.maxMs);
  return minMs <= maxMs ? { minMs, maxMs } : { minMs: maxMs, maxMs: minMs };
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
