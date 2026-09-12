import { describe, expect, it } from 'vitest';
import { cursorPath, easeInOut, randomPointIn } from './path';

/** Acak yang bisa diramal: nilai yang diberikan, lalu berulang. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('randomPointIn', () => {
  it('tidak pernah keluar dari kotak, bahkan di ujung rentang acaknya', () => {
    // Ini syarat yang menentukan benar-salahnya langkah: titik yang melewati tepi kotak
    // akan dihitung chess.com sebagai kotak tetangga, dan langkahnya jadi langkah lain.
    const center = { x: 100, y: 100 };
    for (const value of [0, 0.5, 0.999999]) {
      const point = randomPointIn(center, 60, () => value);
      expect(Math.abs(point.x - center.x)).toBeLessThan(30);
      expect(Math.abs(point.y - center.y)).toBeLessThan(30);
    }
  });

  it('tepat di tengah hanya kalau acaknya tepat di tengah', () => {
    expect(randomPointIn({ x: 10, y: 20 }, 40, () => 0.5)).toEqual({ x: 10, y: 20 });
    expect(randomPointIn({ x: 10, y: 20 }, 40, () => 0)).not.toEqual({ x: 10, y: 20 });
  });
});

describe('easeInOut', () => {
  it('mulai dan berakhir di ujung, dan naik terus di antaranya', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(0.3)).toBeLessThan(easeInOut(0.7));
  });

  it('lebih lambat di awal daripada gerak berkecepatan tetap', () => {
    // Bagian inilah yang membedakannya dari interpolasi lurus: kalau tidak, jaraknya
    // sama dengan t dan gerakannya kembali berkecepatan tetap.
    expect(easeInOut(0.2)).toBeLessThan(0.2);
    expect(easeInOut(0.8)).toBeGreaterThan(0.8);
  });
});

describe('cursorPath', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 300, y: 0 };

  it('selalu berakhir tepat di tujuan', () => {
    // Getaran dan lengkungan boleh ada di tengah jalan, tapi titik terakhir adalah titik
    // yang akan diklik — meleset sedikit saja di sana dan kliknya mendarat di kotak lain.
    const points = cursorPath(from, to, { random: seq(0.1, 0.9, 0.4) });
    expect(points.at(-1)).toEqual(to);
  });

  it('tidak lurus: ada titik yang menyimpang dari garis penghubung', () => {
    const points = cursorPath(from, to, { random: seq(0.9, 0.2, 0.7, 0.1) });
    const offLine = points.some((point) => Math.abs(point.y) > 1);
    expect(offLine).toBe(true);
  });

  it('memberi lebih banyak titik untuk jarak yang lebih jauh', () => {
    const near = cursorPath(from, { x: 40, y: 0 }, { random: () => 0.5 });
    const far = cursorPath(from, { x: 400, y: 0 }, { random: () => 0.5 });
    expect(far.length).toBeGreaterThan(near.length);
  });

  it('tetap menghasilkan jalur saat titik awal dan tujuan sama', () => {
    // Terjadi kalau kursor sudah berada di kotak yang dituju; pembagian dengan jarak nol
    // di dalamnya pernah menghasilkan NaN, dan koordinat NaN membuat papan diam tanpa
    // error apa pun.
    const points = cursorPath(from, from, { random: () => 0.5 });
    expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});
