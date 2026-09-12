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
    ENGINE_ENABLED_KEY,
    engineEnabled,
    loadEnabled,
    readEnabledChange,
    saveEnabled,
    type EnabledOverrides,
    THREATS_KEY,
    loadThreats,
    sanitizeThreats,
    saveThreats,
    DEFAULT_THREATS,
    AUTO_NEW_GAME_KEY,
    DEFAULT_AUTO_NEW_GAME,
    loadAutoNewGame,
    saveAutoNewGame,
    sanitizeAutoNewGame,
    NEW_GAME_MIN_MS,
    NEW_GAME_MAX_MS,
    MAX_GAMES_MIN,
    MAX_GAMES_MAX,
    NEW_GAME_SEEN_KEY,
    loadSeenLabels,
    clearSeenLabels,
    sanitizeSeen,
    type AutoNewGameSetting,
    THINK_STYLE_KEY,
    DEFAULT_THINK_SETTING,
    loadThinkSetting,
    saveThinkSetting,
    sanitizeThinkSetting,
    type ThinkSetting,
    DYNAMIC_ELO_KEY,
    DEFAULT_DYNAMIC_ELO,
    loadDynamicElo,
    saveDynamicElo,
    sanitizeDynamicElo,
    type DynamicEloSetting,
    CURSOR_DOT_KEY,
    loadCursorDot,
    saveCursorDot,
    sanitizeCursorDot,
  } from '../../lib/settings';
  import { OFFSET_MAX, OFFSET_MIN } from '../../lib/dynamicElo';

  let providers = $state<ProviderInfo[]>([]);
  let depths = $state<DepthOverrides>({});
  let loaded = $state(false);
  let timing = $state<AutoTiming>(DEFAULT_TIMING);
  let elos = $state<EloOverrides>({});
  let personas = $state<PersonaOverrides>({});
  let arrows = $state<ArrowOverrides>({});
  let enabled = $state<EnabledOverrides>({});
  let threats = $state(DEFAULT_THREATS);
  let cursorDot = $state(false);
  let dynamic = $state<DynamicEloSetting>(DEFAULT_DYNAMIC_ELO);
  let newGame = $state<AutoNewGameSetting>(DEFAULT_AUTO_NEW_GAME);
  let think = $state<ThinkSetting>(DEFAULT_THINK_SETTING);
  /** Teks tombol yang pernah terlihat di modal hasil, dikumpulkan content script. */
  let seen = $state<string[]>([]);

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

  void loadEnabled().then((values) => {
    enabled = values;
  });

  void loadThreats().then((value) => {
    threats = value;
  });

  void loadCursorDot().then((value) => {
    cursorDot = value;
  });

  void loadDynamicElo().then((value) => {
    dynamic = value;
  });

  void loadAutoNewGame().then((value) => {
    newGame = value;
  });

  void loadSeenLabels().then((value) => {
    seen = value;
  });

  void loadThinkSetting().then((value) => {
    think = value;
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
    if (area === 'local' && ENGINE_ENABLED_KEY in changes) {
      enabled = readEnabledChange(changes[ENGINE_ENABLED_KEY]?.newValue);
    }
    if (area === 'local' && THREATS_KEY in changes) {
      threats = sanitizeThreats(changes[THREATS_KEY]?.newValue);
    }
    if (area === 'local' && AUTO_TIMING_KEY in changes) {
      timing = sanitizeTiming(changes[AUTO_TIMING_KEY]?.newValue);
    }
    if (area === 'local' && NEW_GAME_SEEN_KEY in changes) {
      // Datang dari tab chess.com yang sedang terbuka; daftarnya tumbuh sendiri sambil
      // halaman ini terbuka.
      seen = sanitizeSeen(changes[NEW_GAME_SEEN_KEY]?.newValue);
    }
    if (area === 'local' && AUTO_NEW_GAME_KEY in changes) {
      newGame = sanitizeAutoNewGame(changes[AUTO_NEW_GAME_KEY]?.newValue);
    }
    if (area === 'local' && THINK_STYLE_KEY in changes) {
      think = sanitizeThinkSetting(changes[THINK_STYLE_KEY]?.newValue);
    }
    if (area === 'local' && DYNAMIC_ELO_KEY in changes) {
      dynamic = sanitizeDynamicElo(changes[DYNAMIC_ELO_KEY]?.newValue);
    }
    if (area === 'local' && CURSOR_DOT_KEY in changes) {
      cursorDot = sanitizeCursorDot(changes[CURSOR_DOT_KEY]?.newValue);
    }
  });

  // Semua engine ditampilkan, bukan hanya pencari: sakelar nyala/mati berlaku untuk
  // semuanya, dan engine mode policy yang tak punya depth pun tetap perlu bisa
  // dimatikan dari sini. Setelan yang tidak berlaku untuknya disembunyikan per blok.
  const listed = $derived(providers);

  function isOn(provider: ProviderInfo): boolean {
    return engineEnabled(enabled, provider.id);
  }

  /**
   * Nilai bawaannya menyala, jadi menyalakan kembali berarti menghapus entrinya — bukan
   * menyimpan `true`. Dengan begitu peta ini hanya berisi engine yang benar-benar
   * dimatikan, dan engine baru di config langsung ikut tanpa perlu setelan.
   */
  function toggle(provider: ProviderInfo, on: boolean): void {
    if (on) {
      const { [provider.id]: _removed, ...rest } = enabled;
      enabled = rest;
    } else {
      enabled = { ...enabled, [provider.id]: false };
    }
    void saveEnabled(enabled);
  }

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

  /** Aturan dorong-mendorongnya sama, hanya rentangnya yang berbeda. */
  function setCaptureTiming(edge: 'minMs' | 'maxMs', raw: number): void {
    const capture = { ...timing.capture, [edge]: raw };
    if (edge === 'minMs' && capture.minMs > capture.maxMs) capture.maxMs = capture.minMs;
    if (edge === 'maxMs' && capture.maxMs < capture.minMs) capture.minMs = capture.maxMs;
    timing = sanitizeTiming({ ...timing, capture });
    void saveTiming(timing);
  }

  /**
   * Mode dinamis dan slider kekuatan tidak pernah aktif bersamaan; menyalakan ini
   * membuat slider di bawah jadi tidak berlaku, dan itu dikatakan di UI-nya, bukan
   * dibiarkan jadi kejutan.
   */
  function setDynamic(patch: Partial<DynamicEloSetting>): void {
    const next = { ...dynamic, ...patch };
    if ('minOffset' in patch && next.minOffset > next.maxOffset) next.maxOffset = next.minOffset;
    if ('maxOffset' in patch && next.maxOffset < next.minOffset) next.minOffset = next.maxOffset;
    dynamic = sanitizeDynamicElo(next);
    void saveDynamicElo(dynamic);
  }

  function setNewGame(patch: Partial<AutoNewGameSetting>): void {
    const next = { ...newGame, ...patch };
    if ('minMs' in patch && next.minMs > next.maxMs) next.maxMs = next.minMs;
    if ('maxMs' in patch && next.maxMs < next.minMs) next.minMs = next.maxMs;
    newGame = sanitizeAutoNewGame(next);
    void saveAutoNewGame(newGame);
  }

  /**
   * Daftar kosong berarti "pakai pola bawaan", bukan "tidak ada yang boleh".
   *
   * Membedakan keduanya lewat daftar kosong terasa berisiko, tapi alternatifnya lebih
   * buruk: sakelar "batasi tombol" yang terpisah bisa menyala dengan daftar kosong, dan
   * hasilnya fitur yang diam tanpa alasan yang kelihatan.
   */
  function toggleLabel(label: string, on: boolean): void {
    const labels = on
      ? [...newGame.labels, label]
      : newGame.labels.filter((item) => item !== label);
    setNewGame({ labels });
  }

  /**
   * Buang catatan tombol yang pernah terlihat.
   *
   * Berguna setelah chess.com mengubah bentuk modalnya, atau setelah kamu mengganti
   * bahasa antarmuka: daftar lama jadi tidak akan pernah cocok lagi, dan membiarkannya
   * cuma bikin bingung. Pilihan yang sudah dicentang ikut dibuang, karena isinya justru
   * teks-teks itu.
   */
  function clearSeen(): void {
    seen = [];
    void clearSeenLabels();
    setNewGame({ labels: [] });
  }

  function setThink(patch: Partial<ThinkSetting>): void {
    think = sanitizeThinkSetting({ ...think, ...patch });
    void saveThinkSetting(think);
  }

  function setCursorDot(on: boolean): void {
    cursorDot = on;
    void saveCursorDot(on);
  }

  /**
   * Bawaannya menyala, tapi yang disimpan tetap nilai apa adanya — bukan dihapus saat
   * menyala seperti sakelar per engine. Di sana peta setelan memang harus tetap kosong
   * supaya engine baru ikut bawaan; di sini tidak ada engine yang bisa menyusul.
   */
  function setThreats(on: boolean): void {
    threats = on;
    void saveThreats(on);
  }

  function resetTiming(): void {
    timing = DEFAULT_TIMING;
    void saveTiming(timing);
  }

  const timingChanged = $derived(
    timing.minMs !== DEFAULT_TIMING.minMs ||
      timing.maxMs !== DEFAULT_TIMING.maxMs ||
      timing.capture.minMs !== DEFAULT_TIMING.capture.minMs ||
      timing.capture.maxMs !== DEFAULT_TIMING.capture.maxMs,
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
      <h2>Sorotan ancaman</h2>
      <label class="switch">
        <input
          type="checkbox"
          aria-label="Aktifkan sorotan ancaman"
          checked={threats}
          onchange={(e) => setThreats(e.currentTarget.checked)}
        />
        <span>{threats ? 'aktif' : 'mati'}</span>
      </label>
    </div>
    <p class="lead">
      Menandai kotak tempat bidakmu kalah material kalau lawan menyerangnya dan
      tukar-menukar di kotak itu dijalankan sampai habis. Merah untuk kerugian sebesar
      bidak minor atau lebih, kuning untuk yang lebih kecil.
    </p>
    <p class="lead">
      Tidak melibatkan engine sama sekali: hitungannya dari posisi di papan, jadi
      sorotannya muncul sebelum analisis selesai dan tetap ada walau semua engine
      dimatikan. Karena itu ia juga tidak tahu soal serangan ganda atau taktik dua
      langkah — yang dijawab hanya “apa yang bisa hilang di kotak ini”.
    </p>
  </section>

  <section class="block">
    <div class="top">
      <h2>Jeda mode auto</h2>
      {#if timingChanged}
        <button type="button" class="link" onclick={resetTiming}>kembalikan ke bawaan</button>
      {:else}
        <span class="tag">bawaan</span>
      {/if}
      <span class="value">
        {seconds(timing.minMs)}–{seconds(timing.maxMs)}s ·
        {seconds(timing.capture.minMs)}–{seconds(timing.capture.maxMs)}s
      </span>
    </div>
    <p class="lead">
      Waktu acak antara hasil engine dan bidak mendarat di papan. Angka ini untuk langkah
      utuh — jeda antar-klik diambil dari dalamnya, bukan ditambahkan di atasnya. Waktu
      berpikir engine sendiri diatur lewat depth di bawah.
    </p>
    <p class="lead">
      Dua rentang, dipilih menurut langkahnya. Langkah memakan biasanya pantas lebih
      cepat: bidak lawan sudah berdiri di kotak tujuan, jadi langkah itu tidak perlu
      dicari — berlama-lama sebelum memakan justru terbaca lebih aneh daripada langsung.
    </p>

    <h3 class="range-head">Langkah tenang</h3>

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

    <h3 class="range-head">Langkah memakan</h3>

    <div class="row">
      <label for="cmin">min</label>
      <input
        id="cmin"
        type="range"
        min={TIMING_MIN_MS}
        max={TIMING_MAX_MS}
        step={TIMING_STEP_MS}
        value={timing.capture.minMs}
        oninput={(e) => setCaptureTiming('minMs', e.currentTarget.valueAsNumber)}
      />
      <input
        type="number"
        min={TIMING_MIN_MS}
        max={TIMING_MAX_MS}
        step={TIMING_STEP_MS}
        aria-label="Jeda minimum saat memakan (ms)"
        value={timing.capture.minMs}
        onchange={(e) => setCaptureTiming('minMs', e.currentTarget.valueAsNumber)}
      />
      <span class="unit">ms</span>
    </div>

    <div class="row">
      <label for="cmax">maks</label>
      <input
        id="cmax"
        type="range"
        min={TIMING_MIN_MS}
        max={TIMING_MAX_MS}
        step={TIMING_STEP_MS}
        value={timing.capture.maxMs}
        oninput={(e) => setCaptureTiming('maxMs', e.currentTarget.valueAsNumber)}
      />
      <input
        type="number"
        min={TIMING_MIN_MS}
        max={TIMING_MAX_MS}
        step={TIMING_STEP_MS}
        aria-label="Jeda maksimum saat memakan (ms)"
        value={timing.capture.maxMs}
        onchange={(e) => setCaptureTiming('maxMs', e.currentTarget.valueAsNumber)}
      />
      <span class="unit">ms</span>
    </div>
  </section>

  <section class="block">
    <div class="top">
      <h2>Waktu ikut posisi</h2>
      <label class="switch">
        <input
          type="checkbox"
          aria-label="Aktifkan waktu berpikir adaptif"
          checked={think.think.enabled}
          onchange={(e) => setThink({ think: { ...think.think, enabled: e.currentTarget.checked } })}
        />
        <span>{think.think.enabled ? 'aktif' : 'mati'}</span>
      </label>
    </div>
    <p class="lead">
      Jeda di blok sebelumnya jadi tempo dasar, lalu dikali menurut posisinya. Manusia
      melangkah nyaris refleks saat cuma ada satu langkah legal atau saat membalas makan
      di kotak yang sama, dan diam lama justru ketika beberapa langkah terlihat sama
      bagusnya. Jeda acak merata adalah bentuk sebaran yang tidak pernah dihasilkan
      manusia — dan sebaran waktu jauh lebih mudah diuji daripada gerakan tetikus.
    </p>
    <p class="lead">
      Yang membuat cepat: satu-satunya langkah legal, skakmat terlihat, balasan makan,
      langkah pembukaan, dan langkah terbaik yang unggul telak. Yang membuat lambat: skor
      dua langkah teratas berdekatan.
    </p>

    <h3 class="range-head">Pengali langkah jelas</h3>
    <div class="row">
      <label for="thEasy">cepat</label>
      <input
        id="thEasy"
        type="range"
        min="10"
        max="100"
        step="5"
        disabled={!think.think.enabled}
        value={Math.round(think.think.easy * 100)}
        oninput={(e) =>
          setThink({ think: { ...think.think, easy: e.currentTarget.valueAsNumber / 100 } })}
      />
      <span class="value">{Math.round(think.think.easy * 100)}%</span>
    </div>

    <h3 class="range-head">Pengali posisi sulit</h3>
    <div class="row">
      <label for="thHard">lambat</label>
      <input
        id="thHard"
        type="range"
        min="100"
        max="400"
        step="10"
        disabled={!think.think.enabled}
        value={Math.round(think.think.hard * 100)}
        oninput={(e) =>
          setThink({ think: { ...think.think, hard: e.currentTarget.valueAsNumber / 100 } })}
      />
      <span class="value">{Math.round(think.think.hard * 100)}%</span>
    </div>

    <h3 class="range-head">Panjang pembukaan</h3>
    <div class="row">
      <label for="thPly">langkah</label>
      <input
        id="thPly"
        type="range"
        min="0"
        max="30"
        step="1"
        disabled={!think.think.enabled}
        value={think.think.openingPlies}
        oninput={(e) =>
          setThink({
            think: { ...think.think, openingPlies: e.currentTarget.valueAsNumber },
          })}
      />
      <span class="value">{think.think.openingPlies}</span>
    </div>
    <p class="fine">
      Dihitung dalam setengah-langkah, jadi 10 berarti lima langkah pertama tiap sisi.
      Makin dekat ke langkah pertama, makin cepat — bukan cepat merata lalu berhenti
      mendadak.
    </p>
  </section>

  <section class="block">
    <div class="top">
      <h2>Sadar sisa waktu</h2>
      <label class="switch">
        <input
          type="checkbox"
          aria-label="Aktifkan kesadaran jam"
          checked={think.clock.enabled}
          onchange={(e) => setThink({ clock: { ...think.clock, enabled: e.currentTarget.checked } })}
        />
        <span>{think.clock.enabled ? 'aktif' : 'mati'}</span>
      </label>
    </div>
    <p class="lead">
      Tempo dipercepat saat jam menipis. Tanpa ini, ekstensi memakai tempo yang sama di
      detik pertama dan detik terakhir — dan itu buruk dua kali: tidak ada manusia yang
      tenang berpikir sedetik penuh dengan sisa delapan detik, dan kamu kalah karena
      kehabisan waktu di posisi yang menang.
    </p>

    <h3 class="range-head">Mulai mempercepat di</h3>
    <div class="row">
      <label for="ckPanic">sisa</label>
      <input
        id="ckPanic"
        type="range"
        min="5"
        max="120"
        step="5"
        disabled={!think.clock.enabled}
        value={think.clock.panicSeconds}
        oninput={(e) =>
          setThink({
            clock: { ...think.clock, panicSeconds: e.currentTarget.valueAsNumber },
          })}
      />
      <span class="value">{think.clock.panicSeconds}s</span>
    </div>

    <h3 class="range-head">Tempo tercepat</h3>
    <div class="row">
      <label for="ckFactor">panik</label>
      <input
        id="ckFactor"
        type="range"
        min="5"
        max="100"
        step="5"
        disabled={!think.clock.enabled}
        value={Math.round(think.clock.panicFactor * 100)}
        oninput={(e) =>
          setThink({
            clock: { ...think.clock, panicFactor: e.currentTarget.valueAsNumber / 100 },
          })}
      />
      <span class="value">{Math.round(think.clock.panicFactor * 100)}%</span>
    </div>
    <p class="fine">
      Turun mulus dari 100% di ambang atas sampai angka ini saat waktu habis, bukan
      melompat di satu titik — lompatan mendadak justru pola tersendiri.
    </p>

    <h3 class="range-head">Batas per langkah</h3>
    <div class="row">
      <label for="ckShare">maks</label>
      <input
        id="ckShare"
        type="range"
        min="1"
        max="30"
        step="1"
        disabled={!think.clock.enabled}
        value={Math.round(think.clock.maxShare * 100)}
        oninput={(e) =>
          setThink({
            clock: { ...think.clock, maxShare: e.currentTarget.valueAsNumber / 100 },
          })}
      />
      <span class="value">{Math.round(think.clock.maxShare * 100)}%</span>
    </div>
    <p class="fine">
      Bagian terbesar dari sisa waktu yang boleh dihabiskan satu langkah. Pagar yang
      berdiri sendiri, terpisah dari pengali di atas: tanpa ini, rentang jeda 3 detik akan
      menghabiskan sisa waktu 4 detik.
    </p>
  </section>

  <section class="block">
    <div class="top">
      <h2>Game baru otomatis</h2>
      <label class="switch">
        <input
          type="checkbox"
          aria-label="Aktifkan game baru otomatis"
          checked={newGame.enabled}
          onchange={(e) => setNewGame({ enabled: e.currentTarget.checked })}
        />
        <span>{newGame.enabled ? 'aktif' : 'mati'}</span>
      </label>
    </div>
    <p class="lead">
      Begitu modal hasil muncul, tombol game baru diklik sendiri — lewat kursor maya yang
      sama dengan yang memainkan bidak, bukan lewat klik langsung. Tombolnya dikenali dari
      teksnya, bukan dari nama kelas chess.com yang bisa berubah sewaktu-waktu.
    </p>
    <p class="lead">
      Tombol "Rematch" sengaja tidak dipakai: itu menantang lawan yang sama dan ia harus
      menyetujuinya. Kalau ia menolak atau pergi, permintaannya menggantung dan tidak ada
      game yang dimulai — padahal dari sisi ekstensi tombolnya sudah diklik. Tombol yang
      menyangkut rated/unrated, pembelian, laporan, atau menerima tantangan tidak pernah
      disentuh sama sekali.
    </p>
    <p class="lead">
      <strong>Ini mengubah sifat ekstensi.</strong> Tanpa ia, ekstensi berhenti tiap kali
      satu game selesai; dengan ia, ia berjalan sendiri sampai batas di bawah tercapai.
      Puluhan game beruntun tanpa jeda adalah pola yang jauh lebih mencolok bagi sistem
      fair play daripada satu langkah mana pun — batas jumlah game itu pagar, bukan hiasan.
    </p>

    <h3 class="range-head">Batas game per sesi</h3>
    <div class="row">
      <label for="ngmax">maks</label>
      <input
        id="ngmax"
        type="range"
        min={MAX_GAMES_MIN}
        max={MAX_GAMES_MAX}
        step="1"
        disabled={!newGame.enabled}
        value={newGame.maxGames}
        oninput={(e) => setNewGame({ maxGames: e.currentTarget.valueAsNumber })}
      />
      <input
        type="number"
        min={MAX_GAMES_MIN}
        max={MAX_GAMES_MAX}
        step="1"
        aria-label="Batas game per sesi"
        disabled={!newGame.enabled}
        value={newGame.maxGames}
        onchange={(e) => setNewGame({ maxGames: e.currentTarget.valueAsNumber })}
      />
      <span class="unit">game</span>
    </div>
    <p class="fine">
      Hitungannya nol lagi tiap tab dimuat ulang, atau tiap sakelar di atas dimatikan lalu
      dinyalakan.
    </p>

    <h3 class="range-head">Jeda sebelum klik</h3>
    <div class="row">
      <label for="ngmin">min</label>
      <input
        id="ngmin"
        type="range"
        min={NEW_GAME_MIN_MS}
        max={NEW_GAME_MAX_MS}
        step="1000"
        disabled={!newGame.enabled}
        value={newGame.minMs}
        oninput={(e) => setNewGame({ minMs: e.currentTarget.valueAsNumber })}
      />
      <input
        type="number"
        min={NEW_GAME_MIN_MS}
        max={NEW_GAME_MAX_MS}
        step="1000"
        aria-label="Jeda minimum sebelum klik game baru"
        disabled={!newGame.enabled}
        value={newGame.minMs}
        onchange={(e) => setNewGame({ minMs: e.currentTarget.valueAsNumber })}
      />
      <span class="unit">ms</span>
    </div>
    <div class="row">
      <label for="ngmaxms">maks</label>
      <input
        id="ngmaxms"
        type="range"
        min={NEW_GAME_MIN_MS}
        max={NEW_GAME_MAX_MS}
        step="1000"
        disabled={!newGame.enabled}
        value={newGame.maxMs}
        oninput={(e) => setNewGame({ maxMs: e.currentTarget.valueAsNumber })}
      />
      <input
        type="number"
        min={NEW_GAME_MIN_MS}
        max={NEW_GAME_MAX_MS}
        step="1000"
        aria-label="Jeda maksimum sebelum klik game baru"
        disabled={!newGame.enabled}
        value={newGame.maxMs}
        onchange={(e) => setNewGame({ maxMs: e.currentTarget.valueAsNumber })}
      />
      <span class="unit">ms</span>
    </div>
    <p class="fine">
      Jauh lebih panjang daripada jeda langkah, dan itu disengaja: manusia melihat skor
      akhir dan perubahan ratingnya dulu sebelum memutuskan main lagi.
    </p>

    <h3 class="range-head">Tombol yang boleh diklik</h3>
    {#if seen.length === 0}
      <p class="fine">
        Belum ada tombol yang tercatat. Selesaikan satu game dengan sakelar di atas
        menyala — teks tombol di modal hasilnya akan muncul di sini untuk kamu pilih.
        Sementara itu, pola bawaan yang dipakai: teks yang diawali "New", atau yang
        berbunyi "game baru" / "main lagi".
      </p>
    {:else}
      <div class="pool">
        {#each seen as label (label)}
          <label class="chip" title={label}>
            <input
              type="checkbox"
              disabled={!newGame.enabled}
              checked={newGame.labels.includes(label)}
              onchange={(e) => toggleLabel(label, e.currentTarget.checked)}
            />
            <span>{label}</span>
          </label>
        {/each}
      </div>
      <p class="fine">
        {#if newGame.labels.length === 0}
          Tidak ada yang dicentang — pola bawaan yang dipakai ("New ..."). Centang
          beberapa kalau kamu mau waktu kontrol tertentu saja, termasuk custom seperti
          "New 10 sec + 0.1"; yang dicentang dipilih acak tiap game.
        {:else}
          Dipilih acak tiap game dari yang dicentang. Kalau tak satu pun muncul di modal,
          ekstensi diam saja — bukan memakai tombol lain.
        {/if}
      </p>
      <p class="fine">
        Daftar ini dikumpulkan dari modal yang benar-benar muncul di layarmu, jadi
        bentuknya mengikuti bahasa dan waktu kontrol yang kamu pakai. Tombol berbahaya
        (analisis, laporan, pembelian, menerima tantangan) tidak pernah diklik walau
        tercentang.
        <button type="button" class="link" onclick={clearSeen}>bersihkan daftar</button>
      </p>
    {/if}
  </section>

  <section class="block">
    <div class="top">
      <h2>Kekuatan ikut rating</h2>
      <label class="switch">
        <input
          type="checkbox"
          aria-label="Aktifkan Elo dinamis"
          checked={dynamic.enabled}
          onchange={(e) => setDynamic({ enabled: e.currentTarget.checked })}
        />
        <span>{dynamic.enabled ? 'aktif' : 'mati'}</span>
      </label>
    </div>
    <p class="lead">
      Kekuatan engine dihitung dari rating yang terbaca di halaman, bukan dari slider
      Kekuatan per engine di bawah — kalau mode ini menyala, slider itu tidak berlaku.
      Ratingnya dibaca dari komponen pemain, jadi ia selalu rating untuk tipe game yang
      sedang dimainkan: pindah dari rapid ke blitz tidak perlu diatur ulang.
    </p>
    <p class="lead">
      Offsetnya diacak sekali per game di dalam rentang di bawah, bukan satu angka tetap:
      offset yang sama persis tiap game menghasilkan kekuatan yang seragam, dan
      keseragaman itulah yang jadi pola. Isi min dan maks dengan angka yang sama kalau
      kamu memang mau offset tetap.
    </p>
    <p class="lead">
      Hasilnya tetap dijepit ke rentang yang didukung tiap engine. Stockfish tidak bisa
      turun di bawah 1320, jadi kalau rating-mu 800, angka yang benar-benar dipakai tetap
      1320 — bukan mode ini yang rusak. Kalau rating tidak terbaca (game tanpa rating,
      lawan bot), slider per engine yang dipakai kembali.
    </p>

    <div class="row">
      <label for="omin">min</label>
      <input
        id="omin"
        type="range"
        min={OFFSET_MIN}
        max={OFFSET_MAX}
        step="10"
        disabled={!dynamic.enabled}
        value={dynamic.minOffset}
        oninput={(e) => setDynamic({ minOffset: e.currentTarget.valueAsNumber })}
      />
      <input
        type="number"
        min={OFFSET_MIN}
        max={OFFSET_MAX}
        step="10"
        aria-label="Offset minimum"
        disabled={!dynamic.enabled}
        value={dynamic.minOffset}
        onchange={(e) => setDynamic({ minOffset: e.currentTarget.valueAsNumber })}
      />
      <span class="unit">Elo</span>
    </div>

    <div class="row">
      <label for="omax">maks</label>
      <input
        id="omax"
        type="range"
        min={OFFSET_MIN}
        max={OFFSET_MAX}
        step="10"
        disabled={!dynamic.enabled}
        value={dynamic.maxOffset}
        oninput={(e) => setDynamic({ maxOffset: e.currentTarget.valueAsNumber })}
      />
      <input
        type="number"
        min={OFFSET_MIN}
        max={OFFSET_MAX}
        step="10"
        aria-label="Offset maksimum"
        disabled={!dynamic.enabled}
        value={dynamic.maxOffset}
        onchange={(e) => setDynamic({ maxOffset: e.currentTarget.valueAsNumber })}
      />
      <span class="unit">Elo</span>
    </div>
  </section>

  <section class="block">
    <div class="top">
      <h2>Tampilkan kursor maya</h2>
      <label class="switch">
        <input
          type="checkbox"
          aria-label="Tampilkan penanda kursor maya"
          checked={cursorDot}
          onchange={(e) => setCursorDot(e.currentTarget.checked)}
        />
        <span>{cursorDot ? 'aktif' : 'mati'}</span>
      </label>
    </div>
    <p class="lead">
      Titik merah kecil yang menunjukkan posisi kursor menurut chess.com — bukan kursor
      aslimu. Halaman web tidak bisa memindahkan kursor sistem, jadi seluruh gerakan yang
      dikirim mode auto tidak terlihat sama sekali tanpa penanda ini.
    </p>
    <p class="lead">
      Alat pemeriksa, bukan bagian dari permainan: gunanya melihat jalur dan titik klik
      benar-benar mendarat di kotak yang dimaksud. Titiknya tidak bisa diklik dan tidak
      mengubah apa pun, tapi ia terlihat oleh siapa saja yang melihat layarmu.
    </p>
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
  {:else if listed.length === 0}
    <p class="empty">
      Belum ada engine dari bridge. Jalankan <code>pnpm bridge</code>, lalu buka
      halaman ini lagi.
    </p>
  {:else}
    <ul>
      {#each listed as provider (provider.id)}
        {@const custom = depths[provider.id] !== undefined}
        {@const value = effective(provider)}
        <li class:off={!provider.ready || !isOn(provider)}>
          <div class="top">
            <span class="dot" class:ready={provider.ready && isOn(provider)}></span>
            <span class="name">{provider.label}</span>
            <!-- Sakelarnya di baris nama, bukan di dalam blok setelan: ini bukan salah
                 satu dari setelan itu, melainkan yang menentukan semuanya berlaku atau
                 tidak. -->
            <label class="switch">
              <input
                type="checkbox"
                aria-label={`Aktifkan ${provider.label}`}
                checked={isOn(provider)}
                onchange={(e) => toggle(provider, e.currentTarget.checked)}
              />
              <span>{isOn(provider) ? 'aktif' : 'mati'}</span>
            </label>
          </div>

          <!-- Depth diberi label sendiri seperti Kekuatan dan Kepribadian. Tanpa itu,
               slider paling atas adalah satu-satunya yang tak bernama, dan tidak ada cara
               menebak bahwa "d2" di kanan adalah judulnya. -->
          {#if !isOn(provider)}
            <p class="fine off-note">
              Dimatikan: tidak diminta menghitung dan panahnya tidak digambar. Setelan di
              bawah tetap tersimpan dan berlaku lagi begitu dinyalakan.
            </p>
          {/if}

          {#if supportsDepth(provider.kind)}
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
          {/if}

          <div class="sub" class:first={!supportsDepth(provider.kind)}>
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
                  disabled={dynamic.enabled}
                  value={eloOf(provider)}
                  oninput={(e) => setElo(provider, e.currentTarget.valueAsNumber)}
                />
                <input
                  type="number"
                  min={provider.strength.min}
                  max={provider.strength.max}
                  step="10"
                  aria-label={`Elo ${provider.label} (angka)`}
                  disabled={dynamic.enabled}
                  value={eloOf(provider)}
                  onchange={(e) => setElo(provider, e.currentTarget.valueAsNumber)}
                />
              </div>
              {#if dynamic.enabled}
                <!-- Slider yang mati tanpa penjelasan terbaca seperti bug. Nilainya tetap
                     ditampilkan, bukan disembunyikan: ia yang dipakai lagi begitu mode
                     dinamis dimatikan, atau saat rating tidak terbaca. -->
                <p class="fine">
                  Tidak berlaku sekarang — "Kekuatan ikut rating" sedang menyala. Nilai ini
                  tersimpan dan dipakai lagi kalau mode itu dimatikan, atau kalau rating
                  tidak terbaca di halaman.
                </p>
              {/if}
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
        Engine manusiawi (Maia) tidak punya setelan depth: mode policy hanya menghitung
        satu node. Kekuatannya melekat pada bobot yang dipakai — pilih Maia 1300, 1500,
        atau 1900 di <code>engines.config.json</code>.
      </p>
      <p class="note">
        Sakelar aktif/mati di sini hanya berlaku di ekstensi: engine tetap dijalankan
        bridge, cuma tidak diminta menghitung dan tidak muncul di overlay. Untuk
        mematikannya sampai bridge tidak menjalankannya sama sekali, pakai
        <code>"enabled": false</code> di <code>engines.config.json</code>.
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
  /*
   * Pemisah antara dua rentang jeda. Namanya sengaja panjang: kelas `.sub` sudah dipakai
   * blok per-engine di bawah, dan menamai ini `.sub` juga membuat seluruh blok itu ikut
   * berubah bentuk — persis yang pernah terjadi.
   */
  /* Daftar tombol yang tercatat: mengalir dan membungkus antar baris. */
  .pool { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border: 1px solid #d6d3d1;
    border-radius: 6px;
    background: #fafaf9;
    font-size: 11.5px;
    line-height: 1.2;
    cursor: pointer;
    /*
     * Teks tombolnya kalimat, bukan satu kata — "New 10 sec + 0.1", "Fair Play policy".
     * Dibiarkan membungkus di dalam chip, bentuknya jadi tinggi dan bulat tak karuan;
     * jadi tiap chip dipaksa satu baris, dan yang kepanjangan dipotong dengan elipsis.
     * Teks penuhnya tetap bisa dibaca lewat tooltip.
     */
    white-space: nowrap;
    /*
     * Jangan menyusut. Flex item boleh mengecil agar muat sebaris, dan dengan `overflow:
     * hidden` di dalamnya ia sanggup mengecil sampai tinggal satu huruf — delapan chip
     * berjejer jadi "F… N… L…" yang tidak bisa dibaca sama sekali. Yang benar adalah
     * membungkus ke baris berikutnya, dan itu baru terjadi kalau menyusut dilarang.
     */
    flex: none;
    max-width: 100%;
  }
  .chip span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chip:hover { border-color: #a8a29e; }
  /* Yang tercentang perlu kelihatan dari jauh, bukan cuma dari kotak centangnya. */
  .chip:has(input:checked) { border-color: #2563eb; background: #eff6ff; }
  .chip:has(input:disabled) { opacity: 0.55; cursor: default; }
  .chip input { margin: 0; flex: none; accent-color: #2563eb; cursor: inherit; }
  .range-head {
    margin: 14px 0 2px;
    color: #78716c;
    font-size: 11.5px;
    font-weight: 600;
  }
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

  .switch {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 5px;
    color: #78716c;
    font-size: 11.5px;
    cursor: pointer;
    user-select: none;
  }
  .switch input { accent-color: #2563eb; margin: 0; cursor: pointer; }
  /* `.block label` mematok lebar 34px untuk label slider di blok yang sama; sakelar
     di judul blok bukan salah satunya dan butuh lebar sepanjang teksnya. */
  .block .switch { width: auto; }
  .off-note { margin-top: 6px; }

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
    .chip { border-color: #44403c; background: #1c1917; }
    .chip:hover { border-color: #57534e; }
    .chip:has(input:checked) { border-color: #3b82f6; background: #1e293b; }
    .lead, .tag, .empty, .note, .switch { color: #a8a29e; }
    .value { color: #d6d3d1; }
    footer button { border-color: #44403c; background: #232020; }
    footer button:hover:not(:disabled) { background: #292524; }
    .link { color: #93c5fd; }
  }
</style>
