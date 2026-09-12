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
      Menandai kotak tempat bidakmu kalah material kalau lawan menyerangnya dan
      tukar-menukar di kotak itu dijalankan sampai habis. Merah untuk kerugian sebesar
      bidak minor atau lebih, kuning untuk yang lebih kecil.
    </p>
    <p>
      Tidak melibatkan engine sama sekali: hitungannya dari posisi di papan, jadi
      sorotannya muncul sebelum analisis selesai dan tetap ada walau semua engine
      dimatikan. Karena itu ia juga tidak tahu soal serangan ganda atau taktik dua
      langkah — yang dijawab hanya “apa yang bisa hilang di kotak ini”.
    </p>
  {/snippet}

  <p class="lead">Menandai kotak tempat bidakmu bisa hilang kalau ditukar sampai habis.</p>
</Card>
