/**
 * Membaca panel move list chess.com.
 *
 * Jebakan utamanya: huruf bidak pada SAN dirender sebagai ikon (figurine), bukan teks.
 * `Bb7` muncul di DOM sebagai ikon gajah + teks "b7". Mengambil textContent mentah
 * menghasilkan "b7", yang di banyak posisi merupakan langkah pion yang SAH — jadi
 * kesalahannya tidak terdeteksi sebagai move ilegal, hanya menghasilkan posisi yang salah.
 * Karena itu huruf bidak harus diambil dari elemen ikonnya, bukan disimpulkan dari teks.
 */

export type PieceLetter = 'K' | 'Q' | 'R' | 'B' | 'N';

/** Nama bidak di kelas/atribut ikon chess.com -> huruf SAN. */
const FIGURINE_BY_NAME: Record<string, PieceLetter> = {
  king: 'K',
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
};

const SAN_PIECE = /^[KQRBN]/;
/** SAN yang utuh tanpa huruf bidak: langkah pion (e4, exd5, e8=Q) atau rokade. */
const PAWN_OR_CASTLE = /^(?:[a-h](?:x[a-h])?[1-8](?:=[QRBN])?|O-O(?:-O)?)[+#]?$/;

/**
 * Gabungkan huruf bidak dari ikon dengan teks move.
 * `figurine` boleh berupa huruf ("B"), nama ("bishop"), atau undefined.
 */
export function composeSan(figurine: string | undefined, text: string): string {
  const san = text.replace(/\s+/g, '').trim();
  if (!san) return '';
  // Teks sudah memuat huruf bidak (beberapa tema chess.com memang memakai huruf).
  if (SAN_PIECE.test(san)) return san;

  const letter = toPieceLetter(figurine);
  return letter ? `${letter}${san}` : san;
}

export function toPieceLetter(figurine: string | undefined): PieceLetter | undefined {
  if (!figurine) return undefined;
  const trimmed = figurine.trim();
  if (SAN_PIECE.test(trimmed) && trimmed.length === 1) return trimmed as PieceLetter;

  const lower = trimmed.toLowerCase();
  for (const [name, letter] of Object.entries(FIGURINE_BY_NAME)) {
    if (lower.includes(name)) return letter;
  }
  return undefined;
}

export interface RawMoveCell {
  /** Teks move apa adanya dari DOM, mis. "b7". */
  text: string;
  /** Huruf/nama bidak dari elemen ikon, mis. "bishop" atau "B". */
  figurine?: string;
}

export interface MoveListParseResult {
  san: string[];
  problems: string[];
}

/**
 * Susun daftar SAN dari sel-sel move yang sudah diekstrak dari DOM.
 * Urutan `cells` harus mengikuti urutan permainan (putih, hitam, putih, ...).
 */
export function parseMoveCells(cells: readonly RawMoveCell[]): MoveListParseResult {
  const san: string[] = [];
  const problems: string[] = [];

  for (const [index, cell] of cells.entries()) {
    const composed = composeSan(cell.figurine, cell.text);
    if (!composed) continue;

    // Sel tanpa huruf bidak yang juga bukan langkah pion/rokade berarti ikonnya gagal
    // terbaca. Lebih baik berhenti daripada meneruskan SAN yang terpotong.
    if (!SAN_PIECE.test(composed) && !PAWN_OR_CASTLE.test(composed)) {
      problems.push(
        `move ke-${index + 1} tidak berbentuk SAN yang utuh: "${composed}" ` +
          `(ikon bidak kemungkinan tidak terbaca)`,
      );
      continue;
    }

    san.push(composed);
  }

  return { san, problems };
}
