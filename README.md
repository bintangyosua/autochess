# Chess Move Reader

Ekstensi browser yang membaca posisi di chess.com dan menampilkan saran dari engine lokal.
Rancangan lengkap ada di [PLAN.md](PLAN.md).

> Memakai ini saat bermain live melanggar fair-play policy chess.com dan bisa membuat akun
> ditutup permanen. Pemakaian yang aman: halaman analisis dan game yang sudah selesai.

## Prasyarat
- Node 20+ dan pnpm
- `stockfish/stockfish-windows-x86-64-universal.exe` (sudah ada)
- `lc0/lc0.exe` beserta DLL-nya (dari release LeelaChessZero/lc0) — dipakai Maia dan Leela.

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
| `leela` | Leela 791556 | kuat, gaya berbeda dari Stockfish |
| `maia-1900` | Maia 1900 | meniru pemain manusia rating ~1900 |
| `maia-1500`, `maia-1300` | Maia | terdaftar, tinggal `enabled: true` |

## Menambah engine
Tambahkan entri di `engines.config.json` — tidak ada kode yang perlu diubah.

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
