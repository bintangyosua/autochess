import type { AnalysisResult, ProviderInfo } from '@cmr/shared';
import type { ConnectionState } from './engineClient';

/** Pesan content script <-> background. */
export type RuntimeMessage =
  | {
      type: 'analyze';
      reqId: string;
      providerId: string;
      fen: string;
      movetimeMs?: number;
      /** Override depth dari halaman pengaturan; kalau kosong, `defaults` bridge yang berlaku. */
      depth?: number;
      multipv?: number;
    }
  | { type: 'status' }
  // background -> content script
  | { type: 'analysis'; reqId: string; result: AnalysisResult; final: boolean }
  | { type: 'engineError'; reqId?: string; code: string; message: string }
  // Daftar engine berasal dari engines.config.json lewat bridge; content script tidak
  // menyimpan daftarnya sendiri.
  | { type: 'providers'; providers: ProviderInfo[] };

export interface StatusReply {
  state: ConnectionState;
  providers: ProviderInfo[];
}

export interface AnalyzeReply {
  ok: boolean;
  state: ConnectionState;
}

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}
