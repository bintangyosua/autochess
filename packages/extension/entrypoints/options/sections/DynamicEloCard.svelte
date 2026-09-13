<script lang="ts">
  import Card from '../ui/Card.svelte';
  import Toggle from '../ui/Toggle.svelte';
  import Slider from '../ui/Slider.svelte';
  import Hint from '../ui/Hint.svelte';
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
      Kekuatan engine diatur otomatis dari rating-mu yang tampil di halaman, ditambah
      sedikit selisih. Jadi engine selalu main sedikit di atas levelmu — tidak terlalu
      jago sampai mencurigakan.
    </p>
    <p>
      Contoh: rating-mu 1200 dan selisihnya +50 sampai +150, engine main di kisaran
      1250–1350. Angka pastinya diacak sekali tiap game, supaya kekuatannya tidak persis
      sama terus.
    </p>
    <ul class="effects">
      <li><b>Aktif</b> → slider "Kekuatan" di setiap engine diabaikan.</li>
      <li><b>Mati</b> → slider "Kekuatan" per engine yang dipakai.</li>
    </ul>
    <p class="tip">
      Engine punya batas bawah. Stockfish tidak bisa lebih lemah dari 1320 — kalau
      rating-mu 800, ia tetap main di 1320. Kalau rating tidak terbaca (misalnya lawan
      bot), slider per engine yang dipakai.
    </p>
  {/snippet}

  <p class="lead">Engine main sedikit di atas rating-mu, diatur otomatis.</p>

  <h3 class="group">
    Selisih dari rating-mu
    <Hint label="Penjelasan: selisih dari rating">
      <p>
        Berapa poin engine lebih kuat (atau lebih lemah) dari rating-mu. Tiap game diambil
        angka acak di antara min dan maks.
      </p>
      <ul class="effects">
        <li><b>Dinaikkan</b> → engine makin kuat dibanding kamu. Lebih sering menang.</li>
        <li><b>Diturunkan</b> → engine makin dekat dengan levelmu. Lebih wajar.</li>
        <li><b>Angka minus</b> → engine sengaja lebih lemah dari kamu.</li>
        <li><b>Min = maks</b> → selisihnya selalu sama persis tiap game.</li>
      </ul>
      <p class="tip">
        Selisih yang terlalu besar membuat rating naik terlalu cepat, dan lonjakan
        seperti itu mudah terlihat mencurigakan.
      </p>
    </Hint>
  </h3>
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
