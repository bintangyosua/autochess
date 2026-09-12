/**
 * Menemukan modal hasil game dan tombol "game baru" di dalamnya.
 *
 * Kenapa teks tombol, bukan atribut: tombolnya tidak punya penanda khas sama sekali.
 * Bentuk aslinya seperti ini —
 *
 *     <button class="cc-button-component cc-button-secondary cc-button-large">
 *       <span>New 10 sec + 0.1</span>
 *     </button>
 *
 * — dan kelas-kelas itu milik design-system chess.com, dipakai sama persis oleh "Game
 * Review", "Rematch", dan tombol lain di modal yang sama. Tidak ada `id`, tidak ada
 * `data-*`. Jadi satu-satunya yang membedakan tombol satu dari yang lain adalah teksnya,
 * sama seperti yang dibaca manusia.
 *
 * Teks itu pun tidak dipola secara kaku, karena waktu kontrol bisa apa saja: "New 10 min",
 * "New 10 sec + 0.1", "New 5 | 2", atau custom yang kamu buat sendiri. Yang dipakai
 * adalah daftar teks yang KAMU pilih — dikumpulkan ekstensi dari modal yang benar-benar
 * muncul di layarmu — dengan pencocokan pola hanya sebagai jalan awal sebelum daftar itu
 * terisi.
 */

/** Satu tombol yang terlihat, beserta teksnya. */
export interface ButtonCandidate {
  element: Element;
  text: string;
}

/**
 * Tombol yang TIDAK boleh disentuh, apa pun keadaannya — bahkan kalau kamu sendiri yang
 * mencentangnya.
 *
 * Ini bukan daftar kenyamanan melainkan pagar keselamatan: salah klik di modal hasil
 * bukan blunder catur, melainkan bisa menerima tantangan, mengubah rated jadi unrated,
 * membuka halaman pembelian, atau melaporkan lawan. Daftar ini diperiksa lebih dulu
 * daripada daftar mana pun, dan kecocokan di sini selalu menang.
 */
const DENY =
  /review|analy|analis|share|bagikan|report|lapor|friend|teman|tournament|turnamen|member|upgrade|gold|diamond|premium|buy|beli|subscribe|langganan|accept|terima|decline|tolak|resign|menyerah|abort|settings|pengaturan|profile|profil/i;

/**
 * Pola bawaan untuk "mulai game baru".
 *
 * Hanya kata kerjanya yang dipola; sisa teksnya — waktu kontrol apa pun, custom sekalipun
 * — sengaja dibiarkan bebas. Dipakai sebelum kamu memilih tombol sendiri, dan sebagai
 * jaring kalau daftar pilihanmu tidak ada yang cocok dengan modal yang sedang tampil.
 */
const NEW_GAME = /^new\b|game baru|play again|main lagi|cari lawan|find opponent/i;

/**
 * Rematch sengaja tidak pernah ikut pola bawaan: ia menantang lawan yang SAMA dan lawan
 * itu harus menyetujuinya. Kalau ia menolak atau pergi, permintaannya menggantung dan
 * tidak ada game yang dimulai — sementara dari sisi kita tombolnya sudah diklik dan
 * semuanya tampak beres. Tapi ini bukan larangan: kalau kamu mencentangnya sendiri di
 * pengaturan, itu pilihanmu.
 */
const REMATCH = /rematch|tanding ulang/i;

/** Bentuk baku sebuah teks tombol, supaya spasi dan huruf besar tidak bikin beda. */
export function normalizeLabel(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export interface PickOptions {
  /**
   * Teks tombol yang kamu izinkan. Kosong berarti pakai pola bawaan — bukan berarti
   * tidak ada yang boleh.
   */
  allow?: string[];
  random?: () => number;
}

/**
 * Tombol mana yang diklik, sebagai indeks ke dalam daftarnya — atau `undefined` kalau
 * tidak ada yang pantas.
 *
 * Menyerah adalah hasil yang sah dan sering benar. Modal yang bentuknya tidak dikenal
 * lebih baik dibiarkan daripada ditebak: yang hilang cuma satu game otomatis, sedangkan
 * salah tebak bisa menekan tombol yang tidak bisa dibatalkan.
 */
export function pickNewGameButton(labels: string[], options: PickOptions = {}): number | undefined {
  const random = options.random ?? Math.random;
  const allow = new Set((options.allow ?? []).map(normalizeLabel));

  const candidates: number[] = [];
  for (let i = 0; i < labels.length; i++) {
    const text = labels[i]!.trim();
    if (text.length === 0) continue;
    // Pagar keselamatan diperiksa lebih dulu daripada pilihanmu: daftar centangmu bisa
    // ikut tersimpan dari modal yang bentuknya berbeda, dan tombol berbahaya yang
    // kebetulan bernama mirip tidak boleh lolos hanya karena pernah dicentang.
    if (DENY.test(text)) continue;

    if (allow.size > 0) {
      if (allow.has(normalizeLabel(text))) candidates.push(i);
      continue;
    }
    if (REMATCH.test(text)) continue;
    if (NEW_GAME.test(text)) candidates.push(i);
  }

  if (candidates.length === 0) return undefined;
  return candidates[Math.floor(random() * candidates.length)]!;
}

/** Elemen yang benar-benar tampil — punya ukuran dan tidak tersembunyi. */
function visible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Modal hasil game, kalau sedang terbuka.
 *
 * Kelas dipakai sebagai petunjuk pencarian, bukan sebagai bukti: yang menentukan sebuah
 * elemen benar-benar modal hasil adalah adanya tombol yang berarti "game baru" di
 * dalamnya. Pencariannya memakai pola bawaan, bukan daftar pilihanmu — modal harus tetap
 * bisa dikenali (dan tombolnya dicatat untuk kamu pilih) sebelum kamu memilih apa pun.
 */
export function findGameOverModal(): Element | undefined {
  // Tombol game baru muncul di dua tempat, dan keduanya harus dicari: di dalam modal
  // hasil, dan di panel samping yang baru terisi setelah game selesai (di sana tombolnya
  // berkelas `new-game-buttons-*` dan tidak berada di dalam modal mana pun).
  //
  // Panel samping itu aman dicari kapan saja karena ia hanya terisi setelah game usai;
  // selama game berjalan, tempat yang sama berisi Abort/Draw/Resign — dan tak satu pun
  // dari teks itu lolos dari pola "game baru", apalagi dari daftar larangan.
  const hints = document.querySelectorAll(
    '[class*="game-over"], [class*="game_over"], [class*="new-game"], [class*="modal"], [role="dialog"]',
  );
  for (const element of hints) {
    if (!visible(element)) continue;
    const labels = collectButtons(element).map((button) => button.text);
    if (pickNewGameButton(labels) !== undefined) return element;
  }
  return undefined;
}

/**
 * Tombol-tombol yang bisa diklik di dalam sebuah wadah.
 *
 * `[role=button]` ikut karena chess.com kerap memakai `div` yang diberi peran, bukan
 * elemen `button` sungguhan. Elemen bersarang disaring: sebuah tombol yang mengandung
 * tombol lain akan membuat teks yang sama terhitung dua kali, dan yang terpilih bisa
 * jadi pembungkusnya, bukan tombol yang sebenarnya.
 */
export function collectButtons(root: Element): ButtonCandidate[] {
  const found: ButtonCandidate[] = [];
  for (const element of root.querySelectorAll('button, a, [role="button"]')) {
    if (!visible(element)) continue;
    if (element.querySelector('button, a, [role="button"]')) continue;
    const text = labelOf(element);
    if (text.length === 0 || text.length > 60) continue;
    found.push({ element, text });
  }
  return found;
}

/**
 * Teks sebuah tombol.
 *
 * `aria-label` didahulukan kalau ada, karena di situlah chess.com menaruh nama tombol
 * yang bersih. Bentuk satunya lagi membungkus ikon SVG di dalam tombol yang sama:
 *
 *     <button aria-label="New 1 min">
 *       <span class="cc-button-icon"><svg …/></span>
 *       <span class="new-game-buttons-label">New 1 min</span>
 *     </button>
 *
 * `textContent` di sana kebetulan masih bersih, tapi itu kebetulan — ikon yang punya
 * `<title>` atau `<text>` akan ikut terbaca dan teksnya jadi tidak cocok dengan apa pun
 * yang kamu centang. `aria-label` justru ada untuk menjawab "tombol ini namanya apa".
 */
function labelOf(element: Element): string {
  const aria = element.getAttribute('aria-label');
  const text = aria && aria.trim().length > 0 ? aria : (element.textContent ?? '');
  return text.replace(/\s+/g, ' ').trim();
}
