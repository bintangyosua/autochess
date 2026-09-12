<script lang="ts">
  /**
   * Daftar pilihan.
   *
   * Digambar seperti kolom isian — ditekan ke dalam permukaan — karena memang itulah
   * yang ia lakukan: menerima pilihan, bukan menjalankan tindakan. Panah bawaannya
   * dibuang dan diganti satu yang digambar sendiri, supaya bentuknya tidak berubah-ubah
   * antara Chrome di Windows dan Chrome di macOS.
   */
  interface Props {
    value: string;
    aria: string;
    options: { id: string; label: string }[];
    disabled?: boolean;
    onchange: (id: string) => void;
  }

  const { value, aria, options, disabled = false, onchange }: Props = $props();
</script>

<div class="wrap" class:disabled>
  <select
    aria-label={aria}
    {value}
    {disabled}
    onchange={(e) => onchange(e.currentTarget.value)}
  >
    {#each options as option (option.id)}
      <option value={option.id}>{option.label}</option>
    {/each}
  </select>
  <span class="arrow" aria-hidden="true">▾</span>
</div>

<style>
  .wrap {
    position: relative;
    margin-left: auto;
    display: inline-flex;
    align-items: center;
  }

  select {
    -webkit-appearance: none;
    appearance: none;
    padding: 10px 34px 10px 16px;
    border: 0;
    border-radius: 999px;
    background: var(--fill-press);
    box-shadow: var(--press-sm);
    color: var(--ink);
    font: inherit;
    font-size: 13.5px;
    cursor: pointer;
  }

  select:focus-visible {
    outline: none;
    box-shadow:
      var(--press-sm),
      0 0 0 3px var(--accent-soft);
  }

  .arrow {
    position: absolute;
    right: 15px;
    color: var(--ink-faint);
    font-size: 10px;
    pointer-events: none;
  }

  .disabled {
    opacity: 0.5;
  }

  .disabled select {
    cursor: default;
  }
</style>
