<script lang="ts">
  /**
   * Penjelasan panjang yang disembunyikan di balik satu tombol kecil.
   *
   * Ini popover, bukan tooltip, dan bedanya bukan soal istilah. Tooltip untuk teks
   * sebaris yang dibaca sekilas; isi di sini beberapa paragraf yang kadang perlu dibaca
   * ulang, dipilih, atau disalin. Jadi ia harus bertahan saat kursor berpindah ke
   * dalamnya — yang justru tidak boleh dilakukan tooltip.
   *
   * Tiga cara membukanya, dan ketiganya perlu ada. Hover untuk tetikus. Fokus keyboard,
   * karena penjelasan yang hanya bisa dicapai dengan tetikus sama saja dengan tidak ada
   * bagi yang menelusuri halaman dengan Tab. Dan klik, yang mengunci panelnya tetap
   * terbuka — satu-satunya cara yang bekerja di layar sentuh, di mana tidak ada hover
   * sama sekali.
   *
   * Dipasang lewat API `popover` bawaan supaya panelnya digambar di lapisan teratas.
   * Kartu-kartu halaman ini ditata dalam kolom CSS, dan panel yang digambar biasa akan
   * tertimpa kartu di kolom sebelahnya — bukan karena z-index yang salah, melainkan
   * karena urutan cat antar kolom tidak bisa diatur dari sini sama sekali.
   */
  import type { Snippet } from 'svelte';

  interface Props {
    /** Nama tombolnya untuk pembaca layar, mis. "Penjelasan sorotan ancaman". */
    label: string;
    children: Snippet;
  }

  const { label, children }: Props = $props();

  let trigger = $state<HTMLButtonElement>();
  let panel = $state<HTMLDivElement>();
  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Panel di lapisan teratas tidak ikut mengalir bersama tombolnya, jadi letaknya
   * dihitung di sini — dijepit ke dalam jendela supaya tombol di kolom paling kanan
   * tidak melempar panelnya ke luar layar, dan dipindah ke atas tombol kalau ruang di
   * bawahnya tidak cukup.
   */
  function place(): void {
    if (!trigger || !panel) return;
    const anchor = trigger.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const gap = 10;
    const edge = 12;

    const centered = anchor.left + anchor.width / 2 - width / 2;
    const left = Math.max(edge, Math.min(centered, window.innerWidth - width - edge));

    const fitsBelow = window.innerHeight - anchor.bottom > height + gap + edge;
    const top = fitsBelow
      ? anchor.bottom + gap
      : Math.max(edge, anchor.top - height - gap);

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function show(): void {
    clearTimeout(timer);
    if (!panel || open) return;
    // Ditampilkan dulu baru diukur: panel yang masih tersembunyi tidak punya tinggi,
    // dan letaknya akan dihitung dari nol.
    panel.showPopover();
    place();
  }

  function hide(): void {
    clearTimeout(timer);
    if (!panel || !open) return;
    panel.hidePopover();
  }

  /**
   * Jeda sebelum membuka dan sebelum menutup.
   *
   * Yang membuka menahan panel agar tidak berkedip saat kursor cuma melintas menuju
   * sesuatu di baliknya. Yang menutup memberi waktu untuk menyeberang dari tombol ke
   * panelnya — tanpa ia, celah beberapa piksel di antara keduanya menutup panel tepat
   * saat kamu hendak membacanya.
   */
  function showSoon(): void {
    clearTimeout(timer);
    timer = setTimeout(show, 120);
  }

  function hideSoon(): void {
    clearTimeout(timer);
    timer = setTimeout(hide, 200);
  }

  /**
   * Satu-satunya sumber kebenaran untuk `open`.
   *
   * Panel bisa tertutup tanpa melewati `hide()` — Esc dan klik di luar ditangani sendiri
   * oleh peramban — jadi keadaannya dibaca dari peristiwa panelnya, bukan ditebak dari
   * sisi mana yang memanggil.
   */
  function synced(event: Event): void {
    open = (event as ToggleEvent).newState === 'open';
  }
</script>

<!--
  Hover dipasang di tombolnya sendiri, bukan di pembungkusnya. Pembungkus hanya untuk
  tata letak, dan elemen yang tidak punya peran ARIA tidak boleh memikul peristiwa
  tetikus — pembaca layar tidak punya cara menyampaikan bahwa ia ada. Penyeberangan dari
  tombol ke panel tetap aman karena panelnya menangkap `mouseenter` sendiri, dan jeda
  tutup 200 ms cukup panjang untuk melewati celah di antara keduanya.
-->
<span class="hint">
  <button
    bind:this={trigger}
    type="button"
    class="dot"
    class:open
    aria-label={label}
    aria-expanded={open}
    onclick={() => (open ? hide() : show())}
    onmouseenter={showSoon}
    onmouseleave={hideSoon}
    onfocus={show}
    onblur={hideSoon}
  >
    ?
  </button>

  <div
    bind:this={panel}
    popover="auto"
    class="panel"
    role="tooltip"
    ontoggle={synced}
    onmouseenter={() => clearTimeout(timer)}
    onmouseleave={hideSoon}
  >
    {@render children()}
  </div>
</span>

<style>
  .hint {
    display: inline-flex;
    flex: none;
    vertical-align: middle;
  }

  /*
   * Tombolnya ditekan ke dalam permukaan, bukan menonjol seperti tombol lain di halaman
   * ini. Ia memang bukan tindakan — tidak ada yang berubah kalau ditekan — dan bentuk
   * yang tenggelam membuatnya terbaca sebagai tanda yang menempel di kartu, bukan
   * sebagai tombol yang menunggu ditekan sebelum setelannya bisa dipakai.
   */
  .dot {
    width: 22px;
    height: 22px;
    flex: none;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--fill-press);
    box-shadow: var(--press-sm);
    color: var(--ink-faint);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    cursor: help;
    transition:
      color 200ms var(--ease),
      box-shadow 200ms var(--ease);
  }

  .dot:hover,
  .dot.open {
    color: var(--accent);
    box-shadow:
      var(--press-sm),
      0 0 0 2px var(--accent-soft);
  }

  .dot:focus-visible {
    outline: none;
    color: var(--accent);
    box-shadow:
      var(--press-sm),
      0 0 0 3px var(--accent-soft);
  }

  /*
   * `inset: auto` melepas penengahan bawaan popover, supaya `left`/`top` yang dihitung
   * di skrip benar-benar dipakai. Tanpa itu panelnya selalu mendarat di tengah layar.
   */
  .panel {
    position: fixed;
    inset: auto;
    margin: 0;
    width: min(380px, calc(100vw - 24px));
    padding: 20px 22px;
    border: 0;
    border-radius: var(--r-md);
    /*
     * Satu-satunya permukaan di halaman ini yang memakai bayangan jatuh biasa, bukan
     * bayangan ganda neumorphism. Alasannya ia memang tidak sedang terangkat dari
     * permukaan halaman — ia melayang di atasnya, kadang menutupi dua kartu sekaligus,
     * dan bayangan ganda pada benda melayang terbaca sebagai cacat cetak.
     */
    background: var(--fill-raise);
    box-shadow:
      0 18px 48px -12px rgb(0 0 0 / 0.45),
      0 0 0 1px var(--glow) inset;
    color: var(--ink-soft);
    font-size: 13px;
    line-height: 1.6;
  }

  /*
   * `:global` karena isinya ditulis di komponen lain. Svelte memberi tiap elemen kelas
   * cakupan milik berkas tempat ia DITULIS, bukan tempat ia digambar — jadi `p` di sini
   * membawa kelas cakupan kartunya, dan `.panel p` biasa tidak akan pernah cocok.
   */
  .panel :global(p) {
    margin: 0 0 13px;
  }

  .panel :global(p:last-child) {
    margin-bottom: 0;
  }

  .panel:popover-open {
    animation: rise 180ms var(--ease);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .panel:popover-open {
      animation: none;
    }
  }
</style>
