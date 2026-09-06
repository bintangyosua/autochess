import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EngineProvider, ProviderInfo } from '@cmr/shared';
import { StockfishProvider } from './StockfishProvider.js';

/** Root repo = tiga level di atas packages/bridge/src/providers. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

interface EngineConfigEntry {
  id: string;
  label: string;
  kind: 'strength' | 'human-like';
  type: 'stockfish' | 'lc0';
  enabled?: boolean;
  path: string;
  weights?: string;
  options?: Record<string, string | number | boolean>;
  defaults?: { movetimeMs?: number; depth?: number; nodes?: number; multipv?: number };
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

    if (config.type !== 'stockfish') {
      // MaiaProvider (lc0) menyusul di milestone 4, setelah lc0.exe tersedia.
      this.entries.set(config.id, { info: { ...base, problem: `tipe "${config.type}" belum didukung` } });
      return;
    }

    const provider = new StockfishProvider({
      id: config.id,
      label: config.label,
      path: binary,
      options: config.options,
      defaults: config.defaults,
      debug,
    });

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
