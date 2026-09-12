<script lang="ts">
  /**
   * Tombol.
   *
   * Dua bentuk, dan bedanya bukan hiasan. `solid` menonjol keluar dari permukaan dan
   * menekan ke dalam saat diklik — gerakan itu satu-satunya umpan balik yang dipunyai
   * bahasa visual ini, dan tanpa ia tombol neumorphism terasa mati. `quiet` tidak punya
   * permukaan sama sekali: ia teks beraksen bergaris bawah, untuk tindakan sekunder yang
   * muncul dan hilang di dalam baris judul ("kembalikan ke bawaan") dan akan mengacaukan
   * ritme baris itu kalau digambar sebagai kotak.
   */
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'solid' | 'quiet';
    disabled?: boolean;
    onclick: () => void;
    children: Snippet;
  }

  const { variant = 'solid', disabled = false, onclick, children }: Props = $props();
</script>

<button type="button" class={variant} {disabled} {onclick}>
  {@render children()}
</button>

<style>
  button {
    border: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .solid {
    padding: 14px 28px;
    border-radius: var(--r-md);
    background: var(--fill-raise);
    box-shadow: var(--raise-sm);
    font-size: 14px;
    font-weight: 600;
    transition:
      box-shadow 260ms var(--ease),
      transform 260ms var(--ease);
  }

  .solid:hover:not(:disabled) {
    box-shadow: var(--raise);
    transform: translateY(-1px);
  }

  /*
   * Ditekan berarti masuk ke dalam permukaan, bukan berganti warna — dan ikut turun
   * sedikit. Perpindahan dari terangkat ke tenggelam saja sudah benar secara bentuk,
   * tapi tanpa gerakan ia terjadi seketika dan terbaca seperti kedipan, bukan tekanan.
   */
  .solid:active:not(:disabled) {
    background: var(--fill-press);
    box-shadow: var(--press-sm);
    transform: translateY(1px);
  }

  .solid:focus-visible {
    outline: none;
    box-shadow:
      var(--raise-sm),
      0 0 0 3px var(--accent-soft);
  }

  .solid:disabled {
    background: var(--fill-press);
    box-shadow: var(--press-sm);
    color: var(--ink-faint);
    cursor: default;
  }

  .quiet {
    padding: 0;
    background: none;
    color: var(--accent);
    font-size: 13px;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .quiet:disabled {
    color: var(--ink-faint);
    cursor: default;
  }

  .quiet:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 3px;
  }
</style>
