# Status sinkron 18 Sep 2026 malam

## Frontend (main) — LIVE setelah Vercel Ready

| Commit | Isi |
|--------|-----|
| `902d02a` | Visual V6.7 nav kotak tanpa putih |
| `ec1720b` / `b8d39df` | Perf Android SW + lazy |
| `131a008` | **Input Tempel Teks + Foto Rekap** |
| `ca36700` | Checklist deploy pagi |

## Backend — BELUM deploy (jadwal besok pagi)

- Target: `BACKEND_VERSION = 6.6.3+PO-ROW4-6-STATUS-6COL-DASH`
- File: zip code gs V6.6.3 / bulk optimized (1 lock, setValues bulk)
- Patch alternatif: `docs/OPTIMIZE_bulkTransaction_V6.6.3.gs`
- Panduan: `docs/DEPLOY_BESOK_PAGI.md`

## Kontrak API (sudah cocok, jangan ubah pagi)

- PWA `addTransactionBatch` → GS `bulkTransaction`
- Payload item: tanggal, kodeBarang, qty, keterangan (+ clientItemId)
- Tempel/Foto **tidak** butuh endpoint baru

## Besok pagi hanya

1. Tempel Code.gs V6.6.3 → Save → setupEnvironment → Deploy New version
2. Uji batch 15–20 lalu 40
3. Hard refresh PWA jika perlu
