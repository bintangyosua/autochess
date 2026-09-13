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
      Manusia tidak berpikir dengan tempo yang sama di setiap langkah. Langkah yang jelas
      dimainkan cepat, posisi yang rumit bikin berhenti lama. Setelan ini meniru itu
      dengan mempercepat atau memperlambat jeda dari "Jeda mode auto".
    </p>
    <ul class="effects">
      <li>
        <b>Dipercepat saat</b> → cuma ada satu langkah legal, ada skakmat, membalas makan,
        masih di pembukaan, atau langkah terbaik jauh lebih unggul dari yang lain.
      </li>
      <li>
        <b>Diperlambat saat</b> → dua langkah terbaik nilainya hampir sama, jadi "sulit
        memilih".
      </li>
    </ul>
    <p class="tip">
      Kalau dimatikan, semua langkah memakai jeda acak yang rata — pola yang lebih mudah
      dikenali sebagai bukan manusia.
    </p>
  {/snippet}

  <p class="lead">Langkah jelas dimainkan cepat, posisi sulit dipikir lebih lama.</p>

  <h3 class="group">
    Kecepatan langkah jelas
    <Hint label="Penjelasan: kecepatan langkah jelas">
      <p>
        Seberapa singkat jeda untuk langkah yang jelas. 100% berarti sama dengan jeda
        biasa, 35% berarti tinggal sepertiganya.
      </p>
      <ul class="effects">
        <li><b>Diturunkan</b> → langkah jelas makin kilat, hampir tanpa jeda.</li>
        <li><b>Dinaikkan</b> → langkah jelas tetap ditunggu cukup lama.</li>
        <li><b>100%</b> → langkah jelas tidak dipercepat sama sekali.</li>
      </ul>
    </Hint>
  </h3>
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

  <h3 class="group">
    Lama berpikir di posisi sulit
    <Hint label="Penjelasan: lama berpikir di posisi sulit">
      <p>
        Seberapa panjang jeda saat posisinya sulit. 100% berarti sama dengan jeda biasa,
        200% berarti dua kali lipat.
      </p>
      <ul class="effects">
        <li><b>Dinaikkan</b> → di posisi rumit, berhenti jauh lebih lama.</li>
        <li><b>Diturunkan</b> → posisi rumit tidak terlalu diperlambat.</li>
        <li><b>100%</b> → posisi sulit tidak diperlambat sama sekali.</li>
      </ul>
      <p class="tip">
        Hati-hati menaikkannya di game cepat — jeda panjang bisa menghabiskan jam. "Sadar
        sisa waktu" akan membantu menahannya.
      </p>
    </Hint>
  </h3>
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
        Berapa langkah awal game yang dianggap "hafalan" dan dimainkan cepat. Dihitung per
        setengah langkah: angka 10 berarti 5 langkah putih + 5 langkah hitam.
      </p>
      <ul class="effects">
        <li><b>Dinaikkan</b> → lebih banyak langkah awal yang dimainkan cepat.</li>
        <li><b>Diturunkan</b> → cepat hanya di beberapa langkah pertama.</li>
        <li><b>0</b> → pembukaan diperlakukan sama seperti langkah lainnya.</li>
      </ul>
      <p class="tip">
        Makin awal langkahnya makin cepat, lalu melambat perlahan — bukan cepat terus lalu
        tiba-tiba normal.
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
