import { browser } from 'wxt/browser';

/**
 * Kunci storage untuk override depth per engine.
 *
 * `engines.config.json` tetap satu-satunya sumber daftar engine dan nilai bawaannya.
 * Yang disimpan di sini hanya selisihnya: id engine -> depth pilihan pengguna. Engine
 * yang tidak ada di peta ini memakai `defaults` dari berkas config apa adanya, jadi
 * menghapus setelan sama dengan mengembalikannya ke bawaan.
 */
export const DEPTH_KEY = 'engineDepth';

export type DepthOverrides = Record<string, number>;

/** Batas yang masuk akal untuk pencarian di mesin lokal. */
export const DEPTH_MIN = 1;
export const DEPTH_MAX = 30;

function sanitize(value: unknown): DepthOverrides {
  if (typeof value !== 'object' || value === null) return {};
  const out: DepthOverrides = {};
  for (const [id, depth] of Object.entries(value as Record<string, unknown>)) {
    if (typeof depth !== 'number' || !Number.isFinite(depth)) continue;
    const rounded = Math.round(depth);
    if (rounded < DEPTH_MIN || rounded > DEPTH_MAX) continue;
    out[id] = rounded;
  }
  return out;
}

export async function loadDepths(): Promise<DepthOverrides> {
  const stored = await browser.storage.local.get(DEPTH_KEY);
  return sanitize(stored[DEPTH_KEY]);
}

export async function saveDepths(depths: DepthOverrides): Promise<void> {
  await browser.storage.local.set({ [DEPTH_KEY]: sanitize(depths) });
}

/** Ubah nilai mentah dari storage.onChanged jadi peta yang aman dipakai. */
export function readDepthChange(value: unknown): DepthOverrides {
  return sanitize(value);
}

/**
 * Depth hanya bermakna untuk engine pencari. Mode policy (Maia) selalu `go nodes 1`
 * — satu node tidak punya kedalaman untuk diatur — jadi jangan tawarkan setelannya.
 */
export function supportsDepth(kind: string): boolean {
  return kind === 'strength';
}
