<script lang="ts">
  /**
   * Halaman pengaturan.
   *
   * Berkas ini sengaja tidak tahu apa-apa tentang setelan mana pun: urutan blok adalah
   * satu-satunya keputusan yang tinggal di sini. Keadaannya ada di `settings.svelte.ts`,
   * tampilannya di `sections/`, dan bahasa visualnya di `theme.css` — jadi menambah satu
   * setelan berarti satu berkas baru di `sections/` dan satu baris di sini, bukan
   * menyisipkan seratus baris ke tengah berkas seribu baris.
   *
   * Urutannya dari yang paling sering diubah ke yang paling jarang, dan yang paling
   * berisiko diletakkan di tengah dengan peringatannya sendiri, bukan di ujung tempat
   * orang berhenti membaca.
   */
  import './theme.css';
  import { settings } from './settings.svelte';
  import ThreatsCard from './sections/ThreatsCard.svelte';
  import TimingCard from './sections/TimingCard.svelte';
  import ThinkCard from './sections/ThinkCard.svelte';
  import ClockCard from './sections/ClockCard.svelte';
  import NewGameCard from './sections/NewGameCard.svelte';
  import DynamicEloCard from './sections/DynamicEloCard.svelte';
  import CursorDotCard from './sections/CursorDotCard.svelte';
  import EngineList from './sections/EngineList.svelte';

  settings.start();
</script>

<main>
  <h1>Pengaturan</h1>

  <div class="columns">
    <ThreatsCard />
    <TimingCard />
    <ThinkCard />
    <ClockCard />
    <NewGameCard />
    <DynamicEloCard />
    <CursorDotCard />
  </div>

  <EngineList />
</main>

<style>
  main {
    /* Cukup untuk empat kolom, dan berhenti di situ: teks penjelas di kartu-kartu ini
       panjang, dan kolom yang lebih lebar dari ini membuat barisnya terlalu jauh untuk
       diikuti mata. Sisa ruang di layar ultralebar jadi margin, bukan kolom kelima. */
    max-width: 1560px;
    margin: 0 auto;
    /* Bayangan kartu menjorok sekitar 30px ke luar di tiap sisi; tanpa ruang selebar itu
       ia terpotong tepi jendela dan kartunya terbaca menempel di dinding, bukan
       terangkat. Ini juga yang menentukan jarak antar kolom di bawah. */
    padding: 40px 36px 72px;
  }

  h1 {
    margin: 0 4px 22px;
    font-size: 26px;
    font-weight: 650;
    letter-spacing: -0.02em;
  }

  /*
   * Multi-kolom, bukan grid.
   *
   * Kartu-kartu ini tingginya jauh berbeda — "Game baru otomatis" beberapa kali lebih
   * tinggi daripada "Tampilkan kursor maya". Di grid, tinggi tiap baris mengikuti kartu
   * tertinggi di baris itu, jadi kartu pendek meninggalkan lubang kosong di bawahnya dan
   * halamannya tetap panjang. Kolom CSS mengalir mengisi: kartu berikutnya mulai persis
   * di bawah yang sebelumnya, berapa pun tingginya.
   *
   * Jumlah kolomnya tidak ditentukan, hanya lebar minimalnya — jadi jendela selebar apa
   * pun mendapat kolom sebanyak yang muat, dan di layar sempit ia turun sendiri jadi
   * satu kolom tanpa satu pun media query.
   */
  .columns {
    columns: 400px;
    /* Selebar dua bayangan yang berpapasan, plus sedikit udara. Lebih rapat dari ini dan
       bayangan gelap kartu kiri jatuh ke atas bayangan terang kartu kanan — keduanya
       saling menghapus, dan dua kartu bertetangga terbaca seperti satu bidang kusam. */
    column-gap: 34px;
  }
</style>
