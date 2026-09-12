<script lang="ts">
  import Card from '../ui/Card.svelte';
  import Toggle from '../ui/Toggle.svelte';
  import { settings } from '../settings.svelte';
</script>

<Card title="Tampilkan kursor maya">
  {#snippet action()}
    <Toggle
      label="Tampilkan penanda kursor maya"
      checked={settings.cursorDot}
      onchange={(on) => settings.setCursorDot(on)}
    />
  {/snippet}

  {#snippet hint()}
    <p>
      Titik merah kecil yang menunjukkan posisi kursor menurut chess.com — bukan kursor
      aslimu. Halaman web tidak bisa memindahkan kursor sistem, jadi seluruh gerakan yang
      dikirim mode auto tidak terlihat sama sekali tanpa penanda ini.
    </p>
    <p>
      Alat pemeriksa, bukan bagian dari permainan: gunanya melihat jalur dan titik klik
      benar-benar mendarat di kotak yang dimaksud. Titiknya tidak bisa diklik dan tidak
      mengubah apa pun, tapi ia terlihat oleh siapa saja yang melihat layarmu.
    </p>
  {/snippet}

  <p class="lead">
    Penanda posisi kursor maya di papan. Alat pemeriksa — dan terlihat oleh siapa pun
    yang melihat layarmu.
  </p>
</Card>
