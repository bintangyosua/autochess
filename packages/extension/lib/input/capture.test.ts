import { describe, expect, it } from 'vitest';
import { isCapture } from './capture';

/** Papan mini: kotak -> kode bidak. */
function board(map: Record<string, string>) {
  return (square: string) => map[square];
}

describe('isCapture', () => {
  it('bidak lawan di kotak tujuan berarti memakan', () => {
    expect(isCapture({ from: 'd1', to: 'h5' }, board({ d1: 'wq', h5: 'bp' }))).toBe(true);
  });

  it('kotak tujuan kosong berarti langkah tenang', () => {
    expect(isCapture({ from: 'd1', to: 'h5' }, board({ d1: 'wq' }))).toBe(false);
  });

  it('bidak sendiri di kotak tujuan bukan langkah memakan', () => {
    // Sebagian engine menulis rokade sebagai "raja makan benteng" (e1h1). Kalau itu
    // dihitung memakan, rokade — langkah yang justru sering butuh dipikir — malah dapat
    // jeda tercepat.
    expect(isCapture({ from: 'e1', to: 'h1' }, board({ e1: 'wk', h1: 'wr' }))).toBe(false);
  });

  it('pion yang pindah kolom ke kotak kosong adalah en passant', () => {
    // Satu-satunya cara pion mengubah kolom adalah dengan memakan, jadi kotak kosong di
    // sini tetap berarti ada bidak yang hilang dari papan.
    expect(isCapture({ from: 'e5', to: 'd6' }, board({ e5: 'wp' }))).toBe(true);
  });

  it('pion yang maju lurus tetap langkah tenang', () => {
    expect(isCapture({ from: 'e2', to: 'e4' }, board({ e2: 'wp' }))).toBe(false);
  });

  it('kotak asal kosong berarti papannya tidak sesuai; jangan menebak', () => {
    expect(isCapture({ from: 'e2', to: 'e4' }, board({}))).toBe(false);
  });
});
