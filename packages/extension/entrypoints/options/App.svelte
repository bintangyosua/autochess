<script lang="ts">
  import { browser } from 'wxt/browser';
  import type { ProviderInfo } from '@cmr/shared';
  import type { StatusReply } from '../../lib/messages';
  import {
    AUTO_TIMING_KEY,
    DEFAULT_TIMING,
    DEPTH_KEY,
    DEPTH_MAX,
    DEPTH_MIN,
    loadDepths,
    readDepthChange,
    loadTiming,
    sanitizeTiming,
    saveDepths,
    saveTiming,
    supportsDepth,
    TIMING_MAX_MS,
    TIMING_MIN_MS,
    TIMING_STEP_MS,
    type AutoTiming,
    type DepthOverrides,
  } from '../../lib/settings';

  let providers = $state<ProviderInfo[]>([]);
  let depths = $state<DepthOverrides>({});
  let loaded = $state(false);
  let timing = $state<AutoTiming>(DEFAULT_TIMING);

  // Daftar engine tetap datang dari bridge — halaman ini tidak punya daftarnya sendiri,
  // jadi engine yang dimatikan di engines.config.json juga tidak muncul di sini.
  void browser.storage.session.get('providers').then((values) => {
    if (Array.isArray(values.providers)) providers = values.providers as ProviderInfo[];
  });

  void browser.runtime
    .sendMessage({ type: 'status' })
    .then((reply) => {
      const status = reply as StatusReply | undefined;
      if (status?.providers) providers = status.providers;
    })
    .catch(() => undefined);

  void loadTiming().then((values) => {
    timing = values;
  });

  void loadDepths().then((values) => {
    depths = values;
    loaded = true;
  });

  // Popup dan tab lain bisa mengubah nilai yang sama; ikuti perubahannya.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && Array.isArray(changes.providers?.newValue)) {
      providers = changes.providers.newValue as ProviderInfo[];
    }
    if (area === 'local' && DEPTH_KEY in changes) {
      depths = readDepthChange(changes[DEPTH_KEY]?.newValue);
    }
    if (area === 'local' && AUTO_TIMING_KEY in changes) {
      timing = sanitizeTiming(changes[AUTO_TIMING_KEY]?.newValue);
    }
  });

  const searchers = $derived(providers.filter((p) => supportsDepth(p.kind)));

  /** Nilai yang sedang berlaku: pilihan pengguna kalau ada, kalau tidak bawaan config. */
  function effective(provider: ProviderInfo): number {
    return depths[provider.id] ?? provider.defaults?.depth ?? DEPTH_MIN;
  }

  function set(provider: ProviderInfo, raw: number): void {
    const depth = Math.min(DEPTH_MAX, Math.max(DEPTH_MIN, Math.round(raw)));
    depths = { ...depths, [provider.id]: depth };
    void saveDepths(depths);
  }

  function reset(provider: ProviderInfo): void {
    const { [provider.id]: _removed, ...rest } = depths;
    depths = rest;
    void saveDepths(depths);
  }

  /**
   * Menggeser satu ujung ikut mendorong ujung lainnya kalau keduanya berpapasan.
   * Rentang terbalik tidak punya arti, dan menolak input diam-diam lebih
   * membingungkan daripada memindahkan ujung yang satunya di depan mata.
   */
  function setTiming(edge: 'minMs' | 'maxMs', raw: number): void {
    const next = { ...timing, [edge]: raw };
    if (edge === 'minMs' && next.minMs > next.maxMs) next.maxMs = next.minMs;
    if (edge === 'maxMs' && next.maxMs < next.minMs) next.minMs = next.maxMs;
    timing = sanitizeTiming(next);
    void saveTiming(timing);
  }

  function resetTiming(): void {
    timing = DEFAULT_TIMING;
    void saveTiming(timing);
  }

  const timingChanged = $derived(
    timing.minMs !== DEFAULT_TIMING.minMs || timing.maxMs !== DEFAULT_TIMING.maxMs,
  );

  function seconds(ms: number): string {
    return (ms / 1000).toFixed(1).replace('.', ',');
  }

  function resetAll(): void {
    depths = {};
    void saveDepths(depths);
  }
</script>

<main>
  <header>
    <h1>Pengaturan</h1>
  </header>

  <section class="block">
    <div class="top">
      <h2>Jeda mode auto</h2>
      {#if timingChanged}
        <button type="button" class="link" onclick={resetTiming}>kembalikan ke bawaan</button>
      {:else}
        <span class="tag">bawaan</span>
      {/if}
      <span class="value">{seconds(timing.minMs)}–{seconds(timing.maxMs)}s</span>
    </div>
    <p class="lead">
      Waktu acak antara hasil engine dan bidak mendarat di papan. Angka ini untuk langkah
      utuh — jeda antar-klik diambil dari dalamnya, bukan ditambahkan di atasnya. Waktu
      berpikir engine sendiri diatur lewat depth di bawah.
    </p>

    <div class="row">
      <label for="tmin">min</label>
      <input
        id="tmin"
        type="range"
        min={TIMING_MIN_MS}
        max={TIMING_MAX_MS}
        step={TIMING_STEP_MS}
        value={timing.minMs}
        oninput={(e) => setTiming('minMs', e.currentTarget.valueAsNumber)}
      />
      <input
        type="number"
        min={TIMING_MIN_MS}
        max={TIMING_MAX_MS}
        step={TIMING_STEP_MS}
        aria-label="Jeda minimum (ms)"
        value={timing.minMs}
        onchange={(e) => setTiming('minMs', e.currentTarget.valueAsNumber)}
      />
      <span class="unit">ms</span>
    </div>

    <div class="row">
      <label for="tmax">maks</label>
      <input
        id="tmax"
        type="range"
        min={TIMING_MIN_MS}
        max={TIMING_MAX_MS}
        step={TIMING_STEP_MS}
        value={timing.maxMs}
        oninput={(e) => setTiming('maxMs', e.currentTarget.valueAsNumber)}
      />
      <input
        type="number"
        min={TIMING_MIN_MS}
        max={TIMING_MAX_MS}
        step={TIMING_STEP_MS}
        aria-label="Jeda maksimum (ms)"
        value={timing.maxMs}
        onchange={(e) => setTiming('maxMs', e.currentTarget.valueAsNumber)}
      />
      <span class="unit">ms</span>
    </div>
  </section>

  <header>
    <h2>Depth engine</h2>
    <p class="lead">
      Makin dalam, makin kuat sarannya — dan makin lama menunggunya. Setelan ini berlaku
      untuk semua tab dan menimpa <code>defaults.depth</code> di
      <code>engines.config.json</code> tanpa mengubah berkasnya.
    </p>
  </header>

  {#if !loaded}
    <p class="empty">Memuat...</p>
  {:else if searchers.length === 0}
    <p class="empty">
      Belum ada engine pencari dari bridge. Jalankan <code>pnpm bridge</code>, lalu buka
      halaman ini lagi.
    </p>
  {:else}
    <ul>
      {#each searchers as provider (provider.id)}
        {@const custom = depths[provider.id] !== undefined}
        {@const value = effective(provider)}
        <li class:off={!provider.ready}>
          <div class="top">
            <span class="dot" class:ready={provider.ready}></span>
            <span class="name">{provider.label}</span>
            {#if custom}
              <button type="button" class="link" onclick={() => reset(provider)}>
                kembalikan ke bawaan
              </button>
            {:else if provider.defaults?.depth !== undefined}
              <span class="tag">bawaan</span>
            {/if}
            <span class="value">d{value}</span>
          </div>

          <div class="row">
            <input
              type="range"
              min={DEPTH_MIN}
              max={DEPTH_MAX}
              step="1"
              aria-label={`Depth ${provider.label}`}
              value={value}
              oninput={(e) => set(provider, e.currentTarget.valueAsNumber)}
            />
            <input
              type="number"
              min={DEPTH_MIN}
              max={DEPTH_MAX}
              step="1"
              aria-label={`Depth ${provider.label} (angka)`}
              value={value}
              onchange={(e) => set(provider, e.currentTarget.valueAsNumber)}
            />
          </div>

          {#if !provider.ready}
            <p class="problem">{provider.problem ?? 'engine tidak siap'}</p>
          {/if}
        </li>
      {/each}
    </ul>

    <footer>
      <button type="button" onclick={resetAll} disabled={Object.keys(depths).length === 0}>
        Kembalikan semua ke bawaan
      </button>
      <!-- Mode policy tidak punya kedalaman untuk diatur; katakan sekali di sini supaya
           orang tidak mencari-cari setelan Maia yang memang tidak ada. -->
      <p class="note">
        Engine manusiawi (Maia) tidak muncul di sini: mode policy hanya menghitung satu
        node, jadi tidak ada depth yang bisa diatur.
      </p>
    </footer>
  {/if}
</main>

<style>
  main {
    max-width: 560px;
    margin: 0 auto;
    padding: 24px 20px 40px;
    font: 14px/1.55 system-ui, sans-serif;
    color: #1c1917;
  }
  :global(body) { margin: 0; background: #fafaf9; }

  h1 { margin: 0 0 14px; font-size: 18px; }
  h2 { margin: 0; font-size: 14px; }

  .block {
    margin-bottom: 22px;
    padding: 12px;
    border: 1px solid #e7e5e4;
    border-radius: 8px;
    background: #fff;
  }
  .block .lead { margin: 8px 0 10px; }
  .block .row { margin-top: 6px; }
  .block label {
    width: 34px;
    flex: none;
    color: #78716c;
    font-size: 11.5px;
  }
  .unit { color: #a8a29e; font-size: 11px; }
  .lead { margin: 0 0 18px; color: #57534e; font-size: 12.5px; }
  code { background: #e7e5e4; padding: 1px 4px; border-radius: 3px; font-size: 11.5px; }

  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  li {
    padding: 10px 12px;
    border: 1px solid #e7e5e4;
    border-radius: 8px;
    background: #fff;
  }
  li.off { opacity: 0.65; }

  .top { display: flex; align-items: center; gap: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #a8a29e; flex: none; }
  .dot.ready { background: #16a34a; }
  .name { font-weight: 600; }
  .tag { color: #78716c; font-size: 11px; }
  .value {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: #44403c;
  }

  .row { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
  input[type='range'] { flex: 1; accent-color: #2563eb; }
  input[type='number'] {
    width: 58px;
    padding: 3px 6px;
    border: 1px solid #d6d3d1;
    border-radius: 5px;
    background: #fff;
    color: inherit;
    font: inherit;
    font-variant-numeric: tabular-nums;
  }

  .problem { margin: 6px 0 0; color: #a16207; font-size: 11.5px; }
  .empty { color: #78716c; }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: #2563eb;
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;
    text-decoration: underline;
  }

  footer { margin-top: 18px; }
  footer button {
    padding: 6px 12px;
    border: 1px solid #d6d3d1;
    border-radius: 6px;
    background: #fff;
    color: inherit;
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
  }
  footer button:hover:not(:disabled) { background: #f5f5f4; }
  footer button:disabled { opacity: 0.5; cursor: default; }
  .note { margin: 10px 0 0; color: #78716c; font-size: 11.5px; }

  @media (prefers-color-scheme: dark) {
    :global(body) { background: #1c1917; }
    main { color: #e7e5e4; }
    code { background: #292524; }
    li { border-color: #292524; background: #232020; }
    .block { border-color: #292524; background: #232020; }
    .block label, .unit { color: #a8a29e; }
    input[type='number'] { border-color: #44403c; background: #1c1917; }
    .lead, .tag, .empty, .note { color: #a8a29e; }
    .value { color: #d6d3d1; }
    footer button { border-color: #44403c; background: #232020; }
    footer button:hover:not(:disabled) { background: #292524; }
    .link { color: #93c5fd; }
  }
</style>
