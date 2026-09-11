<script lang="ts">
  import {
    autoPlayProviderId,
    overlay,
    setAutoPlayProvider,
    toggleArrow,
    toggleAutoPlay,
    toggleMovesPanel,
    togglePanel,
    type ProviderView,
  } from '../../lib/overlayState.svelte';
  import { buildArrow, layoutLabels, scoreText, toXY, type Arrow } from '../../lib/overlay/arrows';
  import { findThreats, threatColor } from '../../lib/overlay/threats';
  import { playSuggestion } from '../../lib/input/playSuggestion';
  import { pvLine } from '../../lib/overlay/pv';


  type Suggestion = ProviderView['suggestions'][number];

  /**
   * Per provider digambar sebanyak `arrowCount` langkah teratas, masing-masing dengan
   * skornya, ditambah — kalau ada — balasan terbaik atas langkah pertama.
   *
   * Jumlahnya diatur per engine di halaman pengaturan dan sekaligus jadi `multipv` yang
   * diminta ke engine, jadi daftar ini biasanya sudah tepat sepanjang itu. `slice` tetap
   * dipakai karena hasil yang sedang streaming bisa memuat sisa dari permintaan
   * sebelumnya, saat angkanya masih berbeda.
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
    layoutLabels(
    Object.entries(overlay.providers).flatMap(([id, view]) => {
      if (!view.arrowVisible) return [];

      const out = view.suggestions
        .slice(0, view.arrowCount)
        .map((s, rank) =>
          buildArrow({
            key: `${id}-${rank}`,
            uci: s.uci,
            color: view.color,
            kind: view.kind,
            orientation: overlay.orientation,
            rank,
            label: scoreText(s, view.kind),
          }),
        );

      // Panah balasan hanya untuk langkah terbaik. Menggambarnya untuk tiap alternatif
      // akan melipatgandakan garis di papan demi jawaban atas langkah yang bahkan belum
      // tentu dimainkan.
      const reply = view.suggestions[0]?.pv?.[1];
      if (reply) {
        out.push(
          buildArrow({
            key: `${id}-reply`,
            uci: reply,
            color: view.color,
            kind: view.kind,
            orientation: overlay.orientation,
            rank: 0,
            reply: true,
          }),
        );
      }
      return out;
    }),
    ),
  );

  /**
   * Kotak yang disorot karena bidakmu di sana kalah material kalau ditukar habis.
   *
   * Sepenuhnya lepas dari engine: masukannya cuma FEN dan sisi mana yang kamu mainkan,
   * jadi sorotannya sudah ada sejak posisi terbaca — tidak menunggu analisis selesai,
   * dan tetap ada saat semua engine dimatikan.
   */
  const threats = $derived(
    overlay.threatsVisible ? findThreats(overlay.fen, overlay.orientation) : [],
  );

  const views = $derived(Object.entries(overlay.providers));

  /**
   * Lebar panel samping, satu-satunya tempat angka ini ditulis.
   *
   * Dipakai untuk dua hal: gaya inline panelnya, dan keputusan muat atau tidak di kanan
   * papan. Sebelumnya angkanya juga ditulis lagi di CSS, dan dua salinan yang harus
   * selalu sama adalah dua salinan yang cepat atau lambat tidak sama.
   */
  const SIDE_WIDTH = 208;
  const SIDE_GAP = 10;

  /**
   * Panel ini duduk di LUAR papan, jadi ia bisa terdorong keluar layar — chess.com
   * menaruh papan mepet kanan pada jendela sempit dan pada sebagian layout. Kalau ruang
   * di kanan tidak cukup, pindah ke kiri papan.
   *
   * Perhitungannya ikut `overlay.rect`, yang sudah disegarkan tiap scroll, resize, dan
   * denyut berkala — jadi tidak perlu pendengar ukuran jendela sendiri.
   */
  const sideOnRight = $derived(
    window.innerWidth - (overlay.rect.left + overlay.rect.width) >= SIDE_WIDTH + SIDE_GAP * 2,
  );

  /** Baris yang didaftar = persis panah yang digambar, supaya keduanya selalu sepakat. */
  function listed(view: ProviderView) {
    return view.suggestions.slice(0, view.arrowCount);
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

      <!--
        Sorotan ancaman digambar paling awal, jadi ia berada di bawah semua panah.
        Urutannya penting: sorotan menutupi satu kotak penuh, dan kalau digambar
        belakangan ia akan memudarkan panah yang kebetulan melintasinya.

        Bentuknya bingkai tebal, bukan kotak penuh berwarna. Kotak penuh dengan opacity
        serendah apa pun tetap mengubah warna bidak di atasnya — dan bidak yang berubah
        warna justru yang paling perlu dikenali sekilas. Bingkai menaruh warnanya di
        tepi kotak, tempat yang memang kosong.
      -->
      {#each threats as threat (threat.square)}
        {@const at = toXY(threat.square, overlay.orientation)}
        {@const color = threatColor(threat.level)}
        <g>
          <rect
            x={at.x - 0.5} y={at.y - 0.5}
            width="1" height="1"
            fill={color}
            fill-opacity="0.16"
          />
          <!-- Bingkainya digambar masuk setengah lebar garis supaya tidak tumpah ke
               kotak tetangga; SVG menggambar stroke di tengah tepi, bukan di dalamnya. -->
          <rect
            x={at.x - 0.5 + 0.045} y={at.y - 0.5 + 0.045}
            width={1 - 0.09} height={1 - 0.09}
            fill="none"
            stroke={color}
            stroke-width="0.09"
            stroke-opacity="0.9"
          />
        </g>
      {/each}

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

      <!--
        Skor digambar sesudah semua garis supaya tidak ada panah yang menimpanya.

        Latarnya pil pekat berwarna engine dengan teks putih, bukan teks berwarna yang
        digaris-tepi. Garis tepi harus setebal seperempat badan huruf supaya terlihat di
        atas papan, dan setebal itu ia memakan bentuk hurufnya sendiri — angkanya jadi
        gempal dan buyar. Pil memindahkan kontras ke latar, jadi hurufnya bisa tetap
        bersih, dan warnanya tetap menunjukkan panah ini milik engine yang mana.
      -->
      {#each arrows as arrow (arrow.key + '-label')}
        {#if arrow.label}
          <g opacity={Math.min(1, arrow.opacity + 0.3)}>
            <rect
              x={arrow.labelX - arrow.labelW / 2}
              y={arrow.labelY - arrow.labelH / 2}
              width={arrow.labelW}
              height={arrow.labelH}
              rx={arrow.labelH / 2}
              fill={arrow.color}
              stroke="rgba(0, 0, 0, 0.45)"
              stroke-width="0.022"
            />
            <text
              x={arrow.labelX}
              y={arrow.labelY}
              fill="#fff"
              font-size={arrow.labelSize}
              font-weight="700"
              text-anchor="middle"
              dominant-baseline="central"
            >{arrow.label}</text>
          </g>
        {/if}
      {/each}
    </svg>

    <!--
      Daftar rekomendasi, di luar papan supaya tidak menutupi satu kotak pun. Tiap baris
      adalah tombol: mengkliknya memainkan langkah itu, jadi tidak perlu drag sendiri.
    -->
    <div
      class="side"
      class:collapsed={!overlay.movesPanelVisible}
      style="{sideOnRight
        ? `left:100%; margin-left:${SIDE_GAP}px;`
        : `right:100%; margin-right:${SIDE_GAP}px;`}{overlay.movesPanelVisible
        ? ` width:${SIDE_WIDTH}px;`
        : ''}"
    >
      <div class="bar">
        {#if overlay.movesPanelVisible}<span class="dim">rekomendasi</span>{/if}
        <button
          type="button"
          class="toggle"
          aria-pressed={overlay.movesPanelVisible}
          title={overlay.movesPanelVisible
            ? 'Sembunyikan daftar langkah'
            : 'Tampilkan daftar langkah'}
          onclick={toggleMovesPanel}
        >
          {overlay.movesPanelVisible ? '×' : '☰'}
        </button>
      </div>

      {#if overlay.movesPanelVisible}
        {#each views as [id, view] (id)}
          <section>
            <div class="side-head">
              <span class="swatch" style="background:{view.color}; border-color:{view.color}"></span>
              <strong>{view.label}</strong>
              {#if view.depth}<span class="dim">d{view.depth}</span>{/if}
            </div>

            {#if listed(view).length > 0}
              <ul>
                {#each listed(view) as s, i (s.uci)}
                  {@const line = pvLine(overlay.fen, s.pv, { mateIn: s.mateIn })}
                  <li>
                    <button
                      type="button"
                      class="move-row"
                      class:best={i === 0}
                      title={`Mainkan ${s.san ?? s.uci}`}
                      onclick={() => playSuggestion(s.uci, s.san)}
                    >
                      <span class="top-line">
                        <span class="rank" style="color:{view.color}">{i + 1}</span>
                        <span class="move">{s.san ?? s.uci}</span>
                        <span class="score">{scoreText(s, view.kind)}</span>
                      </span>

                      <!-- Kelanjutan garisnya. Langkah pertama sudah tampil di atas, jadi
                           yang disambung di sini mulai dari langkah kedua. -->
                      {#if line.san.length > 1}
                        <span class="pv" class:mate={line.mate}>
                          {line.san.slice(1).join(' ')}{line.truncated ? ' …' : ''}
                        </span>
                      {/if}
                    </button>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="dim">{view.status === 'thinking' ? 'menghitung...' : '—'}</p>
            {/if}
          </section>
        {:else}
          <p class="dim">menunggu engine...</p>
        {/each}

        {#if overlay.manualPlay.message}
          <p class="played">{overlay.manualPlay.message}</p>
        {/if}
      {/if}
    </div>

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

  /* Angka tabular membuat taksiran lebar pil di CHAR_WIDTH bisa diandalkan: tanpa ini
     lebar tiap digit berbeda-beda dan pil bisa kesempitan untuk angka tertentu saja.
     Teksnya juga tidak boleh ikut terseleksi saat bidak diseret melintasinya. */
  .arrows text {
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-variant-numeric: tabular-nums;
    user-select: none;
  }

  .arrows {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  /* Panel samping duduk di luar kotak papan. `.root` sengaja tidak memotong isinya
     (tidak ada overflow:hidden), jadi left:100% / right:100% sudah cukup untuk
     menempelkannya di sisi luar tanpa menghitung koordinat viewport sendiri. */
  .side {
    pointer-events: auto;
    position: absolute;
    top: 0;
    max-height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
    padding: 5px 7px;
    border-radius: 6px;
    background: rgba(24, 24, 27, 0.92);
    color: #f4f4f5;
    font: 11.5px/1.4 system-ui, sans-serif;
    backdrop-filter: blur(2px);
  }
  /* Saat terlipat ia menyusut jadi sekadar tombol, sama seperti panel di dalam papan. */
  .side.collapsed {
    width: auto;
    padding: 2px;
    background: rgba(24, 24, 27, 0.55);
  }
  .side:not(.collapsed) .bar { margin-bottom: 4px; }
  .side section + section { margin-top: 5px; padding-top: 4px; border-top: 1px solid #3f3f46; }

  .side-head {
    display: flex;
    gap: 4px;
    align-items: center;
    margin-bottom: 2px;
  }

  .side ul { list-style: none; margin: 0; padding: 0; }
  .side li + li { margin-top: 1px; }

  /* Tiap baris adalah tombol selebar panel: targetnya besar, dan tidak ada bagian baris
     yang terlihat bisa diklik tapi ternyata bukan tombol. */
  .move-row {
    display: block;
    width: 100%;
    padding: 2px 4px;
    border: 0;
    border-radius: 3px;
    background: none;
    color: #d4d4d8;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .top-line {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  /* Kelanjutan garis: dibuat redup dan tanpa tebal supaya langkah yang benar-benar akan
     dimainkan — baris di atasnya — tetap yang pertama tertangkap mata. Dibiarkan
     membungkus, bukan dipotong, karena garis skakmat memang ditampilkan sampai habis. */
  .pv {
    display: block;
    margin-left: 13px;
    color: #a1a1aa;
    font-size: 10.5px;
    font-weight: 400;
    line-height: 1.35;
    word-spacing: 1px;
  }
  .move-row:hover .pv { color: #d4d4d8; }
  /* Garis yang berujung skakmat pantas ditandai: itu bukan sekadar rekomendasi lain. */
  .pv.mate { color: #fca5a5; }
  .move-row:hover .pv.mate { color: #fecaca; }
  .move-row:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
  .move-row:active { background: rgba(255, 255, 255, 0.2); }
  .move-row:focus-visible { outline: 1px solid #93c5fd; }
  .move-row.best { color: #f4f4f5; font-weight: 600; }
  .rank { min-width: 7px; font-size: 10px; font-weight: 700; }
  .move-row .move { flex: 1; font-variant-numeric: tabular-nums; }
  .move-row .score { color: #a1a1aa; font-variant-numeric: tabular-nums; }
  .move-row.best .score { color: #e4e4e7; }

  .played {
    margin: 4px 0 0;
    padding-top: 4px;
    border-top: 1px solid #3f3f46;
    color: #86efac;
    font-size: 10.5px;
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
