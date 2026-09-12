/**
 * Mulai game berikutnya sendiri setelah game sekarang selesai.
 *
 * Ini fitur yang mengubah sifat ekstensi, bukan sekadar menambah kenyamanan: tanpa ia,
 * ekstensi ini butuh kamu untuk membuka tiap game; dengan ia, ia berjalan sendiri sampai
 * dihentikan. Karena itu pagarnya dibuat lebih tebal daripada bagian mana pun:
 *
 *   - batas jumlah game per sesi, dan berhenti sendiri sesudahnya
 *   - satu klik per modal, ditandai supaya modal yang sama tidak diklik dua kali
 *   - berhenti kalau bentuk modalnya tidak dikenali, bukan menebak tombol
 *   - jeda acak yang jauh lebih panjang daripada jeda langkah
 *
 * Yang paling penting dari semuanya adalah batas jumlah game. Selebihnya soal terlihat
 * wajar; yang itu soal ada titik berhentinya.
 */

import { clickElement } from './clickElement';
import { collectButtons, findGameOverModal, pickNewGameButton } from '../board/gameOver';
import { debug, warn } from '../log';

export interface NewGameTiming {
  minMs: number;
  maxMs: number;
}

/**
 * Jeda sebelum tombolnya diklik.
 *
 * Jauh lebih panjang daripada jeda langkah, dan itu disengaja: manusia melihat hasilnya
 * dulu — skor akhir, perubahan rating — sebelum memutuskan main lagi. Menekan tombol
 * dalam setengah detik setelah modal muncul adalah hal yang tidak dilakukan siapa pun.
 */
export function newGameDelayMs(timing: NewGameTiming, random: () => number = Math.random): number {
  return timing.minMs + random() * (timing.maxMs - timing.minMs);
}

export interface AutoNewGameOptions {
  enabled: () => boolean;
  timing: () => NewGameTiming;
  /** Teks tombol yang kamu izinkan; kosong berarti pakai pola bawaan. */
  allow: () => string[];
  /** Dipanggil dengan teks tombol yang terlihat, untuk ditawarkan di pengaturan. */
  onSeen?: (labels: string[]) => void;
  /** Berhenti setelah sekian game. */
  maxGames: () => number;
  /** Dipanggil tiap keadaannya berubah, untuk ditampilkan di panel. */
  onState?: (message: string, played: number) => void;
  random?: () => number;
}

export interface AutoNewGame {
  /** Dipanggil dari denyut milik content script. */
  tick: () => void;
  /** Dipanggil saat papan menunjukkan game baru sudah benar-benar dimulai. */
  onNewGame: () => void;
  /** Berapa game yang sudah dimulai sendiri di sesi ini. */
  played: () => number;
  reset: () => void;
}

/**
 * Berapa lama menunggu sebelum mencoba lagi kalau klik sebelumnya tidak berbuah game.
 *
 * Ini yang menjawab keadaan macet: lawan kabur sebelum langkah pertama, chess.com
 * membatalkan pencarian, atau tombol yang diklik ternyata cuma membuka menu. Dalam semua
 * kasus itu tidak akan pernah ada game baru yang menandai selesainya, jadi tanpa batas
 * waktu ekstensi akan menunggu selamanya sesuatu yang tidak akan datang.
 */
export const REARM_AFTER_MS = 45_000;

/**
 * Boleh mengklik tombol game baru sekarang?
 *
 * Dipisah sebagai fungsi murni karena inilah bagian yang menentukan fitur ini macet atau
 * tidak, dan sisanya butuh DOM untuk diuji.
 */
export function shouldArm(input: { armed: boolean; sinceLastClickMs: number }): boolean {
  return input.armed || input.sinceLastClickMs >= REARM_AFTER_MS;
}

export function createAutoNewGame(options: AutoNewGameOptions): AutoNewGame {
  const random = options.random ?? Math.random;
  let played = 0;
  let busy = false;
  /**
   * Modal yang sudah ditangani.
   *
   * Disimpan sebagai elemennya sendiri, bukan sebagai penanda boolean: modal berikutnya
   * adalah elemen yang berbeda, jadi perbandingan ini otomatis kembali membolehkan klik
   * saat game berikutnya selesai — tanpa perlu menebak kapan harus di-reset.
   */
  /**
   * Boleh mengklik sekarang?
   *
   * Dulu yang disimpan adalah ELEMEN modal yang sudah ditangani, dan itu salah: modal
   * hasil memang dibuat ulang tiap game, tapi panel samping `new-game-buttons` adalah
   * elemen yang sama dari game ke game — isinya saja yang berganti. Sekali diklik, panel
   * itu selamanya terhitung "sudah ditangani", dan semua game berikutnya diam.
   *
   * Yang benar bukan identitas elemen melainkan kejadian: satu klik per game yang
   * selesai. Izinnya dicabut setelah mengklik, dan dipulihkan saat papan menunjukkan
   * game baru benar-benar dimulai (`onNewGame`) — atau setelah `REARM_AFTER_MS` kalau
   * game itu tidak pernah datang.
   */
  let armed = true;
  let lastClickAt = 0;
  /** Modal yang sudah dilaporkan tidak dikenali; jangan mengulang peringatan yang sama. */
  let reported: Element | undefined;

  const say = (message: string) => options.onState?.(message, played);

  return {
    played: () => played,

    onNewGame() {
      // Game baru benar-benar jalan; klik berikutnya boleh dilakukan saat ia selesai.
      armed = true;
    },

    reset() {
      played = 0;
      armed = true;
      lastClickAt = 0;
      reported = undefined;
    },

    tick() {
      if (busy || !options.enabled()) return;

      if (!shouldArm({ armed, sinceLastClickMs: Date.now() - lastClickAt })) return;
      if (!armed) {
        // Klik sebelumnya tidak berujung game baru — lawan kabur, pencarian dibatalkan,
        // atau tombolnya ternyata cuma membuka menu. Coba lagi daripada menunggu selamanya.
        debug('[cmr] game baru: klik sebelumnya tidak berbuah, coba lagi');
        armed = true;
        reported = undefined;
      }

      const modal = findGameOverModal();
      if (!modal) {
        // Tidak ada tombol game baru di mana pun: game masih jalan, atau modalnya sudah
        // ditutup. Ingatan soal modal tak dikenal dilepas supaya tidak menumpuk.
        if (reported && !reported.isConnected) reported = undefined;
        return;
      }

      const max = options.maxGames();
      if (played >= max) {
        if (modal !== reported) {
          reported = modal;
          debug(`[cmr] game baru otomatis berhenti: sudah ${played} dari ${max}`);
          say(`berhenti, sudah ${played} game`);
        }
        return;
      }

      const buttons = collectButtons(modal);
      // Dicatat sebelum diputuskan, bukan sesudah: justru saat tidak ada yang cocok,
      // daftar inilah yang kamu butuhkan untuk memilih tombol yang benar di pengaturan.
      options.onSeen?.(buttons.map((button) => button.text));

      const index = pickNewGameButton(
        buttons.map((button) => button.text),
        { allow: options.allow(), random },
      );

      if (index === undefined) {
        // Bentuk modalnya tidak dikenali. Tombolnya ikut dicatat — dari sinilah pola
        // teks yang belum tertangani bisa dilihat tanpa menebak-nebak.
        if (modal !== reported) {
          reported = modal;
          warn(
            '[cmr] tidak ada tombol game baru yang dikenali. Tombol yang terlihat: ' +
              buttons.map((button) => `"${button.text}"`).join(', '),
          );
          say('tombol game baru tidak dikenali');
        }
        return;
      }

      const target = buttons[index]!;
      const delay = newGameDelayMs(options.timing(), random);
      busy = true;
      // Izin dicabut sejak sekarang, bukan setelah kliknya mendarat: selama jeda yang
      // bisa puluhan detik, denyut terus berjalan dan tanpa ini modal yang sama akan
      // dijadwalkan berkali-kali.
      armed = false;
      lastClickAt = Date.now();
      say(`"${target.text}" dalam ${(delay / 1000).toFixed(0)}s`);
      debug(`[cmr] game baru: "${target.text}" dalam ${Math.round(delay)}ms`);

      setTimeout(() => {
        void (async () => {
          try {
            // Modal bisa sudah ditutup sendiri selama jeda — lawan menantang ulang,
            // atau kamu menutupnya. Mengklik koordinat lama berarti mengklik apa pun
            // yang sekarang ada di sana.
            if (!target.element.isConnected) {
              debug('[cmr] game baru batal: tombolnya sudah hilang');
              say('batal, tombolnya hilang');
              armed = true;
              return;
            }
            const clicked = await clickElement(target.element, { durationMs: 600, random });
            if (clicked) {
              // Waktu tunggu sebelum boleh mencoba lagi dihitung dari kliknya mendarat,
              // bukan dari saat ia dijadwalkan — jeda sebelum klik bisa 25 detik, dan
              // memasukkannya ke hitungan akan memperpendek masa tunggu itu sendiri.
              lastClickAt = Date.now();
              played += 1;
              say(`game ${played} dari ${max}`);
              debug(`[cmr] game baru diklik (${played}/${max})`);
            } else {
              // Tidak jadi diklik sama sekali; tidak ada gunanya menunggu game yang
              // memang tidak pernah diminta.
              armed = true;
              say('klik game baru tidak jadi');
            }
          } finally {
            busy = false;
          }
        })();
      }, delay);
    },
  };
}
