/**
 * Aturan main mode auto: kapan langkah engine boleh dimainkan sendiri, dan setelah
 * berapa lama.
 *
 * Dipisah dari eksekusinya supaya syaratnya bisa diuji tanpa DOM — dan syarat itulah
 * bagian yang berbahaya kalau salah: mode ini menggerakkan bidak sungguhan.
 */

/**
 * Total waktu dari hasil engine sampai langkah mendarat di papan — sudah termasuk
 * jeda antar-klik, bukan di luarnya.
 *
 * Rentangnya datang dari halaman pengaturan; bawaannya ada di `settings.ts` supaya
 * hanya ada satu tempat yang menentukan nilai awal.
 */
export function autoPlayDelayMs(
  range: { minMs: number; maxMs: number },
  random: () => number = Math.random,
): number {
  return range.minMs + random() * (range.maxMs - range.minMs);
}

/** Bagian total yang jatuh ke jeda antar-klik. */
const CLICK_SHARE_MIN = 0.25;
const CLICK_SHARE_MAX = 0.45;

/**
 * Pecah satu anggaran waktu jadi dua tahap: berpikir, lalu menggerakkan tangan.
 *
 * Keduanya diambil dari total yang sama supaya batas 0,5–1,5 detik berlaku untuk
 * langkah utuh. Porsinya sendiri diacak, bukan setengah-setengah tetap: rasio yang
 * konstan akan membuat setiap langkah punya bentuk waktu yang identik.
 */
export function splitAutoDelay(
  totalMs: number,
  random: () => number = Math.random,
): { thinkMs: number; clickMs: number } {
  const share = CLICK_SHARE_MIN + random() * (CLICK_SHARE_MAX - CLICK_SHARE_MIN);
  const clickMs = totalMs * share;
  return { thinkMs: totalMs - clickMs, clickMs };
}

/** Sisi yang jalan menurut FEN, atau undefined kalau FEN-nya tidak terbaca. */
export function sideToMove(fen: string | undefined): 'white' | 'black' | undefined {
  const field = fen?.split(' ')[1];
  if (field === 'w') return 'white';
  if (field === 'b') return 'black';
  return undefined;
}

/**
 * Berapa kali satu posisi boleh dicoba, dan jarak antar percobaan.
 *
 * Percobaan yang terkirim tidak berarti langkahnya jadi: papan bisa belum hidup
 * (permainan belum mulai, lawan belum bergabung), atau event sintetisnya diabaikan.
 * Yang paling sering menggigit adalah posisi pembuka saat kamu putih — posisi itu
 * dianalisis sekali, sering sebelum papan bisa dimainkan, dan karena susunan bidaknya
 * tidak berubah tidak akan pernah ada hasil analisis baru yang memicu percobaan kedua.
 */
export const MAX_ATTEMPTS = 5;
export const RETRY_AFTER_MS = 2_500;

/**
 * Boleh dicoba lagi untuk posisi yang sama?
 *
 * Dibatasi jumlahnya, bukan diulang selamanya: kalau papan memang tidak bisa dimainkan
 * — kamu sedang menonton game orang lain, atau permainannya sudah selesai — pengulangan
 * tanpa batas hanya membuang siklus dan membanjiri console.
 */
export function shouldRetry(input: { attempts: number; sinceLastMs: number }): boolean {
  return input.attempts > 0 && input.attempts < MAX_ATTEMPTS && input.sinceLastMs >= RETRY_AFTER_MS;
}

export interface AutoPlayInput {
  enabled: boolean;
  fen?: string;
  orientation: 'white' | 'black';
  /** FEN yang sudah pernah dimainkan otomatis; jangan diulang. */
  playedFen?: string;
}

/**
 * Keputusan mode auto beserta alasannya.
 *
 * Alasan ikut dikembalikan, bukan sekadar true/false, karena mode ini gagal dalam
 * diam: kalau ia memutuskan untuk tidak bergerak, dari luar itu tidak bisa dibedakan
 * dari ekstensi yang rusak. Alasannya ditampilkan di panel supaya jelas mana yang
 * "sedang menunggu giliranmu" dan mana yang "ada yang salah".
 */
export interface AutoPlayDecision {
  play: boolean;
  reason: string;
}

/**
 * Auto hanya jalan saat giliranmu sendiri.
 *
 * Orientasi papan dipakai sebagai penanda sisi pemain — itu memang tebakan, tapi
 * tebakan yang sama yang dipakai chess.com sendiri: papan selalu diputar ke sisi
 * pemain. Efek salahnya pun ringan: kalau kamu sedang menonton papan orang lain,
 * kliknya ditolak papan dan tidak ada yang berubah.
 *
 * Giliran yang cuma ditebak (`turnKnown` false) sengaja TIDAK lagi memblokir. Dulu
 * begitu, dan hasilnya mode auto diam total di langkah pertama: sebelum ada langkah,
 * papan belum punya sorotan untuk disimpulkan, jadi giliran selalu berstatus tebakan
 * dan syarat itu tidak pernah terpenuhi. Risikonya pun kecil — kalau giliran salah
 * baca, langkah yang disarankan milik sisi lawan, dan mengklik bidak lawan tidak
 * menghasilkan apa-apa di papan.
 */
export function autoPlayDecision(input: AutoPlayInput): AutoPlayDecision {
  if (!input.enabled) return { play: false, reason: 'mode auto mati' };
  if (!input.fen) return { play: false, reason: 'posisi belum terbaca' };
  if (input.fen === input.playedFen) return { play: false, reason: 'sudah dimainkan' };

  const side = sideToMove(input.fen);
  if (side !== input.orientation) return { play: false, reason: 'menunggu giliranmu' };

  return { play: true, reason: '' };
}
