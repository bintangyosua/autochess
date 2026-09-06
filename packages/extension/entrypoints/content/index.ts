import { mount, unmount } from 'svelte';
import { browser } from 'wxt/browser';
import Overlay from './Overlay.svelte';
import { watchBoard } from '../../lib/board/DomBoardReader';
import { findBoard } from '../../lib/board/selectors';
import type { ProviderInfo } from '@cmr/shared';
import {
  applyResult,
  markProblem,
  markThinking,
  onArrowsChanged,
  onPanelChanged,
  overlay,
  syncProviders,
} from '../../lib/overlayState.svelte';
import { isRuntimeMessage, type StatusReply } from '../../lib/messages';
import {
  DEPTH_KEY,
  loadDepths,
  readDepthChange,
  supportsDepth,
  type DepthOverrides,
} from '../../lib/settings';

/** Kunci storage untuk daftar engine yang panahnya ditampilkan. */
const ARROWS_KEY = 'visibleArrows';

/** Kunci storage untuk panel data. Panah tidak ikut — keduanya diatur terpisah. */
const PANEL_KEY = 'panelVisible';

/**
 * Daftar engine, label, warna, dan setelan analisis semuanya berasal dari
 * `engines.config.json` lewat bridge. Tidak ada daftar engine kedua di sini — mengubah
 * engine cukup di satu berkas, dan permintaan analisis sengaja tidak menyertakan
 * movetime/multipv supaya `defaults` di berkas itu yang berlaku. Satu-satunya nilai yang
 * bisa ditimpa dari UI adalah depth, lewat halaman pengaturan.
 */
let engines: ProviderInfo[] = [];

/**
 * Depth pilihan pengguna dari halaman pengaturan, id engine -> depth. Hanya dikirim
 * untuk engine yang punya entri di sini; sisanya dibiarkan memakai `defaults` di
 * `engines.config.json` supaya tetap ada satu sumber nilai bawaan.
 */
let depths: DepthOverrides = {};

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
    console.log('[cmr] content script jalan di', location.pathname);

    // Pilihan panah disimpan di storage.local supaya bertahan setelah reload dan
    // berlaku sama di semua tab chess.com.
    const stored = await browser.storage.local.get([ARROWS_KEY, PANEL_KEY]);
    const visible = stored[ARROWS_KEY];
    const isVisible = (id: string) => (Array.isArray(visible) ? visible.includes(id) : true);
    // Default-nya tampil; hanya `false` eksplisit yang menyembunyikan.
    overlay.panelVisible = stored[PANEL_KEY] !== false;
    depths = await loadDepths();

    const applyProviders = (list: ProviderInfo[]) => {
      // Hanya engine yang siap yang dianalisis; yang dimatikan di config tidak muncul.
      engines = list.filter((p) => p.ready);
      syncProviders(engines, isVisible);
    };

    onArrowsChanged((ids) => void browser.storage.local.set({ [ARROWS_KEY]: ids }));
    onPanelChanged((show) => void browser.storage.local.set({ [PANEL_KEY]: show }));

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

      // Depth yang berubah baru berlaku pada analisis berikutnya; posisi yang sedang
      // dihitung sengaja tidak diulang supaya menggeser slider tidak membanjiri bridge.
      if (DEPTH_KEY in changes) depths = readDepthChange(changes[DEPTH_KEY]?.newValue);
    });

    const board = await waitForBoard(ctx.signal);
    if (!board) return;
    console.log('[cmr] papan ditemukan:', board.tagName.toLowerCase());

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
        console.log('[cmr] elemen papan diganti, overlay mengikuti yang baru');
        current = found;
        resizeObserver.disconnect();
        resizeObserver.observe(current);
      }

      const rect = (found ?? current).getBoundingClientRect();
      overlay.rect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }

    resizeObserver.observe(current);
    syncPosition();
    console.log('[cmr] overlay ter-mount, lebar papan:', overlay.rect.width);

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
      } else if (raw.type === 'engineError') {
        console.warn('[cmr] engine error:', raw.message);
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

    function armWatchdog(fen: string, retried = false): void {
      clearTimeout(watchdog);
      watchdogFen = fen;
      watchdog = ctx.setTimeout(() => {
        if (awaiting.size === 0 || watchdogFen !== fen) return;
        const lost = [...awaiting];
        if (!retried) {
          console.warn('[cmr] hasil tidak kembali, meminta ulang:', lost.join(', '));
          for (const id of lost) requestAnalysis(id, fen);
          armWatchdog(fen, true);
          return;
        }
        console.warn('[cmr] hasil tetap tidak kembali setelah diminta ulang:', lost.join(', '));
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

    function requestAnalysis(providerId: string, fen: string, attempt = 1): void {
      void browser.runtime
        .sendMessage({
          type: 'analyze',
          reqId: `r${++reqId}`,
          providerId,
          fen,
          depth: depthFor(providerId),
        })
        .then((reply) => {
          const ok = (reply as { ok?: boolean } | undefined)?.ok;
          if (ok) {
            awaiting.add(providerId);
            return;
          }
          if (attempt < 3) {
            ctx.setTimeout(() => requestAnalysis(providerId, fen, attempt + 1), 500 * attempt);
            return;
          }
          console.warn('[cmr] bridge tidak menerima permintaan setelah 3 percobaan');
          markProblem('offline', 'bridge tidak terhubung');
        })
        .catch((err) => {
          console.warn('[cmr] gagal kirim ke background:', err);
          markProblem('offline', 'background tidak merespons');
        });
    }

    watchBoard({
      onChange: (snapshot) => {
        overlay.orientation = snapshot.orientation;
        overlay.assumptions = snapshot.assumptions;
        overlay.turnKnown = snapshot.turnKnown;
        syncPosition();

        console.log(`[cmr] posisi: ${snapshot.fen} (sorotan: ${snapshot.highlights.length})`);
        markThinking();
        awaiting.clear();
        clearTimeout(watchdog);
        if (engines.length === 0) {
          markProblem('offline', 'belum ada engine dari bridge');
          return;
        }
        for (const engine of engines) requestAnalysis(engine.id, snapshot.fen!);
        armWatchdog(snapshot.fen!);
      },
      onBoardMissing: () => markProblem('idle', 'papan tidak terbaca'),
    });
  },
});
