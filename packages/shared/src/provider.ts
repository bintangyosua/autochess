/** Kontrak provider engine. Dipakai bridge (implementasi) dan ekstensi (tipe saja). */

export type ProviderKind = 'strength' | 'human-like';

export interface AnalysisRequest {
  fen: string;
  /**
   * Posisi jangkar untuk rantai langkah di `moves`, kalau riwayatnya diketahui.
   *
   * Engine yang cuma diberi `position fen` tidak punya riwayat, jadi ia tidak bisa
   * melihat pengulangan posisi sama sekali — bisa menyarankan langkah yang justru
   * menyerahkan remis, atau melewatkan pengulangan sebagai penyelamat di posisi kalah.
   * Rantai ini yang mengembalikan penglihatan itu.
   */
  startFen?: string;
  /** Langkah UCI dari `startFen` sampai `fen`. Hanya sah bersama `startFen`. */
  moves?: string[];
  movetimeMs?: number;
  depth?: number;
  nodes?: number;
  multipv?: number;
  /** Target Elo pilihan pengguna; diterjemahkan provider sesuai `StrengthSpec` engine. */
  elo?: number;
  /** Id persona dari `ProviderInfo.personas`. */
  persona?: string;
}

/**
 * Cara sebuah engine dibatasi kekuatannya. Tiap engine punya tombolnya sendiri dan
 * namanya tidak seragam, jadi pemetaannya ditaruh di engines.config.json — bukan di kode.
 *
 * - `uciElo` : engine punya UCI_LimitStrength + UCI_Elo (Stockfish). Angkanya native.
 * - `skill`  : engine hanya punya skala skill bulat (Komodo/Dragon: `Skill` 0..25).
 *              Elo dipetakan linier ke skala itu, jadi angkanya PERKIRAAN, bukan native.
 */
export type StrengthSpec =
  | { mode: 'uciElo'; min: number; max: number }
  | { mode: 'skill'; min: number; max: number; option: string; levels: number };

export interface PersonaInfo {
  id: string;
  label: string;
  /** Keterangan singkat untuk UI. */
  hint?: string;
}

export interface Suggestion {
  /** Koordinat UCI, mis. "e2e4" / "e7e8q". */
  uci: string;
  /** SAN, diisi bridge lewat chess.js. */
  san?: string;
  /** Centipawn dari sisi yang jalan. Diisi provider `strength`. */
  scoreCp?: number;
  /** Positif = sisi yang jalan mate dalam n. */
  mateIn?: number;
  /** Probabilitas move dimainkan manusia (0..1). Diisi provider `human-like`. */
  policy?: number;
  /** Principal variation dalam UCI. */
  pv?: string[];
}

export interface AnalysisResult {
  providerId: string;
  fen: string;
  /** Urut terbaik -> terburuk. */
  suggestions: Suggestion[];
  depth?: number;
  nps?: number;
  elapsedMs: number;
  /** true selama masih streaming, false pada hasil final. */
  partial: boolean;
}

/**
 * Deskripsi provider yang dikirim bridge ke ekstensi.
 *
 * Ekstensi tidak menyimpan daftar engine sendiri — semuanya berasal dari
 * `engines.config.json`, termasuk warna panah dan setelan analisisnya. Dengan begitu
 * menambah atau mengubah engine cukup di satu berkas.
 */
export interface ProviderInfo {
  id: string;
  label: string;
  kind: ProviderKind;
  ready: boolean;
  /** Warna panah dan penanda di overlay, mis. "#2563eb". */
  color?: string;
  /** Setelan analisis bawaan; ekstensi memakai ini apa adanya. */
  defaults?: { movetimeMs?: number; depth?: number; nodes?: number; multipv?: number };
  /** Ada kalau engine bisa dibatasi kekuatannya; UI memakai min/max-nya sebagai rentang slider. */
  strength?: StrengthSpec;
  /** Elo bawaan dari config, dipakai UI sebagai nilai awal sebelum pengguna memilih. */
  defaultElo?: number;
  /**
   * Kepribadian yang tersedia. Kosong atau undefined berarti engine ini memang tidak
   * menyediakannya — Stockfish tidak punya tombol semacam ini sama sekali.
   */
  personas?: PersonaInfo[];
  defaultPersona?: string;
  /** Diisi kalau ready === false. */
  problem?: string;
}

export interface EngineProvider {
  readonly id: string;
  readonly label: string;
  readonly kind: ProviderKind;
  init(): Promise<void>;
  analyze(
    req: AnalysisRequest,
    onUpdate?: (partial: AnalysisResult) => void,
  ): Promise<AnalysisResult>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}
