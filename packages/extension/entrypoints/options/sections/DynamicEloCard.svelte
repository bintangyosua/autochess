<script lang="ts">
  import Card from '../ui/Card.svelte';
  import Toggle from '../ui/Toggle.svelte';
  import Slider from '../ui/Slider.svelte';
  import { settings } from '../settings.svelte';
  import { OFFSET_MAX, OFFSET_MIN } from '../../../lib/dynamicElo';

  const dynamic = $derived(settings.dynamic);
  const off = $derived(!dynamic.enabled);
</script>

<Card title="Kekuatan ikut rating">
  {#snippet action()}
    <Toggle
      label="Aktifkan Elo dinamis"
      checked={dynamic.enabled}
      onchange={(on) => settings.setDynamic({ enabled: on })}
    />
  {/snippet}

  {#snippet hint()}
    <p>
      Kekuatan engine dihitung dari rating yang terbaca di halaman, bukan dari slider
      Kekuatan per engine — kalau mode ini menyala, slider itu tidak berlaku. Ratingnya
      dibaca dari komponen pemain, jadi ia selalu rating untuk tipe game yang sedang
      dimainkan: pindah dari rapid ke blitz tidak perlu diatur ulang.
    </p>
    <p>
      Offsetnya diacak sekali per game di dalam rentang di bawah, bukan satu angka tetap:
      offset yang sama persis tiap game menghasilkan kekuatan yang seragam, dan
      keseragaman itulah yang jadi pola. Isi min dan maks dengan angka yang sama kalau
      kamu memang mau offset tetap.
    </p>
    <p>
      Hasilnya tetap dijepit ke rentang yang didukung tiap engine. Stockfish tidak bisa
      turun di bawah 1320, jadi kalau rating-mu 800, angka yang benar-benar dipakai tetap
      1320 — bukan mode ini yang rusak. Kalau rating tidak terbaca (game tanpa rating,
      lawan bot), slider per engine yang dipakai kembali.
    </p>
  {/snippet}

  <p class="lead">
    Kekuatan engine mengikuti rating yang terbaca di halaman. Menyalakannya membuat
    slider Kekuatan per engine tidak berlaku.
  </p>

  <Slider
    label="min"
    aria="Offset minimum"
    min={OFFSET_MIN}
    max={OFFSET_MAX}
    step={10}
    disabled={off}
    value={dynamic.minOffset}
    number
    unit="Elo"
    onchange={(v) => settings.setDynamic({ minOffset: v })}
  />
  <Slider
    label="maks"
    aria="Offset maksimum"
    min={OFFSET_MIN}
    max={OFFSET_MAX}
    step={10}
    disabled={off}
    value={dynamic.maxOffset}
    number
    unit="Elo"
    onchange={(v) => settings.setDynamic({ maxOffset: v })}
  />
</Card>
