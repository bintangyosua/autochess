/** Protokol WebSocket antara ekstensi dan bridge lokal. */

import type { AnalysisResult, ProviderInfo } from './provider.js';

export const PROTOCOL_VERSION = 1;
/**
 * Satu-satunya port yang dipakai. Bridge tidak pindah kalau port ini terisi dan ekstensi
 * tidak menyapu port lain: kalau tidak ada apa pun di sini, artinya bridge memang tidak
 * jalan. Menyapu port membuat dua kegagalan yang sangat berbeda — bridge belum dijalankan
 * versus bridge pindah tempat — jadi tidak bisa dibedakan, dan yang pertama jauh lebih sering.
 */
export const DEFAULT_PORT = 8787;

/**
 * Service worker MV3 dimatikan Chrome setelah ~30 detik tanpa aktivitas, dan WebSocket-nya
 * ikut mati. Sejak Chrome 116 lalu lintas WebSocket memperpanjang umur worker, jadi bridge
 * mengirim heartbeat di bawah ambang itu supaya koneksi bertahan selama ada yang memakai.
 */
export const HEARTBEAT_MS = 20_000;

export type ClientMessage =
  | { type: 'hello'; version: number }
  | {
      type: 'analyze';
      reqId: string;
      providerId: string;
      fen: string;
      movetimeMs?: number;
      depth?: number;
      nodes?: number;
      multipv?: number;
      /** Target Elo pilihan pengguna; bridge yang menerjemahkannya ke opsi engine. */
      elo?: number;
      persona?: string;
    }
  | { type: 'stop'; reqId: string }
  | { type: 'pong' };

export type ServerMessage =
  | { type: 'providers'; version: number; providers: ProviderInfo[] }
  | { type: 'ping' }
  | { type: 'partial'; reqId: string; result: AnalysisResult }
  | { type: 'result'; reqId: string; result: AnalysisResult }
  | { type: 'error'; reqId?: string; code: ErrorCode; message: string };

export type ErrorCode =
  | 'unknown_provider'
  | 'provider_not_ready'
  | 'bad_request'
  | 'invalid_fen'
  | 'engine_failed'
  | 'version_mismatch';

export function isServerMessage(v: unknown): v is ServerMessage {
  return typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';
}
