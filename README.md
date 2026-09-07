# Chess Move Reader

Ekstensi browser yang membaca posisi di chess.com dan menampilkan saran dari engine lokal.
Rancangan lengkap ada di [PLAN.md](PLAN.md).

> Memakai ini saat bermain live melanggar fair-play policy chess.com dan bisa membuat akun
> ditutup permanen. Pemakaian yang aman: halaman analisis dan game yang sudah selesai.

## Prasyarat
- Node 20+ dan pnpm
- Binari dan bobot engine ditaruh di `models/` (tidak ikut ter-commit; lihat `engines.config.json`):
  - `models/stockfish/stockfish-windows-x86-64-universal.exe`
  - `models/lc0/lc0.exe` beserta DLL-nya (dari release LeelaChessZero/lc0) — dipakai Maia dan Leela
  - `models/lc0/791556.pb.gz` (Leela) dan `models/maia-1900.pb.gz` (+1500, +1300)

## Jalankan

```bash
pnpm install

# terminal 1 — bridge engine lokal (ws://127.0.0.1:8787)
pnpm bridge

# terminal 2 — ekstensi dengan hot reload
pnpm dev
```

Build produksi: `pnpm build` (hasilnya di `packages/extension/.output/chrome-mv3`).

## Uji engine tanpa browser

```bash
pnpm bridge:probe                                    # posisi awal, stockfish
pnpm bridge:probe -- --fen "<FEN>" --movetime 1500 --multipv 3
pnpm bridge:probe -- --provider maia-1900 --debug
```

## Engine yang tersedia

| id | Model | Sifat |
|---|---|---|
| `stockfish` | Stockfish 19 | terkuat secara objektif |
| `dragon` | Dragon (Komodo) | kuat, gaya lebih posisional |
| `komodo` | Komodo 14.1 | kuat, generasi sebelum Dragon |
| `leela` | Leela 791556 | kuat, gaya berbeda dari Stockfish |
| `maia-1900` | Maia 1900 | meniru pemain manusia rating ~1900 |
| `maia-1500`, `maia-1300` | Maia | terdaftar, tinggal `enabled: true` |

## Menambah engine
Semua konfigurasi engine ada di **satu berkas**: `engines.config.json`. Ekstensi mengambil
daftarnya dari bridge — termasuk label, warna panah, dan `defaults` — jadi tidak ada daftar
engine kedua di sisi UI, dan tidak ada kode yang perlu diubah.

| field | pengaruh |
|---|---|
| `label` | nama di panel overlay |
| `color` | warna panah dan penanda |
| `enabled` | muncul di overlay atau tidak |
| `defaults.multipv` | berapa langkah berperingkat ditampilkan |
| `type` | `uci` untuk engine UCI biasa (Stockfish/Dragon/Komodo), `lc0` untuk Leela/Maia |
| `defaults.depth` | kedalaman tetap; menang atas `nodes` dan `movetimeMs` |
| `defaults.movetimeMs` | lama berpikir, dipakai kalau `depth`/`nodes` kosong |
| `defaults.nodes` | jumlah node (Maia: 1) |

`type: "lc0"` punya dua mode, memakai biner yang sama:

| mode | perintah | keluaran | untuk |
|---|---|---|---|
| `policy` | `go nodes 1` | persentase policy | Maia — kemiripan dengan manusia justru datang dari tidak mencari |
| `search` | `go movetime` | evaluasi centipawn | jaringan Leela biasa |

## Mode auto

Tombol ▶ di panel overlay memainkan langkah engine sendiri setiap giliranmu. Engine yang
dituruti dipilih lewat dropdown di panel — panel bisa menampilkan tiga engine sekaligus
dan mereka sering tidak sepakat, jadi "langkah terbaik" baru punya arti setelah satu
engine dipilih. Bawaannya engine pertama yang siap (Stockfish).

Total waktu dari hasil engine sampai langkah mendarat di papan diacak dalam rentang yang
diatur di halaman pengaturan (bawaan 0,5–1,5 detik). Angka itu untuk langkah utuh: di
dalamnya dibagi lagi jadi jeda berpikir lalu jeda antar-klik, dengan porsi yang ikut diacak
supaya tiap langkah tidak punya bentuk waktu yang identik. Waktu berpikir engine sendiri
diatur terpisah lewat depth.

Auto diam kalau bukan giliranmu (sisi pemain dibaca dari orientasi papan) atau kalau posisi
berubah selama jeda — memainkan langkah lama di posisi baru adalah blunder yang dibuat
ekstensi, bukan olehmu. Setiap kali ia memilih untuk tidak bergerak, alasannya ditulis di
panel dan di console (); mode yang bekerja tanpa diminta tidak boleh gagal
dalam diam.

Langkahnya dikirim sebagai klik-asal lalu klik-tujuan. Kalau papan tidak merespons —
setelan "move method" di chess.com bisa diset drag saja — langkah yang sama diulang
sekali sebagai drag sebelum menyerah.

## Struktur
| Paket | Isi |
|---|---|
| `packages/shared` | tipe `EngineProvider`, `AnalysisResult`, dan protokol WebSocket |
| `packages/bridge` | server WS + `UciProcess` + provider (spawn engine native) |
| `packages/extension` | WXT + Svelte 5: background, content script, popup |
