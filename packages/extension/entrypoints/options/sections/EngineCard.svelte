<script lang="ts">
  /**
   * Satu engine dengan seluruh setelannya.
   *
   * Blok mana yang muncul berbeda-beda per engine, dan itu bukan kebetulan: tiap engine
   * memang menyediakan tombol yang berbeda. Maia tidak punya depth karena mode policy
   * hanya menghitung satu node; Stockfish tidak punya kepribadian karena engine-nya
   * tidak menyediakannya. Jadi tiap blok berdiri di belakang syaratnya sendiri, bukan
   * digambar abu-abu.
   */
  import type { ProviderInfo } from '@cmr/shared';
  import Toggle from '../ui/Toggle.svelte';
  import Slider from '../ui/Slider.svelte';
  import Select from '../ui/Select.svelte';
  import Button from '../ui/Button.svelte';
  import Hint from '../ui/Hint.svelte';
  import { settings } from '../settings.svelte';
  import { ARROWS_MAX, ARROWS_MIN, DEPTH_MAX, DEPTH_MIN, supportsDepth } from '../../../lib/settings';

  interface Props {
    provider: ProviderInfo;
  }

  const { provider }: Props = $props();

  const on = $derived(settings.isOn(provider));
  const live = $derived(provider.ready && on);
  const hasDepth = $derived(supportsDepth(provider.kind));
</script>

<li class="engine" class:dim={!live}>
  <div class="head">
    <span class="dot" class:live></span>
    <span class="name">{provider.label}</span>
    <!-- Sakelarnya di baris nama, bukan di dalam blok setelan: ini bukan salah satu dari
         setelan itu, melainkan yang menentukan semuanya berlaku atau tidak. -->
    <Toggle
      label={`Aktifkan ${provider.label}`}
      checked={on}
      onchange={(next) => settings.toggleEngine(provider, next)}
    />
  </div>

  {#if !on}
    <p class="fine">
      Dimatikan: tidak diminta menghitung dan panahnya tidak digambar. Setelan di bawah
      tetap tersimpan dan berlaku lagi begitu dinyalakan.
    </p>
  {/if}

  {#if hasDepth}
    {@const value = settings.depthOf(provider)}
    <div class="field first">
      <div class="head">
        <span class="label">Depth</span>
        <Hint label={`Penjelasan depth ${provider.label}`}>
          <p>
            Seberapa jauh engine berpikir. Kalau depth-nya rendah, ia sudah lebih lemah
            daripada Elo mana pun di bawah — dan slider Kekuatan jadi tidak berefek.
          </p>
          <!-- Hubungan ini tidak terduga sampai kamu menemukannya sendiri: daftar
               kelanjutan di panel rekomendasi terasa "kosong" padahal engine memang belum
               menghitung sejauh itu. -->
          <p>
            Ini juga yang menentukan panjang daftar kelanjutan di panel rekomendasi:
            engine hanya melaporkan garis sejauh yang ia cari. Di depth 1–2 tidak ada
            kelanjutan sama sekali, di depth 4 sekitar empat langkah, dan baru dari
            sekitar depth 12 daftarnya benar-benar panjang.
          </p>
        </Hint>
        {#if settings.depths[provider.id] !== undefined}
          <Button variant="quiet" onclick={() => settings.resetDepth(provider)}>
            kembalikan ke bawaan
          </Button>
        {:else if provider.defaults?.depth !== undefined}
          <span class="tag">bawaan</span>
        {/if}
        <span class="value">d{value}</span>
      </div>
      <Slider
        aria={`Depth ${provider.label}`}
        min={DEPTH_MIN}
        max={DEPTH_MAX}
        step={1}
        {value}
        number
        onchange={(v) => settings.setDepth(provider, v)}
      />
    </div>
  {/if}

  <div class="field" class:first={!hasDepth}>
    <div class="head">
      <span class="label">Panah</span>
      <!-- Ini bukan sekadar setelan tampilan, dan bedanya perlu dikatakan: angkanya
           dikirim ke engine sebagai MultiPV. -->
      <Hint label={`Penjelasan panah ${provider.label}`}>
        <p>
          Berapa langkah teratas yang digambar di papan, lengkap dengan skornya. Yang
          pertama tebal, sisanya makin tipis.
        </p>
        <p>
          Angkanya juga dipakai sebagai <code>MultiPV</code> — jadi menaikkannya membuat
          engine menjaga lebih banyak baris sekaligus, dan tiap baris jadi sedikit lebih
          dangkal pada depth yang sama.
        </p>
      </Hint>
      {#if settings.arrows[provider.id] !== undefined}
        <Button variant="quiet" onclick={() => settings.resetArrows(provider)}>
          kembalikan ke bawaan
        </Button>
      {:else if provider.defaults?.multipv !== undefined}
        <span class="tag">bawaan</span>
      {/if}
      <span class="value">{settings.arrowsOf(provider)}</span>
    </div>
    <Slider
      aria={`Jumlah panah ${provider.label}`}
      min={ARROWS_MIN}
      max={ARROWS_MAX}
      step={1}
      value={settings.arrowsOf(provider)}
      number
      onchange={(v) => settings.setArrows(provider, v)}
    />
  </div>

  {#if provider.strength}
    <div class="field">
      <div class="head">
        <span class="label">Kekuatan</span>
        <!-- Perbedaan ini nyata dan tidak bisa disembunyikan: hanya Stockfish yang punya
             UCI_Elo. Sisanya dipetakan ke skala Skill, jadi angkanya perkiraan. -->
        <Hint label={`Penjelasan kekuatan ${provider.label}`}>
          <p>
            {#if provider.strength.mode === 'skill'}
              Perkiraan — engine ini tidak punya <code>UCI_Elo</code>, angkanya dipetakan
              ke <code>Skill</code> 0–{provider.strength.levels}.
            {:else}
              Native <code>UCI_Elo</code>, rentang {provider.strength.min}–{provider
                .strength.max}.
            {/if}
            Skalanya milik engine, bukan skala Chess.com atau Lichess.
          </p>
        </Hint>
        {#if settings.elos[provider.id] !== undefined}
          <Button variant="quiet" onclick={() => settings.resetElo(provider)}>
            kembalikan ke bawaan
          </Button>
        {/if}
        <span class="value">{settings.eloLabel(provider)}</span>
      </div>
      <Slider
        aria={`Elo ${provider.label}`}
        min={provider.strength.min}
        max={provider.strength.max}
        step={10}
        disabled={settings.dynamic.enabled}
        value={settings.eloOf(provider)}
        number
        onchange={(v) => settings.setElo(provider, v)}
      />
      {#if settings.dynamic.enabled}
        <!-- Slider yang mati tanpa penjelasan terbaca seperti bug. Nilainya tetap
             ditampilkan, bukan disembunyikan: ia yang dipakai lagi begitu mode dinamis
             dimatikan, atau saat rating tidak terbaca. -->
        <p class="fine">
          Tidak berlaku sekarang — "Kekuatan ikut rating" sedang menyala. Nilai ini
          tersimpan dan dipakai lagi kalau mode itu dimatikan, atau kalau rating tidak
          terbaca di halaman.
        </p>
      {/if}
    </div>
  {/if}

  {#if provider.personas?.length}
    <div class="field">
      <div class="head">
        <span class="label">Kepribadian</span>
        <Select
          aria={`Kepribadian ${provider.label}`}
          value={settings.personaOf(provider)}
          options={provider.personas}
          onchange={(id) => settings.setPersona(provider, id)}
        />
      </div>
      {#if settings.personaHint(provider)}
        <p class="fine">{settings.personaHint(provider)}</p>
      {/if}
    </div>
  {/if}

  {#if !provider.ready}
    <p class="problem">{provider.problem ?? 'engine tidak siap'}</p>
  {/if}
</li>

<style>
  .engine {
    padding: 22px 26px 24px;
    border-radius: var(--r-lg);
    background: var(--fill-raise);
    box-shadow: var(--raise);
    transition: box-shadow 320ms var(--ease);
  }

  .engine:hover:not(.dim) {
    box-shadow: var(--raise-lift);
  }

  /*
   * Engine yang mati ditekan ke dalam permukaan, bukan diredupkan sampai hampir hilang.
   * Bahasa halaman ini adalah kedalaman, dan "tidak aktif" punya terjemahan yang tepat
   * di dalamnya: tenggelam. Teksnya tetap terbaca penuh — setelan yang tersimpan masih
   * perlu bisa dibaca dan diubah selagi engine-nya mati.
   */
  .engine.dim {
    background: var(--fill-press);
    box-shadow: var(--press-sm);
  }

  /* Sama seperti baris judul kartu setelan: "kembalikan ke bawaan" dan nilai yang
     berlaku bisa muncul bersamaan di kolom selebar 320px. */
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
  }

  /* Lampu kesiapan: tenggelam saat mati, menyala terang saat siap. */
  .dot {
    width: 10px;
    height: 10px;
    flex: none;
    border-radius: 50%;
    background: var(--fill-press);
    box-shadow: var(--press-sm);
  }

  .dot.live {
    background: var(--ok);
    box-shadow: 0 0 10px 1px var(--ok);
  }

  .name {
    font-weight: 650;
  }

  .field {
    margin-top: 16px;
  }

  /* Yang pertama menempel langsung di bawah nama engine dan tidak butuh jarak penuh. */
  .field.first {
    margin-top: 12px;
  }

  .label {
    color: var(--ink-soft);
    font-size: 13px;
    font-weight: 600;
  }

  .problem {
    margin: 14px 0 0;
    padding: 11px 16px;
    border-left: 3px solid var(--warn);
    border-radius: var(--r-sm);
    background: var(--fill-press);
    box-shadow: var(--press-sm);
    color: var(--warn);
    font-size: 13px;
  }
</style>
