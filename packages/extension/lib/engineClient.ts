import {
  DEFAULT_PORT,
  PORT_SCAN_END,
  PROTOCOL_VERSION,
  isServerMessage,
  type AnalysisResult,
  type ClientMessage,
  type ProviderInfo,
  type ServerMessage,
} from '@cmr/shared';

export type ConnectionState = 'connecting' | 'connected' | 'offline';

export interface EngineClientEvents {
  onState?: (state: ConnectionState, detail?: string) => void;
  onProviders?: (providers: ProviderInfo[]) => void;
  onPartial?: (reqId: string, result: AnalysisResult) => void;
  onResult?: (reqId: string, result: AnalysisResult) => void;
  onError?: (reqId: string | undefined, code: string, message: string) => void;
}

/** Jeda antar-port saat menyapu rentang; sapuan penuh harus cepat, bukan bertahap. */
const PORT_STEP_MS = 250;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

/**
 * Koneksi ke bridge lokal. Bridge memindai port kalau 8787 terpakai, jadi klien
 * ikut memindai rentang yang sama sampai ada yang menjawab.
 */
export class EngineClient {
  private socket?: WebSocket;
  private port = DEFAULT_PORT;
  private backoffMs = RECONNECT_MIN_MS;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private closedByUs = false;

  providers: ProviderInfo[] = [];
  state: ConnectionState = 'offline';

  constructor(private readonly events: EngineClientEvents = {}) {}

  connect(): void {
    this.closedByUs = false;
    this.openSocket();
  }

  private setState(state: ConnectionState, detail?: string) {
    this.state = state;
    this.events.onState?.(state, detail);
  }

  private openSocket(): void {
    this.setState('connecting', `port ${this.port}`);
    const socket = new WebSocket(`ws://127.0.0.1:${this.port}`);
    this.socket = socket;

    socket.onopen = () => {
      this.backoffMs = RECONNECT_MIN_MS;
      this.send({ type: 'hello', version: PROTOCOL_VERSION });
    };

    socket.onmessage = (event) => {
      let message: unknown;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!isServerMessage(message)) return;
      this.dispatch(message);
    };

    socket.onclose = () => {
      if (this.closedByUs) return;
      this.providers = [];

      // Sapu seluruh rentang port dengan cepat, baru menunggu lama setelah satu sapuan
      // penuh gagal. Kalau tiap port memakai backoff eksponensial, kembali ke 8787 —
      // tempat bridge biasanya berada — bisa makan lebih dari satu menit.
      if (this.port < PORT_SCAN_END) {
        this.port += 1;
        this.setState('connecting', `mencoba port ${this.port}`);
        this.reconnectIn(PORT_STEP_MS);
        return;
      }

      this.port = DEFAULT_PORT;
      this.setState('offline', 'bridge tidak merespons');
      this.reconnectIn(this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, RECONNECT_MAX_MS);
    };

    socket.onerror = () => {
      // onclose selalu menyusul; penanganan cukup di sana.
    };
  }

  private dispatch(message: ServerMessage): void {
    switch (message.type) {
      case 'ping':
        // Cukup membalas: lalu lintas dua arah inilah yang menahan service worker
        // agar tidak dimatikan Chrome karena dianggap menganggur.
        this.send({ type: 'pong' });
        break;
      case 'providers':
        this.providers = message.providers;
        this.setState('connected', `port ${this.port}`);
        this.events.onProviders?.(message.providers);
        break;
      case 'partial':
        this.events.onPartial?.(message.reqId, message.result);
        break;
      case 'result':
        this.events.onResult?.(message.reqId, message.result);
        break;
      case 'error':
        this.events.onError?.(message.reqId, message.code, message.message);
        break;
    }
  }

  private reconnectIn(delayMs: number): void {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.openSocket(), delayMs);
  }

  send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  analyze(params: Omit<Extract<ClientMessage, { type: 'analyze' }>, 'type'>): boolean {
    return this.send({ type: 'analyze', ...params });
  }

  stop(reqId: string): boolean {
    return this.send({ type: 'stop', reqId });
  }

  disconnect(): void {
    this.closedByUs = true;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.setState('offline', 'ditutup');
  }
}
