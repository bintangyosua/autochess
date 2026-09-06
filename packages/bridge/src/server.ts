import { WebSocketServer, type WebSocket } from 'ws';
import {
  DEFAULT_PORT,
  HEARTBEAT_MS,
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

// Kegagalan bind adalah masalah operasional, bukan bug — cetak pesannya saja, jangan
// menumpahkan stack trace yang menutupi instruksi perbaikannya.
const wss = await listen().catch(async (err: Error) => {
  console.error(`[bridge] ${err.message}`);
  await registry.disposeAll();
  process.exit(1);
});
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

/**
 * Dengar di DEFAULT_PORT saja.
 *
 * Sebelumnya bridge pindah ke port berikutnya kalau 8787 terisi. Itu terdengar ramah,
 * tapi hasilnya bridge yang hidup di tempat yang tidak dicari siapa pun — dan ekstensi
 * cuma bisa menebak-nebak. Lebih baik gagal terang-terangan: port terisi hampir selalu
 * berarti masih ada bridge lama yang jalan, dan itu yang perlu dimatikan.
 */
function listen(): Promise<WebSocketServer> {
  return new Promise((resolvePort, rejectPort) => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: DEFAULT_PORT });
    server.once('listening', () => resolvePort(server));
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EADDRINUSE') return rejectPort(err);
      rejectPort(
        new Error(
          `port ${DEFAULT_PORT} sudah dipakai — kemungkinan besar bridge lain masih jalan.\n` +
            `  Cek: netstat -ano | findstr :${DEFAULT_PORT}\n` +
            `  Lalu hentikan prosesnya, atau tutup terminal bridge yang lama.`,
        ),
      );
    });
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log('\n[bridge] menutup engine...');
    void registry.disposeAll().then(() => process.exit(0));
  });
}
