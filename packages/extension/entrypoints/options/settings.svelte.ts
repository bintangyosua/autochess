/**
 * Satu tempat untuk seluruh keadaan halaman pengaturan.
 *
 * Sebelumnya semua ini tinggal di dalam `App.svelte`: empat belas `$state`, empat belas
 * pemuat, dan satu pendengar `storage.onChanged` sepanjang empat puluh baris yang harus
 * dibaca seluruhnya untuk tahu setelan mana yang ikut berubah dari tab lain. Dipisah ke
 * sini, tiap setelan punya satu baris pendaftaran, dan komponen di `sections/` cukup
 * membaca `settings.threats` tanpa tahu dari mana asalnya.
 *
 * Bentuknya kelas, bukan sekumpulan variabel lepas: rune `$state` hanya hidup sebagai
 * properti kelas atau variabel komponen, dan properti kelas adalah satu-satunya dari
 * keduanya yang bisa dibagi lintas berkas tanpa kehilangan reaktivitasnya.
 */
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

class SettingsStore {
  providers = $state<ProviderInfo[]>([]);
  loaded = $state(false);

  depths = $state<DepthOverrides>({});
  elos = $state<EloOverrides>({});
  personas = $state<PersonaOverrides>({});
  arrows = $state<ArrowOverrides>({});
  enabled = $state<EnabledOverrides>({});

  timing = $state<AutoTiming>(DEFAULT_TIMING);
  think = $state<ThinkSetting>(DEFAULT_THINK_SETTING);
  dynamic = $state<DynamicEloSetting>(DEFAULT_DYNAMIC_ELO);
  newGame = $state<AutoNewGameSetting>(DEFAULT_AUTO_NEW_GAME);
  threats = $state(DEFAULT_THREATS);
  cursorDot = $state(false);

  /** Teks tombol yang pernah terlihat di modal hasil, dikumpulkan content script. */
  seen = $state<string[]>([]);

  /** Ada setelan per engine yang menyimpang dari `engines.config.json`. */
  anyOverride = $derived(
    Object.keys(this.depths).length +
      Object.keys(this.elos).length +
      Object.keys(this.personas).length +
      Object.keys(this.arrows).length >
      0,
  );

  timingChanged = $derived(
    this.timing.minMs !== DEFAULT_TIMING.minMs ||
      this.timing.maxMs !== DEFAULT_TIMING.maxMs ||
      this.timing.capture.minMs !== DEFAULT_TIMING.capture.minMs ||
      this.timing.capture.maxMs !== DEFAULT_TIMING.capture.maxMs,
  );

  /**
   * Muat semua nilai dan ikuti perubahannya.
   *
   * Dipanggil dari komponen, bukan dari konstruktor: modul ini diimpor juga oleh berkas
   * yang hanya butuh tipenya, dan memulai I/O sebagai efek samping impor berarti berkas
   * apa pun yang menyentuhnya ikut membangunkan storage.
   */
  start(): void {
    // Daftar engine tetap datang dari bridge — halaman ini tidak punya daftarnya sendiri,
    // jadi engine yang dimatikan di engines.config.json juga tidak muncul di sini.
    void browser.storage.session.get('providers').then((values) => {
      if (Array.isArray(values.providers)) this.providers = values.providers as ProviderInfo[];
    });

    void browser.runtime
      .sendMessage({ type: 'status' })
      .then((reply) => {
        const status = reply as StatusReply | undefined;
        if (status?.providers) this.providers = status.providers;
      })
      .catch(() => undefined);

    void loadTiming().then((v) => (this.timing = v));
    void loadElos().then((v) => (this.elos = v));
    void loadPersonas().then((v) => (this.personas = v));
    void loadArrows().then((v) => (this.arrows = v));
    void loadEnabled().then((v) => (this.enabled = v));
    void loadThreats().then((v) => (this.threats = v));
    void loadCursorDot().then((v) => (this.cursorDot = v));
    void loadDynamicElo().then((v) => (this.dynamic = v));
    void loadAutoNewGame().then((v) => (this.newGame = v));
    void loadSeenLabels().then((v) => (this.seen = v));
    void loadThinkSetting().then((v) => (this.think = v));

    void loadDepths().then((v) => {
      this.depths = v;
      this.loaded = true;
    });

    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'session' && Array.isArray(changes.providers?.newValue)) {
        this.providers = changes.providers.newValue as ProviderInfo[];
        return;
      }
      if (area !== 'local') return;

      // Popup dan tab lain bisa mengubah nilai yang sama. Satu kunci satu baris, jadi
      // menambah setelan berarti menambah baris — bukan menyisipkan cabang `if` lain ke
      // dalam rentetan yang harus dibaca seluruhnya.
      const apply: Record<string, (value: unknown) => void> = {
        [DEPTH_KEY]: (v) => (this.depths = readDepthChange(v)),
        [ELO_KEY]: (v) => (this.elos = readEloChange(v)),
        [PERSONA_KEY]: (v) => (this.personas = readPersonaChange(v)),
        [ARROW_COUNT_KEY]: (v) => (this.arrows = readArrowChange(v)),
        [ENGINE_ENABLED_KEY]: (v) => (this.enabled = readEnabledChange(v)),
        [THREATS_KEY]: (v) => (this.threats = sanitizeThreats(v)),
        [AUTO_TIMING_KEY]: (v) => (this.timing = sanitizeTiming(v)),
        // Datang dari tab chess.com yang sedang terbuka; daftarnya tumbuh sendiri sambil
        // halaman ini terbuka.
        [NEW_GAME_SEEN_KEY]: (v) => (this.seen = sanitizeSeen(v)),
        [AUTO_NEW_GAME_KEY]: (v) => (this.newGame = sanitizeAutoNewGame(v)),
        [THINK_STYLE_KEY]: (v) => (this.think = sanitizeThinkSetting(v)),
        [DYNAMIC_ELO_KEY]: (v) => (this.dynamic = sanitizeDynamicElo(v)),
        [CURSOR_DOT_KEY]: (v) => (this.cursorDot = sanitizeCursorDot(v)),
      };

      for (const [key, change] of Object.entries(changes)) apply[key]?.(change.newValue);
    });
  }

  // --- sakelar tunggal ---------------------------------------------------------------

  /**
   * Bawaannya menyala, tapi yang disimpan tetap nilai apa adanya — bukan dihapus saat
   * menyala seperti sakelar per engine. Di sana peta setelan memang harus tetap kosong
   * supaya engine baru ikut bawaan; di sini tidak ada engine yang bisa menyusul.
   */
  setThreats(on: boolean): void {
    this.threats = on;
    void saveThreats(on);
  }

  setCursorDot(on: boolean): void {
    this.cursorDot = on;
    void saveCursorDot(on);
  }

  // --- jeda mode auto ----------------------------------------------------------------

  /**
   * Menggeser satu ujung ikut mendorong ujung lainnya kalau keduanya berpapasan.
   * Rentang terbalik tidak punya arti, dan menolak input diam-diam lebih
   * membingungkan daripada memindahkan ujung yang satunya di depan mata.
   */
  setTiming(edge: 'minMs' | 'maxMs', raw: number): void {
    const next = { ...this.timing, [edge]: raw };
    if (edge === 'minMs' && next.minMs > next.maxMs) next.maxMs = next.minMs;
    if (edge === 'maxMs' && next.maxMs < next.minMs) next.minMs = next.maxMs;
    this.timing = sanitizeTiming(next);
    void saveTiming(this.timing);
  }

  /** Aturan dorong-mendorongnya sama, hanya rentangnya yang berbeda. */
  setCaptureTiming(edge: 'minMs' | 'maxMs', raw: number): void {
    const capture = { ...this.timing.capture, [edge]: raw };
    if (edge === 'minMs' && capture.minMs > capture.maxMs) capture.maxMs = capture.minMs;
    if (edge === 'maxMs' && capture.maxMs < capture.minMs) capture.minMs = capture.maxMs;
    this.timing = sanitizeTiming({ ...this.timing, capture });
    void saveTiming(this.timing);
  }

  resetTiming(): void {
    this.timing = DEFAULT_TIMING;
    void saveTiming(this.timing);
  }

  // --- gaya berpikir -----------------------------------------------------------------

  setThink(patch: Partial<ThinkSetting>): void {
    this.think = sanitizeThinkSetting({ ...this.think, ...patch });
    void saveThinkSetting(this.think);
  }

  /** Jalan pintas untuk setelan di dalam `think`, yang selalu ditulis utuh. */
  patchThink(patch: Partial<ThinkSetting['think']>): void {
    this.setThink({ think: { ...this.think.think, ...patch } });
  }

  patchClock(patch: Partial<ThinkSetting['clock']>): void {
    this.setThink({ clock: { ...this.think.clock, ...patch } });
  }

  // --- Elo dinamis -------------------------------------------------------------------

  /**
   * Mode dinamis dan slider kekuatan tidak pernah aktif bersamaan; menyalakan ini
   * membuat slider di bawah jadi tidak berlaku, dan itu dikatakan di UI-nya, bukan
   * dibiarkan jadi kejutan.
   */
  setDynamic(patch: Partial<DynamicEloSetting>): void {
    const next = { ...this.dynamic, ...patch };
    if ('minOffset' in patch && next.minOffset > next.maxOffset) next.maxOffset = next.minOffset;
    if ('maxOffset' in patch && next.maxOffset < next.minOffset) next.minOffset = next.maxOffset;
    this.dynamic = sanitizeDynamicElo(next);
    void saveDynamicElo(this.dynamic);
  }

  // --- game baru otomatis ------------------------------------------------------------

  setNewGame(patch: Partial<AutoNewGameSetting>): void {
    const next = { ...this.newGame, ...patch };
    if ('minMs' in patch && next.minMs > next.maxMs) next.maxMs = next.minMs;
    if ('maxMs' in patch && next.maxMs < next.minMs) next.minMs = next.maxMs;
    this.newGame = sanitizeAutoNewGame(next);
    void saveAutoNewGame(this.newGame);
  }

  /**
   * Daftar kosong berarti "pakai pola bawaan", bukan "tidak ada yang boleh".
   *
   * Membedakan keduanya lewat daftar kosong terasa berisiko, tapi alternatifnya lebih
   * buruk: sakelar "batasi tombol" yang terpisah bisa menyala dengan daftar kosong, dan
   * hasilnya fitur yang diam tanpa alasan yang kelihatan.
   */
  toggleLabel(label: string, on: boolean): void {
    const labels = on
      ? [...this.newGame.labels, label]
      : this.newGame.labels.filter((item) => item !== label);
    this.setNewGame({ labels });
  }

  /**
   * Buang catatan tombol yang pernah terlihat.
   *
   * Berguna setelah chess.com mengubah bentuk modalnya, atau setelah kamu mengganti
   * bahasa antarmuka: daftar lama jadi tidak akan pernah cocok lagi, dan membiarkannya
   * cuma bikin bingung. Pilihan yang sudah dicentang ikut dibuang, karena isinya justru
   * teks-teks itu.
   */
  clearSeen(): void {
    this.seen = [];
    void clearSeenLabels();
    this.setNewGame({ labels: [] });
  }

  // --- setelan per engine ------------------------------------------------------------

  isOn(provider: ProviderInfo): boolean {
    return engineEnabled(this.enabled, provider.id);
  }

  /**
   * Nilai bawaannya menyala, jadi menyalakan kembali berarti menghapus entrinya — bukan
   * menyimpan `true`. Dengan begitu peta ini hanya berisi engine yang benar-benar
   * dimatikan, dan engine baru di config langsung ikut tanpa perlu setelan.
   */
  toggleEngine(provider: ProviderInfo, on: boolean): void {
    if (on) {
      const { [provider.id]: _removed, ...rest } = this.enabled;
      this.enabled = rest;
    } else {
      this.enabled = { ...this.enabled, [provider.id]: false };
    }
    void saveEnabled(this.enabled);
  }

  /** Nilai yang sedang berlaku: pilihan pengguna kalau ada, kalau tidak bawaan config. */
  depthOf(provider: ProviderInfo): number {
    return this.depths[provider.id] ?? provider.defaults?.depth ?? DEPTH_MIN;
  }

  setDepth(provider: ProviderInfo, raw: number): void {
    const depth = Math.min(DEPTH_MAX, Math.max(DEPTH_MIN, Math.round(raw)));
    this.depths = { ...this.depths, [provider.id]: depth };
    void saveDepths(this.depths);
  }

  resetDepth(provider: ProviderInfo): void {
    const { [provider.id]: _removed, ...rest } = this.depths;
    this.depths = rest;
    void saveDepths(this.depths);
  }

  /**
   * Elo yang berlaku. Nilai awalnya ujung atas rentang, bukan tengahnya: tanpa pilihan
   * eksplisit engine memang jalan penuh, dan slider harus mencerminkan itu.
   */
  eloOf(provider: ProviderInfo): number {
    return this.elos[provider.id] ?? provider.defaultElo ?? provider.strength?.max ?? 0;
  }

  setElo(provider: ProviderInfo, raw: number): void {
    const spec = provider.strength;
    if (!spec) return;
    const elo = Math.min(spec.max, Math.max(spec.min, Math.round(raw)));
    this.elos = { ...this.elos, [provider.id]: elo };
    void saveElos(this.elos);
  }

  resetElo(provider: ProviderInfo): void {
    const { [provider.id]: _removed, ...rest } = this.elos;
    this.elos = rest;
    void saveElos(this.elos);
  }

  /** Jumlah panah yang berlaku: pilihan pengguna, kalau tidak `defaults.multipv`. */
  arrowsOf(provider: ProviderInfo): number {
    return arrowsFor(this.arrows, provider.id, provider.defaults?.multipv);
  }

  setArrows(provider: ProviderInfo, raw: number): void {
    const count = Math.min(ARROWS_MAX, Math.max(ARROWS_MIN, Math.round(raw)));
    this.arrows = { ...this.arrows, [provider.id]: count };
    void saveArrows(this.arrows);
  }

  resetArrows(provider: ProviderInfo): void {
    const { [provider.id]: _removed, ...rest } = this.arrows;
    this.arrows = rest;
    void saveArrows(this.arrows);
  }

  personaOf(provider: ProviderInfo): string {
    return this.personas[provider.id] ?? provider.defaultPersona ?? provider.personas?.[0]?.id ?? '';
  }

  setPersona(provider: ProviderInfo, id: string): void {
    this.personas = { ...this.personas, [provider.id]: id };
    void savePersonas(this.personas);
  }

  personaHint(provider: ProviderInfo): string {
    return provider.personas?.find((x) => x.id === this.personaOf(provider))?.hint ?? '';
  }

  /**
   * Di ujung atas rentang pembatas dilepas sama sekali, jadi angkanya menyesatkan kalau
   * ditampilkan. Untuk engine mode `skill` angkanya hasil pemetaan ke skala Skill 0..25 —
   * ditandai `≈` supaya tidak dibaca sebagai Elo native seperti punya Stockfish.
   */
  eloLabel(provider: ProviderInfo): string {
    const spec = provider.strength;
    if (!spec) return '';
    const value = this.eloOf(provider);
    if (value >= spec.max) return 'penuh';
    return spec.mode === 'skill' ? `≈${value}` : `${value}`;
  }

  resetAll(): void {
    this.depths = {};
    this.elos = {};
    this.personas = {};
    this.arrows = {};
    void saveDepths(this.depths);
    void saveElos(this.elos);
    void savePersonas(this.personas);
    void saveArrows(this.arrows);
  }
}

export const settings = new SettingsStore();

/** Detik dengan satu angka di belakang koma, koma sebagai pemisahnya. */
export function seconds(ms: number): string {
  return (ms / 1000).toFixed(1).replace('.', ',');
}
