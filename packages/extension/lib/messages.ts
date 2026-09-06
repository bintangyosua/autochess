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
      multipv?: number;
    }
  | { type: 'status' }
  // background -> content script
  | { type: 'analysis'; reqId: string; result: AnalysisResult; final: boolean }
  | { type: 'engineError'; reqId?: string; code: string; message: string };

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
