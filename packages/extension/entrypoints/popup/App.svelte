<script lang="ts">
  import { browser } from 'wxt/browser';
  import type { ProviderInfo } from '@cmr/shared';
  import type { StatusReply } from '../../lib/messages';
  import { DEPTH_KEY, readDepthChange, supportsDepth, type DepthOverrides } from '../../lib/settings';

  // Jangan menamai variabel `state`: `$state` akan dibaca Svelte sebagai akses store
  // bernama `state`, bukan rune.
  let bridgeState = $state('memuat...');
  let detail = $state<string | null>(null);
  let providers = $state<ProviderInfo[]>([]);
  let depths = $state<DepthOverrides>({});

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
  void browser.storage.local.get(DEPTH_KEY).then((v) => (depths = readDepthChange(v[DEPTH_KEY])));

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && DEPTH_KEY in changes) {
      depths = readDepthChange(changes[DEPTH_KEY]?.newValue);
      return;
    }
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

  /**
   * Engine yang siap dan yang dimatikan dipisah. Dulu keduanya berbaur dalam satu
   * daftar dan tiap engine mati menyisipkan satu baris keterangan sendiri, jadi daftar
   * pendek pun terlihat seperti tumpukan peringatan. Sekarang alasannya cukup ditulis
   * sekali untuk seluruh kelompok.
   */
  const ready = $derived(providers.filter((p) => p.ready));
  const disabled = $derived(providers.filter((p) => !p.ready));

  /** Depth yang benar-benar dipakai: pilihan pengguna kalau ada, kalau tidak bawaan. */
  function depthOf(provider: ProviderInfo): number | undefined {
    if (!supportsDepth(provider.kind)) return undefined;
    return depths[provider.id] ?? provider.defaults?.depth;
  }

  function openSettings(): void {
    // Jangan panggil window.close() di sini. openOptionsPage() asinkron, dan menutup
    // popup secara sinkron membongkar konteksnya sebelum permintaan itu sempat terkirim
    // — hasilnya popup hilang tanpa ada tab yang terbuka. Browser sendiri yang menutup
    // popup begitu fokus pindah ke tab pengaturan.
    void browser.runtime.openOptionsPage();
  }
</script>

<main>
  <header>
    <h1>Chess Move Reader</h1>
    <button type="button" class="settings" onclick={openSettings} title="Atur depth tiap engine">
      Depth
    </button>
  </header>

  <p class="state" class:ok={bridgeState === 'connected'}>
    <span class="dot" class:ready={bridgeState === 'connected'}></span>
    Bridge {LABEL[bridgeState] ?? bridgeState}
    {#if detail}<span class="detail">{detail}</span>{/if}
  </p>

  {#if bridgeState === 'offline'}
    <p class="hint">Jalankan <code>pnpm bridge</code> di folder proyek.</p>
  {/if}

  {#if providers.length === 0}
    <p class="empty">Belum ada engine.</p>
  {:else}
    {#if ready.length > 0}
      <ul>
        {#each ready as provider (provider.id)}
          {@const depth = depthOf(provider)}
          <li>
            <span class="dot ready"></span>
            <span class="name">{provider.label}</span>
            <span class="kind">{provider.kind === 'strength' ? 'terkuat' : 'manusiawi'}</span>
            {#if depth !== undefined}
              <span class="depth" class:custom={depths[provider.id] !== undefined}>d{depth}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if disabled.length > 0}
      <details>
        <summary>{disabled.length} engine tidak aktif</summary>
        <ul class="off">
          {#each disabled as provider (provider.id)}
            <li>
              <span class="dot"></span>
              <span class="name">{provider.label}</span>
              <span class="problem">{provider.problem ?? 'dimatikan di engines.config.json'}</span>
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  {/if}
</main>

<style>
  /* Popup mewarisi margin bawaan <body>, dan latar halaman browser bocor lewat celah
     itu sebagai bingkai putih di sekeliling panel. Jadi margin dinolkan dan warna
     panel dipasang di <body> sendiri, bukan cuma di <main>. */
  :global(html),
  :global(body) {
    margin: 0;
    background: #fafaf9;
  }
  main {
    width: 300px;
    box-sizing: border-box;
    padding: 12px 14px;
    font: 13px/1.5 system-ui, sans-serif;
    color: #1c1917;
    background: #fafaf9;
  }

  header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  h1 { margin: 0; font-size: 14px; }
  .settings {
    margin-left: auto;
    padding: 3px 9px;
    border: 1px solid #d6d3d1;
    border-radius: 5px;
    background: #fff;
    color: #44403c;
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;
  }
  .settings:hover { background: #f5f5f4; }
  .settings:focus-visible { outline: 2px solid #93c5fd; }

  .state { display: flex; align-items: center; gap: 6px; margin: 0 0 8px; color: #b91c1c; }
  .state.ok { color: #15803d; }
  .detail { color: #78716c; font-size: 11px; }
  .hint { margin: 0 0 8px; color: #57534e; font-size: 12px; }
  code { background: #e7e5e4; padding: 1px 4px; border-radius: 3px; }

  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; }
  li { display: flex; align-items: center; gap: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #a8a29e; flex: none; }
  .dot.ready { background: #16a34a; }
  .name { font-weight: 600; }
  .kind { color: #78716c; font-size: 11px; }
  /* Depth berdiri di kanan sebagai kolom sendiri supaya sekilas terlihat mana yang
     sudah diubah dari bawaannya. */
  .depth {
    margin-left: auto;
    color: #78716c;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .depth.custom { color: #2563eb; font-weight: 600; }

  details { margin-top: 10px; border-top: 1px solid #e7e5e4; padding-top: 8px; }
  summary { color: #78716c; font-size: 11.5px; cursor: pointer; }
  ul.off { margin-top: 6px; }
  ul.off .name { font-weight: 500; color: #78716c; }
  .problem { margin-left: auto; color: #a16207; font-size: 11px; }
  .empty { margin: 0; color: #78716c; }

  @media (prefers-color-scheme: dark) {
    :global(html),
    :global(body) { background: #1c1917; }
    main { color: #e7e5e4; background: #1c1917; }
    code { background: #292524; }
    .hint, .kind, .empty, .detail, .depth, summary { color: #a8a29e; }
    .settings { border-color: #44403c; background: #232020; color: #e7e5e4; }
    .settings:hover { background: #292524; }
    .depth.custom { color: #93c5fd; }
    details { border-color: #292524; }
    ul.off .name { color: #a8a29e; }
  }
</style>
