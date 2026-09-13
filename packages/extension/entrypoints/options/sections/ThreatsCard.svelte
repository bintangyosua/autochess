<script lang="ts">
  import Card from '../ui/Card.svelte';
  import Toggle from '../ui/Toggle.svelte';
  import { settings } from '../settings.svelte';
</script>

<Card title="Sorotan ancaman">
  {#snippet action()}
    <Toggle
      label="Aktifkan sorotan ancaman"
      checked={settings.threats}
      onchange={(on) => settings.setThreats(on)}
    />
  {/snippet}

  {#snippet hint()}
    <p>
      Kotak bidakmu diberi warna kalau bidak itu bisa dimakan lawan dan kamu rugi
      setelah semua tukar-menukar di kotak itu selesai.
    </p>
    <ul class="effects">
      <li><b>Merah</b> → kamu bisa kehilangan kuda, gajah, atau yang lebih besar.</li>
      <li><b>Kuning</b> → kerugiannya kecil, misalnya satu pion.</li>
    </ul>
    <p>
      Tidak butuh engine, jadi muncul langsung dan tetap jalan walau semua engine mati.
      Tapi ia hanya melihat satu kotak — jebakan atau taktik beberapa langkah tidak
      terdeteksi.
    </p>
    <p class="tip">Matikan kalau papan terasa terlalu ramai warna.</p>
  {/snippet}

  <p class="lead">Menandai kotak tempat bidakmu bisa hilang kalau ditukar sampai habis.</p>
</Card>
