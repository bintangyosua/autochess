import { describe, expect, it } from 'vitest';
import { normalizeLabel, pickNewGameButton } from './gameOver';

describe('normalizeLabel', () => {
  it('menyamakan spasi dan huruf besar', () => {
    // Teks tombol diambil dari DOM dan bisa membawa spasi ganda atau baris baru dari
    // markup-nya; yang kamu centang di pengaturan harus tetap cocok.
    expect(normalizeLabel('  New  10 sec + 0.1 ')).toBe('new 10 sec + 0.1');
    expect(normalizeLabel('NEW 3 MIN')).toBe('new 3 min');
  });
});

describe('pickNewGameButton', () => {
  const pick = (labels: string[], options = {}) =>
    pickNewGameButton(labels, { random: () => 0, ...options });

  it('mengenali tombol game baru lewat pola bawaan', () => {
    expect(pick(['Game Review', 'New 10 min', 'Rematch'])).toBe(1);
  });

  it('mengenali waktu kontrol custom, bukan hanya menit bulat', () => {
    // Bentuk aslinya dari chess.com: "New 10 sec + 0.1". Memaksa teksnya jadi angka menit
    // akan menutup pintu untuk semua waktu kontrol yang dibuat sendiri.
    expect(pick(['New 10 sec + 0.1'])).toBe(0);
    expect(pick(['New 5 | 2'])).toBe(0);
  });

  it('tidak pernah memilih tombol yang berbahaya', () => {
    const dangerous = ['Game Review', 'Accept', 'Terima tantangan', 'Upgrade to Diamond', 'Report'];
    expect(pick(dangerous)).toBeUndefined();
  });

  it('menolak tombol berbahaya walau kamu sendiri yang mencentangnya', () => {
    // Daftar centang bisa ikut tersimpan dari modal berbentuk lain; pagar keselamatan
    // diperiksa lebih dulu justru untuk kasus itu.
    expect(pick(['Accept challenge'], { allow: ['Accept challenge'] })).toBeUndefined();
  });

  it('tidak memakai Rematch lewat pola bawaan', () => {
    // Ia menantang lawan yang SAMA dan butuh persetujuannya. Kalau lawan menolak,
    // permintaannya menggantung — padahal dari sisi kita tombolnya sudah diklik.
    expect(pick(['Rematch', 'Tanding ulang'])).toBeUndefined();
  });

  it('tapi memakainya kalau kamu memilihnya sendiri', () => {
    expect(pick(['Rematch'], { allow: ['Rematch'] })).toBe(0);
  });

  it('hanya memakai tombol yang kamu pilih kalau daftarnya terisi', () => {
    const labels = ['New 3 min', 'New 10 min', 'New 10 sec + 0.1'];
    expect(pick(labels, { allow: ['New 10 sec + 0.1'] })).toBe(2);
    expect(pick(labels, { allow: ['New 10 min'] })).toBe(1);
  });

  it('diam kalau tidak ada pilihanmu yang muncul di modal', () => {
    // Lebih baik satu game otomatis hilang daripada menekan tombol yang tidak kamu maksud.
    expect(pick(['New 3 min'], { allow: ['New 30 min'] })).toBeUndefined();
  });

  it('menyerah untuk modal yang bentuknya tidak dikenal', () => {
    expect(pick(['Lanjut', 'OK', 'Hmm'])).toBeUndefined();
  });

  it('memilih acak di antara yang cocok, bukan selalu yang pertama', () => {
    const labels = ['New 3 min', 'New 5 min', 'New 10 min'];
    expect(pickNewGameButton(labels, { random: () => 0.99 })).toBe(2);
    expect(pickNewGameButton(labels, { random: () => 0 })).toBe(0);
  });
});

describe('pagar untuk panel samping', () => {
  it('kontrol saat game masih jalan tidak pernah terbaca sebagai game baru', () => {
    // Panel samping berisi tombol-tombol ini selama game berlangsung. Kalau salah satunya
    // lolos, ekstensi akan "memulai game baru" dengan cara menyerahkan game yang sedang
    // dimainkan — kesalahan yang tidak bisa dibatalkan.
    const live = ['Abort', 'Draw', 'Resign', 'Menyerah', 'Tawarkan remis'];
    expect(pickNewGameButton(live, { random: () => 0 })).toBeUndefined();
  });
});
