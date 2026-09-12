/**
 * Rating-mu sendiri, dibaca dari halaman.
 *
 * Dipakai mode Elo dinamis: kekuatan engine mengikuti rating yang sedang berlaku,
 * bukan satu angka tetap yang kamu atur sekali lalu terlupakan. Keunggulannya bukan
 * kenyamanan semata — rating blitz dan rapid-mu bisa beda ratusan poin, dan angka yang
 * dibaca dari halaman selalu rating untuk tipe game yang sedang dimainkan.
 */

/** Satu rating yang terbaca, beserta posisi vertikalnya di layar. */
export interface RatingEntry {
  value: number;
  centerY: number;
}

/**
 * Mana dari dua rating yang terbaca itu milikmu.
 *
 * Papan chess.com selalu diputar ke sisi pemain, jadi kamu selalu di bawah — dan itu
 * kebenaran geometris yang tidak bergantung pada nama kelas apa pun. Memilih lewat
 * kelas seperti `player-bottom` akan bekerja sampai chess.com mengganti namanya; memilih
 * lewat posisi bekerja selama papannya masih menghadap pemain.
 *
 * Kalau cuma ada satu angka, itu dipakai apa adanya: lebih baik memakai rating yang
 * mungkin milik lawan daripada menyerah dan jatuh ke Elo bawaan yang bisa jauh meleset.
 * Kalau tidak ada sama sekali, `undefined` — dan pemanggil harus kembali ke nilai manual,
 * bukan menebak.
 */
export function pickOwnRating(entries: RatingEntry[], boardCenterY: number): number | undefined {
  const usable = entries.filter((entry) => Number.isFinite(entry.value) && entry.value > 0);
  if (usable.length === 0) return undefined;
  if (usable.length === 1) return usable[0]!.value;

  const below = usable.filter((entry) => entry.centerY > boardCenterY);
  const pool = below.length > 0 ? below : usable;
  // Yang paling bawah, bukan sekadar yang di bawah titik tengah: di layar sempit kedua
  // komponen pemain bisa sama-sama jatuh di bawah papan.
  return pool.reduce((lowest, entry) => (entry.centerY > lowest.centerY ? entry : lowest)).value;
}

/**
 * Angka rating dari sebuah teks.
 *
 * Isinya bisa "1234", "(1234)", atau "1234?" — tanda tanya dipakai chess.com untuk
 * rating yang belum mapan. Semua bentuk itu tetap rating yang sah untuk tujuan kita.
 */
export function parseRating(text: string | null | undefined): number | undefined {
  const match = /\d{3,4}/.exec(text ?? '');
  if (!match) return undefined;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : undefined;
}

/** Kelas chess.com untuk angka rating di komponen pemain. */
const RATING_SELECTOR = '.rating-score-rating';

/**
 * Rating-mu sekarang, atau `undefined` kalau tidak terbaca — papan belum ada, game
 * tanpa rating (unrated, lawan bot, permainan latihan), atau chess.com mengubah
 * strukturnya.
 */
export function readOwnRating(board: Element | undefined): number | undefined {
  if (!board) return undefined;
  const rect = board.getBoundingClientRect();
  if (rect.width === 0) return undefined;

  const entries: RatingEntry[] = [];
  for (const element of document.querySelectorAll(RATING_SELECTOR)) {
    const value = parseRating(element.textContent);
    if (value === undefined) continue;
    const box = element.getBoundingClientRect();
    if (box.height === 0) continue; // tersembunyi; bukan yang sedang tampil
    entries.push({ value, centerY: box.top + box.height / 2 });
  }

  return pickOwnRating(entries, rect.top + rect.height / 2);
}
