<script lang="ts">
  import { browser } from 'wxt/browser';
  import type { ProviderInfo } from '@cmr/shared';
  import type { StatusReply } from '../../lib/messages';
  import {
    ARROW_COUNT_KEY,
    ARROWS_MAX,
    ARROWS_MIN,
    arrowsFor,
    loadArrows,
    readArrowChange,
    saveArrows,
    type ArrowOverrides,
    AUTO_TIMING_KEY,
    DEFAULT_TIMING,
    DEPTH_KEY,
    DEPTH_MAX,
    DEPTH_MIN,
    ELO_KEY,
    PERSONA_KEY,
    loadDepths,
    loadElos,
    loadPersonas,
    readEloChange,
    readPersonaChange,
    saveElos,
    savePersonas,
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
    type EloOverrides,
    type PersonaOverrides,
  } from '../../lib/settings';

  let providers = $state<ProviderInfo[]>([]);
  let depths = $state<DepthOverrides>({});
  let loaded = $state(false);
  let timing = $state<AutoTiming>(DEFAULT_TIMING);
  let elos = $state<EloOverrides>({});
  let personas = $state<PersonaOverrides>({});
  let arrows = $state<ArrowOverrides>({});

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

  void loadElos().then((values) => {
    elos = values;
  });

  void loadPersonas().then((values) => {
    personas = values;
  });

  void loadArrows().then((values) => {
    arrows = values;
  });

  // Popup dan tab lain bisa mengubah nilai yang sama; ikuti perubahannya.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && Array.isArray(changes.providers?.newValue)) {
      providers = changes.providers.newValue as ProviderInfo[];
    }
    if (area === 'local' && DEPTH_KEY in changes) {
      depths = readDepthChange(changes[DEPTH_KEY]?.newValue);
    }
    if (area === 'local' && ELO_KEY in changes) {
      elos = readEloChange(changes[ELO_KEY]?.newValue);
    }
    if (area === 'local' && PERSONA_KEY in changes) {
      personas = readPersonaChange(changes[PERSONA_KEY]?.newValue);
    }
    if (area === 'local' && ARROW_COUNT_KEY in changes) {
      arrows = readArrowChange(changes[ARROW_COUNT_KEY]?.newValue);
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
   * Elo yang berlaku. Nilai awalnya ujung atas rentang, bukan tengahnya: tanpa pilihan
   * eksplisit engine memang jalan penuh, dan slider harus mencerminkan itu.
   */
  function eloOf(provider: ProviderInfo): number {
    return elos[provider.id] ?? provider.defaultElo ?? provider.strength?.max ?? 0;
  }

  function setElo(provider: ProviderInfo, raw: number): void {
    const spec = provider.strength;
    if (!spec) return;
    const elo = Math.min(spec.max, Math.max(spec.min, Math.round(raw)));
    elos = { ...elos, [provider.id]: elo };
    void saveElos(elos);
  }

  function resetElo(provider: ProviderInfo): void {
    const { [provider.id]: _removed, ...rest } = elos;
    elos = rest;
    void saveElos(elos);
  }

  /** Jumlah panah yang berlaku: pilihan pengguna, kalau tidak `defaults.multipv`. */
  function arrowsOf(provider: ProviderInfo): number {
    return arrowsFor(arrows, provider.id, provider.defaults?.multipv);
  }

  function setArrows(provider: ProviderInfo, raw: number): void {
    const count = Math.min(ARROWS_MAX, Math.max(ARROWS_MIN, Math.round(raw)));
    arrows = { ...arrows, [provider.id]: count };
    void saveArrows(arrows);
  }

  function resetArrows(provider: ProviderInfo): void {
    const { [provider.id]: _removed, ...rest } = arrows;
    arrows = rest;
    void saveArrows(arrows);
  }

  function personaOf(provider: ProviderInfo): string {
    return personas[provider.id] ?? provider.defaultPersona ?? provider.personas?.[0]?.id ?? '';
  }

  function setPersona(provider: ProviderInfo, id: string): void {
    personas = { ...personas, [provider.id]: id };
    void savePersonas(personas);
  }

  /**
   * Di ujung atas rentang pembatas dilepas sama sekali, jadi angkanya menyesatkan kalau
   * ditampilkan. Untuk engine mode `skill` angkanya hasil pemetaan ke skala Skill 0..25 —
   * ditandai `≈` supaya tidak dibaca sebagai Elo native seperti punya Stockfish.
   */
  function eloLabel(provider: ProviderInfo): string {
    const spec = provider.strength;
    if (!spec) return '';
    const value = eloOf(provider);
    if (value >= spec.max) return 'penuh';
    return spec.mode === 'skill' ? `≈${value}` : `${value}`;
  }

  function personaHint(provider: ProviderInfo): string {
    return provider.personas?.find((x) => x.id === personaOf(provider))?.hint ?? '';
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
    elos = {};
    personas = {};
    arrows = {};
    void saveDepths(depths);
    void saveElos(elos);
    void savePersonas(personas);
    void saveArrows(arrows);
  }

  const anyOverride = $derived(
    Object.keys(depths).length +
      Object.keys(elos).length +
      Object.keys(personas).length +
      Object.keys(arrows).length >
      0,
  );
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
    <h2>Engine</h2>
    <p class="lead">
      Depth, jumlah panah, kekuatan, dan kepribadian per engine. Semuanya berlaku untuk semua tab dan
      menimpa nilai di <code>engines.config.json</code> tanpa mengubah berkasnya. Pilihan
      yang tersedia berbeda-beda karena tiap engine memang menyediakan tombol yang
      berbeda.
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
          </div>

          <!-- Depth diberi label sendiri seperti Kekuatan dan Kepribadian. Tanpa itu,
               slider paling atas adalah satu-satunya yang tak bernama, dan tidak ada cara
               menebak bahwa "d2" di kanan adalah judulnya. -->
          <div class="sub first">
            <div class="top">
              <span class="sublabel">Depth</span>
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
            <p class="fine">
              Seberapa jauh engine berpikir. Kalau depth-nya rendah, ia sudah lebih lemah
              daripada Elo mana pun di bawah — dan slider Kekuatan jadi tidak berefek.
            </p>
            <!-- Hubungan ini tidak terduga sampai kamu menemukannya sendiri: daftar
                 kelanjutan di panel rekomendasi terasa "kosong" padahal engine memang
                 belum menghitung sejauh itu. -->
            <p class="fine">
              Ini juga yang menentukan panjang daftar kelanjutan di panel rekomendasi:
              engine hanya melaporkan garis sejauh yang ia cari. Di depth 1–2 tidak ada
              kelanjutan sama sekali, di depth 4 sekitar empat langkah, dan baru dari
              sekitar depth 12 daftarnya benar-benar panjang.
            </p>
          </div>

          <div class="sub">
            <div class="top">
              <span class="sublabel">Panah</span>
              {#if arrows[provider.id] !== undefined}
                <button type="button" class="link" onclick={() => resetArrows(provider)}>
                  kembalikan ke bawaan
                </button>
              {:else if provider.defaults?.multipv !== undefined}
                <span class="tag">bawaan</span>
              {/if}
              <span class="value">{arrowsOf(provider)}</span>
            </div>
            <div class="row">
              <input
                type="range"
                min={ARROWS_MIN}
                max={ARROWS_MAX}
                step="1"
                aria-label={`Jumlah panah ${provider.label}`}
                value={arrowsOf(provider)}
                oninput={(e) => setArrows(provider, e.currentTarget.valueAsNumber)}
              />
              <input
                type="number"
                min={ARROWS_MIN}
                max={ARROWS_MAX}
                step="1"
                aria-label={`Jumlah panah ${provider.label} (angka)`}
                value={arrowsOf(provider)}
                onchange={(e) => setArrows(provider, e.currentTarget.valueAsNumber)}
              />
            </div>
            <!-- Ini bukan sekadar setelan tampilan, dan bedanya perlu dikatakan: angkanya
                 dikirim ke engine sebagai MultiPV. -->
            <p class="fine">
              Berapa langkah teratas yang digambar di papan, lengkap dengan skornya. Yang
              pertama tebal, sisanya makin tipis. Angkanya juga dipakai sebagai
              <code>MultiPV</code> — jadi menaikkannya membuat engine menjaga lebih banyak
              baris sekaligus, dan tiap baris jadi sedikit lebih dangkal pada depth yang sama.
            </p>
          </div>

          {#if provider.strength}
            <div class="sub">
              <div class="top">
                <span class="sublabel">Kekuatan</span>
                {#if elos[provider.id] !== undefined}
                  <button type="button" class="link" onclick={() => resetElo(provider)}>
                    kembalikan ke bawaan
                  </button>
                {/if}
                <span class="value">{eloLabel(provider)}</span>
              </div>
              <div class="row">
                <input
                  type="range"
                  min={provider.strength.min}
                  max={provider.strength.max}
                  step="10"
                  aria-label={`Elo ${provider.label}`}
                  value={eloOf(provider)}
                  oninput={(e) => setElo(provider, e.currentTarget.valueAsNumber)}
                />
                <input
                  type="number"
                  min={provider.strength.min}
                  max={provider.strength.max}
                  step="10"
                  aria-label={`Elo ${provider.label} (angka)`}
                  value={eloOf(provider)}
                  onchange={(e) => setElo(provider, e.currentTarget.valueAsNumber)}
                />
              </div>
              <!-- Perbedaan ini nyata dan tidak bisa disembunyikan: hanya Stockfish yang
                   punya UCI_Elo. Sisanya dipetakan ke skala Skill, jadi angkanya perkiraan. -->
              <p class="fine">
                {#if provider.strength.mode === 'skill'}
                  Perkiraan — engine ini tidak punya <code>UCI_Elo</code>, angkanya dipetakan
                  ke <code>Skill</code> 0–{provider.strength.levels}.
                {:else}
                  Native <code>UCI_Elo</code>, rentang {provider.strength.min}–{provider.strength.max}.
                {/if}
                Skalanya milik engine, bukan skala Chess.com atau Lichess.
              </p>
            </div>
          {/if}

          {#if provider.personas?.length}
            <div class="sub">
              <div class="top">
                <span class="sublabel">Kepribadian</span>
                <select
                  aria-label={`Kepribadian ${provider.label}`}
                  value={personaOf(provider)}
                  onchange={(e) => setPersona(provider, e.currentTarget.value)}
                >
                  {#each provider.personas as persona (persona.id)}
                    <option value={persona.id}>{persona.label}</option>
                  {/each}
                </select>
              </div>
              {#if personaHint(provider)}
                <p class="fine">{personaHint(provider)}</p>
              {/if}
            </div>
          {/if}

          {#if !provider.ready}
            <p class="problem">{provider.problem ?? 'engine tidak siap'}</p>
          {/if}
        </li>
      {/each}
    </ul>

    <footer>
      <button type="button" onclick={resetAll} disabled={!anyOverride}>
        Kembalikan semua ke bawaan
      </button>
      <!-- Mode policy tidak punya kedalaman untuk diatur; katakan sekali di sini supaya
           orang tidak mencari-cari setelan Maia yang memang tidak ada. -->
      <p class="note">
        Engine manusiawi (Maia) tidak muncul di sini: mode policy hanya menghitung satu
        node, jadi tidak ada depth yang bisa diatur. Kekuatannya sudah melekat pada bobot
        yang dipakai — pilih Maia 1300, 1500, atau 1900 di <code>engines.config.json</code>.
      </p>
      <p class="note">
        Stockfish tidak punya pilihan kepribadian karena engine-nya memang tidak
        menyediakan tombol itu; Dragon dan Komodo punya. Sebaliknya hanya Stockfish yang
        punya Elo native.
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

  .sub { margin-top: 10px; padding-top: 9px; border-top: 1px solid #f0efee; }
  /* Yang pertama menempel langsung di bawah nama engine; garisnya jadi mubazir. */
  .sub.first { margin-top: 6px; padding-top: 0; border-top: 0; }
  .sublabel { color: #78716c; font-size: 11.5px; font-weight: 600; }
  .fine { margin: 5px 0 0; color: #78716c; font-size: 11px; line-height: 1.45; }
  select {
    margin-left: auto;
    padding: 3px 6px;
    border: 1px solid #d6d3d1;
    border-radius: 5px;
    background: #fff;
    color: inherit;
    font: inherit;
    font-size: 12.5px;
  }
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
    select { border-color: #44403c; background: #1c1917; }
    .sub { border-top-color: #292524; }
    .sublabel, .fine { color: #a8a29e; }
    .lead, .tag, .empty, .note { color: #a8a29e; }
    .value { color: #d6d3d1; }
    footer button { border-color: #44403c; background: #232020; }
    footer button:hover:not(:disabled) { background: #292524; }
    .link { color: #93c5fd; }
  }
</style>
