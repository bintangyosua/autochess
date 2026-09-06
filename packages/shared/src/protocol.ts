/** Protokol WebSocket antara ekstensi dan bridge lokal. */

import type { AnalysisResult, ProviderInfo } from './provider.js';

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 8787;

/**
 * Service worker MV3 dimatikan Chrome setelah ~30 detik tanpa aktivitas, dan WebSocket-nya
 * ikut mati. Sejak Chrome 116 lalu lintas WebSocket memperpanjang umur worker, jadi bridge
 * mengirim heartbeat di bawah ambang itu supaya koneksi bertahan selama ada yang memakai.
 */
export const HEARTBEAT_MS = 20_000;
/** Bridge akan mencoba port berurutan dari DEFAULT_PORT sampai PORT_SCAN_END. */
export const PORT_SCAN_END = 8797;

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
