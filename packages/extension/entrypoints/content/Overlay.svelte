<script lang="ts">
  import { overlay, toggleArrow, type ProviderView } from '../../lib/overlayState.svelte';

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
  }

  /**
   * Hanya langkah terbaik tiap provider yang digambar. Menggambar tiga panah per
   * provider membuat papan tidak terbaca; peringkat selengkapnya ada di panel.
   */
  const arrows = $derived<Arrow[]>(
    Object.entries(overlay.providers).flatMap(([id, view]) => {
      const best = view.suggestions[0];
      if (!best || !view.arrowVisible) return [];

      const from = toXY(best.uci.slice(0, 2));
      const to = toXY(best.uci.slice(2, 4));
      // Pendekkan ujung panah supaya kepalanya berhenti di tepi kotak tujuan,
      // bukan menutupi bidak yang ada di sana.
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const trim = 0.3;
      return [{
        key: id,
        x1: from.x, y1: from.y,
        x2: to.x - (dx / len) * trim,
        y2: to.y - (dy / len) * trim,
        color: view.color,
        width: view.kind === 'strength' ? 0.13 : 0.1,
        opacity: view.kind === 'strength' ? 0.9 : 0.75,
      }];
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
            markerWidth="3.2"
            markerHeight="3.2"
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
          opacity={arrow.opacity}
          marker-end="url(#head-{arrow.key})"
        />
      {/each}
    </svg>

    <div class="panel">
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
