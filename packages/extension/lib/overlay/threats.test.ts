import { describe, expect, it } from 'vitest';
import { findThreats } from './threats';

/** Ringkas hasil jadi bentuk yang enak dibandingkan di ekspektasi. */
function map(fen: string, side: 'white' | 'black') {
  return Object.fromEntries(findThreats(fen, side).map((t) => [t.square, t.loss]));
}

describe('findThreats', () => {
  it('diam di posisi awal', () => {
    expect(findThreats('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'white')).toEqual(
      [],
    );
  });

  it('menandai bidak yang benar-benar menggantung', () => {
    // Kuda putih di e5 diserang benteng hitam di e8, tanpa satu pun pembela.
    expect(map('4r2k/8/8/4N3/8/8/8/6K1 w - - 0 1', 'white')).toEqual({ e5: 320 });
  });

  it('diam untuk bidak yang dibela cukup', () => {
    // Kuda e5 diserang benteng e8, tapi dibela benteng e1: benteng mati lawan kuda mati,
    // dan lawan berhenti sebelum itu. Tidak ada yang hilang.
    expect(findThreats('4r2k/8/8/4N3/8/8/8/4R1K1 w - - 0 1', 'white')).toEqual([]);
  });

  it('tetap menandai bidak mahal walau dibela', () => {
    // Menteri d5 diserang pion c6 dan dibela benteng d1. Menukar menteri dengan pion
    // tetap rugi 800 walau balasannya ada — ini yang tidak terlihat oleh cara naif.
    const found = map('7k/8/2p5/3Q4/8/8/8/3R2K1 w - - 0 1', 'white');
    expect(found).toEqual({ d5: 800 });
  });

  it('mengurutkan tukar dari penyerang termurah', () => {
    // Kuda e5 diserang pion d6 dan benteng e8, dibela gajah g3. Yang dipakai lawan
    // adalah pion, bukan benteng: pxN (+320), Bxp (-100), Rxb (+330) — sisa 320 buat
    // hitam. Mulai dari benteng malah lebih buruk untuknya, dan itulah gunanya urutan.
    expect(map('4r2k/8/3p4/4N3/8/6B1/8/3Q2K1 w - - 0 1', 'white')).toEqual({ e5: 320 });
  });

  it('tahu pembela yang terpaku tidak bisa membela', () => {
    // Kuda e5 diserang benteng e8 dan "dibela" kuda d3. Kuda d3 terpaku benteng d8 ke
    // raja d1, jadi Nxe5 bukan langkah legal dan tidak ada balasan sama sekali.
    // Pion c2 hanya ada supaya d3 sendiri tidak ikut jadi temuan kedua.
    expect(map('3rr2k/8/8/4N3/8/3N4/2P5/3K4 b - - 0 1', 'white')).toEqual({ e5: 320 });
  });

  it('memakai giliranmu sendiri, bukan hanya giliran lawan', () => {
    // FEN-nya bergiliran putih; ancamannya tetap terbaca supaya peringatan datang saat
    // masih bisa ditindaklanjuti.
    expect(map('4r2k/8/8/4N3/8/8/8/6K1 w - - 0 1', 'white')).toEqual({ e5: 320 });
  });

  it('membaca sisi hitam dengan cara yang sama', () => {
    expect(map('6k1/8/8/4n3/8/8/8/4R2K b - - 0 1', 'black')).toEqual({ e5: 320 });
  });

  it('tidak pernah menandai raja', () => {
    // Raja hitam di h8 diserang benteng putih; raja tidak bisa ditangkap, jadi ia tidak
    // punya kerugian material untuk dilaporkan.
    expect(findThreats('7k/8/8/8/8/8/8/7R b - - 0 1', 'black')).toEqual([]);
  });

  it('membedakan kerugian besar dari yang kecil', () => {
    const heavy = findThreats('4r2k/8/8/4N3/8/8/8/6K1 w - - 0 1', 'white');
    expect(heavy[0]?.level).toBe('high');

    // Pion e5 menggantung: rugi 100, di bawah ambang satu bidak minor.
    const light = findThreats('4r2k/8/8/4P3/8/8/8/6K1 w - - 0 1', 'white');
    expect(light[0]).toMatchObject({ square: 'e5', loss: 100, level: 'low' });
  });

  it('tidak jatuh pada fen yang tidak utuh', () => {
    expect(findThreats(undefined, 'white')).toEqual([]);
    expect(findThreats('bukan fen', 'white')).toEqual([]);
  });
});
