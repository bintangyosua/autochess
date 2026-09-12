<script lang="ts">
  /**
   * Satu teks tombol yang tercatat, bisa dicentang.
   *
   * Tercentang digambar sebagai permukaan yang DITEKAN ke dalam, bukan yang terangkat.
   * Arahnya sengaja begitu: yang belum dipilih menonjol seperti tombol yang menunggu
   * ditekan, yang sudah dipilih tenggelam seperti tombol yang sedang ditahan. Warna
   * aksen ditambahkan di atasnya, bukan menggantikannya — bentuk saja terlalu halus
   * untuk dibaca sekilas dari delapan chip berjejer.
   */
  interface Props {
    label: string;
    checked: boolean;
    disabled?: boolean;
    onchange: (on: boolean) => void;
  }

  const { label, checked, disabled = false, onchange }: Props = $props();
</script>

<label class="chip" class:on={checked} class:disabled title={label}>
  <input
    type="checkbox"
    {checked}
    {disabled}
    onchange={(e) => onchange(e.currentTarget.checked)}
  />
  <span class="text">{label}</span>
</label>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border-radius: 999px;
    background: var(--fill-raise);
    box-shadow: var(--raise-sm);
    color: var(--ink-soft);
    font-size: 13px;
    line-height: 1.2;
    cursor: pointer;
    transition:
      box-shadow 240ms var(--ease),
      transform 240ms var(--ease);
    /*
     * Teks tombolnya kalimat, bukan satu kata — "New 10 sec + 0.1", "Fair Play policy".
     * Dibiarkan membungkus di dalam chip, bentuknya jadi tinggi dan bulat tak karuan;
     * jadi tiap chip dipaksa satu baris, dan yang kepanjangan dipotong dengan elipsis.
     * Teks penuhnya tetap bisa dibaca lewat tooltip.
     */
    white-space: nowrap;
    /*
     * Jangan menyusut. Flex item boleh mengecil agar muat sebaris, dan dengan `overflow:
     * hidden` di dalamnya ia sanggup mengecil sampai tinggal satu huruf — delapan chip
     * berjejer jadi "F… N… L…" yang tidak bisa dibaca sama sekali. Yang benar adalah
     * membungkus ke baris berikutnya, dan itu baru terjadi kalau menyusut dilarang.
     */
    flex: none;
    max-width: 100%;
  }

  .chip:hover:not(.disabled):not(.on) {
    box-shadow: var(--raise);
    transform: translateY(-1px);
  }

  .chip.on {
    background: var(--fill-press);
    box-shadow: var(--press-sm);
    color: var(--accent);
    font-weight: 600;
  }

  .chip.disabled {
    opacity: 0.5;
    cursor: default;
  }

  .text {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  input {
    margin: 0;
    flex: none;
    cursor: inherit;
  }

  .chip:has(input:focus-visible) {
    box-shadow:
      var(--raise-sm),
      0 0 0 3px var(--accent-soft);
  }
</style>
