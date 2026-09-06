<script lang="ts">
  import { overlay } from '../../lib/overlayState.svelte';

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
    x1: number; y1: number; x2: number; y2: number;
    color: string; width: number; opacity: number;
  }

  // Saran pertama digambar tebal dan pekat; alternatif makin tipis dan pudar.
  const arrows = $derived<Arrow[]>(
    overlay.suggestions.slice(0, 3).map((s, i) => {
      const from = toXY(s.uci.slice(0, 2));
      const to = toXY(s.uci.slice(2, 4));
      // Pendekkan ujung panah supaya kepalanya berhenti di tepi kotak tujuan,
      // bukan menutupi bidak yang ada di sana.
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const trim = 0.3;
      return {
        x1: from.x,
        y1: from.y,
        x2: to.x - (dx / len) * trim,
        y2: to.y - (dy / len) * trim,
        color: i === 0 ? '#2563eb' : '#475569',
        width: i === 0 ? 0.13 : 0.08,
        opacity: i === 0 ? 0.9 : 0.5,
      };
    }),
  );

  function scoreText(s: { scoreCp?: number; mateIn?: number; policy?: number }): string {
    if (s.mateIn !== undefined) return `#${s.mateIn}`;
    if (s.scoreCp !== undefined) return (s.scoreCp > 0 ? '+' : '') + (s.scoreCp / 100).toFixed(2);
    if (s.policy !== undefined) return `${(s.policy * 100).toFixed(0)}%`;
    return '';
  }
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
        {#each arrows as arrow, i (i)}
          <marker
            id="head-{i}"
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

      {#each arrows as arrow, i (i)}
        <line
          x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2}
          stroke={arrow.color}
          stroke-width={arrow.width}
          stroke-linecap="round"
          opacity={arrow.opacity}
          marker-end="url(#head-{i})"
        />
      {/each}
    </svg>

    <div class="panel">
      <div class="head">
        <strong>Stockfish</strong>
        {#if overlay.depth}<span class="dim">d{overlay.depth}</span>{/if}
        {#if overlay.status === 'thinking'}<span class="dim">...</span>{/if}
      </div>

      {#if overlay.suggestions.length > 0}
        <ol>
          {#each overlay.suggestions.slice(0, 3) as s, i (s.uci)}
            <li class:best={i === 0}>
              <span class="move">{s.san ?? s.uci}</span>
              <span class="score">{scoreText(s)}</span>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="dim">{overlay.note || 'menunggu posisi...'}</p>
      {/if}

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
    position: absolute;
    top: 4px;
    right: 4px;
    min-width: 108px;
    padding: 5px 7px;
    border-radius: 6px;
    background: rgba(24, 24, 27, 0.85);
    color: #f4f4f5;
    font: 11.5px/1.4 system-ui, sans-serif;
    backdrop-filter: blur(2px);
  }
  .head { display: flex; gap: 5px; align-items: baseline; margin-bottom: 1px; }
  .dim { color: #a1a1aa; font-size: 10.5px; font-weight: 400; }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: flex; justify-content: space-between; gap: 10px; color: #d4d4d8; }
  li.best { color: #93c5fd; font-weight: 600; }
  .move, .score { font-variant-numeric: tabular-nums; }
  .score { color: #a1a1aa; }
  li.best .score { color: #93c5fd; }
  .warn { margin: 3px 0 0; color: #fcd34d; font-size: 10px; }
  p { margin: 0; }
</style>
