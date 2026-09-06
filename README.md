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

## Struktur
| Paket | Isi |
|---|---|
| `packages/shared` | tipe `EngineProvider`, `AnalysisResult`, dan protokol WebSocket |
| `packages/bridge` | server WS + `UciProcess` + provider (spawn engine native) |
| `packages/extension` | WXT + Svelte 5: background, content script, popup |
