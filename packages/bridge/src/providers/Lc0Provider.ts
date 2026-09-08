import { dirname } from 'node:path';
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
import { createSanner, uciLineToSan } from '../san.js';

/**
 * Dua cara memakai lc0, dengan biner yang sama persis:
 *
 * - `policy`: `go nodes 1`, tanpa pencarian. Yang dibaca adalah distribusi policy —
 *   seberapa mungkin sebuah langkah dimainkan. Ini yang dipakai Maia; meniru manusia
 *   justru datang dari TIDAK mencari.
 * - `search`: pencarian penuh seperti engine biasa, hasilnya evaluasi centipawn.
 *   Ini yang dipakai jaringan Leela biasa.
 */
export type Lc0Mode = 'policy' | 'search';

export interface Lc0ProviderConfig {
  id: string;
  label: string;
  /** Path ke lc0.exe. */
  path: string;
  /** Path ke bobot .pb.gz. */
  weights: string;
  mode: Lc0Mode;
  defaults?: { nodes?: number; depth?: number; movetimeMs?: number; multipv?: number };
  debug?: boolean;
}

/** Baris verbose move stats: `info string e2e4  (322 ) N: 0 (+ 0) (P: 44.24%) ...` */
const POLICY_LINE =
  /^info string ([a-h][1-8][a-h][1-8][qrbn]?)\s+\(\s*\d+\s*\).*?\(P:\s*([\d.]+)%\)/;

export class Lc0Provider implements EngineProvider {
  readonly kind: ProviderKind;
  readonly id: string;
  readonly label: string;

  private proc?: UciProcess;
  private chain: Promise<unknown> = Promise.resolve();
  private currentMultipv = 1;

  constructor(private readonly config: Lc0ProviderConfig) {
    this.id = config.id;
    this.label = config.label;
    this.kind = config.mode === 'policy' ? 'human-like' : 'strength';
  }

  async init(): Promise<void> {
    const proc = new UciProcess({
      path: this.config.path,
      args: [`--weights=${this.config.weights}`],
      // lc0 memuat dnnl.dll dan mimalloc dari foldernya sendiri; tanpa cwd ini
      // prosesnya gagal start di Windows.
      cwd: dirname(this.config.path),
      debug: this.config.debug,
    });
    await proc.start();
    await proc.handshake(30_000);

    if (this.config.mode === 'policy') proc.setOption('VerboseMoveStats', true);
    const multipv = this.config.defaults?.multipv ?? 3;
    proc.setOption('MultiPV', multipv);
    this.currentMultipv = multipv;

    await proc.isReady(30_000);
    this.proc = proc;

    // Bobot baru dimuat saat `go` pertama, dan untuk jaringan besar itu bisa beberapa
    // detik. Panaskan sekarang supaya permintaan sungguhan pertama tidak menggantung.
    await this.runAnalysis(
      { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', movetimeMs: 200 },
      undefined,
      120_000,
    );
  }

  private async ensureRunning(): Promise<UciProcess> {
    if (this.proc?.running) return this.proc;
    if (this.proc) {
      console.warn(`[${this.id}] proses lc0 mati, menjalankan ulang`);
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
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async runAnalysis(
    req: AnalysisRequest,
    onUpdate?: (partial: AnalysisResult) => void,
    timeoutOverrideMs?: number,
  ): Promise<AnalysisResult> {
    const proc = this.proc?.running ? this.proc : await this.ensureRunning();

    const multipv = req.multipv ?? this.config.defaults?.multipv ?? 3;
    if (multipv !== this.currentMultipv) {
      proc.setOption('MultiPV', multipv);
      this.currentMultipv = multipv;
      await proc.isReady();
    }

    const startedAt = Date.now();
    return this.config.mode === 'policy'
      ? this.runPolicy(proc, req, multipv, startedAt, timeoutOverrideMs)
      : this.runSearch(proc, req, startedAt, onUpdate, timeoutOverrideMs);
  }

  /** Mode Maia: 1 node, hasilnya probabilitas langkah dimainkan manusia. */
  private async runPolicy(
    proc: UciProcess,
    req: AnalysisRequest,
    multipv: number,
    startedAt: number,
    timeoutOverrideMs?: number,
  ): Promise<AnalysisResult> {
    const policies = new Map<string, number>();
    const off = proc.onLine((line) => {
      const match = POLICY_LINE.exec(line);
      if (match) policies.set(match[1]!, Number(match[2]) / 100);
    });

    try {
      proc.send('ucinewgame');
      proc.send(`position fen ${req.fen}`);
      const finished = proc.waitFor((line) => parseBestmove(line), timeoutOverrideMs ?? 20_000);
      proc.send(`go nodes ${req.nodes ?? this.config.defaults?.nodes ?? 1}`);
      const bestmove = await finished;

      const sanOf = createSanner(req.fen);
      const suggestions: Suggestion[] = [...policies.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, multipv)
        .map(([uci, policy]) => ({ uci, san: sanOf(uci), policy }));

      // Kalau verbose stats tidak terbaca (versi lc0 berbeda), setidaknya kembalikan
      // langkah pilihannya daripada mengembalikan hasil kosong.
      if (suggestions.length === 0 && bestmove.best !== '(none)') {
        suggestions.push({ uci: bestmove.best, san: sanOf(bestmove.best) });
      }

      return {
        providerId: this.id,
        fen: req.fen,
        suggestions,
        elapsedMs: Date.now() - startedAt,
        partial: false,
      };
    } finally {
      off();
    }
  }

  /** Mode Leela: pencarian penuh. Baris info-nya sama persis dengan Stockfish. */
  private async runSearch(
    proc: UciProcess,
    req: AnalysisRequest,
    startedAt: number,
    onUpdate?: (partial: AnalysisResult) => void,
    timeoutOverrideMs?: number,
  ): Promise<AnalysisResult> {
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

      const { goCommand, timeoutMs } = buildSearchGo(req, this.config.defaults);
      const finished = proc.waitFor((line) => parseBestmove(line), timeoutOverrideMs ?? timeoutMs);
      proc.send(goCommand);
      const bestmove = await finished;

      const result = snapshot(false);
      if (result.suggestions.length === 0 && bestmove.best !== '(none)') {
        result.suggestions.push({
          uci: bestmove.best,
          san: uciLineToSan(req.fen, [bestmove.best])[0],
        });
      }
      return result;
    } finally {
      off();
    }
  }

  async stop(): Promise<void> {
    if (this.config.mode === 'search') this.proc?.send('stop');
    // Mode policy selesai dalam milidetik; tidak ada yang perlu dihentikan.
  }

  async dispose(): Promise<void> {
    await this.proc?.dispose();
    this.proc = undefined;
  }
}

/**
 * Sama seperti di UciEngineProvider: request per-analisis menang penuh atas defaults
 * (warm-up mengirim movetimeMs eksplisit dan tidak boleh ikut terseret ke `go depth`),
 * lalu defaults dengan urutan depth > nodes > movetime.
 */
function buildSearchGo(
  req: AnalysisRequest,
  defaults?: { movetimeMs?: number; depth?: number; nodes?: number },
): { goCommand: string; timeoutMs: number } {
  if (req.depth !== undefined) return { goCommand: `go depth ${req.depth}`, timeoutMs: 120_000 };
  if (req.nodes !== undefined) return { goCommand: `go nodes ${req.nodes}`, timeoutMs: 120_000 };

  if (req.movetimeMs === undefined) {
    if (defaults?.depth !== undefined)
      return { goCommand: `go depth ${defaults.depth}`, timeoutMs: 120_000 };
    if (defaults?.nodes !== undefined)
      return { goCommand: `go nodes ${defaults.nodes}`, timeoutMs: 120_000 };
  }

  const movetime = req.movetimeMs ?? defaults?.movetimeMs ?? 800;
  return { goCommand: `go movetime ${movetime}`, timeoutMs: movetime + 15_000 };
}
