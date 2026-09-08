import type {
  AnalysisRequest,
  AnalysisResult,
  EngineProvider,
  PersonaInfo,
  ProviderKind,
  StrengthSpec,
  Suggestion,
} from '@cmr/shared';
import { UciProcess } from '../uci/UciProcess.js';
import { parseBestmove } from '../uci/parseInfo.js';
import { createMultiPvCollector } from '../uci/collectMultiPv.js';
import { uciLineToSan } from '../san.js';

/**
 * Provider untuk engine UCI biasa: Stockfish, Komodo, Dragon, dan sejenisnya.
 *
 * Tidak ada satu pun perilaku khusus Stockfish di sini — yang dipakai hanyalah perintah
 * UCI standar (`setoption`, `position fen`, `go`, `info ... multipv`), jadi engine mana
 * pun yang bicara UCI cukup ditambahkan di engines.config.json tanpa kode baru.
 */

export interface UciEngineProviderConfig {
  id: string;
  label: string;
  path: string;
  options?: Record<string, string | number | boolean>;
  defaults?: { movetimeMs?: number; depth?: number; nodes?: number; multipv?: number };
  strength?: StrengthSpec;
  defaultElo?: number;
  personas?: PersonaConfig[];
  defaultPersona?: string;
  debug?: boolean;
}

export interface PersonaConfig extends PersonaInfo {
  /** setoption yang dikirim saat persona ini dipilih. */
  options: Record<string, string | number | boolean>;
}

export class UciEngineProvider implements EngineProvider {
  readonly kind: ProviderKind = 'strength';
  readonly id: string;
  readonly label: string;

  private proc?: UciProcess;
  private currentMultipv = 1;
  private currentElo?: number;
  private currentPersona?: string;
  /**
   * Nama option yang benar-benar diiklankan engine, beserta nilai bawaannya.
   *
   * Diisi dari handshake `uci`, bukan dari daftar tetap: nama tombol kekuatan tidak
   * seragam antar-engine, dan Dragon maupun Komodo sama sekali tidak punya `UCI_Elo`.
   * Mengirim `setoption` yang tidak dikenal umumnya diabaikan diam-diam — yang jauh
   * lebih buruk daripada gagal, karena pengguna melihat slider yang tidak berefek apa pun.
   */
  private supported = new Map<string, string | undefined>();
  private warned = new Set<string>();
  /** Rantai promise supaya hanya satu `go` aktif per proses engine. */
  private chain: Promise<unknown> = Promise.resolve();
  private running = false;

  constructor(private readonly config: UciEngineProviderConfig) {
    this.id = config.id;
    this.label = config.label;
  }

  async init(): Promise<void> {
    const proc = new UciProcess({ path: this.config.path, debug: this.config.debug });
    await proc.start();
    const { options } = await proc.handshake();
    this.supported = parseOptionDefaults(options);
    for (const [name, value] of Object.entries(this.config.options ?? {})) {
      this.setIfSupported(proc, name, value);
    }
    await proc.isReady();
    this.proc = proc;
    this.currentMultipv = Number(this.config.options?.MultiPV ?? 1);
    // Proses baru berarti engine kembali ke bawaannya — lupakan apa yang tadi terpasang
    // supaya Elo dan persona dikirim ulang pada analisis berikutnya, bukan dilewati
    // karena dikira masih aktif.
    this.currentElo = undefined;
    this.currentPersona = undefined;
  }

  private setIfSupported(proc: UciProcess, name: string, value: string | number | boolean): void {
    if (!this.supported.has(name)) {
      if (!this.warned.has(name)) {
        this.warned.add(name);
        console.warn(`[${this.id}] option "${name}" tidak ada di engine ini, dilewati`);
      }
      return;
    }
    proc.setOption(name, value);
  }

  /**
   * Terjemahkan target Elo jadi setoption sesuai kemampuan engine.
   *
   * Hanya Stockfish yang punya UCI_Elo. Untuk Komodo dan Dragon angkanya dipetakan ke
   * skala `Skill` 0..25, jadi Elo di sana adalah perkiraan — UI menandainya begitu.
   */
  private applyElo(proc: UciProcess, elo: number): void {
    const spec = this.config.strength;
    if (!spec) return;
    const clamped = Math.min(spec.max, Math.max(spec.min, Math.round(elo)));

    if (spec.mode === 'uciElo') {
      // Di ujung atas rentang, membatasi kekuatan justru melemahkan tanpa alasan:
      // lepaskan pembatasnya sekalian supaya "maksimum" berarti kekuatan penuh.
      const full = clamped >= spec.max;
      this.setIfSupported(proc, 'UCI_LimitStrength', !full);
      if (!full) this.setIfSupported(proc, 'UCI_Elo', clamped);
      return;
    }

    const span = Math.max(1, spec.max - spec.min);
    const level = Math.round(((clamped - spec.min) / span) * spec.levels);
    this.setIfSupported(proc, spec.option, Math.min(spec.levels, Math.max(0, level)));
  }

  /**
   * Persona sebelumnya harus dibongkar dulu, bukan sekadar ditimpa: dua persona tidak
   * selalu menyentuh option yang sama, dan sisa dari persona lama akan menempel diam-diam
   * pada persona baru. Nilai pemulihannya diambil dari config kalau ada, kalau tidak dari
   * bawaan yang diiklankan engine saat handshake.
   */
  private applyPersona(proc: UciProcess, id: string): void {
    const next = this.config.personas?.find((p) => p.id === id);
    if (!next) return;
    const previous = this.config.personas?.find((p) => p.id === this.currentPersona);

    for (const name of Object.keys(previous?.options ?? {})) {
      if (name in next.options) continue;
      const restored = this.config.options?.[name] ?? this.supported.get(name);
      if (restored !== undefined) this.setIfSupported(proc, name, restored);
    }
    for (const [name, value] of Object.entries(next.options)) {
      this.setIfSupported(proc, name, value);
    }
  }

  /**
   * Engine UCI umumnya keluar begitu saja pada input yang tidak ia sukai (FEN invalid,
   * misalnya),
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

    // Elo dan persona adalah setoption, bukan bagian dari `go` — jadi keduanya hanya
    // dikirim ulang saat berubah, seperti MultiPV. Satu `isReady` menutup semuanya.
    let dirty = false;

    const multipv = req.multipv ?? this.config.defaults?.multipv ?? 1;
    if (multipv !== this.currentMultipv) {
      proc.setOption('MultiPV', multipv);
      this.currentMultipv = multipv;
      dirty = true;
    }

    const persona = req.persona ?? this.config.defaultPersona;
    if (persona !== undefined && persona !== this.currentPersona) {
      this.applyPersona(proc, persona);
      this.currentPersona = persona;
      dirty = true;
    }

    const elo = req.elo ?? this.config.defaultElo;
    if (elo !== undefined && elo !== this.currentElo) {
      this.applyElo(proc, elo);
      this.currentElo = elo;
      dirty = true;
    }

    if (dirty) await proc.isReady();

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
    if (!this.running) return;
    try {
      this.proc?.send('stop');
    } catch {
      // Engine sudah mati; analisis yang berjalan akan gagal sendiri lewat jalurnya.
    }
  }

  async dispose(): Promise<void> {
    await this.proc?.dispose();
    this.proc = undefined;
  }
}

/**
 * Ubah baris `option name X type spin default N min .. max ..` dari handshake jadi peta
 * nama -> nilai bawaan. Nama option boleh mengandung spasi ("Skill Level", "UCI_Elo"),
 * jadi pemisahnya adalah " type ", bukan spasi biasa.
 */
export function parseOptionDefaults(lines: string[]): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  for (const line of lines) {
    const match = /^option name (.+?) type (\w+)(.*)$/.exec(line.trim());
    const name = match?.[1];
    if (!name) continue;
    // `default` bisa diikuti kata kunci lain (min/max/var), dan untuk combo nilainya
    // boleh mengandung spasi — jadi potong di kata kunci berikutnya, bukan di spasi.
    const value = /\bdefault\s+(.*?)(?=\s+(?:min|max|var)\s|$)/.exec(match[3] ?? '')?.[1]?.trim();
    out.set(name, value === '<empty>' ? '' : value);
  }
  return out;
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
