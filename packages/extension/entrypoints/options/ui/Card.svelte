<script lang="ts">
  /**
   * Satu blok setelan: permukaan yang menonjol keluar, dengan judul dan satu tempat
   * untuk kendali utamanya di kanan judul.
   *
   * `action` dipisah dari isi, bukan dibiarkan jadi elemen pertama di dalamnya, karena
   * ia memang bukan salah satu setelan di dalam kartu — ia yang menentukan seluruh
   * setelan itu berlaku atau tidak. Memberinya tempat sendiri di baris judul membuat
   * beda itu terbaca tanpa perlu dijelaskan.
   */
  import type { Snippet } from 'svelte';

  import Hint from './Hint.svelte';

  interface Props {
    title: string;
    /** Kendali di kanan judul: sakelar, nilai yang berlaku, tombol kembalikan. */
    action?: Snippet;
    /**
     * Penjelasan panjang, disembunyikan di balik tombol tanya di sebelah judul.
     *
     * Kartu ini dulu memuat penjelasannya utuh, dan hasilnya halaman yang harus dibaca
     * seluruhnya sebelum satu slider pun bisa ditemukan. Yang tinggal terlihat sekarang
     * satu kalimat; sisanya tetap ada, tinggal tidak lagi berdiri di antara kamu dan
     * kendali yang kamu cari.
     */
    hint?: Snippet;
    children: Snippet;
  }

  const { title, action, hint, children }: Props = $props();
</script>

<section class="card">
  <header>
    <h2>{title}</h2>
    {#if hint}
      <Hint label={`Penjelasan: ${title}`}>{@render hint()}</Hint>
    {/if}
    {#if action}{@render action()}{/if}
  </header>
  {@render children()}
</section>

<style>
  /*
   * Kartu tidak punya latar sendiri dan tidak punya garis tepi. Keduanya diganti satu
   * hal: bayangan ganda yang membuatnya terbaca sebagai permukaan yang sama dengan
   * halaman, hanya terangkat. Menambahkan latar yang sedikit berbeda akan merusak
   * ilusinya sama sekali — tepinya jadi terlihat, dan bentuknya kembali jadi kotak biasa.
   */
  .card {
    margin-bottom: 22px;
    padding: 24px 26px 26px;
    border-radius: var(--r-lg);
    /* Gradien, bukan warna rata: ini yang membuat kartunya terbaca melengkung. */
    background: var(--fill-raise);
    box-shadow: var(--raise);
    transition: box-shadow 320ms var(--ease);
    /*
     * Halaman menata kartu dalam kolom CSS, dan kolom CSS akan dengan senang hati
     * memotong satu kartu di tengah — separuh atas di kolom kiri, separuh bawah di
     * kolom kanan, lengkap dengan bayangan terangkat di kedua potongannya. Tanpa baris
     * ini seluruh ilusi permukaan tunggal itu hancur di layar lebar.
     */
    break-inside: avoid;
    /* Safari lama masih menuntut nama lamanya. */
    -webkit-column-break-inside: avoid;
  }

  /*
   * Membungkus, karena kolomnya bisa sesempit 340px sementara isi baris ini tidak selalu
   * pendek: "Jeda mode auto" membawa tombol "kembalikan ke bawaan" DAN nilai berjalan
   * "0,5–1,5s · 0,2–0,7s" sekaligus. Tanpa membungkus, yang terjadi bukan baris yang
   * sesak melainkan nilai yang terdorong keluar dari kartunya.
   */
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 12px;
    margin-bottom: 14px;
  }

  /*
   * Kartu naik sedikit saat disentuh. Bukan untuk menandakan ia bisa diklik — ia tidak
   * bisa — melainkan supaya permukaannya terasa punya ketebalan yang bisa berubah, dan
   * bukan gambar yang dicetak di latar. Yang bergerak hanya bayangannya, jadi tidak ada
   * teks yang bergeser di bawah kursor saat dibaca.
   */
  .card:hover {
    box-shadow: var(--raise-lift);
  }

  /* Judul tidak boleh ikut menyusut jadi satu huruf per baris saat baris ini sesak. */
  h2 {
    flex: none;
  }

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
</style>
