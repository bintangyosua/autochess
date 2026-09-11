import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';

/**
 * Sorotan kotak untuk bidak yang berada dalam bahaya.
 *
 * Berbeda dari panah, ini tidak melibatkan engine sama sekali — semuanya dihitung dari
 * FEN yang sudah terbaca. Alasannya bukan sekadar hemat: engine menjawab "langkah apa
 * yang terbaik", sedangkan yang ditanyakan di sini adalah "apa yang sedang terancam",
 * dan jawaban kedua tidak bisa dibaca dari yang pertama. Langkah terbaik sering
 * kebetulan menyelamatkan bidak yang menggantung tanpa pernah menyebutkan bidaknya, dan
 * lebih sering lagi ia mengabaikannya demi sesuatu yang lebih besar.
 *
 * Cara menghitungnya adalah static exchange evaluation: baku hantam di satu kotak
 * dijalankan sampai habis, tiap giliran selalu memakai penyerang termurah, dan tiap
 * pihak boleh berhenti kapan saja kalau melanjutkan malah merugikan. Yang dilaporkan
 * adalah sisa untung-ruginya dalam centipawn.
 *
 * Pendekatan naif — "ada yang menyerang dan tidak ada yang membela" — salah di dua arah
 * sekaligus, dan keduanya sering muncul. Ia berteriak untuk kuda yang diserang pion tapi
 * dibela tiga kali, dan ia diam untuk menteri yang "dibela" benteng padahal menukar
 * menteri dengan pion tetap bencana.
 */

export type Orientation = 'white' | 'black';

/** Seberapa parah, dipakai memilih warna. Ambangnya di `LEVEL_CP`. */
export type ThreatLevel = 'high' | 'low';

export interface Threat {
  square: string;
  level: ThreatLevel;
  /** Kerugian material kalau baku hantam di kotak itu dijalankan sampai habis. */
  loss: number;
  /** Huruf bidak yang berdiri di sana. */
  piece: PieceSymbol;
}

/**
 * Nilai bidak dalam centipawn.
 *
 * Sengaja memakai skala yang sama dengan skor engine supaya "rugi 300" di sini berarti
 * hal yang sama dengan "-3.00" di panel. Raja tidak punya nilai karena tidak pernah bisa
 * ditangkap — pencarian langkah legal chess.js yang menjaga itu, bukan angka besar.
 */
const VALUE: Record<PieceSymbol, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/**
 * Di bawah ambang ini sorotannya kuning, di atasnya merah.
 *
 * Satu bidak minor adalah batas yang wajar: kehilangan pion dalam tukar-menukar sering
 * memang disengaja, sedangkan kehilangan kuda jarang.
 */
const LEVEL_CP = 300;

/**
 * Sorotan dihitung ulang tiap posisi berubah, dan posisi yang sama bisa ditanyakan
 * berkali-kali dalam satu langkah — panel digambar ulang sepuluh kali per detik selama
 * hasil engine masih streaming, dan tiap gambar ulang menanyakan hal yang sama.
 */
let cacheKey: string | undefined;
let cacheValue: Threat[] = [];

/**
 * Cari semua bidak milik `side` yang kehilangan material kalau lawan menyerangnya.
 *
 * Perhitungannya selalu dilakukan seolah-olah giliran lawan, berapa pun giliran yang
 * sebenarnya. Waktu giliranmu sendiri, bidak yang terancam memang masih bisa
 * diselamatkan — tapi justru saat itulah peringatannya berguna. Kalau baru disorot
 * ketika giliran lawan, ia datang tepat pada saat kamu tidak bisa berbuat apa-apa.
 */
export function findThreats(fen: string | undefined, side: Orientation): Threat[] {
  if (!fen) return [];

  const key = `${side}|${fen}`;
  if (cacheKey === key) return cacheValue;

  cacheKey = key;
  cacheValue = compute(fen, side);
  return cacheValue;
}

function compute(fen: string, side: Orientation): Threat[] {
  const me: Color = side === 'white' ? 'w' : 'b';
  const foe: Color = me === 'w' ? 'b' : 'w';
  const chess = asOpponentToMove(fen, me);
  if (!chess) return [];

  const out: Threat[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      // Raja tidak pernah masuk hitungan: ia tidak bisa ditangkap, jadi "kerugian"-nya
      // tidak punya arti. Skak adalah persoalan lain, dan papan sudah menandainya.
      if (!cell || cell.color !== me || cell.type === 'k') continue;

      // Saringan murah sebelum simulasi. `attackers` mengabaikan keterpakuan, jadi ia
      // bisa menyebut penyerang yang sebenarnya tidak boleh bergerak — tapi ke arah
      // sebaliknya ia tidak pernah luput, dan kotak tanpa penyerang sama sekali adalah
      // mayoritas isi papan. Yang lolos di sini tetap diperiksa dengan langkah legal.
      if (chess.attackers(cell.square, foe).length === 0) continue;

      const loss = exchange(chess, cell.square);
      if (loss <= 0) continue;
      out.push({
        square: cell.square,
        level: loss >= LEVEL_CP ? 'high' : 'low',
        loss,
        piece: cell.type,
      });
    }
  }
  return out;
}

/**
 * Salinan posisi dengan giliran dipaksa ke pihak lawan.
 *
 * Gilirannya ditukar lewat FEN, bukan lewat `setTurn` — yang terakhir itu memainkan null
 * move, dan null move ditolak saat sedang skak. Justru posisi skak yang paling perlu
 * diperiksa. Target en passant ikut dikosongkan karena ia hanya berlaku untuk pihak yang
 * seharusnya jalan; membiarkannya berarti menawarkan tangkapan yang tidak ada.
 *
 * Hasilnya bisa berupa posisi yang tidak sah menurut aturan — raja pihak yang tidak
 * jalan boleh saja sedang terserang. Itu memang yang diinginkan: pertanyaannya adalah
 * "apa yang bisa diambil lawan kalau ia jalan sekarang", bukan "apakah posisi ini bisa
 * muncul dalam permainan". Karena itu validasinya dilewati.
 */
function asOpponentToMove(fen: string, me: Color): Chess | undefined {
  const parts = fen.split(' ');
  if (parts.length < 4) return undefined;
  parts[1] = me === 'w' ? 'b' : 'w';
  parts[3] = '-';

  try {
    return new Chess(parts.join(' '), { skipValidation: true });
  } catch {
    return undefined;
  }
}

/**
 * Jalankan baku hantam di `square` sampai habis, dari sudut pandang pihak yang sedang
 * jalan. Hasilnya positif berarti pihak itu untung sebanyak itu.
 *
 * Langkahnya benar-benar dimainkan di papan, bukan disimulasikan dari daftar penyerang.
 * Itu yang membuat dua hal ikut benar tanpa penanganan khusus: bidak pembela yang
 * sebenarnya terpaku (menggerakkannya membuka raja sendiri) tidak pernah muncul sebagai
 * langkah legal, dan penyerang yang tadinya terhalang bidak lain ikut terbuka begitu
 * bidak itu pindah.
 */
function exchange(chess: Chess, square: Square): number {
  // Selalu pakai penyerang termurah. Kalau ternyata ada balasan, yang hilang adalah
  // bidak yang paling sedikit nilainya — dan itu yang membuat hasilnya menjadi batas
  // terburuk yang benar, bukan sekadar salah satu urutan yang mungkin.
  let best: Move | undefined;
  for (const move of chess.moves({ verbose: true })) {
    if (move.to !== square || move.captured === undefined) continue;
    if (!best || VALUE[move.piece] < VALUE[best.piece]) best = move;
  }
  if (!best) return 0;

  const won = VALUE[best.captured as PieceSymbol];
  chess.move(best);
  const reply = exchange(chess, square);
  chess.undo();

  // Tidak ada kewajiban meneruskan tukar-menukar. Kalau melanjutkan malah merugi,
  // pihak ini berhenti — dan hasilnya nol, bukan angka negatif.
  return Math.max(0, won - reply);
}

/** Warna sorotan per tingkat. Merah untuk kerugian besar, kuning untuk yang kecil. */
export function threatColor(level: ThreatLevel): string {
  return level === 'high' ? '#dc2626' : '#eab308';
}
