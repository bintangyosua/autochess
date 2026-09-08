/**
 * Geometri panah dan label skor di atas papan.
 *
 * Dipisah dari komponennya supaya bisa dipakai apa adanya oleh alat lain — terutama
 * preview yang dirender di luar browser ekstensi. Kalau angka-angka ini hidup di dalam
 * `.svelte`, satu-satunya cara memeriksanya secara visual adalah menyalinnya, dan salinan
 * itu akan menyimpang diam-diam dari yang benar-benar terpasang.
 */

export type Orientation = 'white' | 'black';
export type ProviderKind = 'strength' | 'human-like';

export interface ScoreSource {
  scoreCp?: number;
  mateIn?: number;
  policy?: number;
}

export function scoreText(s: ScoreSource, kind: ProviderKind): string {
  if (s.mateIn !== undefined) return `#${s.mateIn}`;
  if (kind === 'human-like' && s.policy !== undefined) return `${(s.policy * 100).toFixed(0)}%`;
  if (s.scoreCp === undefined) return '';

  // Dua angka di belakang koma cuma berguna selama posisinya masih berimbang. Begitu
  // selisihnya lewat satu bidak penuh, angka keduanya tidak menambah apa pun — dan di
  // papan, satu karakter lebih pendek berarti pil yang menutupi lebih sedikit kotak.
  const pawns = s.scoreCp / 100;
  return (pawns > 0 ? '+' : '') + pawns.toFixed(Math.abs(pawns) >= 10 ? 1 : 2);
}

/**
 * Papan digambar sebagai grid 8x8 lewat viewBox, jadi koordinat panah ditulis dalam
 * satuan kotak dan ikut menyesuaikan berapa pun ukuran papan di layar.
 */
export function toXY(square: string, orientation: Orientation): { x: number; y: number } {
  const file = square.charCodeAt(0) - 96; // a=1
  const rank = Number(square[1]);
  return orientation === 'white'
    ? { x: file - 0.5, y: 8 - rank + 0.5 }
    : { x: 8 - file + 0.5, y: rank - 0.5 };
}

export interface Arrow {
  key: string;
  x1: number; y1: number; x2: number; y2: number;
  color: string;
  width: number;
  opacity: number;
  /** Kosong = garis penuh. Diisi hanya untuk panah balasan. */
  dash: string;
  head: number;
  /** Skor engine untuk langkah ini. Kosong = tanpa label. */
  label: string;
  labelX: number;
  labelY: number;
  labelSize: number;
  /** Ukuran pil latar; ditaksir dari panjang teks karena SVG tidak bisa mengukurnya. */
  labelW: number;
  labelH: number;
  /** Ujung panah, titik acuan label sebelum digeser. */
  tipX: number;
  tipY: number;
  /** Vektor satuan tegak lurus batang panah; arah geser label saat menghindari tabrakan. */
  perpX: number;
  perpY: number;
  /** Vektor satuan searah panah (asal -> tujuan); label mundur sepanjang ini kalau perlu. */
  dirX: number;
  dirY: number;
  /** Peringkat, dipakai layout untuk memutuskan siapa yang mengalah. */
  rank: number;
}

/**
 * Lebar satu karakter relatif terhadap font-size, untuk angka tabular.
 *
 * SVG tidak punya cara mengukur teks tanpa menyentuh DOM, jadi lebar pil ditaksir dari
 * jumlah karakter. Taksirannya sengaja sedikit royal — pil yang kelewat sempit memotong
 * angkanya, sementara yang kelewat lebar cuma terlihat lapang.
 */
const CHAR_WIDTH = 0.6;
/** Jarak dari tepi teks ke tepi pil, dalam satuan font-size. */
const LABEL_PADDING = 0.34;

/**
 * Seberapa tipis dan redup panah peringkat ke-n dibanding yang utama.
 *
 * Peringkat harus terbaca sekilas tanpa membaca angkanya: langkah terbaik tebal dan
 * pekat, alternatifnya makin tipis makin ke bawah. Turunnya dibuat melandai, bukan
 * linier — dengan skala linier panah kelima nyaris hilang sementara beda kedua ke ketiga
 * hampir tak terasa.
 */
export function rankScale(rank: number): { width: number; opacity: number } {
  if (rank === 0) return { width: 1, opacity: 1 };
  return { width: Math.max(0.3, 0.52 - rank * 0.05), opacity: Math.max(0.35, 0.7 - rank * 0.1) };
}

export interface ArrowSpec {
  key: string;
  uci: string;
  color: string;
  kind: ProviderKind;
  orientation: Orientation;
  /** 0 = langkah terbaik. */
  rank: number;
  /** Balasan bersyarat dari pv, digambar putus-putus. */
  reply?: boolean;
  label?: string;
}

export function buildArrow(spec: ArrowSpec): Arrow {
  const { key, uci, color, kind, orientation, rank, reply = false, label = '' } = spec;
  const from = toXY(uci.slice(0, 2), orientation);
  const to = toXY(uci.slice(2, 4), orientation);

  // Pendekkan ujung panah supaya kepalanya berhenti di tepi kotak tujuan, bukan
  // menutupi bidak yang ada di sana.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const trim = 0.3;

  const scale = rankScale(rank);
  const width = (kind === 'strength' ? 0.13 : 0.1) * scale.width;
  const opacity = (kind === 'strength' ? 0.9 : 0.75) * scale.opacity;
  const x2 = to.x - (dx / len) * trim;
  const y2 = to.y - (dy / len) * trim;

  // Label digeser tegak lurus dari batang panah. Tepat di ujungnya ia bertumpuk dengan
  // kepala panah, dan di tengah kotak tujuan ia menutupi bidak.
  const labelSize = rank === 0 ? 0.24 : 0.2;
  const perpX = -dy / len;
  const perpY = dx / len;

  return {
    key,
    x1: from.x, y1: from.y,
    x2, y2,
    color,
    width: reply ? width * 0.55 : width,
    opacity: reply ? opacity * 0.45 : opacity,
    dash: reply ? '0.17 0.13' : '',
    head: reply ? 2.6 : 3.2,
    label,
    labelX: x2 + perpX * BASE_OFFSET,
    labelY: y2 + perpY * BASE_OFFSET,
    labelSize,
    labelW: (label.length * CHAR_WIDTH + LABEL_PADDING * 2) * labelSize,
    labelH: labelSize * 1.5,
    tipX: x2,
    tipY: y2,
    perpX,
    perpY,
    dirX: dx / len,
    dirY: dy / len,
    rank,
  };
}

/** Jarak baku label dari batang panah. Lebih dekat dan ia bertumpuk dengan kepala panah. */
const BASE_OFFSET = 0.3;

/**
 * Posisi geser yang boleh dicoba sebuah label: [tegak lurus, mundur sepanjang batang].
 *
 * Urutannya dari yang paling tidak mengganggu ke yang paling: sisi baku dulu, lalu sisi
 * seberang, lalu makin jauh, lalu mundur menyusuri batang panahnya sendiri. Keduanya
 * bergerak relatif terhadap panah, bukan ke arah bebas mana pun — dengan begitu label
 * tetap jelas milik panah yang mana, sejauh apa pun ia terpaksa digeser.
 *
 * Mundur sepanjang batang itu yang menyelamatkan kasus tersulitnya: beberapa langkah
 * teratas sering berujung di kotak yang sama persis, jadi menggeser tegak lurus saja
 * tidak pernah cukup — semuanya berebut cincin sempit di sekeliling satu titik.
 */
const OFFSET_CANDIDATES: readonly [number, number][] = [
  [0.3, 0], [-0.3, 0],
  [0.56, 0], [-0.56, 0],
  [0.3, -0.36], [-0.3, -0.36],
  [0.82, 0], [-0.82, 0],
  [0.56, -0.36], [-0.56, -0.36],
  [0.3, -0.72], [-0.3, -0.72],
  [0.56, -0.72], [-0.56, -0.72],
];

function overlaps(a: Arrow, b: Arrow): boolean {
  // Sedikit margin supaya dua pil tidak sekadar bersinggungan tepi.
  const margin = 0.03;
  return (
    Math.abs(a.labelX - b.labelX) * 2 < a.labelW + b.labelW + margin * 2 &&
    Math.abs(a.labelY - b.labelY) * 2 < a.labelH + b.labelH + margin * 2
  );
}

/**
 * Geser label yang bertabrakan, dan tarik masuk yang menjorok keluar papan.
 *
 * Dua hal ini nyata, bukan kehati-hatian teoretis: dengan lima panah dari satu engine,
 * langkah-langkah teratas sering berujung di kotak yang berdekatan sehingga pilnya
 * bertumpuk dan angkanya tak terbaca — dan panah yang berujung di tepi papan melempar
 * labelnya ke luar bingkai, terpotong separuh.
 *
 * Yang mengalah selalu peringkat yang lebih rendah: langkah terbaik berhak atas tempat
 * terbaik. Kalau semua kandidat penuh, label tetap digambar di tempat asalnya — bertumpuk
 * masih lebih baik daripada hilang tanpa penjelasan.
 */
export function layoutLabels(arrows: readonly Arrow[]): Arrow[] {
  const withLabel = arrows.filter((a) => a.label);
  const plain = arrows.filter((a) => !a.label);

  const placed: Arrow[] = [];
  for (const arrow of [...withLabel].sort((a, b) => a.rank - b.rank)) {
    let chosen: Arrow | undefined;
    for (const [perp, along] of OFFSET_CANDIDATES) {
      const candidate = clampToBoard({
        ...arrow,
        labelX: arrow.tipX + arrow.perpX * perp + arrow.dirX * along,
        labelY: arrow.tipY + arrow.perpY * perp + arrow.dirY * along,
      });
      if (placed.some((other) => overlaps(candidate, other))) continue;
      chosen = candidate;
      break;
    }
    placed.push(chosen ?? clampToBoard(arrow));
  }

  return [...plain, ...placed];
}

/** Tarik pil ke dalam papan supaya tidak ada angka yang terpotong tepi. */
function clampToBoard(arrow: Arrow): Arrow {
  const halfW = arrow.labelW / 2;
  const halfH = arrow.labelH / 2;
  return {
    ...arrow,
    labelX: Math.min(8 - halfW, Math.max(halfW, arrow.labelX)),
    labelY: Math.min(8 - halfH, Math.max(halfH, arrow.labelY)),
  };
}
