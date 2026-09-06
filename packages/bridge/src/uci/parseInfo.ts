export interface UciInfo {
  depth?: number;
  seldepth?: number;
  multipv?: number;
  scoreCp?: number;
  mateIn?: number;
  /** Skor masih batas atas/bawah dari aspiration window — belum bisa dipercaya. */
  bound?: 'lower' | 'upper';
  nodes?: number;
  nps?: number;
  timeMs?: number;
  pv?: string[];
  /** Isi dari `info string ...` (lc0 memakainya untuk verbose move stats). */
  string?: string;
}

const NUMERIC_FIELDS: Record<string, keyof UciInfo> = {
  depth: 'depth',
  seldepth: 'seldepth',
  multipv: 'multipv',
  nodes: 'nodes',
  nps: 'nps',
  time: 'timeMs',
};

/**
 * Parse satu baris `info ...` dari engine UCI.
 * Mengembalikan undefined kalau baris bukan `info`.
 */
export function parseInfo(line: string): UciInfo | undefined {
  if (!line.startsWith('info ')) return undefined;

  const rest = line.slice(5);
  // `info string ...` adalah bentuk khusus: sisanya teks bebas.
  if (rest.startsWith('string ')) return { string: rest.slice(7) };

  const tokens = rest.split(/\s+/);
  const info: UciInfo = {};

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;

    const numericKey = NUMERIC_FIELDS[token];
    if (numericKey) {
      const value = Number(tokens[++i]);
      if (Number.isFinite(value)) (info[numericKey] as number) = value;
      continue;
    }

    if (token === 'score') {
      const kind = tokens[++i];
      const value = Number(tokens[++i]);
      if (!Number.isFinite(value)) continue;
      if (kind === 'cp') info.scoreCp = value;
      else if (kind === 'mate') info.mateIn = value;
      continue;
    }

    if (token === 'lowerbound') {
      info.bound = 'lower';
      continue;
    }
    if (token === 'upperbound') {
      info.bound = 'upper';
      continue;
    }

    if (token === 'pv') {
      // pv selalu token terakhir sebelum daftar move, jadi sisanya milik pv.
      info.pv = tokens.slice(i + 1).filter(Boolean);
      break;
    }
  }

  return info;
}

/** Parse `bestmove e2e4 [ponder e7e5]`. Mengembalikan undefined kalau bukan bestmove. */
export function parseBestmove(line: string): { best: string; ponder?: string } | undefined {
  if (!line.startsWith('bestmove')) return undefined;
  const [, best, , ponder] = line.split(/\s+/);
  if (!best) return undefined;
  return { best, ponder };
}
