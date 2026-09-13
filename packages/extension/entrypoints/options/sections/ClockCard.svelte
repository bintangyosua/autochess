<script lang="ts">
  import Card from '../ui/Card.svelte';
  import Toggle from '../ui/Toggle.svelte';
  import Slider from '../ui/Slider.svelte';
  import Hint from '../ui/Hint.svelte';
  import { settings } from '../settings.svelte';

  const clock = $derived(settings.think.clock);
  const off = $derived(!clock.enabled);

  const pct = (value: number): number => Math.round(value * 100);
</script>

<Card title="Sadar sisa waktu">
  {#snippet action()}
    <Toggle
      label="Aktifkan kesadaran jam"
      checked={clock.enabled}
      onchange={(on) => settings.patchClock({ enabled: on })}
    />
  {/snippet}

  {#snippet hint()}
    <p>
      Saat jam-mu hampir habis, mode auto main lebih cepat — seperti manusia yang panik
      dikejar waktu.
    </p>
    <ul class="effects">
      <li><b>Aktif</b> → tempo makin cepat saat waktu menipis, jadi lebih jarang kalah waktu.</li>
      <li>
        <b>Mati</b> → tempo sama saja di detik pertama dan terakhir. Kamu bisa kalah waktu
        padahal posisinya menang.
      </li>
    </ul>
    <p class="tip">Sebaiknya selalu aktif, terutama di blitz dan bullet.</p>
  {/snippet}

  <p class="lead">Main makin cepat saat jam hampir habis.</p>

  <h3 class="group">
    Mulai panik di sisa
    <Hint label="Penjelasan: mulai panik di sisa">
      <p>Saat jam-mu tinggal sekian detik, tempo mulai dipercepat.</p>
      <ul class="effects">
        <li><b>Dinaikkan</b> → mulai buru-buru lebih awal. Lebih aman dari kalah waktu.</li>
        <li><b>Diturunkan</b> → tetap santai sampai waktunya benar-benar mepet.</li>
      </ul>
      <p class="tip">
        Untuk bullet (1 menit) coba 15–20 detik. Untuk blitz dan rapid, 30 detik sudah
        cukup.
      </p>
    </Hint>
  </h3>
  <Slider
    label="sisa"
    aria="Sisa waktu saat mulai mempercepat"
    min={5}
    max={120}
    step={5}
    disabled={off}
    value={clock.panicSeconds}
    display={`${clock.panicSeconds}s`}
    onchange={(v) => settings.patchClock({ panicSeconds: v })}
  />

  <h3 class="group">
    Kecepatan saat panik
    <Hint label="Penjelasan: kecepatan saat panik">
      <p>
        Seberapa cepat tempo saat waktu hampir nol. 100% berarti tidak dipercepat, 20%
        berarti jeda tinggal seperlimanya.
      </p>
      <ul class="effects">
        <li><b>Diturunkan</b> → di detik-detik terakhir main nyaris instan.</li>
        <li><b>Dinaikkan</b> → tetap agak tenang walau waktu hampir habis.</li>
      </ul>
      <p class="tip">
        Percepatannya bertahap — makin sedikit waktu, makin cepat — bukan melompat
        tiba-tiba.
      </p>
    </Hint>
  </h3>
  <Slider
    label="panik"
    aria="Tempo tercepat saat waktu menipis"
    min={5}
    max={100}
    step={5}
    disabled={off}
    value={pct(clock.panicFactor)}
    display={`${pct(clock.panicFactor)}%`}
    onchange={(v) => settings.patchClock({ panicFactor: v / 100 })}
  />

  <h3 class="group">
    Batas waktu per langkah
    <Hint label="Penjelasan: batas waktu per langkah">
      <p>
        Satu langkah tidak boleh memakan lebih dari sekian persen sisa jam-mu, berapa pun
        jeda yang diatur di tempat lain.
      </p>
      <ul class="effects">
        <li><b>Diturunkan</b> → langkah selalu hemat waktu. Paling aman.</li>
        <li><b>Dinaikkan</b> → boleh berpikir lama walau sisa waktu sedikit.</li>
      </ul>
      <p class="tip">
        Contoh: dengan 6% dan sisa 10 detik, satu langkah paling lama 0,6 detik.
      </p>
    </Hint>
  </h3>
  <Slider
    label="maks"
    aria="Bagian terbesar sisa waktu untuk satu langkah"
    min={1}
    max={30}
    step={1}
    disabled={off}
    value={pct(clock.maxShare)}
    display={`${pct(clock.maxShare)}%`}
    onchange={(v) => settings.patchClock({ maxShare: v / 100 })}
  />
</Card>
