import { describe, expect, it } from 'vitest';
import { REARM_AFTER_MS, newGameDelayMs, shouldArm } from './autoNewGame';

describe('shouldArm', () => {
  it('boleh mengklik saat izinnya masih ada', () => {
    expect(shouldArm({ armed: true, sinceLastClickMs: 0 })).toBe(true);
  });

  it('menahan klik kedua selama game barunya masih mungkin datang', () => {
    // Tanpa ini, denyut tiap detik akan menjadwalkan modal yang sama berkali-kali selama
    // jeda sebelum klik — yang bisa 25 detik.
    expect(shouldArm({ armed: false, sinceLastClickMs: 5_000 })).toBe(false);
  });

  it('mencoba lagi kalau game barunya tidak pernah datang', () => {
    // Inilah keadaan macet yang sebenarnya: lawan kabur sebelum langkah pertama,
    // pencarian dibatalkan, atau tombolnya ternyata cuma membuka menu. Tidak akan pernah
    // ada game baru yang menandai selesainya, jadi menunggu tanpa batas berarti diam
    // selamanya.
    expect(shouldArm({ armed: false, sinceLastClickMs: REARM_AFTER_MS })).toBe(true);
  });
});

describe('newGameDelayMs', () => {
  it('tetap di dalam rentangnya', () => {
    expect(newGameDelayMs({ minMs: 6_000, maxMs: 25_000 }, () => 0)).toBe(6_000);
    expect(newGameDelayMs({ minMs: 6_000, maxMs: 25_000 }, () => 1)).toBe(25_000);
  });
});
