import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { once } from 'node:events';

export interface UciProcessOptions {
  path: string;
  args?: string[];
  cwd?: string;
  /** Log tiap baris stdin/stdout ke console. */
  debug?: boolean;
}

type LineListener = (line: string) => void;

/**
 * Bungkus satu proses engine UCI: spawn, baca stdout per baris, dan sediakan
 * primitif tunggu-sampai-baris-cocok. Tidak tahu apa-apa soal Stockfish atau lc0 —
 * pengetahuan itu ada di provider.
 */
export class UciProcess {
  private child?: ChildProcessWithoutNullStreams;
  private rl?: Interface;
  private readonly listeners = new Set<LineListener>();
  private exitInfo?: { code: number | null; signal: NodeJS.Signals | null };
  private stderrTail: string[] = [];
  private stdinBroken = false;

  constructor(private readonly opts: UciProcessOptions) {}

  get running(): boolean {
    return !!this.child && this.exitInfo === undefined;
  }

  async start(): Promise<void> {
    if (this.child) throw new Error('UciProcess sudah dijalankan');

    const child = spawn(this.opts.path, this.opts.args ?? [], {
      cwd: this.opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;

    // Error spawn (ENOENT dll.) datang async; tangkap sebelum perintah pertama.
    const spawned = Promise.race([
      once(child, 'spawn').then(() => true as const),
      once(child, 'error').then(([err]) => {
        throw err as Error;
      }),
    ]);

    child.on('exit', (code, signal) => {
      this.exitInfo = { code, signal };
      this.stdinBroken = true;
    });

    // Engine bisa mati di sela pemeriksaan `running` dan write-nya sendiri. Kalau itu
    // terjadi, kegagalan write datang async sebagai event 'error' di stdin — tanpa
    // listener, EPIPE itu menjatuhkan seluruh proses bridge. Tandai pipanya rusak lalu
    // telan errornya; kematian engine sudah dilaporkan lewat 'exit'.
    child.stdin.on('error', (err: NodeJS.ErrnoException) => {
      this.stdinBroken = true;
      if (this.opts.debug) console.error(`[${this.opts.path}] stdin: ${err.code ?? err.message}`);
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      // lc0 menulis banyak diagnostik ke stderr; simpan ekornya untuk pesan error.
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.trim()) continue;
        this.stderrTail.push(line);
        if (this.stderrTail.length > 20) this.stderrTail.shift();
        if (this.opts.debug) console.error(`[${this.opts.path}] stderr: ${line}`);
      }
    });

    this.rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    this.rl.on('line', (raw) => {
      const line = raw.trim();
      if (!line) return;
      if (this.opts.debug) console.log(`< ${line}`);
      for (const listener of [...this.listeners]) listener(line);
    });

    await spawned;
  }

  send(command: string): void {
    if (!this.child || this.exitInfo || this.stdinBroken || !this.child.stdin.writable) {
      throw new Error(`Engine tidak berjalan (${this.describeExit()})`);
    }
    if (this.opts.debug) console.log(`> ${command}`);
    this.child.stdin.write(`${command}\n`);
  }

  onLine(listener: LineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Tunggu sampai `match` mengembalikan nilai non-undefined, lalu resolve dengan nilai itu.
   * Semua baris yang lewat dikumpulkan supaya provider bisa memakainya (mis. daftar opsi UCI).
   */
  waitFor<T>(match: (line: string) => T | undefined, timeoutMs = 10_000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        off();
        clearTimeout(timer);
        this.child?.off('exit', onExit);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout ${timeoutMs}ms menunggu balasan engine`));
      }, timeoutMs);
      const onExit = () => {
        cleanup();
        reject(new Error(`Engine keluar saat ditunggu (${this.describeExit()})`));
      };
      const off = this.onLine((line) => {
        const value = match(line);
        if (value === undefined) return;
        cleanup();
        resolve(value);
      });
      this.child?.once('exit', onExit);
    });
  }

  /** Handshake UCI. Mengembalikan nama engine + baris `option ...` mentah. */
  async handshake(timeoutMs = 10_000): Promise<{ name: string; options: string[] }> {
    const options: string[] = [];
    let name = 'unknown';
    const done = this.waitFor((line) => {
      if (line.startsWith('id name ')) name = line.slice('id name '.length);
      else if (line.startsWith('option name ')) options.push(line);
      return line === 'uciok' ? true : undefined;
    }, timeoutMs);
    this.send('uci');
    await done;
    return { name, options };
  }

  /** Barrier: pastikan engine sudah memproses semua perintah sebelumnya. */
  async isReady(timeoutMs = 10_000): Promise<void> {
    const done = this.waitFor((line) => (line === 'readyok' ? true : undefined), timeoutMs);
    this.send('isready');
    await done;
  }

  setOption(name: string, value: string | number | boolean): void {
    this.send(`setoption name ${name} value ${String(value)}`);
  }

  async dispose(): Promise<void> {
    this.listeners.clear();
    if (!this.child || this.exitInfo) return;
    const child = this.child;
    try {
      child.stdin.write('quit\n');
    } catch {
      // stdin mungkin sudah tertutup — lanjut ke kill.
    }
    const exited = await Promise.race([
      once(child, 'exit').then(() => true),
      new Promise<false>((r) => setTimeout(() => r(false), 2000)),
    ]);
    if (!exited) child.kill();
    this.rl?.close();
  }

  private describeExit(): string {
    if (!this.exitInfo) return this.stdinBroken ? 'stdin tertutup' : 'belum start';
    const { code, signal } = this.exitInfo;
    const tail = this.stderrTail.slice(-3).join(' | ');
    return `exit code=${code} signal=${signal}${tail ? `; stderr: ${tail}` : ''}`;
  }
}
