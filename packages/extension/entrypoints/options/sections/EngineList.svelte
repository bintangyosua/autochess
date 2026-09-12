<script lang="ts">
  import EngineCard from './EngineCard.svelte';
  import Button from '../ui/Button.svelte';
  import Hint from '../ui/Hint.svelte';
  import { settings } from '../settings.svelte';
</script>

<section class="engines">
  <header>
    <h2>
      Engine
      <Hint label="Penjelasan: setelan engine">
        <p>
          Depth, jumlah panah, kekuatan, dan kepribadian per engine. Semuanya berlaku
          untuk semua tab dan menimpa nilai di <code>engines.config.json</code> tanpa
          mengubah berkasnya.
        </p>
        <p>
          Pilihan yang tersedia berbeda-beda karena tiap engine memang menyediakan tombol
          yang berbeda. Engine manusiawi (Maia) tidak punya setelan depth: mode policy
          hanya menghitung satu node, dan kekuatannya melekat pada bobot yang dipakai —
          pilih Maia 1300, 1500, atau 1900 di <code>engines.config.json</code>. Stockfish
          tidak punya pilihan kepribadian; Dragon dan Komodo punya. Sebaliknya hanya
          Stockfish yang punya Elo native.
        </p>
        <p>
          Sakelar aktif/mati di sini hanya berlaku di ekstensi: engine tetap dijalankan
          bridge, cuma tidak diminta menghitung dan tidak muncul di overlay. Untuk
          mematikannya sampai bridge tidak menjalankannya sama sekali, pakai
          <code>"enabled": false</code> di <code>engines.config.json</code>.
        </p>
      </Hint>
    </h2>
    <p class="lead">Setelan per engine, menimpa <code>engines.config.json</code>.</p>
  </header>

  {#if !settings.loaded}
    <p class="empty">Memuat...</p>
  {:else if settings.providers.length === 0}
    <p class="empty">
      Belum ada engine dari bridge. Jalankan <code>pnpm bridge</code>, lalu buka halaman
      ini lagi.
    </p>
  {:else}
    <!-- Semua engine ditampilkan, bukan hanya pencari: sakelar nyala/mati berlaku untuk
         semuanya, dan engine mode policy yang tak punya depth pun tetap perlu bisa
         dimatikan dari sini. Setelan yang tidak berlaku untuknya disembunyikan per blok. -->
    <ul>
      {#each settings.providers as provider (provider.id)}
        <EngineCard {provider} />
      {/each}
    </ul>

    <footer>
      <Button disabled={!settings.anyOverride} onclick={() => settings.resetAll()}>
        Kembalikan semua ke bawaan
      </Button>
    </footer>
  {/if}
</section>

<style>
  /*
   * Judul bagian ini duduk langsung di atas permukaan halaman, tanpa kartu. Kartu di
   * dalam kartu adalah cara tercepat merusak neumorphism: dua permukaan terangkat yang
   * bertumpuk tidak lagi terbaca sebagai kedalaman, melainkan sebagai kotak yang salah
   * ukuran.
   */
  header {
    margin: 44px 4px 22px;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 8px;
    font-size: 19px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  /*
   * Di sini grid, bukan kolom seperti blok setelan di atas — dan bedanya ada alasannya.
   *
   * Kartu engine tingginya sebanding satu sama lain: isinya blok yang itu-itu juga,
   * cuma beda beberapa baris. Jadi lubang kosong yang membuat grid tidak cocok di atas
   * praktis tidak muncul di sini, dan sebagai gantinya kita dapat yang tidak bisa
   * diberikan kolom CSS: urutan baca kiri-ke-kanan. Daftar engine memang dibaca begitu —
   * "mana yang menyala" adalah pertanyaan yang dijawab dengan menyapu satu baris, bukan
   * menelusuri satu kolom sampai bawah lalu naik lagi.
   *
   * `align-items: start` supaya kartu yang lebih pendek berhenti di tingginya sendiri
   * dan tidak diregangkan mengikuti tetangga tertingginya — kartu teregang akan punya
   * ruang kosong di dalam bayangannya, dan itu terbaca sebagai cacat, bukan sebagai jeda.
   */
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
    align-items: start;
    /* Sama seperti jarak antar kolom di atas, dan karena alasan yang sama: bayangan yang
       berpapasan terlalu rapat saling menghapus. */
    gap: 34px;
  }

  footer {
    margin-top: 22px;
    padding: 0 4px;
  }

  .empty {
    padding: 0 4px;
    color: var(--ink-soft);
  }
</style>
