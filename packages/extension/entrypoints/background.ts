import { browser } from 'wxt/browser';
import { EngineClient } from '../lib/engineClient';
import { isRuntimeMessage, type AnalyzeReply, type RuntimeMessage, type StatusReply } from '../lib/messages';

export default defineBackground(() => {
  /** reqId -> tab yang memintanya, supaya hasil dikirim balik ke tab yang benar. */
  const requesters = new Map<string, number>();

  const toTab = (reqId: string, message: RuntimeMessage) => {
    const tabId = requesters.get(reqId);
    if (tabId === undefined) return;
    void browser.tabs.sendMessage(tabId, message).catch(() => {
      // Tab bisa saja sudah ditutup atau berpindah halaman.
      requesters.delete(reqId);
    });
  };

  const client = new EngineClient({
    onState: (state, detail) => {
      console.log(`[cmr] bridge ${state}${detail ? ` (${detail})` : ''}`);
      void browser.storage.session.set({
        bridgeState: state,
        bridgeDetail: detail ?? null,
        // Daftar provider ikut hilang saat koneksi putus; jangan biarkan sisa yang lama
        // terpampang seolah masih siap.
        ...(state === 'connected' ? {} : { providers: [] }),
      });
    },
    onProviders: (providers) => {
      console.log('[cmr] provider:', providers.map((p) => `${p.id}=${p.ready ? 'siap' : p.problem}`));
      void browser.storage.session.set({ providers });
    },
    onPartial: (reqId, result) => toTab(reqId, { type: 'analysis', reqId, result, final: false }),
    onResult: (reqId, result) => {
      toTab(reqId, { type: 'analysis', reqId, result, final: true });
      requesters.delete(reqId);
      void browser.storage.session.set({ lastResult: result });
    },
    onError: (reqId, code, message) => {
      console.warn(`[cmr] error ${reqId ?? '-'}: ${code} — ${message}`);
      if (reqId) {
        toTab(reqId, { type: 'engineError', reqId, code, message });
        requesters.delete(reqId);
      }
    },
  });

  client.connect();

  browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse: (r: unknown) => void) => {
    if (!isRuntimeMessage(raw)) return false;

    if (raw.type === 'status') {
      sendResponse({ state: client.state, providers: client.providers } satisfies StatusReply);
      return true;
    }

    if (raw.type === 'analyze') {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) requesters.set(raw.reqId, tabId);
      const ok = client.analyze({
        reqId: raw.reqId,
        providerId: raw.providerId,
        fen: raw.fen,
        movetimeMs: raw.movetimeMs,
        multipv: raw.multipv,
      });
      if (!ok) requesters.delete(raw.reqId);
      sendResponse({ ok, state: client.state } satisfies AnalyzeReply);
      return true;
    }

    return false;
  });
});
