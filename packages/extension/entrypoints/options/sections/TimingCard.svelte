<script lang="ts">
  import Card from '../ui/Card.svelte';
  import Button from '../ui/Button.svelte';
  import Slider from '../ui/Slider.svelte';
  import Hint from '../ui/Hint.svelte';
  import { settings, seconds } from '../settings.svelte';
  import { TIMING_MAX_MS, TIMING_MIN_MS, TIMING_STEP_MS } from '../../../lib/settings';
</script>

<Card title="Jeda mode auto">
  {#snippet action()}
    {#if settings.timingChanged}
      <Button variant="quiet" onclick={() => settings.resetTiming()}>
        kembalikan ke bawaan
      </Button>
    {:else}
      <span class="tag">bawaan</span>
    {/if}
    <span class="value">
      {seconds(settings.timing.minMs)}–{seconds(settings.timing.maxMs)}s ·
      {seconds(settings.timing.capture.minMs)}–{seconds(settings.timing.capture.maxMs)}s
    </span>
  {/snippet}

  {#snippet hint()}
    <p>
      Setelah engine menemukan langkah, mode auto tidak langsung memainkannya. Ia menunggu
      sebentar dulu — lamanya diambil acak di antara angka <b>min</b> dan <b>maks</b> —
      supaya tidak terlihat seperti mesin.
    </p>
    <p>
      Waktu ini sudah termasuk gerakan kursor dan kliknya, bukan tambahan di atasnya.
    </p>
    <p>
      Ada dua rentang: satu untuk langkah biasa, satu untuk langkah memakan. Langkah
      memakan dibuat lebih cepat karena manusia juga begitu — bidak lawan sudah jelas
      terlihat, tidak perlu dipikir lama.
    </p>
    <p class="tip">
      Jeda ini masih bisa dipercepat atau diperlambat lagi oleh "Waktu ikut posisi" dan
      "Sadar sisa waktu".
    </p>
  {/snippet}

  <p class="lead">Berapa lama menunggu sebelum langkah dimainkan.</p>

  <h3 class="group">
    Langkah biasa
    <Hint label="Penjelasan: jeda langkah biasa">
      <p>Jeda untuk langkah yang tidak memakan bidak.</p>
      <ul class="effects">
        <li><b>Min dinaikkan</b> → tidak pernah ada langkah yang terlalu cepat.</li>
        <li><b>Maks dinaikkan</b> → sesekali ada langkah yang lama, seperti sedang mikir.</li>
        <li><b>Keduanya diturunkan</b> → main lebih cepat, cocok untuk bullet/blitz.</li>
        <li><b>Min dan maks berjauhan</b> → temponya lebih bervariasi, lebih manusiawi.</li>
      </ul>
      <p class="tip">
        Kalau min digeser melewati maks, maks ikut terdorong — begitu juga sebaliknya.
      </p>
    </Hint>
  </h3>
  <Slider
    label="min"
    aria="Jeda minimum (ms)"
    min={TIMING_MIN_MS}
    max={TIMING_MAX_MS}
    step={TIMING_STEP_MS}
    value={settings.timing.minMs}
    number
    unit="ms"
    onchange={(v) => settings.setTiming('minMs', v)}
  />
  <Slider
    label="maks"
    aria="Jeda maksimum (ms)"
    min={TIMING_MIN_MS}
    max={TIMING_MAX_MS}
    step={TIMING_STEP_MS}
    value={settings.timing.maxMs}
    number
    unit="ms"
    onchange={(v) => settings.setTiming('maxMs', v)}
  />

  <h3 class="group">
    Langkah memakan
    <Hint label="Penjelasan: jeda langkah memakan">
      <p>Jeda khusus saat langkahnya memakan bidak lawan.</p>
      <ul class="effects">
        <li><b>Dinaikkan</b> → berhenti lebih lama sebelum memakan.</li>
        <li><b>Diturunkan</b> → memakan hampir langsung, seperti refleks.</li>
      </ul>
      <p class="tip">
        Sebaiknya tetap lebih pendek dari jeda langkah biasa. Berlama-lama sebelum memakan
        bidak yang jelas-jelas bisa dimakan justru terlihat aneh.
      </p>
    </Hint>
  </h3>
  <Slider
    label="min"
    aria="Jeda minimum saat memakan (ms)"
    min={TIMING_MIN_MS}
    max={TIMING_MAX_MS}
    step={TIMING_STEP_MS}
    value={settings.timing.capture.minMs}
    number
    unit="ms"
    onchange={(v) => settings.setCaptureTiming('minMs', v)}
  />
  <Slider
    label="maks"
    aria="Jeda maksimum saat memakan (ms)"
    min={TIMING_MIN_MS}
    max={TIMING_MAX_MS}
    step={TIMING_STEP_MS}
    value={settings.timing.capture.maxMs}
    number
    unit="ms"
    onchange={(v) => settings.setCaptureTiming('maxMs', v)}
  />
</Card>
