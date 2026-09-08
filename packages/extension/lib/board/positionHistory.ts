import { deriveMove, deriveTwoMoves, type DerivedMove } from './deriveMove';

/**
 * Menyusun rantai langkah dari deretan pembacaan papan.
 *
 * Ekstensi bisa mulai memantau kapan saja — di tengah game, atau bahkan di tengah tab
 * yang sudah lama terbuka — jadi rantai ini tidak pernah mengaku tahu seluruh riwayat.
 * Yang dijanjikannya hanya: rantai yang sah dari sebuah posisi jangkar sampai posisi
 * sekarang. Untuk pengulangan posisi itu sudah cukup, karena pengulangan selalu terjadi
 * dalam rentang beberapa langkah.
 *
 * Rantainya dipotong tiap langkah tak-terbalikkan. Tangkapan dan langkah pion membuat
 * posisi sebelumnya mustahil terulang, jadi memotong di sana tidak menghilangkan apa pun
 * — sekaligus menjaga panjangnya tetap terbatas tanpa perlu batas buatan.
 */

export interface Observation {
  /** FEN hasil pembacaan DOM. */
  fen: string;
  /** false kalau giliran di `fen` hanya tebakan dari sorotan kotak. */
  turnKnown: boolean;
}

export interface TrackedPosition {
  /** Posisi yang sebaiknya dipakai: hasil rantai kalau ada, kalau tidak apa adanya dari DOM. */
  fen: string;
  /** Jangkar rantai. Sama dengan `fen` kalau rantainya kosong. */
  startFen: string;
  /** Langkah UCI dari `startFen` sampai `fen`. */
  moves: string[];
  /** true kalau giliran di `fen` bisa dipertanggungjawabkan, bukan tebakan. */
  turnKnown: boolean;
  /** Kenapa rantai sebelumnya dibuang, kalau memang dibuang pada pembacaan ini. */
  reanchored?: string;
}

function boardOf(fen: string): string {
  return fen.split(' ', 1)[0] ?? '';
}

export interface PositionHistory {
  observe(observation: Observation): TrackedPosition;
  reset(): void;
}

export function createPositionHistory(): PositionHistory {
  let startFen: string | undefined;
  let currentFen: string | undefined;
  let moves: string[] = [];
  /** Apakah giliran di jangkar diketahui pasti. Seluruh rantai mewarisi ini. */
  let anchorTurnKnown = false;

  const anchor = (observation: Observation, reason?: string): TrackedPosition => {
    startFen = observation.fen;
    currentFen = observation.fen;
    moves = [];
    anchorTurnKnown = observation.turnKnown;
    return {
      fen: observation.fen,
      startFen: observation.fen,
      moves: [],
      turnKnown: observation.turnKnown,
      reanchored: reason,
    };
  };

  const advance = (applied: readonly DerivedMove[]): void => {
    for (const move of applied) {
      moves.push(move.uci);
      currentFen = move.fen;
      // Setelah tangkapan atau langkah pion, tidak ada posisi sebelumnya yang bisa
      // terulang lagi. Jangkar dimajukan ke sini dan rantainya dikosongkan.
      if (move.irreversible) {
        startFen = move.fen;
        moves = [];
      }
    }
  };

  const result = (): TrackedPosition => ({
    fen: currentFen!,
    startFen: startFen!,
    moves: [...moves],
    turnKnown: anchorTurnKnown,
  });

  return {
    reset() {
      startFen = undefined;
      currentFen = undefined;
      moves = [];
      anchorTurnKnown = false;
    },

    observe(observation) {
      if (!currentFen) return anchor(observation);

      const target = boardOf(observation.fen);

      // Susunan bidak tidak berubah. Pembacaan DOM bisa saja berbeda di field giliran
      // atau en passant — tapi itu justru bagian yang ditebaknya, jadi posisi hasil
      // rantai yang dipertahankan.
      if (boardOf(currentFen) === target) {
        // Sorotan yang tadinya tidak terbaca kini terbaca: kalau sepakat dengan rantai,
        // tebakan di jangkar naik status jadi diketahui.
        if (!anchorTurnKnown && observation.turnKnown) {
          const chainTurn = currentFen.split(' ')[1];
          const domTurn = observation.fen.split(' ')[1];
          if (chainTurn === domTurn) anchorTurnKnown = true;
          else return anchor(observation, 'giliran rantai bertentangan dengan sorotan');
        }
        return result();
      }

      const single = deriveMove(currentFen, target);
      if (single) {
        advance([single]);
        return result();
      }

      const pair = deriveTwoMoves(currentFen, target);
      if (pair) {
        advance(pair);
        return result();
      }

      // Bukan kelanjutan yang bisa dijelaskan: game baru, papan diganti, analisis lompat
      // ke posisi lain, atau lebih dari dua langkah terlewat. Mulai lagi dari sini —
      // rantai yang salah jauh lebih berbahaya daripada rantai yang pendek.
      return anchor(observation, 'posisi tidak bisa dijangkau dari rantai sekarang');
    },
  };
}
