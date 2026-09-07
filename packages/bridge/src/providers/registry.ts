import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EngineProvider, ProviderInfo, StrengthSpec } from '@cmr/shared';
import { UciEngineProvider, type PersonaConfig } from './UciEngineProvider.js';
import { Lc0Provider, type Lc0Mode } from './Lc0Provider.js';

/** Root repo = tiga level di atas packages/bridge/src/providers. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

interface EngineConfigEntry {
  id: string;
  label: string;
  kind: 'strength' | 'human-like';
  /**
   * 'uci' = engine UCI biasa (Stockfish, Komodo, Dragon). 'stockfish' dipertahankan
   * sebagai nama lama yang artinya sama persis.
   */
  type: 'uci' | 'stockfish' | 'lc0';
  enabled?: boolean;
  path: string;
  weights?: string;
  /** Warna panah di overlay, mis. "#2563eb". */
  color?: string;
  /** Khusus type lc0: 'policy' untuk Maia, 'search' untuk Leela biasa. */
  mode?: Lc0Mode;
  options?: Record<string, string | number | boolean>;
  defaults?: { movetimeMs?: number; depth?: number; nodes?: number; multipv?: number };
  /** Cara engine ini dibatasi kekuatannya; tanpa ini, slider Elo tidak muncul untuknya. */
  strength?: StrengthSpec;
  defaultElo?: number;
  personas?: PersonaConfig[];
  defaultPersona?: string;
}

export interface RegistryEntry {
  info: ProviderInfo;
  provider?: EngineProvider;
}

export class ProviderRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  static async load(configPath = resolve(REPO_ROOT, 'engines.config.json'), debug = false) {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as { engines: EngineConfigEntry[] };
    const registry = new ProviderRegistry();
    for (const entry of parsed.engines) await registry.add(entry, debug);
    return registry;
  }

  private async add(config: EngineConfigEntry, debug: boolean): Promise<void> {
    const base: ProviderInfo = {
      id: config.id,
      label: config.label,
      kind: config.kind,
      ready: false,
      // Diteruskan apa adanya ke ekstensi: warna panah dan setelan analisis ikut
      // berasal dari berkas ini, supaya tidak ada daftar engine kedua di sisi UI.
      color: config.color ?? (config.kind === 'human-like' ? '#ea7317' : '#2563eb'),
      defaults: config.defaults,
      strength: config.strength,
      defaultElo: config.defaultElo,
      // Hanya id/label/hint yang diteruskan: daftar setoption-nya urusan bridge, dan
      // ekstensi tidak perlu tahu tombol mana yang diputar untuk tiap kepribadian.
      personas: config.personas?.map(({ id, label, hint }) => ({ id, label, hint })),
      defaultPersona: config.defaultPersona,
    };

    if (config.enabled === false) {
      this.entries.set(config.id, { info: { ...base, problem: 'dimatikan di engines.config.json' } });
      return;
    }

    const binary = resolve(REPO_ROOT, config.path);
    if (!existsSync(binary)) {
      this.entries.set(config.id, { info: { ...base, problem: `binari tidak ditemukan: ${binary}` } });
      return;
    }

    let provider: EngineProvider;
    if (config.type === 'uci' || config.type === 'stockfish') {
      provider = new UciEngineProvider({
        id: config.id,
        label: config.label,
        path: binary,
        options: config.options,
        defaults: config.defaults,
        strength: config.strength,
        defaultElo: config.defaultElo,
        personas: config.personas,
        defaultPersona: config.defaultPersona,
        debug,
      });
    } else if (config.type === 'lc0') {
      if (!config.weights) {
        this.entries.set(config.id, { info: { ...base, problem: 'entri lc0 tanpa "weights"' } });
        return;
      }
      const weights = resolve(REPO_ROOT, config.weights);
      if (!existsSync(weights)) {
        this.entries.set(config.id, { info: { ...base, problem: `bobot tidak ditemukan: ${weights}` } });
        return;
      }
      provider = new Lc0Provider({
        id: config.id,
        label: config.label,
        path: binary,
        weights,
        mode: config.mode ?? 'policy',
        defaults: config.defaults,
        debug,
      });
    } else {
      this.entries.set(config.id, { info: { ...base, problem: `tipe "${config.type}" tidak dikenal` } });
      return;
    }

    try {
      await provider.init();
      this.entries.set(config.id, { info: { ...base, ready: true }, provider });
      console.log(`[registry] ${config.id} siap (${binary})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.entries.set(config.id, { info: { ...base, problem: message } });
      console.error(`[registry] ${config.id} gagal init: ${message}`);
    }
  }

  list(): ProviderInfo[] {
    return [...this.entries.values()].map((entry) => entry.info);
  }

  get(id: string): RegistryEntry | undefined {
    return this.entries.get(id);
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.entries.values()].map((entry) => entry.provider?.dispose()));
  }
}
