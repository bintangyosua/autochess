/**
 * Bentuk gerakan tetikus: titik mana saja yang dilewati, dan di sebelah mana persis
 * dari sebuah kotak jarinya mendarat.
 *
 * Semuanya fungsi murni dan menerima sumber acak sebagai argumen, supaya bisa diuji
 * tanpa DOM dan tanpa hasil yang berubah-ubah.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Seberapa besar kotak sasaran klik dibanding kotak papan.
 *
 * Tidak sampai ke tepi: kotak papan chess.com bersebelahan tanpa sela, jadi titik yang
 * terlalu pinggir berisiko dihitung sebagai kotak tetangga kalau geometri kita meleset
 * sedikit saja. Setengah kotak menyisakan seperempat lebar sebagai bantalan di tiap
 * sisi — cukup lebar untuk terlihat acak, cukup jauh dari garis batas untuk aman.
 */
const CLICK_BOX = 0.5;

/**
 * Satu titik acak di dalam kotak kecil di tengah sebuah kotak papan.
 *
 * Manusia tidak pernah mengklik titik tengah yang sama persis dua kali. Dulu kita
 * selalu mengklik pusat kotak, dan rentetan koordinat yang identik sampai pecahan
 * piksel adalah pola yang paling gampang dikenali sebagai bukan-manusia.
 */
export function randomPointIn(
  center: Point,
  squareSize: number,
  random: () => number = Math.random,
): Point {
  const span = squareSize * CLICK_BOX;
  return {
    x: center.x + (random() - 0.5) * span,
    y: center.y + (random() - 0.5) * span,
  };
}

/** Percepatan lalu perlambatan — gerak tangan tidak pernah berkecepatan tetap. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export interface PathOptions {
  /** Jumlah titik antara (tidak termasuk titik awal; titik terakhir selalu `to`). */
  steps?: number;
  random?: () => number;
}

/**
 * Jalur melengkung dari satu titik ke titik lain.
 *
 * Lengkungnya penting, bukan hiasan: garis lurus sempurna antara dua kotak adalah
 * tanda gerakan yang dihitung, bukan digerakkan. Lengkungan diambil tegak lurus
 * terhadap arah gerak, dengan besar dan tanda yang diacak, ditambah getaran kecil di
 * tiap titik supaya jalurnya tidak mulus secara matematis juga.
 */
export function cursorPath(from: Point, to: Point, options: PathOptions = {}): Point[] {
  const random = options.random ?? Math.random;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  // Jarak dekat tidak perlu banyak titik; jarak jauh perlu, kalau tidak setiap
  // lompatannya besar dan penangan hover halaman melewatkan kotak-kotak di tengah.
  const steps = options.steps ?? Math.max(6, Math.min(28, Math.round(distance / 18)));

  // Besar lengkungan sebanding jarak, dibatasi supaya jalur jauh tidak melenceng
  // sampai keluar papan.
  const bow = (random() - 0.5) * Math.min(distance * 0.18, 48);
  const nx = distance === 0 ? 0 : -dy / distance;
  const ny = distance === 0 ? 0 : dx / distance;
  const jitter = Math.min(distance * 0.02, 2.5);

  const points: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    // Titik terakhir dipasang persis di tujuan, bukan dihitung: sisa pecahan dari sinus
    // dan getaran akan membuatnya meleset sepersekian piksel, dan titik inilah yang
    // nanti diklik.
    if (i === steps) {
      points.push({ x: to.x, y: to.y });
      break;
    }
    const t = easeInOut(i / steps);
    // Setengah gelombang sinus: nol di kedua ujung, jadi titik awal dan akhir tetap
    // tepat pada tempatnya sementara bagian tengahnya melengkung.
    const arc = Math.sin((i / steps) * Math.PI) * bow;
    points.push({
      x: from.x + dx * t + nx * arc + (random() - 0.5) * jitter,
      y: from.y + dy * t + ny * arc + (random() - 0.5) * jitter,
    });
  }
  return points;
}
