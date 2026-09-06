<script lang="ts">
  import { browser } from 'wxt/browser';
  import type { ProviderInfo } from '@cmr/shared';
  import type { StatusReply } from '../../lib/messages';

  // Jangan menamai variabel `state`: `$state` akan dibaca Svelte sebagai akses store
  // bernama `state`, bukan rune.
  let bridgeState = $state('memuat...');
  let detail = $state<string | null>(null);
  let providers = $state<ProviderInfo[]>([]);

  const LABEL: Record<string, string> = {
    connected: 'terhubung',
    connecting: 'menyambung...',
    offline: 'bridge mati',
  };

  function apply(values: Record<string, unknown>) {
    if (typeof values.bridgeState === 'string') bridgeState = values.bridgeState;
    if (values.bridgeDetail === null || typeof values.bridgeDetail === 'string') {
      detail = values.bridgeDetail;
    }
    if (Array.isArray(values.providers)) providers = values.providers as ProviderInfo[];
  }

  // Membuka popup membangunkan service worker, yang langsung memulai koneksi baru.
  // Jadi jawaban sekali-tanya hampir selalu tertangkap saat masih "connecting" —
  // status harus diikuti terus lewat storage.session, bukan difoto sekali.
  void browser.storage.session.get(['bridgeState', 'bridgeDetail', 'providers']).then(apply);

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session') return;
    const values: Record<string, unknown> = {};
    for (const [key, change] of Object.entries(changes)) values[key] = change.newValue;
    apply(values);
  });

  // Tetap kirim status sekali untuk membangunkan background kalau ia sedang tidur.
  void browser.runtime
    .sendMessage({ type: 'status' })
    .then((reply) => {
      const status = reply as StatusReply | undefined;
      if (status) apply({ bridgeState: status.state, providers: status.providers });
    })
    .catch(() => {
      bridgeState = 'background tidak merespons';
    });
</script>

<main>
  <h1>Chess Move Reader</h1>

  <p class="state" class:ok={bridgeState === 'connected'}>
    Bridge: {LABEL[bridgeState] ?? bridgeState}
    {#if detail}<span class="detail">{detail}</span>{/if}
  </p>

  {#if bridgeState === 'offline'}
    <p class="hint">Jalankan <code>pnpm bridge</code> di folder proyek.</p>
  {/if}

  <ul>
    {#each providers as provider (provider.id)}
      <li>
        <span class="dot" class:ready={provider.ready}></span>
        <span class="name">{provider.label}</span>
        <span class="kind">{provider.kind === 'strength' ? 'terkuat' : 'manusiawi'}</span>
        {#if !provider.ready}<span class="problem">{provider.problem}</span>{/if}
      </li>
    {:else}
      <li class="empty">Belum ada provider.</li>
    {/each}
  </ul>
</main>

<style>
  main {
    width: 300px;
    padding: 12px 14px;
    font: 13px/1.5 system-ui, sans-serif;
    color: #1c1917;
    background: #fafaf9;
  }
  h1 { margin: 0 0 8px; font-size: 14px; }
  .state { margin: 0 0 6px; color: #b91c1c; }
  .state.ok { color: #15803d; }
  .detail { color: #78716c; font-size: 11px; }
  .hint { margin: 0 0 8px; color: #57534e; font-size: 12px; }
  code { background: #e7e5e4; padding: 1px 4px; border-radius: 3px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  li { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #a8a29e; flex: none; }
  .dot.ready { background: #16a34a; }
  .name { font-weight: 600; }
  .kind { color: #78716c; font-size: 11px; }
  .problem { width: 100%; color: #a16207; font-size: 11px; padding-left: 14px; }
  .empty { color: #78716c; }

  @media (prefers-color-scheme: dark) {
    main { color: #e7e5e4; background: #1c1917; }
    code { background: #292524; }
    .hint, .kind, .empty, .detail { color: #a8a29e; }
  }
</style>
