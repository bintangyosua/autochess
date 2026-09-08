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

/** Jarak minimum antar-update parsial ke pemanggil (ms). */
const UPDATE_INTERVAL_MS = 60;

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
  /**
   * FEN yang terakhir dianalisis proses ini, untuk memutuskan perlu `ucinewgame` atau tidak.
   * undefined = proses masih segar, belum pernah diberi posisi.
   */
  private lastFen?: string;
  /** Rantai promise supaya hanya satu `go` aktif per proses engine. */
  private chain: Promise<unknown> = Promise.resolve();
  /**
   * Dinaikkan tiap `stop()`. Sebuah analisis menangkap nilainya saat mulai, lalu
   * memeriksanya lagi tepat sebelum mengirim `go`.
   *
   * Sebelumnya ini cuma flag `running` yang baru menyala persis sebelum `go` — sesudah
   * `ensureRunning()` dan `isReady()`, yang dua-duanya menunggu. Pembatalan yang tiba di
   * jendela itu tidak menemukan apa pun untuk dihentikan lalu hilang, dan `go` yang sudah
   * usang tetap terkirim: analisis untuk posisi lama jalan sampai selesai, sementara
   * posisi yang sekarang antre di belakangnya. `stop` UCI juga tidak bisa menutup lubang
   * itu sendiri — engine yang belum mencari mengabaikannya.
   */
  private stopEpoch = 0;

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
    this.lastFen = undefined;
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
    const epoch = this.stopEpoch;
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

    // `ucinewgame` memerintahkan engine membuang transposition table beserta killer,
    // history, dan counter-move heuristic. Posisi sesudah lawan jalan adalah anak dari
    // posisi yang barusan dicari, dan TT dikunci Zobrist hash — bukan jalur — jadi isinya
    // masih sah dan langsung terpakai. Mengirimnya tiap langkah berarti menghitung ulang
    // dari nol, ditambah biaya mengosongkan hash (256 MB per engine di config sekarang)
    // yang pada depth rendah bisa lebih mahal daripada pencariannya sendiri.
    //
    // Jadi kirim hanya saat papannya memang bukan kelanjutan: game baru, atau lompat ke
    // posisi yang tidak berhubungan.
    if (!isContinuation(this.lastFen, req.fen)) {
      proc.send('ucinewgame');
      dirty = true;
    }
    this.lastFen = req.fen;

    // Satu barrier menutup setoption sekaligus pengosongan hash — engine boleh butuh
    // waktu untuk yang terakhir, dan `position` tidak boleh menyusul sebelum ia selesai.
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

    // Engine mengirim ratusan baris `info` per detik dan tiap snapshot berarti sort +
    // array baru + serialisasi ke extension. Mata manusia tidak butuh lebih dari ~16
    // update per detik, jadi update parsial dikoalisikan; hasil akhir tetap dikirim utuh.
    let pending: NodeJS.Timeout | undefined;
    const off = proc.onLine((line) => {
      if (!collector.feed(line) || !onUpdate || pending) return;
      pending = setTimeout(() => {
        pending = undefined;
        onUpdate(snapshot(true));
      }, UPDATE_INTERVAL_MS);
    });

    try {
      // Dengan rantai langkah, engine melihat posisi yang sama TAPI juga tahu bagaimana
      // posisi itu dicapai — dan hanya dengan begitu ia bisa mengenali pengulangan
      // posisi. Rantainya sudah diverifikasi bridge, jadi di sini dipakai apa adanya.
      proc.send(
        req.startFen && req.moves?.length
          ? `position fen ${req.startFen} moves ${req.moves.join(' ')}`
          : `position fen ${req.fen}`,
      );

      // Titik pemeriksaan terakhir sebelum mesin mulai bekerja: semua `await` di atas
      // sudah lewat, jadi satu pemeriksaan di sini menutup seluruh jendela persiapan.
      if (this.stopEpoch !== epoch) return snapshot(false);

      const { goCommand, timeoutMs } = buildGoCommand(req, this.config.defaults);
      const finished = proc.waitFor((line) => parseBestmove(line), timeoutMs);
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
      if (pending) clearTimeout(pending);
      off();
    }
  }

  async stop(): Promise<void> {
    // Dinaikkan lebih dulu, tanpa syarat. Analisis yang belum sempat mengirim `go` hanya
    // bisa tahu dirinya dibatalkan lewat angka ini — dan justru itu kasus yang dulu lolos.
    this.stopEpoch += 1;
    try {
      // `stop` pada engine yang sedang diam diabaikan begitu saja, jadi mengirimnya tanpa
      // memeriksa keadaan lebih aman daripada menebak-nebak apakah pencarian sudah jalan.
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

/**
 * Apakah `next` masuk akal sebagai kelanjutan dari `prev` dalam game yang sama?
 *
 * FEN dari pembacaan DOM tidak punya nomor langkah yang bisa dipercaya (diisi `0 1`),
 * jadi penentunya adalah materi: dalam satu game, bidak hanya berkurang. Pion tidak
 * pernah bertambah, dan bidak non-pion hanya boleh bertambah kalau ada pion yang hilang
 * pada sisi yang sama — itu promosi.
 *
 * Sengaja dibuat longgar, dan arah salahnya penting. Salah menyimpulkan "lanjutan"
 * padahal bukan hanya menyisakan entri TT basi, dan itu tidak berbahaya: entri dikunci
 * Zobrist hash, jadi yang tidak cocok tidak akan pernah terbaca — cuma memakan tempat.
 * Sebaliknya, salah menyimpulkan "game baru" membuang seluruh hasil pencarian yang masih
 * sah, dan itu persis biaya yang ingin dihindari.
 */
export function isContinuation(prev: string | undefined, next: string): boolean {
  if (prev === undefined) return false;
  if (prev === next) return true;

  const before = countMaterial(prev);
  const after = countMaterial(next);

  for (const color of ['w', 'b'] as const) {
    const pawnsLost = before[color].pawns - after[color].pawns;
    if (pawnsLost < 0) return false;
    // Bidak baru harus dibayar dengan pion yang hilang; lebih dari itu berarti papan
    // yang berbeda, bukan promosi.
    if (after[color].others - before[color].others > pawnsLost) return false;
    if (after[color].total > before[color].total) return false;
  }
  return true;
}

interface Material {
  w: { pawns: number; others: number; total: number };
  b: { pawns: number; others: number; total: number };
}

/** Hitung bidak per warna dari field pertama FEN. */
function countMaterial(fen: string): Material {
  const out: Material = {
    w: { pawns: 0, others: 0, total: 0 },
    b: { pawns: 0, others: 0, total: 0 },
  };
  const board = fen.split(' ', 1)[0] ?? '';
  for (const ch of board) {
    if (ch === '/' || (ch >= '1' && ch <= '8')) continue;
    const side = ch === ch.toUpperCase() ? out.w : out.b;
    // Raja tidak ikut dihitung: jumlahnya selalu satu dan tidak menambah informasi.
    const lower = ch.toLowerCase();
    if (lower === 'k') continue;
    if (lower === 'p') side.pawns += 1;
    else side.others += 1;
    side.total += 1;
  }
  return out;
}
