import type {
  AnalysisRequest,
  AnalysisResult,
  EngineProvider,
  ProviderKind,
  Suggestion,
} from '@cmr/shared';
import { UciProcess } from '../uci/UciProcess.js';
import { parseBestmove } from '../uci/parseInfo.js';
import { createMultiPvCollector } from '../uci/collectMultiPv.js';
import { uciLineToSan } from '../san.js';

export interface StockfishProviderConfig {
  id: string;
  label: string;
  path: string;
  options?: Record<string, string | number | boolean>;
  defaults?: { movetimeMs?: number; depth?: number; nodes?: number; multipv?: number };
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
    const collector = createMultiPvCollector(req.fen);

    const snapshot = (partial: boolean): AnalysisResult => ({
      providerId: this.id,
      fen: req.fen,
      suggestions: collector.suggestions(),
      depth: collector.depth(),
      nps: collector.nps(),
      elapsedMs: Date.now() - startedAt,
      partial,
    });

    const off = proc.onLine((line) => {
      if (collector.feed(line)) onUpdate?.(snapshot(true));
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
      const result = snapshot(false);
      if (result.suggestions.length === 0 && bestmove.best !== '(none)') {
        result.suggestions.push({
          uci: bestmove.best,
          san: uciLineToSan(req.fen, [bestmove.best])[0],
        });
      }
      return result;
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
  defaults?: { movetimeMs?: number; depth?: number; nodes?: number },
): { goCommand: string; timeoutMs: number } {
  // Apa pun yang diminta per-analisis menang atas seluruh defaults — kalau tidak,
  // permintaan `movetimeMs` eksplisit akan diam-diam dibajak oleh `defaults.depth`.
  // Baru setelah itu defaults dipakai, dengan urutan depth > nodes > movetime.
  if (req.depth !== undefined) return { goCommand: `go depth ${req.depth}`, timeoutMs: 120_000 };
  if (req.nodes !== undefined) return { goCommand: `go nodes ${req.nodes}`, timeoutMs: 120_000 };

  if (req.movetimeMs === undefined) {
    if (defaults?.depth !== undefined)
      return { goCommand: `go depth ${defaults.depth}`, timeoutMs: 120_000 };
    if (defaults?.nodes !== undefined)
      return { goCommand: `go nodes ${defaults.nodes}`, timeoutMs: 120_000 };
  }

  const movetime = req.movetimeMs ?? defaults?.movetimeMs ?? 800;
  // Beri kelonggaran: engine baru mengirim bestmove sedikit setelah movetime habis.
  return { goCommand: `go movetime ${movetime}`, timeoutMs: movetime + 10_000 };
}
