/** Kontrak provider engine. Dipakai bridge (implementasi) dan ekstensi (tipe saja). */

export type ProviderKind = 'strength' | 'human-like';

export interface AnalysisRequest {
  fen: string;
  movetimeMs?: number;
  depth?: number;
  nodes?: number;
  multipv?: number;
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
