<script lang="ts">
  import Card from '../ui/Card.svelte';
  import Button from '../ui/Button.svelte';
  import Slider from '../ui/Slider.svelte';
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
      Waktu acak antara hasil engine dan bidak mendarat di papan. Angka ini untuk langkah
      utuh — jeda antar-klik diambil dari dalamnya, bukan ditambahkan di atasnya. Waktu
      berpikir engine sendiri diatur lewat depth di blok Engine.
    </p>
    <p>
      Dua rentang, dipilih menurut langkahnya. Langkah memakan biasanya pantas lebih
      cepat: bidak lawan sudah berdiri di kotak tujuan, jadi langkah itu tidak perlu
      dicari — berlama-lama sebelum memakan justru terbaca lebih aneh daripada langsung.
    </p>
  {/snippet}

  <p class="lead">Waktu acak antara hasil engine dan bidak mendarat di papan.</p>

  <h3 class="group">Langkah tenang</h3>
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

  <h3 class="group">Langkah memakan</h3>
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
