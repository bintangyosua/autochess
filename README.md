# Chess Move Reader

Ekstensi browser yang membaca posisi di chess.com dan menampilkan saran dari engine lokal.
Rancangan lengkap ada di [PLAN.md](PLAN.md).

> Memakai ini saat bermain live melanggar fair-play policy chess.com dan bisa membuat akun
> ditutup permanen. Pemakaian yang aman: halaman analisis dan game yang sudah selesai.

## Prasyarat
- Node 20+ dan pnpm
- `stockfish/stockfish-windows-x86-64-universal.exe` (sudah ada)
- `engines/lc0/lc0.exe` — **belum ada**, dibutuhkan untuk Maia. Download dari release
  LeelaChessZero/lc0, lalu set `enabled: true` pada entri `maia-1900` di `engines.config.json`.

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

## Menambah engine
Tambahkan entri di `engines.config.json`. Untuk Maia 1500/1300 cukup salin entri
`maia-1900`, ganti `id` dan `weights` — tidak ada kode yang perlu diubah.

## Struktur
| Paket | Isi |
|---|---|
| `packages/shared` | tipe `EngineProvider`, `AnalysisResult`, dan protokol WebSocket |
| `packages/bridge` | server WS + `UciProcess` + provider (spawn engine native) |
| `packages/extension` | WXT + Svelte 5: background, content script, popup |
