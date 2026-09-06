import { WebSocketServer, type WebSocket } from 'ws';
import {
  DEFAULT_PORT,
  HEARTBEAT_MS,
  PORT_SCAN_END,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from '@cmr/shared';
import { ProviderRegistry } from './providers/registry.js';
import { fenProblem } from './san.js';

const debug = process.argv.includes('--debug');

const registry = await ProviderRegistry.load(undefined, debug);
const ready = registry.list().filter((p) => p.ready);
if (ready.length === 0) {
  console.error('[bridge] tidak ada provider yang siap:');
  for (const p of registry.list()) console.error(`  - ${p.id}: ${p.problem ?? 'tidak diketahui'}`);
}

const wss = await listen();
console.log(`[bridge] siap di ws://127.0.0.1:${(wss.address() as { port: number }).port}`);
console.log(`[bridge] provider: ${registry.list().map((p) => `${p.id}${p.ready ? '' : ' (off)'}`).join(', ')}`);

wss.on('connection', (socket) => {
  /** Satu request aktif per provider, per koneksi. */
  const active = new Map<string, string>();
  console.log('[bridge] ekstensi terhubung');

  const send = (message: ServerMessage) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  };
  const fail = (code: ErrorCode, message: string, reqId?: string) =>
    send({ type: 'error', code, message, reqId });

  // Menjaga service worker MV3 tetap hidup: tanpa lalu lintas, Chrome mematikannya
  // (dan koneksi ini) setelah ~30 detik.
  const heartbeat = setInterval(() => send({ type: 'ping' }), HEARTBEAT_MS);

  socket.on('message', (data) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(data)) as ClientMessage;
    } catch {
      return fail('bad_request', 'payload bukan JSON');
    }
    if (message.type === 'pong') return;
    void handle(message, socket, active, send, fail);
  });

  socket.on('close', () => {
    clearInterval(heartbeat);
    console.log('[bridge] ekstensi terputus');
  });
});

async function handle(
  message: ClientMessage,
  _socket: WebSocket,
  active: Map<string, string>,
  send: (m: ServerMessage) => void,
  fail: (code: ErrorCode, message: string, reqId?: string) => void,
): Promise<void> {
  if (message.type === 'hello') {
    if (message.version !== PROTOCOL_VERSION) {
      return fail(
        'version_mismatch',
        `bridge memakai protokol v${PROTOCOL_VERSION}, ekstensi v${message.version}`,
      );
    }
    return send({ type: 'providers', version: PROTOCOL_VERSION, providers: registry.list() });
  }

  if (message.type === 'stop') {
    for (const [providerId, reqId] of active) {
      if (reqId === message.reqId) await registry.get(providerId)?.provider?.stop();
    }
    return;
  }

  if (message.type !== 'analyze') return fail('bad_request', 'tipe pesan tidak dikenal');

  const entry = registry.get(message.providerId);
  if (!entry) return fail('unknown_provider', `provider "${message.providerId}" tidak ada`, message.reqId);
  if (!entry.provider) {
    return fail('provider_not_ready', entry.info.problem ?? 'provider belum siap', message.reqId);
  }

  const problem = fenProblem(message.fen);
  if (problem) return fail('invalid_fen', problem, message.reqId);

  // Request baru membatalkan yang lama pada provider yang sama.
  const previous = active.get(message.providerId);
  if (previous && previous !== message.reqId) await entry.provider.stop();
  active.set(message.providerId, message.reqId);

  try {
    const result = await entry.provider.analyze(
      {
        fen: message.fen,
        movetimeMs: message.movetimeMs,
        depth: message.depth,
        nodes: message.nodes,
        multipv: message.multipv,
      },
      (partial) => {
        // Jangan kirim update dari request yang sudah digantikan.
        if (active.get(message.providerId) === message.reqId) {
          send({ type: 'partial', reqId: message.reqId, result: partial });
        }
      },
    );
    send({ type: 'result', reqId: message.reqId, result });
  } catch (err) {
    fail('engine_failed', err instanceof Error ? err.message : String(err), message.reqId);
  } finally {
    if (active.get(message.providerId) === message.reqId) active.delete(message.providerId);
  }
}

/** Cari port bebas mulai dari DEFAULT_PORT. */
function listen(): Promise<WebSocketServer> {
  return new Promise((resolvePort, rejectPort) => {
    const tryPort = (port: number) => {
      if (port > PORT_SCAN_END) {
        return rejectPort(new Error(`tidak ada port bebas di ${DEFAULT_PORT}-${PORT_SCAN_END}`));
      }
      const server = new WebSocketServer({ host: '127.0.0.1', port });
      server.once('listening', () => resolvePort(server));
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') tryPort(port + 1);
        else rejectPort(err);
      });
    };
    tryPort(DEFAULT_PORT);
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log('\n[bridge] menutup engine...');
    void registry.disposeAll().then(() => process.exit(0));
  });
}
