<script lang="ts">
  import Card from '../ui/Card.svelte';
  import Toggle from '../ui/Toggle.svelte';
  import Slider from '../ui/Slider.svelte';
  import Hint from '../ui/Hint.svelte';
  import { settings } from '../settings.svelte';

  const think = $derived(settings.think.think);
  const off = $derived(!think.enabled);

  /** Nilai di storage pecahan 0..1; slider bekerja dalam persen supaya stepnya bulat. */
  const pct = (value: number): number => Math.round(value * 100);
</script>

<Card title="Waktu ikut posisi">
  {#snippet action()}
    <Toggle
      label="Aktifkan waktu berpikir adaptif"
      checked={think.enabled}
      onchange={(on) => settings.patchThink({ enabled: on })}
    />
  {/snippet}

  {#snippet hint()}
    <p>
      Jeda di blok "Jeda mode auto" jadi tempo dasar, lalu dikali menurut posisinya.
      Manusia melangkah nyaris refleks saat cuma ada satu langkah legal atau saat
      membalas makan di kotak yang sama, dan diam lama justru ketika beberapa langkah
      terlihat sama bagusnya. Jeda acak merata adalah bentuk sebaran yang tidak pernah
      dihasilkan manusia — dan sebaran waktu jauh lebih mudah diuji daripada gerakan
      tetikus.
    </p>
    <p>
      Yang membuat cepat: satu-satunya langkah legal, skakmat terlihat, balasan makan,
      langkah pembukaan, dan langkah terbaik yang unggul telak. Yang membuat lambat: skor
      dua langkah teratas berdekatan.
    </p>
  {/snippet}

  <p class="lead">Tempo dasar dikali menurut sulitnya posisi.</p>

  <h3 class="group">Pengali langkah jelas</h3>
  <Slider
    label="cepat"
    aria="Pengali untuk langkah yang jelas"
    min={10}
    max={100}
    step={5}
    disabled={off}
    value={pct(think.easy)}
    display={`${pct(think.easy)}%`}
    onchange={(v) => settings.patchThink({ easy: v / 100 })}
  />

  <h3 class="group">Pengali posisi sulit</h3>
  <Slider
    label="lambat"
    aria="Pengali untuk posisi sulit"
    min={100}
    max={400}
    step={10}
    disabled={off}
    value={pct(think.hard)}
    display={`${pct(think.hard)}%`}
    onchange={(v) => settings.patchThink({ hard: v / 100 })}
  />

  <h3 class="group">
    Panjang pembukaan
    <Hint label="Penjelasan: panjang pembukaan">
      <p>
        Dihitung dalam setengah-langkah, jadi 10 berarti lima langkah pertama tiap sisi.
        Makin dekat ke langkah pertama, makin cepat — bukan cepat merata lalu berhenti
        mendadak.
      </p>
    </Hint>
  </h3>
  <Slider
    label="langkah"
    aria="Panjang pembukaan dalam setengah-langkah"
    min={0}
    max={30}
    step={1}
    disabled={off}
    value={think.openingPlies}
    display={`${think.openingPlies}`}
    onchange={(v) => settings.patchThink({ openingPlies: v })}
  />
</Card>
