# GudangAI Warehouse Operations

Gunakan prosedur ketat untuk CV dan PT. Google Sheets adalah sumber kebenaran.

## Aturan keselamatan mutlak

1. **Pisahkan entitas.** CV atau PT — jangan campur master.
2. **Protected range.** Payload tulis hanya: `tanggal`, `kodeBarang`, `qty`, `keterangan`. Jangan kirim `nama`/`satuan`.
3. **Validasi sebelum write.** Status, master lookup, `validateTransaction` bila ada.
4. **Jangan retry write ambigu.** Timeout setelah kemungkinan write → read-back dulu.
5. **Shortage HOLD.** Barang keluar stok tidak cukup → `qty: 0` + keterangan terstruktur. Jangan stok negatif.
6. **Fail-closed offline.** Offline = snapshot + draft REVIEW. Jangan auto-sync write stok tanpa approval.

## Workflow PDF → Keranjang → Batch

1. Ekstrak PDF (teks digital atau OCR; layout 2-kolom digabung).
2. Validasi ke master + alias; ambigu (YAKINIKU/LOWFAT, CIDEA, promo) wajib konfirmasi operator.
3. Item cocok masuk keranjang.
4. Satu tombol kirim → `addTransactionBatch` (satu request).
5. Fallback sequential jika backend belum mendukung batch.

## Backend Actions

- `status` / `ping` / `healthCheck`
- `getAllStock`
- `addTransaction` / `addTransactionBatch`
- `generatePO` / `writePurchaseOrder`

## Dashboard PO Mingguan

Fungsi `refreshWeeklyPODashboard` (lihat `docs/refreshWeeklyPODashboard.gs` dan `Code.gs`):
- Sumber: sheet `purchase order` + `Barang masuk`
- Output: area No. 5 di sheet `Dashboard`
- Status: DATANG / SEBAGIAN DATANG / BELUM DATANG
- Aman: document lock, tidak menulis sheet sumber

Setup: paste ke Apps Script → jalankan `setupWeeklyPOLayoutOnce()` sekali → `testWeeklyPOCalculation()`.
