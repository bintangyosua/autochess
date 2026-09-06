import { describe, expect, it } from 'vitest';
import { shouldAccept, type AcceptInput } from './DomBoardReader';

const BOARD_A = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R';
const BOARD_B = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R';

/** Pembacaan normal: papan konsisten, giliran terbaca, tidak ada interaksi. */
const snap = (over: Partial<AcceptInput> = {}): AcceptInput => ({
  fen: `${BOARD_A} b KQkq - 0 1`,
  fenBoard: BOARD_A,
  turnKnown: true,
  interacting: false,
  ...over,
});

describe('shouldAccept', () => {
  it('menerima posisi baru', () => {
    expect(shouldAccept(snap(), { lastFen: 'lain', lastBoard: BOARD_B })).toBe(true);
  });

  it('menolak selama bidak sedang dipegang', () => {
    expect(shouldAccept(snap({ interacting: true }), {})).toBe(false);
  });

  it('menolak posisi yang sama persis', () => {
    const s = snap();
    expect(shouldAccept(s, { lastFen: s.fen, lastBoard: s.fenBoard })).toBe(false);
  });

  it('menolak papan yang belum konsisten', () => {
    expect(shouldAccept(snap({ fen: undefined, fenBoard: undefined }), {})).toBe(false);
  });

  // Inti bug-nya: mengangkat bidak menambah satu kotak tersorot, giliran jatuh ke
  // tebakan 'w', dan fen berubah hanya di field giliran. Tanpa aturan ini, engine
  // diminta menganalisis untuk lawan padahal posisinya sama sekali belum berubah.
  it('menolak giliran tebakan saat susunan bidak tidak berubah', () => {
    const guessed = snap({ fen: `${BOARD_A} w KQkq - 0 1`, turnKnown: false });
    const last = { lastFen: `${BOARD_A} b KQkq - 0 1`, lastBoard: BOARD_A };
    expect(shouldAccept(guessed, last)).toBe(false);
  });

  it('tetap menerima giliran tebakan kalau bidaknya benar-benar pindah', () => {
    const guessed = snap({ fen: `${BOARD_B} w KQkq - 0 1`, fenBoard: BOARD_B, turnKnown: false });
    expect(shouldAccept(guessed, { lastFen: `${BOARD_A} b KQkq - 0 1`, lastBoard: BOARD_A })).toBe(
      true,
    );
  });

  it('menerima pembacaan pertama saat belum ada riwayat', () => {
    expect(shouldAccept(snap({ turnKnown: false }), {})).toBe(true);
  });
});
