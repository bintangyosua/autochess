<script lang="ts">
  import {
    autoPlayProviderId,
    overlay,
    setAutoPlayProvider,
    toggleArrow,
    toggleAutoPlay,
    togglePanel,
    type ProviderView,
  } from '../../lib/overlayState.svelte';


  /**
   * Papan digambar sebagai grid 8x8 lewat viewBox, jadi koordinat panah ditulis dalam
   * satuan kotak dan ikut menyesuaikan berapa pun ukuran papan di layar.
   */
  function toXY(square: string): { x: number; y: number } {
    const file = square.charCodeAt(0) - 96; // a=1
    const rank = Number(square[1]);
    return overlay.orientation === 'white'
      ? { x: file - 0.5, y: 8 - rank + 0.5 }
      : { x: 8 - file + 0.5, y: rank - 0.5 };
  }

  interface Arrow {
    key: string;
    x1: number; y1: number; x2: number; y2: number;
    color: string; width: number; opacity: number;
    /** Kosong = garis penuh. Diisi hanya untuk panah balasan. */
    dash: string;
    head: number;
  }

  function buildArrow(key: string, uci: string, view: ProviderView, reply: boolean): Arrow {
    const from = toXY(uci.slice(0, 2));
    const to = toXY(uci.slice(2, 4));
    // Pendekkan ujung panah supaya kepalanya berhenti di tepi kotak tujuan,
    // bukan menutupi bidak yang ada di sana.
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const trim = 0.3;
    const width = view.kind === 'strength' ? 0.13 : 0.1;
    const opacity = view.kind === 'strength' ? 0.9 : 0.75;
    return {
      key,
      x1: from.x, y1: from.y,
      x2: to.x - (dx / len) * trim,
      y2: to.y - (dy / len) * trim,
      color: view.color,
      width: reply ? width * 0.55 : width,
      opacity: reply ? opacity * 0.45 : opacity,
      dash: reply ? '0.17 0.13' : '',
      head: reply ? 2.6 : 3.2,
    };
  }

  /**
   * Per provider digambar dua panah: langkah terbaik untuk sisi yang jalan, dan —
   * kalau ada — balasan terbaik atas langkah itu.
   *
   * Panah balasan diambil dari langkah kedua principal variation, jadi tidak menambah
   * beban engine sama sekali. Gunanya paling terasa saat giliran lawan: kalau lawan
   * benar-benar memainkan langkah terbaiknya, panah putus-putus itulah jawaban yang
   * bisa kamu premove.
   *
   * Perhatikan bahwa panah ini bersyarat. Begitu lawan memainkan langkah lain, balasan
   * itu belum tentu masih yang terbaik — karena itu digambar tipis dan putus-putus,
   * bukan sekuat panah utama.
   *
   * Maia tidak pernah menghasilkannya: mode policy hanya menghitung satu node, jadi
   * tidak ada PV, dan `pv?.[1]` di bawah otomatis kosong tanpa perlu pengecualian.
   */
  const arrows = $derived<Arrow[]>(
    Object.entries(overlay.providers).flatMap(([id, view]) => {
      const best = view.suggestions[0];
      if (!best || !view.arrowVisible) return [];

      const out = [buildArrow(id, best.uci, view, false)];
      const reply = best.pv?.[1];
      if (reply) out.push(buildArrow(`${id}-reply`, reply, view, true));
      return out;
    }),
  );

  function scoreText(s: Suggestion, kind: ProviderView['kind']): string {
    if (s.mateIn !== undefined) return `#${s.mateIn}`;
    if (kind === 'human-like' && s.policy !== undefined) return `${(s.policy * 100).toFixed(0)}%`;
    if (s.scoreCp !== undefined) return (s.scoreCp > 0 ? '+' : '') + (s.scoreCp / 100).toFixed(2);
    return '';
  }

  type Suggestion = ProviderView['suggestions'][number];
  const views = $derived(Object.entries(overlay.providers));
</script>

{#if overlay.visible && overlay.rect.width > 0}
  <!--
    Overlay memposisikan dirinya sendiri terhadap viewport. Shadow host tidak dipakai
    sebagai acuan ukuran sama sekali, jadi styling WXT tidak bisa mengacaukan geometri.
  -->
  <div
    class="root"
    style="left:{overlay.rect.left}px; top:{overlay.rect.top}px; width:{overlay.rect
      .width}px; height:{overlay.rect.height}px;"
  >
    <svg class="arrows" viewBox="0 0 8 8" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {#each arrows as arrow (arrow.key)}
          <marker
            id="head-{arrow.key}"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth={arrow.head}
            markerHeight={arrow.head}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={arrow.color} opacity={arrow.opacity} />
          </marker>
        {/each}
      </defs>

      {#each arrows as arrow (arrow.key)}
        <line
          x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2}
          stroke={arrow.color}
          stroke-width={arrow.width}
          stroke-linecap="round"
          stroke-dasharray={arrow.dash}
          opacity={arrow.opacity}
          marker-end="url(#head-{arrow.key})"
        />
      {/each}
    </svg>

    <!--
      Tombolnya ikut di dalam panel dan tetap ada saat isinya disembunyikan, supaya
      selalu ada jalan untuk mengembalikannya tanpa membuka menu ekstensi.
    -->
    <div class="panel" class:collapsed={!overlay.panelVisible}>
      <div class="bar">
        {#if overlay.panelVisible}<span class="dim">analisis</span>{/if}
        <div class="tools">
        <button
          type="button"
          class="toggle"
          class:on={overlay.autoPlay.enabled}
          aria-pressed={overlay.autoPlay.enabled}
          title={overlay.autoPlay.enabled
            ? 'Matikan mode auto'
            : 'Mainkan langkah engine otomatis saat giliranmu'}
          onclick={toggleAutoPlay}
        >
          {'▶'}
        </button>
        <button
          type="button"
          class="toggle"
          aria-pressed={overlay.panelVisible}
          title={overlay.panelVisible
            ? 'Sembunyikan data (panah tetap tampil)'
            : 'Tampilkan data analisis'}
          onclick={togglePanel}
        >
          {overlay.panelVisible ? '×' : 'i'}
        </button>
        </div>
      </div>

      {#if overlay.panelVisible}
        {#if overlay.autoPlay.enabled}
          <!-- Engine mana yang dituruti harus terlihat, bukan tersembunyi di
               pengaturan: tiga engine di panel sering menyarankan langkah berbeda. -->
          <div class="auto">
            <span class="dim">auto</span>
            <select
              value={autoPlayProviderId() ?? ''}
              onchange={(e) => setAutoPlayProvider(e.currentTarget.value)}
              aria-label="Engine untuk mode auto"
            >
              {#each views as [id, view] (id)}
                <option value={id}>{view.label}</option>
              {/each}
            </select>
          </div>
          {#if overlay.autoPlay.message}
            <p class="auto-msg">{overlay.autoPlay.message}</p>
          {/if}
        {/if}

        {#each views as [id, view] (id)}
          <section class:muted={!view.arrowVisible}>
            <button
              type="button"
              class="head"
              aria-pressed={view.arrowVisible}
              title={view.arrowVisible ? 'Sembunyikan panah' : 'Tampilkan panah'}
              onclick={() => toggleArrow(id)}
            >
              <span
                class="swatch"
                style={view.arrowVisible
                  ? `background:${view.color}; border-color:${view.color}`
                  : `background:transparent; border-color:${view.color}`}
              ></span>
              <strong>{view.label}</strong>
              {#if view.depth}<span class="dim">d{view.depth}</span>{/if}
              {#if view.status === 'thinking'}<span class="dim">...</span>{/if}
            </button>

            {#if view.suggestions.length > 0}
              <!-- Tampilkan semua yang dikirim engine; jumlahnya diatur lewat `multipv`
                   per provider di content script, bukan dipotong di sini. -->
              <ol>
                {#each view.suggestions as s, i (s.uci)}
                  <li class:best={i === 0}>
                    <span class="move">{s.san ?? s.uci}</span>
                    <span class="score">{scoreText(s, view.kind)}</span>
                  </li>
                {/each}
              </ol>
            {:else}
              <p class="dim">{overlay.note || '—'}</p>
            {/if}
          </section>
        {:else}
          <p class="dim">menunggu posisi...</p>
        {/each}

        <!-- Hak rokade memang selalu ditebak sampai move list terbaca; itu normal dan
             tidak perlu diperingatkan. Yang berbahaya adalah giliran yang salah baca. -->
        {#if !overlay.turnKnown}
          <p class="warn" title={overlay.assumptions.join('\n')}>giliran ditebak</p>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  .root {
    position: fixed;
    pointer-events: none;
    z-index: 2147483000;
  }

  .arrows {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .panel {
    /* Root-nya pointer-events:none supaya papan tetap bisa dimainkan; panel
       mengaktifkannya lagi agar tombolnya bisa diklik. */
    pointer-events: auto;
    position: absolute;
    top: 4px;
    right: 4px;
    min-width: 116px;
    /* Dengan multipv besar daftarnya bisa lebih tinggi dari papan, jadi beri batas
       dan biarkan bagian dalamnya di-scroll. */
    max-height: calc(100% - 8px);
    overflow-y: auto;
    padding: 5px 7px;
    border-radius: 6px;
    background: rgba(24, 24, 27, 0.85);
    color: #f4f4f5;
    font: 11.5px/1.4 system-ui, sans-serif;
    backdrop-filter: blur(2px);
  }
  /* Saat terlipat, panel menyusut jadi sekadar tombol supaya papan hampir tidak
     tertutup sama sekali — dan sengaja dibuat redup agar tidak menarik perhatian. */
  .panel.collapsed {
    min-width: 0;
    padding: 2px;
    background: rgba(24, 24, 27, 0.55);
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .panel:not(.collapsed) .bar { margin-bottom: 3px; }
  .tools { display: flex; gap: 3px; }
  .toggle.on { background: #2563eb; color: #fff; }
  .toggle.on:hover { background: #3b82f6; }

  .auto {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 4px;
    padding-bottom: 4px;
    border-bottom: 1px solid #3f3f46;
  }
  .auto select {
    max-width: 96px;
    padding: 1px 3px;
    border: 1px solid #52525b;
    border-radius: 3px;
    background: #18181b;
    color: #f4f4f5;
    font: 11px/1.3 system-ui, sans-serif;
  }
  .auto-msg { margin: 0 0 4px; color: #86efac; font-size: 10.5px; }
  .toggle {
    flex: none;
    width: 15px;
    height: 15px;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.1);
    color: #d4d4d8;
    font: 600 11px/1 system-ui, sans-serif;
    cursor: pointer;
  }
  .toggle:hover { background: rgba(255, 255, 255, 0.22); color: #fff; }
  .toggle:focus-visible { outline: 1px solid #93c5fd; }

  section + section { margin-top: 5px; padding-top: 4px; border-top: 1px solid #3f3f46; }
  .head {
    display: flex;
    gap: 4px;
    align-items: baseline;
    margin-bottom: 1px;
    width: 100%;
    padding: 1px 2px;
    border: 0;
    border-radius: 3px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .head:hover { background: rgba(255, 255, 255, 0.09); }
  .head:focus-visible { outline: 1px solid #93c5fd; }
  section.muted .head strong,
  section.muted ol { opacity: 0.45; }
  .swatch {
    width: 7px;
    height: 7px;
    border: 1px solid;
    border-radius: 50%;
    align-self: center;
    flex: none;
    box-sizing: border-box;
  }
  .dim { color: #a1a1aa; font-size: 10.5px; font-weight: 400; }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: flex; justify-content: space-between; gap: 10px; color: #d4d4d8; }
  li.best { color: #f4f4f5; font-weight: 600; }
  .move, .score { font-variant-numeric: tabular-nums; }
  .score { color: #a1a1aa; }
  li.best .score { color: #e4e4e7; }
  .warn { margin: 3px 0 0; color: #fcd34d; font-size: 10px; }

  p { margin: 0; }
</style>
