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
      Saat mode auto jalan, kursor aslimu tidak ikut bergerak — gerakannya "tak terlihat".
      Titik merah ini menunjukkan ke mana kursor itu sebenarnya bergerak dan di mana ia
      mengklik.
    </p>
    <ul class="effects">
      <li><b>Aktif</b> → titik merah muncul di papan, mengikuti gerakan mode auto.</li>
      <li><b>Mati</b> → tidak ada penanda, mode auto tetap jalan seperti biasa.</li>
    </ul>
    <p>
      Hanya untuk mengecek apakah klik mendarat di kotak yang benar. Tidak mengubah cara
      bermain.
    </p>
    <p class="tip">
      Biarkan mati untuk dipakai sehari-hari — titiknya terlihat oleh siapa saja yang
      melihat layarmu, termasuk saat kamu siaran.
    </p>
  {/snippet}

  <p class="lead">
    Penanda posisi kursor maya di papan. Alat pemeriksa — dan terlihat oleh siapa pun
    yang melihat layarmu.
  </p>
</Card>
