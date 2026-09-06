# Rencana Implementasi — Chess.com Move Reader Extension

## 0. Catatan awal
Ekstensi yang membaca posisi live di chess.com lalu menampilkan saran engine melanggar fair-play policy chess.com kalau dipakai saat bermain (risiko akun di-close permanen). Rencana ini tetap dibuat lengkap; keputusan pemakaian ada di kamu. Saran: default mode "analysis only" (aktif di halaman /analysis dan game yang sudah selesai), live mode jadi opt-in eksplisit.

## 1. Arsitektur

```
Chess.com tab
  |- content script  -- baca DOM board -> FEN --+
  |- overlay UI (Svelte 5, shadow DOM)  <-------+
                                                | chrome.runtime message
Background service worker (MV3)                 |
  |- EngineClient (WebSocket + reconnect)  <----+
             |  JSON message
             v
Engine Bridge (Node.js lokal, ws://127.0.0.1:8787)
  |- ProviderRegistry
  |- StockfishProvider  -> stockfish-windows-x86-64-universal.exe (UCI/stdio)
  |- MaiaProvider(1900) -> lc0.exe --weights=maia-1900.pb.gz (UCI/stdio)
  |- (slot) Maia 1500 / Maia 1300 -- cukup tambah entri config, kode sama
```

**Kenapa bridge lokal, bukan WASM di dalam ekstensi?**
- Stockfish WASM ada, tapi Maia adalah jaringan Leela; butuh lc0 untuk inferensi. Tidak ada build lc0 WASM yang layak pakai. Jadi Maia *harus* lewat proses native.
- MV3 service worker mati tiap ~30 detik idle. Engine yang hidup di luar browser justru lebih stabil (hash table dan NNUE tetap warm).
- Konsekuensinya: bridge harus dijalankan user. Disediakan `pnpm bridge` + skrip `.bat`.

Alternatif kalau nanti mau zero-install: `chrome.runtime.connectNative` (Native Messaging Host: manifest JSON + registry Windows). Lebih ribet dipasang tapi tidak buka port. Interface provider dibuat identik, jadi transport bisa ditukar belakangan tanpa menyentuh provider.

## 2. Stack

| Bagian | Pilihan | Alasan |
|---|---|---|
| Extension framework | **WXT** (wxt.dev) | Vite-based, MV3 native, HMR untuk content script (pembeda besar vs Plasmo/CRXJS), entrypoint file-based, build Chrome + Firefox sekaligus |
| UI | **Svelte 5** (runes) lewat `@wxt-dev/module-svelte` | modul resmi WXT. Runtime ~3-5KB (penting karena overlay di-inject ke tiap halaman chess.com) dan reaktivitas fine-grained tanpa VDOM — pas untuk stream baris `info` engine yang datang puluhan kali per detik |
| Styling | Tailwind + shadow DOM (`createShadowRootUi` bawaan WXT) | CSS chess.com tidak bocor ke overlay dan sebaliknya |
| State | `$state` di file `.svelte.ts` | tidak butuh library state terpisah |
| Chess logic | chess.js | validasi FEN, SAN <-> UCI, legal move |
| Rendering papan | **tidak ada** | papan chess.com sudah di layar; kita cuma overlay SVG di atasnya. Tidak perlu chessground/chessboard sama sekali |
| Bridge | Node 20 + `ws` + TypeScript (`tsx` untuk dev) | spawn proses UCI |
| Monorepo | pnpm workspaces | `packages/shared` menyimpan tipe protokol yang dipakai dua sisi |

## 3. Struktur repo

```
chess/
|- engines/                     # binari & bobot (gitignored)
|  |- stockfish/stockfish-windows-x86-64-universal.exe
|  |- lc0/lc0.exe               # BELUM ADA -> lihat bagian 4
|  |- weights/maia-1900.pb.gz (+1500, +1300)
|- packages/
|  |- shared/                   # protokol WS, tipe Provider, tipe Analysis
|  |- bridge/
|  |  |- src/uci/UciProcess.ts  # spawn, line parser, queue, ready-sync
|  |  |- src/providers/StockfishProvider.ts
|  |  |- src/providers/MaiaProvider.ts
|  |  |- src/providers/registry.ts
|  |  |- src/server.ts
|  |- extension/                # WXT
|     |- entrypoints/content/   # scraper + overlay
|     |- entrypoints/background.ts
|     |- entrypoints/popup/
|     |- lib/board/             # DomBoardReader, MoveListReader, FenBuilder
|- engines.config.json
|- PLAN.md
```

## 4. Prasyarat yang masih kurang
1. **lc0.exe** — download release Windows dari LeelaChessZero/lc0 (pilih build CPU/onnx-dml kalau tidak yakin soal GPU). Tanpa ini Maia tidak jalan.
2. Verifikasi manual: `lc0.exe --weights=maia-1900.pb.gz`, ketik `uci`, harus balas `uciok`.
3. Stockfish exe sudah ada; cek `uci` juga sekali.

## 5. Kontrak Provider (inti desain)

```ts
// packages/shared/src/provider.ts
export interface AnalysisRequest {
  fen: string;
  movetimeMs?: number;
  depth?: number;
  nodes?: number;
  multipv?: number;
}

export interface Suggestion {
  uci: string;            // "e2e4"
  san?: string;
  scoreCp?: number;       // dari sisi yang jalan
  mateIn?: number;
  policy?: number;        // Maia: probabilitas move dimainkan manusia (0..1)
  pv?: string[];
}

export interface AnalysisResult {
  providerId: string;
  fen: string;
  suggestions: Suggestion[];   // urut terbaik -> terburuk
  depth?: number;
  nps?: number;
  elapsedMs: number;
}

export interface EngineProvider {
  readonly id: string;              // "stockfish" | "maia-1900"
  readonly label: string;
  readonly kind: 'strength' | 'human-like';
  init(): Promise<void>;
  analyze(req: AnalysisRequest, onUpdate?: (p: AnalysisResult) => void): Promise<AnalysisResult>;
  stop(): Promise<void>;            // UCI "stop"
  dispose(): Promise<void>;
}
```

Registry = `Map<string, EngineProvider>` yang diisi dari `engines.config.json`. Menambah Maia 1500/1300 nanti cuma menambah satu entri config — nol baris kode baru.

### StockfishProvider
- `setoption name Threads / Hash / MultiPV`; `UCI_LimitStrength` disiapkan untuk mode sparring.
- `position fen <fen>` -> `go movetime|depth` -> parse baris `info depth ... score cp|mate ... pv ...`.
- Kirim partial result ke UI tiap baris `info` supaya eval bar hidup.

### MaiaProvider
- lc0 dengan `--weights=maia-1900.pb.gz`, dan **`go nodes 1`** — ini kuncinya: Maia meniru manusia justru tanpa search.
- Distribusi policy diambil lewat `--verbose-move-stats` (atau MultiPV) -> tampilkan "3 move paling mungkin dimainkan pemain 1900" beserta persentasenya.
- Dipetakan ke `Suggestion.policy`, bukan `scoreCp`. UI harus membedakan dua jenis angka ini.

## 6. Membaca papan chess.com
Dua sumber, tapi perannya tidak setara.

**1. Move list (sumber utama).** Parse SAN dari panel move list, replay dengan chess.js.
Ini menghasilkan **keenam field FEN sekaligus** — termasuk giliran, hak rokade, en passant,
dan halfmove clock, yang semuanya tidak ada di DOM bidak. Karena itu riwayat adalah sumber
posisi, bukan pelengkap.

**2. DOM pieces (verifikator).** Elemen `wc-chess-board`, bidak berupa `div.piece` dengan
class `wp`/`bk` dan `square-XY`, mis. `piece br square-88`.
- X = file 1..8 (a..h), Y = rank 1..8.
- **Koordinat ini absolut, bukan posisi visual.** Papan yang dibalik (pemain hitam) tetap memakai `square-58` untuk raja hitam di e8; pembalikan murni CSS. Jadi pembentukan FEN tidak perlu tahu orientasi sama sekali — orientasi hanya dipakai saat menggambar overlay.
- Urutan elemen di DOM acak, jadi harus dipetakan lewat kelasnya, bukan dibaca berurutan.

**Huruf bidak SAN dirender sebagai ikon, bukan teks.** Di panel live, `Bb7` muncul sebagai
ikon gajah + teks `b7`. Mengambil `textContent` mentah menghasilkan `b7` — dan itu SAN yang
sah untuk langkah pion, jadi di sebagian posisi replay akan menerimanya dan menghasilkan
posisi yang salah tanpa error apa pun. Huruf bidak wajib diambil dari elemen ikonnya
(`composeSan` di `lib/board/moveList.ts`). Dua lapis pertahanan kalau ikon gagal terbaca:
bentuk SAN yang tidak masuk akal ditolak di parser, dan sisanya tertangkap sebagai move
ilegal saat replay atau sebagai ketidakcocokan di `crossCheck`.

Move list diperlakukan sebagai **daftar lurus**, bukan pohon. Panel analisis memang bisa
menampilkan variasi bercabang, tapi itu muncul saat pengguna iseng menelusuri cabang di game
yang sudah selesai — bukan alur normal. Menulis penelusur pohon tidak sepadan dengan
kerumitannya.

**Kenapa verifikator tetap perlu**, padahal riwayat sudah memberi FEN utuh:
- **Posisi tanpa riwayat** — puzzle, atau papan analisis yang diisi FEN tempel. Move list kosong padahal ada posisi di layar. Hanya `.piece` yang bisa membacanya.
- **Posisi awal non-standar** — Chess960, atau puzzle yang mulai dari tengah permainan. Replay dari posisi awal standar akan menghasilkan posisi yang salah *tanpa error apa pun*.
- **Cabang variasi** — inilah cara kasus pohon ditangani: tanpa kode penelusur apa pun. Kalau pengguna sedang membuka cabang, hasil replay daftar lurus tidak akan cocok dengan bidak di papan, jadi `crossCheck` mengembalikan `confidence: 'none'` dan ekstensi diam. Tidak ideal, tapi aman, dan nol kerumitan.

Aturannya: kirim ke engine hanya kalau kedua sumber sepakat. Kalau riwayat kosong, pakai
bidak DOM dan tandai field FEN lain sebagai tebakan (`confidence: 'low'`). Kalau keduanya ada
tapi berbeda, jangan kirim apa pun — lebih baik diam daripada memberi saran meyakinkan untuk
posisi yang keliru.

Detail teknis:
- Semua selector di satu file `lib/board/selectors.ts` + health check yang bilang "board reader rusak" di popup, bukan gagal diam-diam. Selector chess.com berubah berkala.
- `MutationObserver` pada container board, debounce ~120 ms, hash FEN, kirim hanya kalau FEN berubah.
- Orientasi papan (main hitam) dibaca dari class `flipped` pada elemen board — dipakai untuk menggambar panah.

## 7. Protokol WebSocket

```
-> { type:'hello', version:1 }
<- { type:'providers', providers:[{id,label,kind,ready}] }
-> { type:'analyze', reqId, providerId, fen, movetimeMs, multipv }
<- { type:'partial', reqId, result }
<- { type:'result',  reqId, result }
-> { type:'stop', reqId }
<- { type:'error', reqId, code, message }
```

Request baru dengan FEN berbeda otomatis membatalkan yang lama (satu request aktif per provider). Background worker menyimpan hasil terakhir di `chrome.storage.session` supaya overlay tetap hidup saat worker di-suspend.

## 8. Overlay UI
Di-mount lewat `createShadowRootUi` milik WXT, lalu `mount(Overlay, { target: container })` di dalam shadow root. Tailwind di-inject ke shadow root, bukan ke `document.head`.

Tidak ada papan yang kita render sendiri. Overlay = satu `<svg>` transparan yang diposisikan absolut persis di atas `wc-chess-board`, plus panel info di sampingnya. SVG ini ikut `ResizeObserver` board supaya panah tetap pas saat window di-resize.

- Panel mengambang di kanan papan: draggable, collapsible.
- Eval bar + best move Stockfish (depth, cp/mate, PV 5 langkah).
- Kolom terpisah "Maia 1900": top-3 move manusiawi + persen policy.
- Panah SVG di atas papan: biru = Stockfish, oranye = Maia. Koordinat dihitung dari bounding box board dan ikut orientasi flip.
- Toggle master on/off + hotkey.
- Catatan performa: hasil `partial` dari engine di-throttle ~10 fps sebelum masuk ke `$state`. Baris `info` dari Stockfish bisa datang puluhan kali per detik; tanpa throttle, panel patah-patah.
- Popup: status bridge, pilih provider aktif, slider movetime, switch analysis-only mode.

## 9. Urutan pengerjaan

| # | Milestone | Selesai kalau | Status |
|---|---|---|---|
| 1 | Scaffold pnpm workspace + WXT + shared types | `wxt build` menghasilkan MV3 | **selesai** |
| 2 | `UciProcess` + StockfishProvider | script node kirim FEN -> dapat bestmove | **selesai** |
| 3 | WS server + protokol + registry | klien WS bisa analyze | **selesai** |
| 4 | Ambil lc0, MaiaProvider `go nodes 1` | dapat top-3 policy dari maia-1900 | butuh lc0.exe |
| 5a | Bidak DOM -> bagian papan FEN + unit test | FEN cocok dengan DOM asli | **selesai** (kini dipakai sebagai verifikator) |
| 5b | Move list -> replay chess.js -> FEN utuh (sumber utama) | FEN 6 field cocok dengan bidak DOM | logika murni selesai; butuh DOM untuk selector |
| 5c | Simpulkan giliran/rokade/ep dari sorotan langkah terakhir | FEN 6 field tanpa move list | **selesai**, selector `.highlight` belum diverifikasi |
| 6 | Background EngineClient + reconnect + teruskan hasil ke tab | hasil sampai ke content script | **selesai** |
| 7 | Overlay Svelte (panel saran) | saran tampil real-time | kode selesai, **belum terlihat di browser** |
| 8 | Panah SVG + flip handling | panah pas di kedua orientasi | kode selesai, **belum terlihat di browser** |
| 9 | Popup settings + persist `storage.local` | setting bertahan setelah reload | popup status sudah ada |
| 10 | Packaging: `wxt build`, `bridge.bat`, README setup | orang lain bisa pasang dari nol | README sudah ada |

### Temuan saat implementasi
- **Stockfish 19 keluar (exit 1) kalau diberi FEN invalid**, bukan mengabaikannya. Server dan probe memvalidasi FEN via chess.js sebelum kirim, dan `StockfishProvider.ensureRunning()` menghidupkan ulang proses yang mati supaya provider tidak lumpuh permanen.
- **Slot MultiPV tidak boleh dicampur antar-depth.** Iterasi terakhir sering tidak lengkap (slot 1 ditandai `upperbound` dan dibuang), sehingga slot yang belum ter-update menyisakan move dari depth sebelumnya — hasilnya move duplikat. Provider menyimpan per-iterasi dan memakai iterasi terlengkap.
- **Jangan menamai variabel Svelte `state`.** `$state` akan dibaca sebagai akses store bernama `state`, bukan rune.

## 10. Risiko dan mitigasi
- **Selector chess.com berubah** -> semua selector terpusat + self-test + pesan error eksplisit.
- **lc0 tidak jalan di GPU** -> sediakan build CPU sebagai default, GPU sebagai opsi.
- **MV3 worker suspend** -> state penting di `storage.session`, reconnect WS idempoten.
- **Port 8787 bentrok** -> port bisa dikonfigurasi + auto-scan 8787-8797.
- **Latency Maia** -> `go nodes 1` sangat cepat (<50 ms di CPU), aman untuk realtime.
