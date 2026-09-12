<script lang="ts">
  import Card from '../ui/Card.svelte';
  import Toggle from '../ui/Toggle.svelte';
  import Slider from '../ui/Slider.svelte';
  import Chip from '../ui/Chip.svelte';
  import Button from '../ui/Button.svelte';
  import Hint from '../ui/Hint.svelte';
  import { settings } from '../settings.svelte';
  import {
    MAX_GAMES_MAX,
    MAX_GAMES_MIN,
    NEW_GAME_MAX_MS,
    NEW_GAME_MIN_MS,
  } from '../../../lib/settings';

  const newGame = $derived(settings.newGame);
  const off = $derived(!newGame.enabled);
</script>

<Card title="Game baru otomatis">
  {#snippet action()}
    <Toggle
      label="Aktifkan game baru otomatis"
      checked={newGame.enabled}
      onchange={(on) => settings.setNewGame({ enabled: on })}
    />
  {/snippet}

  {#snippet hint()}
    <p>
      Begitu modal hasil muncul, tombol game baru diklik sendiri — lewat kursor maya yang
      sama dengan yang memainkan bidak, bukan lewat klik langsung. Tombolnya dikenali
      dari teksnya, bukan dari nama kelas chess.com yang bisa berubah sewaktu-waktu.
    </p>
    <p>
      Tombol "Rematch" sengaja tidak dipakai: itu menantang lawan yang sama dan ia harus
      menyetujuinya. Kalau ia menolak atau pergi, permintaannya menggantung dan tidak ada
      game yang dimulai — padahal dari sisi ekstensi tombolnya sudah diklik. Tombol yang
      menyangkut rated/unrated, pembelian, laporan, atau menerima tantangan tidak pernah
      disentuh sama sekali.
    </p>
  {/snippet}

  <p class="lead">Tombol game baru diklik sendiri begitu modal hasil muncul.</p>

  <!--
    Peringatan ini tetap terlihat, tidak ikut pindah ke balik tombol tanya.
    Penjelasan boleh disembunyikan karena ia menjawab pertanyaan yang kamu ajukan
    sendiri; peringatan tidak, karena ia menjawab pertanyaan yang justru tidak terpikir
    untuk diajukan. Sakelar ini mengubah ekstensi dari alat yang diawasi jadi alat yang
    berjalan sendiri, dan itu harus terbaca sebelum sakelarnya disentuh.
  -->
  <p class="warning">
    <strong>Ini mengubah sifat ekstensi.</strong> Tanpa ia, ekstensi berhenti tiap kali
    satu game selesai; dengan ia, ia berjalan sendiri sampai batas di bawah tercapai.
    Puluhan game beruntun tanpa jeda jauh lebih mencolok bagi sistem fair play daripada
    satu langkah mana pun — batas jumlah game itu pagar, bukan hiasan.
  </p>

  <h3 class="group">
    Batas game per sesi
    <Hint label="Penjelasan: batas game per sesi">
      <p>
        Hitungannya nol lagi tiap tab dimuat ulang, atau tiap sakelar di atas dimatikan
        lalu dinyalakan.
      </p>
    </Hint>
  </h3>
  <Slider
    label="maks"
    aria="Batas game per sesi"
    min={MAX_GAMES_MIN}
    max={MAX_GAMES_MAX}
    step={1}
    disabled={off}
    value={newGame.maxGames}
    number
    unit="game"
    onchange={(v) => settings.setNewGame({ maxGames: v })}
  />

  <h3 class="group">
    Jeda sebelum klik
    <Hint label="Penjelasan: jeda sebelum klik">
      <p>
        Jauh lebih panjang daripada jeda langkah, dan itu disengaja: manusia melihat skor
        akhir dan perubahan ratingnya dulu sebelum memutuskan main lagi.
      </p>
    </Hint>
  </h3>
  <Slider
    label="min"
    aria="Jeda minimum sebelum klik game baru"
    min={NEW_GAME_MIN_MS}
    max={NEW_GAME_MAX_MS}
    step={1000}
    disabled={off}
    value={newGame.minMs}
    number
    unit="ms"
    onchange={(v) => settings.setNewGame({ minMs: v })}
  />
  <Slider
    label="maks"
    aria="Jeda maksimum sebelum klik game baru"
    min={NEW_GAME_MIN_MS}
    max={NEW_GAME_MAX_MS}
    step={1000}
    disabled={off}
    value={newGame.maxMs}
    number
    unit="ms"
    onchange={(v) => settings.setNewGame({ maxMs: v })}
  />

  <h3 class="group">
    Tombol yang boleh diklik
    <Hint label="Penjelasan: tombol yang boleh diklik">
      <p>
        Daftar ini dikumpulkan dari modal yang benar-benar muncul di layarmu, jadi
        bentuknya mengikuti bahasa dan waktu kontrol yang kamu pakai.
      </p>
      <p>
        Tidak ada yang dicentang berarti pola bawaan yang dipakai ("New ..."), bukan
        berarti tidak ada yang boleh. Centang beberapa kalau kamu mau waktu kontrol
        tertentu saja, termasuk custom seperti "New 10 sec + 0.1"; yang dicentang dipilih
        acak tiap game. Kalau tak satu pun muncul di modal, ekstensi diam saja — bukan
        memakai tombol lain.
      </p>
      <p>
        Tombol berbahaya (analisis, laporan, pembelian, menerima tantangan) tidak pernah
        diklik walau tercentang.
      </p>
    </Hint>
  </h3>
  {#if settings.seen.length === 0}
    <p class="fine">
      Belum ada tombol yang tercatat. Selesaikan satu game dengan sakelar di atas
      menyala — teks tombol di modal hasilnya akan muncul di sini untuk kamu pilih.
    </p>
  {:else}
    <div class="pool">
      {#each settings.seen as label (label)}
        <Chip
          {label}
          disabled={off}
          checked={newGame.labels.includes(label)}
          onchange={(on) => settings.toggleLabel(label, on)}
        />
      {/each}
    </div>
    <p class="fine">
      {#if newGame.labels.length === 0}
        Tidak ada yang dicentang — pola bawaan yang dipakai ("New ...").
      {:else}
        Dipilih acak tiap game dari yang dicentang.
      {/if}
    </p>
    <div class="clear">
      <Button variant="quiet" onclick={() => settings.clearSeen()}>bersihkan daftar</Button>
    </div>
  {/if}
</Card>

<style>
  /*
   * Peringatan ini satu-satunya teks di halaman yang bukan penjelasan melainkan
   * pemberitahuan risiko, dan kartu neumorphism tidak punya cara menonjolkan sesuatu
   * lewat latar — semua latar sama. Jadi ia ditandai dari samping: satu garis aksen
   * peringatan di tepi kiri, pada permukaan yang ditekan ke dalam.
   */
  .warning {
    margin: 0 0 14px;
    padding: 14px 18px;
    border-left: 3px solid var(--warn);
    border-radius: var(--r-sm);
    background: var(--fill-press);
    box-shadow: var(--press-sm);
    color: var(--ink-soft);
    font-size: 12.5px;
  }

  .warning strong {
    color: var(--ink);
  }

  /* Daftar tombol yang tercatat: mengalir dan membungkus antar baris. */
  .pool {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }

  .clear {
    margin-top: 8px;
  }
</style>
