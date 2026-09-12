import { debug, warn } from '../../lib/log';
import { mount, unmount } from 'svelte';
import { browser } from 'wxt/browser';
import Overlay from './Overlay.svelte';
import { watchBoard } from '../../lib/board/DomBoardReader';
import { findBoard } from '../../lib/board/selectors';
import type { ProviderInfo } from '@cmr/shared';
import {
  applyResult,
  autoPlayProviderId,
  markProblem,
  applyArrowCounts,
  markThinking,
  onArrowsChanged,
  onAutoPlayChanged,
  onMovesPanelChanged,
  onPanelChanged,
  overlay,
  syncProviders,
} from '../../lib/overlayState.svelte';
import { cancelGlide, pieceAt, playMove } from '../../lib/input/playMove';
import { createIdleDrift } from '../../lib/input/idleDrift';
import { showCursorDot } from '../../lib/input/cursorDot';
import { isCapture } from '../../lib/input/capture';
import { createPositionHistory, type TrackedPosition } from '../../lib/board/positionHistory';
import {
  MAX_ATTEMPTS,
  autoPlayDecision,
  autoPlayDelayMs,
  shouldRetry,
  splitAutoDelay,
} from '../../lib/input/autoPlay';
import { isRuntimeMessage, type StatusReply } from '../../lib/messages';
import {
  AUTO_TIMING_KEY,
  DEFAULT_TIMING,
  DEPTH_KEY,
  ELO_KEY,
  PERSONA_KEY,
  loadElos,
  loadPersonas,
  readEloChange,
  readPersonaChange,
  ARROW_COUNT_KEY,
  arrowsFor,
  loadArrows,
  readArrowChange,
  type ArrowOverrides,
  ENGINE_ENABLED_KEY,
  engineEnabled,
  loadEnabled,
  readEnabledChange,
  type EnabledOverrides,
  loadDepths,
  loadTiming,
  readDepthChange,
  sanitizeTiming,
  supportsDepth,
  THREATS_KEY,
  CURSOR_DOT_KEY,
  loadCursorDot,
  sanitizeCursorDot,
  loadThreats,
  sanitizeThreats,
  type AutoTiming,
  type DepthOverrides,
  type EloOverrides,
  type PersonaOverrides,
} from '../../lib/settings';

/** Kunci storage untuk daftar engine yang panahnya ditampilkan. */
const ARROWS_KEY = 'visibleArrows';

/** Kunci storage untuk panel data. Panah tidak ikut — keduanya diatur terpisah. */
const PANEL_KEY = 'panelVisible';

/**
 * Kunci storage untuk panel daftar rekomendasi di luar papan.
 *
 * Terpisah dari PANEL_KEY, bukan berbagi satu nilai: panel di dalam papan menutupi kotak
 * sehingga sering ditutup di tengah permainan, sedangkan yang di luar justru dipakai
 * untuk mengklik langkah. Satu tombol untuk keduanya berarti menutup yang satu memaksa
 * menutup yang lain.
 */
const MOVES_PANEL_KEY = 'movesPanelVisible';

/** Kunci storage untuk mode auto: `{ enabled, providerId }`. Mati secara bawaan. */
const AUTO_PLAY_KEY = 'autoPlay';

/**
 * Daftar engine, label, warna, dan setelan analisis semuanya berasal dari
 * `engines.config.json` lewat bridge. Tidak ada daftar engine kedua di sini — mengubah
 * engine cukup di satu berkas, dan permintaan analisis hanya menyertakan nilai yang
 * benar-benar ditimpa dari halaman pengaturan: depth, Elo, kepribadian, dan multipv
 * (jumlah panah). Sisanya dibiarkan kosong supaya `defaults` di berkas itu yang berlaku,
 * jadi menghapus setelan sama dengan kembali ke bawaan.
 */
let engines: ProviderInfo[] = [];

/**
 * Depth pilihan pengguna dari halaman pengaturan, id engine -> depth. Hanya dikirim
 * untuk engine yang punya entri di sini; sisanya dibiarkan memakai `defaults` di
 * `engines.config.json` supaya tetap ada satu sumber nilai bawaan.
 */
let depths: DepthOverrides = {};

/**
 * Target Elo dan kepribadian pilihan pengguna, id engine -> nilai. Sama seperti depth,
 * yang tidak punya entri di sini dibiarkan memakai bawaan di `engines.config.json`.
 */
let elos: EloOverrides = {};
let personas: PersonaOverrides = {};

/**
 * Rentang jeda mode auto dari halaman pengaturan. Perubahannya baru berlaku pada
 * langkah berikutnya — langkah yang jedanya sudah berjalan sengaja tidak dijadwal
 * ulang, supaya menggeser slider tidak mempercepat langkah yang sedang menunggu.
 */
let timing: AutoTiming = DEFAULT_TIMING;

/**
 * Jumlah panah per engine dari halaman pengaturan.
 *
 * Angka ini dikirim ke bridge sebagai `multipv`, jadi engine menghitung persis sebanyak
 * yang akan digambar — bukan menghitung tiga lalu membuang dua. Engine tanpa entri di
 * sini memakai `defaults.multipv` dari `engines.config.json`.
 */
let arrowCounts: ArrowOverrides = {};

/**
 * Engine yang dimatikan dari halaman pengaturan. Yang mati dibuang dari daftar aktif,
 * jadi ia tidak diminta analisis sama sekali — bukan dihitung lalu disembunyikan
 * panahnya. Efeknya sama seperti `enabled: false` di `engines.config.json`, bedanya
 * bisa dibalik seketika tanpa menyentuh berkas itu dan tanpa restart bridge.
 */
let enabledEngines: EnabledOverrides = {};

/**
 * Daftar mentah dari bridge, sebelum disaring. Disimpan karena penyaringnya bisa
 * berubah sendiri: menyalakan engine di halaman pengaturan harus bisa mengembalikannya
 * tanpa menunggu bridge mengirim ulang daftarnya.
 */
let allProviders: ProviderInfo[] = [];

/**
 * Posisi terakhir yang terbaca dari papan. Dipegang supaya engine yang baru dinyalakan
 * bisa langsung diminta menganalisis posisi sekarang — kalau harus menunggu langkah
 * berikutnya, menyalakan engine di tengah giliran terlihat seperti tidak berfungsi.
 */
let lastPosition: TrackedPosition | undefined;

/**
 * Terapkan setelan mode auto dari storage tanpa menulisnya balik.
 *
 * Nilai mentahnya sengaja diperiksa satu per satu: isi storage bisa berasal dari versi
 * ekstensi lama atau tab lain, dan mode yang menggerakkan bidak sendiri tidak boleh
 * menyala gara-gara nilai yang bentuknya tak terduga.
 */
function applyAutoPlaySetting(raw: unknown): void {
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  overlay.autoPlay.enabled = value.enabled === true;
  overlay.autoPlay.providerId = typeof value.providerId === 'string' ? value.providerId : '';
  if (!overlay.autoPlay.enabled) overlay.autoPlay.message = '';
}

/**
 * Chess.com adalah SPA: saat content script jalan, papan sering belum ada di DOM.
 * Jadi jangan menyerah kalau belum ketemu — tunggu sampai muncul.
 */
function waitForBoard(signal: AbortSignal): Promise<Element | undefined> {
  const existing = findBoard();
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const board = findBoard();
      if (!board) return;
      observer.disconnect();
      resolve(board);
    });
    observer.observe(document.documentElement, { subtree: true, childList: true });
    signal.addEventListener('abort', () => {
      observer.disconnect();
      resolve(undefined);
    });
  });
}

export default defineContentScript({
  matches: ['*://*.chess.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    debug('[cmr] content script jalan di', location.pathname);

    // Pilihan panah disimpan di storage.local supaya bertahan setelah reload dan
    // berlaku sama di semua tab chess.com.
    const stored = await browser.storage.local.get([
      ARROWS_KEY,
      PANEL_KEY,
      MOVES_PANEL_KEY,
      AUTO_PLAY_KEY,
    ]);
    const visible = stored[ARROWS_KEY];
    const isVisible = (id: string) => (Array.isArray(visible) ? visible.includes(id) : true);
    // Default-nya tampil; hanya `false` eksplisit yang menyembunyikan.
    overlay.panelVisible = stored[PANEL_KEY] !== false;
    overlay.movesPanelVisible = stored[MOVES_PANEL_KEY] !== false;
    applyAutoPlaySetting(stored[AUTO_PLAY_KEY]);
    depths = await loadDepths();
    elos = await loadElos();
    personas = await loadPersonas();
    timing = await loadTiming();
    arrowCounts = await loadArrows();
    overlay.threatsVisible = await loadThreats();
    showCursorDot(await loadCursorDot());
    enabledEngines = await loadEnabled();

    const multipvOf = (id: string) =>
      arrowsFor(arrowCounts, id, engines.find((e) => e.id === id)?.defaults?.multipv);

    const applyProviders = (list: ProviderInfo[]) => {
      allProviders = list;
      // Dua saringan yang berbeda asalnya: `ready` datang dari bridge (binari ada,
      // engine mau start), sedangkan sakelar di halaman pengaturan adalah pilihanmu.
      // Yang gugur di salah satunya tidak dianalisis dan tidak muncul di overlay.
      engines = list.filter((p) => p.ready && engineEnabled(enabledEngines, p.id));
      syncProviders(engines, isVisible);
      applyArrowCounts(arrowCounts, multipvOf);
    };

    onArrowsChanged((ids) => void browser.storage.local.set({ [ARROWS_KEY]: ids }));
    onPanelChanged((show) => void browser.storage.local.set({ [PANEL_KEY]: show }));
    onMovesPanelChanged((show) => void browser.storage.local.set({ [MOVES_PANEL_KEY]: show }));
    onAutoPlayChanged((state) => {
      void browser.storage.local.set({ [AUTO_PLAY_KEY]: state });
      // Menyalakan mode auto (atau berpindah engine) di tengah giliran harus langsung
      // berlaku. Tanpa ini, pemicunya hanya hasil analisis yang baru datang — dan untuk
      // posisi yang hasilnya sudah selesai, tidak ada lagi yang akan datang: mode auto
      // menyala tapi diam sampai langkah berikutnya.
      if (state.enabled) maybeAutoPlay();
    });

    // Bridge mungkin sudah tersambung sebelum halaman ini dimuat, jadi siaran
    // `providers` bisa sudah lewat. Tanyakan sekali di awal.
    void browser.runtime
      .sendMessage({ type: 'status' })
      .then((reply) => {
        const status = reply as StatusReply | undefined;
        if (status?.providers) applyProviders(status.providers);
      })
      .catch(() => undefined);

    // Tab lain bisa mengubah pilihan yang sama; ikuti perubahannya.
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;

      const ids = changes[ARROWS_KEY]?.newValue;
      if (Array.isArray(ids)) {
        for (const [id, view] of Object.entries(overlay.providers)) {
          view.arrowVisible = ids.includes(id);
        }
      }

      const panel = changes[PANEL_KEY]?.newValue;
      if (typeof panel === 'boolean') overlay.panelVisible = panel;

      const movesPanel = changes[MOVES_PANEL_KEY]?.newValue;
      if (typeof movesPanel === 'boolean') overlay.movesPanelVisible = movesPanel;

      // Sorotan ancaman tidak perlu analisis ulang: ia dihitung dari FEN yang sudah
      // dipegang overlay, jadi menyalakannya langsung menggambar posisi sekarang.
      if (THREATS_KEY in changes) {
        overlay.threatsVisible = sanitizeThreats(changes[THREATS_KEY]?.newValue);
      }

      if (AUTO_PLAY_KEY in changes) {
        applyAutoPlaySetting(changes[AUTO_PLAY_KEY]?.newValue);
        if (overlay.autoPlay.enabled) maybeAutoPlay();
      }

      // Depth yang berubah baru berlaku pada analisis berikutnya; posisi yang sedang
      // dihitung sengaja tidak diulang supaya menggeser slider tidak membanjiri bridge.
      if (DEPTH_KEY in changes) depths = readDepthChange(changes[DEPTH_KEY]?.newValue);
      if (ELO_KEY in changes) elos = readEloChange(changes[ELO_KEY]?.newValue);
      if (PERSONA_KEY in changes) personas = readPersonaChange(changes[PERSONA_KEY]?.newValue);
      if (AUTO_TIMING_KEY in changes) timing = sanitizeTiming(changes[AUTO_TIMING_KEY]?.newValue);
      if (CURSOR_DOT_KEY in changes) showCursorDot(sanitizeCursorDot(changes[CURSOR_DOT_KEY]?.newValue));

      // Jumlah panah berlaku langsung untuk yang sudah tergambar — memotong daftar yang
      // sudah ada tidak perlu menunggu analisis baru. Yang menunggu langkah berikutnya
      // hanyalah menambah panah, karena barisnya memang belum dihitung engine.
      if (ARROW_COUNT_KEY in changes) {
        arrowCounts = readArrowChange(changes[ARROW_COUNT_KEY]?.newValue);
        applyArrowCounts(arrowCounts, multipvOf);
      }

      // Mematikan engine berlaku seketika: ia hilang dari overlay lewat syncProviders.
      // Menyalakannya juga tidak menunggu langkah berikutnya — posisi sekarang langsung
      // diminta ulang, kalau tidak sakelarnya terlihat tidak berfungsi sampai lawan jalan.
      if (ENGINE_ENABLED_KEY in changes) {
        const before = new Set(engines.map((e) => e.id));
        enabledEngines = readEnabledChange(changes[ENGINE_ENABLED_KEY]?.newValue);
        applyProviders(allProviders);
        // Selama papan belum ketemu, tidak ada analisis berjalan dan tidak ada posisi
        // untuk diminta — daftar yang baru disaring sudah cukup.
        const position = lastPosition;
        if (!position) return;
        const active = new Set(engines.map((e) => e.id));
        // Hasil dari engine yang baru dimatikan tidak akan pernah dipakai; membiarkannya
        // di daftar tunggu hanya membuat watchdog menyimpulkan bridge diam.
        for (const id of [...awaiting]) if (!active.has(id)) awaiting.delete(id);
        for (const engine of engines) {
          if (before.has(engine.id)) continue;
          markThinking(engine.id);
          requestAnalysis(engine.id, position);
        }
      }
    });

    const board = await waitForBoard(ctx.signal);
    if (!board) return;
    debug('[cmr] papan ditemukan:', board.tagName.toLowerCase());

    // Overlay TIDAK disisipkan ke dalam wc-chess-board. Elemen itu dirender lit, yang
    // membersihkan isi container-nya tiap re-render — anak yang bukan miliknya ikut
    // tersapu tiap langkah. Jadi overlay ditaruh di body dan diposisikan mengikuti
    // kotak papan; ini juga membuatnya kebal terhadap perubahan struktur DOM chess.com.
    const ui = await createShadowRootUi(ctx, {
      name: 'cmr-overlay',
      position: 'inline',
      anchor: document.body,
      append: 'last',
      onMount: (container) => mount(Overlay, { target: container }),
      onRemove: (app) => {
        if (app) void unmount(app);
      },
    });
    ui.mount();

    // Host sengaja dibiarkan tanpa ukuran. Overlay di dalamnya memakai position:fixed
    // dengan koordinat papan, jadi geometri sepenuhnya dikendalikan komponen sendiri
    // dan tidak bergantung pada bagaimana WXT menata host-nya.
    const host = ui.shadowHost as HTMLElement;
    Object.assign(host.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      overflow: 'visible',
      pointerEvents: 'none',
      zIndex: '2147483000',
    });

    // Chess.com bisa mengganti elemen papannya dengan yang baru. Kalau referensi lama
    // dipegang terus, getBoundingClientRect() pada node yang sudah lepas mengembalikan
    // nol dan overlay menghilang permanen — padahal pembacaan posisi tetap jalan karena
    // watchBoard selalu mencari papan segar. Jadi resolve ulang tiap sinkronisasi.
    let current: Element = board;
    const resizeObserver = new ResizeObserver(() => syncPosition());

    function syncPosition(): void {
      const found = findBoard();
      if (found && found !== current) {
        debug('[cmr] elemen papan diganti, overlay mengikuti yang baru');
        current = found;
        resizeObserver.disconnect();
        resizeObserver.observe(current);
      }

      const rect = (found ?? current).getBoundingClientRect();
      overlay.rect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }

    resizeObserver.observe(current);
    syncPosition();
    debug('[cmr] overlay ter-mount, lebar papan:', overlay.rect.width);

    // Jaring pengaman: papan bisa bergeser tanpa scroll, resize, atau perubahan posisi
    // (panel samping terbuka, iklan termuat, layout berubah). Cek berkala itu murah.
    ctx.setInterval(syncPosition, 500);
    window.addEventListener('scroll', syncPosition, {
      capture: true,
      passive: true,
      signal: ctx.signal,
    });
    window.addEventListener('resize', syncPosition, { passive: true, signal: ctx.signal });

    browser.runtime.onMessage.addListener((raw: unknown) => {
      if (!isRuntimeMessage(raw)) return;
      if (raw.type === 'providers') applyProviders(raw.providers);
      else if (raw.type === 'analysis') {
        if (raw.final) awaiting.delete(raw.result.providerId);
        applyResult(raw.result, raw.final);
        if (raw.final) maybeAutoPlay();
      } else if (raw.type === 'engineError') {
        warn('[cmr] engine error:', raw.message);
        awaiting.clear();
        markProblem('blocked', raw.message);
      }
    });

    let reqId = 0;

    /**
     * Engine yang permintaannya sudah diterima bridge tapi hasilnya belum kembali.
     *
     * Diterima ≠ selesai: service worker MV3 bisa dimatikan Chrome di tengah analisis,
     * dan peta `reqId -> tab` di background ikut hilang bersamanya — hasilnya tidak
     * pernah sampai ke tab mana pun. Tanpa pengawas, panel berhenti di status
     * "thinking" sampai langkah berikutnya, persis seperti tidak ada saran sama sekali.
     */
    const awaiting = new Set<string>();
    let watchdog: ReturnType<typeof ctx.setTimeout> | undefined;
    let watchdogFen: string | undefined;

    /** Depth 18 bisa makan beberapa detik; beri kelonggaran sebelum menyimpulkan hilang. */
    const WATCHDOG_MS = 25_000;

    function armWatchdog(position: TrackedPosition, retried = false): void {
      clearTimeout(watchdog);
      watchdogFen = position.fen;
      watchdog = ctx.setTimeout(() => {
        if (awaiting.size === 0 || watchdogFen !== position.fen) return;
        const lost = [...awaiting];
        if (!retried) {
          warn('[cmr] hasil tidak kembali, meminta ulang:', lost.join(', '));
          for (const id of lost) requestAnalysis(id, position);
          armWatchdog(position, true);
          return;
        }
        warn('[cmr] hasil tetap tidak kembali setelah diminta ulang:', lost.join(', '));
        markProblem('offline', 'bridge diam, tidak ada hasil');
      }, WATCHDOG_MS);
    }

    /**
     * Service worker MV3 bisa tidur di antara dua langkah. Permintaan pertama setelah ia
     * bangun sering gagal karena WebSocket ke bridge belum tersambung ulang — dan tanpa
     * percobaan kedua, papan akan diam tanpa saran sampai langkah berikutnya.
     */
    /** Depth hanya relevan untuk engine pencari; mode policy diabaikan. */
    function depthFor(providerId: string): number | undefined {
      const engine = engines.find((e) => e.id === providerId);
      if (!engine || !supportsDepth(engine.kind)) return undefined;
      return depths[engine.id];
    }

    function requestAnalysis(providerId: string, position: TrackedPosition, attempt = 1): void {
      void browser.runtime
        .sendMessage({
          type: 'analyze',
          reqId: `r${++reqId}`,
          providerId,
          fen: position.fen,
          // Rantai langkah dikirim apa adanya; bridge yang memverifikasinya sebelum
          // dipercayakan ke engine.
          startFen: position.startFen,
          moves: position.moves,
          depth: depthFor(providerId),
          multipv: arrowCounts[providerId],
          elo: elos[providerId],
          persona: personas[providerId],
        })
        .then((reply) => {
          const ok = (reply as { ok?: boolean } | undefined)?.ok;
          if (ok) {
            awaiting.add(providerId);
            return;
          }
          if (attempt < 3) {
            ctx.setTimeout(() => requestAnalysis(providerId, position, attempt + 1), 500 * attempt);
            return;
          }
          warn('[cmr] bridge tidak menerima permintaan setelah 3 percobaan');
          markProblem('offline', 'bridge tidak terhubung');
        })
        .catch((err) => {
          warn('[cmr] gagal kirim ke background:', err);
          markProblem('offline', 'background tidak merespons');
        });
    }

    /**
     * Langkah yang sudah dimainkan mode auto, supaya satu posisi tidak dimainkan dua
     * kali — hasil analisis untuk fen yang sama bisa datang berkali-kali (partial lalu
     * final, atau permintaan ulang dari watchdog).
     */
    let autoPlayedFen: string | undefined;
    let autoTimer: ReturnType<typeof ctx.setTimeout> | undefined;
    /** Berapa kali posisi sekarang sudah dicoba, dan kapan percobaan terakhirnya. */
    let autoAttempts = 0;
    let autoLastAttemptAt = 0;
    /** Alasan penolakan terakhir; denyut tiap detik tidak perlu mencatat hal yang sama. */
    let autoLastReason = '';
    /**
     * Sampai kapan kursor dipegang mode auto.
     *
     * Gerak menganggur dan langkah sungguhan memakai kursor maya yang sama, jadi salah
     * satu harus mengalah. Yang mengalah adalah yang menganggur — batas ini dipasang
     * sejak langkah dijadwalkan, bukan saat kliknya dikirim, karena selama jeda berpikir
     * pun kursornya sudah dipesan.
     */
    let autoBusyUntil = 0;

    /**
     * Coba mainkan langkah terbaik untuk posisi sekarang.
     *
     * Dipanggil tiap hasil final datang. Setiap jalan keluar menuliskan alasannya —
     * mode ini bekerja tanpa diminta, jadi "tidak bergerak" harus selalu bisa
     * dibedakan dari "rusak".
     */
    function maybeAutoPlay(): void {
      if (!overlay.autoPlay.enabled) return;

      const fen = overlay.fen;
      const decision = autoPlayDecision({
        enabled: overlay.autoPlay.enabled,
        fen,
        orientation: overlay.orientation,
        playedFen: autoPlayedFen,
      });
      if (!decision.play) {
        // Sudah pernah dicoba untuk posisi ini — tapi "dicoba" belum tentu "jadi".
        // Kalau papan masih menunjukkan posisi yang sama setelah jeda yang wajar,
        // percobaannya tidak berbuah dan boleh diulang sampai batas tertentu.
        const retry =
          decision.reason === 'sudah dimainkan' &&
          shouldRetry({ attempts: autoAttempts, sinceLastMs: Date.now() - autoLastAttemptAt });
        if (!retry) {
          if (decision.reason !== autoLastReason) {
            debug('[cmr] auto tidak jalan:', decision.reason);
            autoLastReason = decision.reason;
          }
          if (decision.reason !== 'sudah dimainkan') {
            // Jangan timpa pesan langkah yang sedang ditampilkan hanya karena engine
            // lain ikut mengirim hasil untuk posisi yang sama.
            overlay.autoPlay.message = decision.reason;
          } else if (autoAttempts >= MAX_ATTEMPTS) {
            // Sudah dicoba klik maupun drag berkali-kali dan papan tetap pada posisi
            // yang sama. Katakan, jangan diam — ini bukan keadaan yang normal.
            overlay.autoPlay.message = 'papan tidak merespons';
          }
          return;
        }
        warn(`[cmr] auto: percobaan ${autoAttempts} tidak berbuah, ulangi`);
      }

      const id = autoPlayProviderId();
      const best = id ? overlay.providers[id]?.suggestions[0] : undefined;
      if (!id) {
        debug('[cmr] auto tidak jalan: belum ada engine');
        overlay.autoPlay.message = 'belum ada engine';
        return;
      }
      if (!best) {
        // Engine pilihan belum mengirim hasil; engine lain mungkin sudah. Ini normal
        // sesaat, dan panggilan berikutnya akan mencoba lagi.
        debug(`[cmr] auto menunggu hasil dari ${id}`);
        overlay.autoPlay.message = `menunggu ${overlay.providers[id]?.label ?? id}`;
        return;
      }

      // Ditandai sebelum jeda, bukan sesudah: selama menunggu, hasil final dari engine
      // lain untuk posisi yang sama masih berdatangan, dan tanpa tanda ini setiap satu
      // di antaranya akan menjadwalkan langkah kedua untuk posisi yang sama.
      autoPlayedFen = fen;
      autoLastReason = '';
      autoAttempts += 1;
      autoLastAttemptAt = Date.now();
      // Percobaan ganjil memakai klik, genap memakai drag. Chess.com punya setelan
      // "move method" yang bisa diset drag saja, dan di papan seperti itu klik tidak
      // menghasilkan apa pun tanpa error — jadi keduanya digilir, bukan salah satu saja.
      const style: 'click' | 'drag' = autoAttempts % 2 === 1 ? 'click' : 'drag';
      // Satu anggaran waktu untuk seluruh langkah, lalu dibagi jadi jeda berpikir dan
      // jeda antar-klik — bukan dua jeda yang saling menumpuk.
      // Langkah memakan punya anggaran waktunya sendiri, biasanya lebih pendek. Sifat
      // langkahnya dibaca dari papan yang sedang tampil, bukan dari FEN hasil rantai
      // langkah kita: kalau rantai itu sedang meleset, yang salah cuma pilihan jeda
      // kalau sumbernya papan — sedangkan menebak dari FEN yang salah bisa berarti
      // memilih jeda berdasarkan posisi yang tidak ada.
      const board = findBoard();
      const capture =
        !!board && isCapture({ from: best.uci.slice(0, 2), to: best.uci.slice(2, 4) }, (square) => pieceAt(board, square));
      const total = autoPlayDelayMs(capture ? timing.capture : timing);
      const { thinkMs, clickMs } = splitAutoDelay(total);
      overlay.autoPlay.message = `${best.san ?? best.uci} dalam ${(total / 1000).toFixed(1)}s`;
      // Sisa perjalanan kursor masih berlangsung setelah jeda antar-klik habis, jadi
      // dilebihkan sedikit — gerak menganggur yang menyela di detik terakhir akan
      // membatalkan klik tujuannya.
      autoBusyUntil = Date.now() + total + 1_000;

      clearTimeout(autoTimer);
      autoTimer = ctx.setTimeout(() => {
        // Posisi bisa berubah selama jeda — lawan bergerak, kamu sendiri yang jalan
        // duluan, papan diganti. Memainkan langkah lama di posisi baru adalah blunder
        // yang dibuat ekstensi, bukan olehmu.
        if (overlay.fen !== fen) {
          debug('[cmr] auto batal: posisi berubah selama jeda');
          overlay.autoPlay.message = 'batal, posisi berubah';
          return;
        }
        debug(`[cmr] auto memainkan ${best.san ?? best.uci} (${best.uci}) via ${style}`);
        // Gerak menganggur bisa sedang di tengah jalan; hentikan dulu supaya jalur
        // kursor tidak terbelah antara dua tujuan.
        cancelGlide();
        const failure = playMove(
          {
            from: best.uci.slice(0, 2),
            to: best.uci.slice(2, 4),
            promotion: best.uci.length > 4 ? best.uci[4] : undefined,
          },
          { clickDelayMs: clickMs, style },
        );
        overlay.autoPlay.message = failure ? failure.error : (best.san ?? best.uci);
      }, thinkMs);
    }

    /**
     * Denyut ulang untuk mode auto.
     *
     * Pemicu utamanya adalah hasil analisis yang baru datang — dan itu tidak cukup:
     * kalau posisinya tidak berubah, tidak akan pernah ada hasil baru. Persis itu yang
     * terjadi di langkah pembuka saat kamu putih: posisi awal dianalisis sekali, sering
     * sebelum papan benar-benar bisa dimainkan, lalu semuanya diam sampai kamu jalan
     * sendiri secara manual. Denyut ini yang mencobanya lagi.
     */
    /**
     * Gerak kursor selagi menunggu.
     *
     * Ikut hidup-mati bersama mode auto: kursor yang bergerak sendiri hanya masuk akal
     * di papan yang memang sedang dimainkan sendiri. Rekomendasinya diambil dari engine
     * yang sama dengan yang dituruti mode auto, supaya yang "dilihat-lihat" kursor
     * adalah langkah-langkah yang memang sedang dipertimbangkan.
     */
    const idleDrift = createIdleDrift({
      idle: () => overlay.autoPlay.enabled && Date.now() >= autoBusyUntil,
      moves: () => {
        const id = autoPlayProviderId();
        return id ? (overlay.providers[id]?.suggestions ?? []).map((s) => s.uci) : [];
      },
    });

    ctx.setInterval(() => {
      if (!overlay.autoPlay.enabled) return;
      maybeAutoPlay();
      idleDrift.tick();
    }, 1_000);

    const history = createPositionHistory();

    watchBoard({
      onChange: (snapshot) => {
        overlay.orientation = snapshot.orientation;

        // Rantai langkah menggantikan sebagian tebakan `inferState`: hak rokade, target
        // en passant, dan halfmove clock jadi hasil perhitungan dari posisi jangkar,
        // bukan dibaca ulang dari sorotan kotak tiap langkah.
        const position = history.observe({ fen: snapshot.fen!, turnKnown: snapshot.turnKnown });
        lastPosition = position;
        if (position.reanchored) {
          debug('[cmr] rantai langkah dimulai ulang:', position.reanchored);
        }

        // Mode auto memeriksa fen ini sebelum dan sesudah jeda, jadi ia harus selalu
        // menunjuk pembacaan yang sama dengan yang dikirim ke engine.
        overlay.fen = position.fen;
        overlay.assumptions = snapshot.assumptions;
        overlay.turnKnown = position.turnKnown;
        syncPosition();

        debug(
          `[cmr] posisi: ${position.fen} (sorotan: ${snapshot.highlights.length}, ` +
            `rantai: ${position.moves.length} langkah)`,
        );
        markThinking();
        overlay.autoPlay.message = '';
        autoLastReason = '';
        autoAttempts = 0;
        autoLastAttemptAt = 0;
        awaiting.clear();
        clearTimeout(watchdog);
        if (engines.length === 0) {
          markProblem('offline', 'belum ada engine dari bridge');
          return;
        }
        for (const engine of engines) requestAnalysis(engine.id, position);
        armWatchdog(position);
      },
      onBoardMissing: () => markProblem('idle', 'papan tidak terbaca'),
    });
  },
});
