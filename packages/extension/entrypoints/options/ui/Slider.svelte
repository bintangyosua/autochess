<script lang="ts">
  /**
   * Satu baris slider: nama di kiri, alur di tengah, dan — kalau diminta — kolom angka
   * dan satuannya di kanan.
   *
   * Kolom angkanya opsional dengan sengaja. Ia berguna kalau nilainya memang diketik
   * (jeda dalam milidetik, batas jumlah game), dan cuma jadi bising kalau nilainya
   * persentase yang hanya masuk akal digeser. Halaman lama memakai dua bentuk baris yang
   * berbeda untuk dua kasus itu dan menuliskannya dua kali; di sini keduanya satu
   * komponen dengan satu prop.
   *
   * Slider dan kolom angka sengaja mendengar peristiwa yang berbeda: `oninput` untuk
   * slider supaya nilainya mengikuti jari, `onchange` untuk kolom angka supaya "150"
   * tidak sempat tersimpan sebagai "1" lalu "15" sementara masih diketik.
   */
  interface Props {
    /**
     * Teks pendek di kiri, mis. "min" atau "cepat". Lebarnya dipatok agar beberapa
     * slider bersebelahan punya alur yang mulai di titik yang sama. Boleh kosong kalau
     * slidernya sudah bernama oleh judul blok tepat di atasnya — kolom kosong selebar
     * 38px di sana terbaca seperti label yang lupa diisi.
     */
    label?: string;
    /** Dibaca pembaca layar — `label` terlalu pendek untuk berdiri sendiri. */
    aria: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    disabled?: boolean;
    /** Teks siap-pakai di kanan, mis. "75%" atau "30s". Tidak digabung dengan `number`. */
    display?: string;
    /** Tampilkan kolom angka yang bisa diketik. */
    number?: boolean;
    /** Satuan di kanan kolom angka, mis. "ms". */
    unit?: string;
    onchange: (value: number) => void;
  }

  const {
    label = '',
    aria,
    value,
    min,
    max,
    step = 1,
    disabled = false,
    display,
    number = false,
    unit,
    onchange,
  }: Props = $props();
</script>

<div class="row" class:disabled>
  {#if label}<span class="name">{label}</span>{/if}
  <input
    type="range"
    {min}
    {max}
    {step}
    {value}
    {disabled}
    aria-label={aria}
    oninput={(e) => onchange(e.currentTarget.valueAsNumber)}
  />
  {#if number}
    <input
      class="num"
      type="number"
      {min}
      {max}
      {step}
      {value}
      {disabled}
      aria-label={`${aria} (angka)`}
      onchange={(e) => onchange(e.currentTarget.valueAsNumber)}
    />
    {#if unit}<span class="unit">{unit}</span>{/if}
  {:else if display}
    <span class="value">{display}</span>
  {/if}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 10px;
  }

  /* Nama slider tidak ikut meredup saat slider dimatikan — yang mati kendalinya, dan
     namanya justru masih perlu dibaca untuk tahu apa yang sedang tidak berlaku. */
  .name {
    width: 46px;
    flex: none;
    color: var(--ink-soft);
    font-size: 13px;
  }

  .row.disabled .name {
    opacity: 0.55;
  }

  /* Kolom angka ditekan ke dalam permukaan: bentuk yang sama dipakai semua tempat di
     halaman ini yang menerima ketikan. */
  .num {
    width: 80px;
    flex: none;
    padding: 11px 14px;
    border: 0;
    border-radius: 999px;
    background: var(--fill-press);
    box-shadow: var(--press-sm);
    color: var(--ink);
    font: inherit;
    font-size: 13.5px;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .num:focus-visible {
    outline: none;
    box-shadow:
      var(--press-sm),
      0 0 0 3px var(--accent-soft);
  }

  .num:disabled {
    opacity: 0.45;
  }

  .unit {
    flex: none;
    color: var(--ink-faint);
    font-size: 12.5px;
  }
</style>
