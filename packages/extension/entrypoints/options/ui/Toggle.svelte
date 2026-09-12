<script lang="ts">
  /**
   * Sakelar aktif/mati.
   *
   * Bentuknya alur yang ditekan ke dalam dengan kenop yang menonjol keluar — kebalikan
   * dari kartu yang memuatnya, jadi ia terbaca sebagai lubang di permukaan dan bukan
   * tombol lain. Saat menyala alurnya diisi aksen: di sinilah kontras rendah harus
   * ditinggalkan, karena "menyala atau mati" adalah satu-satunya hal di kartu ini yang
   * salah bacanya paling mahal.
   *
   * Kotak centang aslinya tetap ada, cuma disembunyikan dari mata: keyboard, pembaca
   * layar, dan klik pada teks label semuanya ikut bekerja tanpa satu baris kode pun.
   */
  interface Props {
    checked: boolean;
    /** Dibaca pembaca layar; teks di sebelah kenop hanya "aktif"/"mati". */
    label: string;
    disabled?: boolean;
    onchange: (on: boolean) => void;
  }

  const { checked, label, disabled = false, onchange }: Props = $props();
</script>

<label class="toggle" class:on={checked} class:disabled>
  <input
    type="checkbox"
    aria-label={label}
    {checked}
    {disabled}
    onchange={(e) => onchange(e.currentTarget.checked)}
  />
  <span class="track"><span class="knob"></span></span>
  <span class="text">{checked ? 'aktif' : 'mati'}</span>
</label>

<style>
  .toggle {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--ink-soft);
    font-size: 13px;
    cursor: pointer;
    user-select: none;
  }

  .toggle.disabled {
    opacity: 0.45;
    cursor: default;
  }

  /* Tetap di alur fokus dan tetap terbaca pembaca layar, hanya tidak digambar. */
  input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    clip-path: inset(50%);
    overflow: hidden;
    white-space: nowrap;
  }

  .track {
    position: relative;
    width: 58px;
    height: 32px;
    flex: none;
    border-radius: 999px;
    background: var(--fill-press);
    box-shadow: var(--press-sm);
    transition:
      background 280ms var(--ease),
      box-shadow 280ms var(--ease);
  }

  .knob {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--fill-raise);
    box-shadow: var(--raise-sm);
    /* Sedikit melewati tujuannya lalu kembali. Kenop yang berhenti tepat di ujung
       terbaca seperti gambar yang berpindah; yang memantul sedikit terbaca seperti benda
       yang punya bobot. */
    transition: transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .toggle.on .track {
    /* Saat menyala, alurnya berhenti jadi lubang: ia terisi. Bayangan dalamnya diganti
       satu bayangan gelap tipis supaya kenopnya tetap terbaca menempel di atasnya, dan
       satu pendar aksen di luar supaya isinya terasa menyala, bukan sekadar diwarnai. */
    background: var(--accent);
    box-shadow:
      inset 0 2px 5px rgb(0 0 0 / 0.32),
      0 0 14px -2px var(--accent);
  }

  .toggle.on .knob {
    transform: translateX(26px);
  }

  .toggle.on .text {
    color: var(--ink);
    font-weight: 600;
  }

  input:focus-visible + .track {
    box-shadow:
      var(--press-sm),
      0 0 0 3px var(--accent-soft);
  }

  .toggle.on input:focus-visible + .track {
    box-shadow:
      inset 0 2px 5px rgb(0 0 0 / 0.32),
      0 0 0 3px var(--accent-soft);
  }
</style>
