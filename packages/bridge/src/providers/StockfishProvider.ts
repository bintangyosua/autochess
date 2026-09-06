import type {
  AnalysisRequest,
  AnalysisResult,
  EngineProvider,
  ProviderKind,
  Suggestion,
} from '@cmr/shared';
import { UciProcess } from '../uci/UciProcess.js';
import { parseBestmove, parseInfo } from '../uci/parseInfo.js';
import { uciLineToSan } from '../san.js';

export interface StockfishProviderConfig {
  id: string;
  label: string;
  path: string;
  options?: Record<string, string | number | boolean>;
  defaults?: { movetimeMs?: number; depth?: number; multipv?: number };
  debug?: boolean;
}

export class StockfishProvider implements EngineProvider {
  readonly kind: ProviderKind = 'strength';
  readonly id: string;
  readonly label: string;

  private proc?: UciProcess;
  private currentMultipv = 1;
  /** Rantai promise supaya hanya satu `go` aktif per proses engine. */
  private chain: Promise<unknown> = Promise.resolve();
  private running = false;

  constructor(private readonly config: StockfishProviderConfig) {
    this.id = config.id;
    this.label = config.label;
  }

  async init(): Promise<void> {
    const proc = new UciProcess({ path: this.config.path, debug: this.config.debug });
    await proc.start();
    await proc.handshake();
    for (const [name, value] of Object.entries(this.config.options ?? {})) {
      proc.setOption(name, value);
    }
    await proc.isReady();
    this.proc = proc;
    this.currentMultipv = Number(this.config.options?.MultiPV ?? 1);
  }

  /**
   * Stockfish keluar begitu saja pada input yang tidak ia sukai (FEN invalid, misalnya),
   * dan proses yang mati akan membuat provider ini lumpuh permanen. Jadi hidupkan lagi
   * sebelum tiap analisis kalau perlu.
   */
  private async ensureRunning(): Promise<UciProcess> {
    if (this.proc?.running) return this.proc;
    if (this.proc) {
      console.warn(`[${this.id}] proses engine mati, menjalankan ulang`);
      this.proc = undefined;
    }
    await this.init();
    return this.proc!;
  }

  async analyze(
    req: AnalysisRequest,
    onUpdate?: (partial: AnalysisResult) => void,
  ): Promise<AnalysisResult> {
    const run = this.chain.then(
      () => this.runAnalysis(req, onUpdate),
      () => this.runAnalysis(req, onUpdate),
    );
    // Simpan hasil (termasuk kegagalan) sebagai ekor rantai tanpa memicu unhandled rejection.
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async runAnalysis(
    req: AnalysisRequest,
    onUpdate?: (partial: AnalysisResult) => void,
  ): Promise<AnalysisResult> {
    const proc = await this.ensureRunning();

    const multipv = req.multipv ?? this.config.defaults?.multipv ?? 1;
    if (multipv !== this.currentMultipv) {
      proc.setOption('MultiPV', multipv);
      this.currentMultipv = multipv;
      await proc.isReady();
    }

    const startedAt = Date.now();
    let depth: number | undefined;
    let nps: number | undefined;

    // Slot MultiPV hanya boleh dibaca dalam satu iterasi depth yang sama. Kalau dicampur,
    // slot yang belum ter-update di depth terakhir menyisakan move dari depth sebelumnya
    // dan hasilnya bisa memuat move yang sama dua kali.
    let current = new Map<number, Suggestion>();
    let currentDepth: number | undefined;
    let completed = new Map<number, Suggestion>();

    const bestIteration = () => (current.size >= completed.size ? current : completed);

    const snapshot = (partial: boolean): AnalysisResult => ({
      providerId: this.id,
      fen: req.fen,
      suggestions: [...bestIteration().entries()]
        .sort(([a], [b]) => a - b)
        .map(([, suggestion]) => suggestion),
      depth,
      nps,
      elapsedMs: Date.now() - startedAt,
      partial,
    });

    const off = proc.onLine((line) => {
      const info = parseInfo(line);
      if (!info || info.string !== undefined) return;
      // Skor lowerbound/upperbound berasal dari aspiration window dan akan direvisi.
      if (info.bound) return;
      if (!info.pv?.length) {
        if (info.depth !== undefined) depth = info.depth;
        if (info.nps !== undefined) nps = info.nps;
        return;
      }

      if (info.depth !== undefined) depth = info.depth;
      if (info.nps !== undefined) nps = info.nps;

      // Iterasi depth baru dimulai. Simpan iterasi sebelumnya hanya kalau ia minimal
      // selengkap yang tersimpan — kalau tidak, iterasi yang baru terisi satu slot akan
      // menimpa iterasi utuh dan hasil akhirnya menyusut jadi satu move.
      if (info.depth !== undefined && info.depth !== currentDepth) {
        if (current.size >= completed.size) completed = current;
        current = new Map();
        currentDepth = info.depth;
      }

      const pv = info.pv;
      const san = uciLineToSan(req.fen, pv.slice(0, 6));
      current.set(info.multipv ?? 1, {
        uci: pv[0]!,
        san: san[0],
        scoreCp: info.scoreCp,
        mateIn: info.mateIn,
        pv,
      });

      onUpdate?.(snapshot(true));
    });

    try {
      proc.send('ucinewgame');
      proc.send(`position fen ${req.fen}`);

      const { goCommand, timeoutMs } = buildGoCommand(req, this.config.defaults);
      const finished = proc.waitFor((line) => parseBestmove(line), timeoutMs);
      this.running = true;
      proc.send(goCommand);
      const bestmove = await finished;

      // Posisi mate/stalemate tidak menghasilkan baris pv sama sekali.
      if (bestIteration().size === 0 && bestmove.best !== '(none)') {
        current.set(1, {
          uci: bestmove.best,
          san: uciLineToSan(req.fen, [bestmove.best])[0],
        });
      }
      return snapshot(false);
    } finally {
      this.running = false;
      off();
    }
  }

  async stop(): Promise<void> {
    if (this.running) this.proc?.send('stop');
  }

  async dispose(): Promise<void> {
    await this.proc?.dispose();
    this.proc = undefined;
  }
}

function buildGoCommand(
  req: AnalysisRequest,
  defaults?: { movetimeMs?: number; depth?: number },
): { goCommand: string; timeoutMs: number } {
  if (req.depth !== undefined) return { goCommand: `go depth ${req.depth}`, timeoutMs: 120_000 };
  if (req.nodes !== undefined) return { goCommand: `go nodes ${req.nodes}`, timeoutMs: 120_000 };

  const movetime = req.movetimeMs ?? defaults?.movetimeMs ?? 800;
  // Beri kelonggaran: engine baru mengirim bestmove sedikit setelah movetime habis.
  return { goCommand: `go movetime ${movetime}`, timeoutMs: movetime + 10_000 };
}
