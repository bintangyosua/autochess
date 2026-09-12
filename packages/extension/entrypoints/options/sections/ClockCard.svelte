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
      Tempo dipercepat saat jam menipis. Tanpa ini, ekstensi memakai tempo yang sama di
      detik pertama dan detik terakhir — dan itu buruk dua kali: tidak ada manusia yang
      tenang berpikir sedetik penuh dengan sisa delapan detik, dan kamu kalah karena
      kehabisan waktu di posisi yang menang.
    </p>
  {/snippet}

  <p class="lead">Tempo dipercepat saat jam menipis.</p>

  <h3 class="group">Mulai mempercepat di</h3>
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
    Tempo tercepat
    <Hint label="Penjelasan: tempo tercepat">
      <p>
        Turun mulus dari 100% di ambang atas sampai angka ini saat waktu habis, bukan
        melompat di satu titik — lompatan mendadak justru pola tersendiri.
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
    Batas per langkah
    <Hint label="Penjelasan: batas per langkah">
      <p>
        Bagian terbesar dari sisa waktu yang boleh dihabiskan satu langkah. Pagar yang
        berdiri sendiri, terpisah dari pengali di atas: tanpa ini, rentang jeda 3 detik
        akan menghabiskan sisa waktu 4 detik.
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
