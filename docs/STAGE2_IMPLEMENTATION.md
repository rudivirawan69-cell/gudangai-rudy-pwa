# Tahap 2 — Implementasi perubahan minimal

Tanggal: 17 Sep 2026
Commit kerja lokal: 31afa5d — patch Code.gs + api.js

## Perubahan

1. `Code.gs` — backend V6.5.4-STAGE2 (mengganti stub 158 baris yang tidak dapat di-deploy sebagai backend lengkap).
   - GET write blocking → `GET_WRITE_BLOCKED`
   - action wajib → `ACTION_REQUIRED`
   - LockService pada jalur write
   - tanggal transaksi parse `YYYY-MM-DD` (kalender PWA)
   - auto spreadsheet: Script Properties + bound + fallback
   - master dinamis dari Stock CV + Stock PT
   - batch max 200; 201 ditolak `BATCH_LIMIT`
   - idempotensi CacheService
   - flush + read-back; gagal konklusif → `UNKNOWN`
   - payload tulis hanya tanggal, kode, qty, keterangan
   - shortage: `(STOK HABIS)` / `(DISESUAIKAN)`
   - PO merge CV+PT, status `SAVED`, idempoten
   - Dashboard refresh data-only (tidak recreate chart)

2. `src/data/api.js`
   - stok demo/random dimatikan (fail-closed)
   - penolakan klien > 200 item
   - respons `UNKNOWN` masuk antrian, tidak di-mark applied

## Tidak diubah

- Layout spreadsheet, formula, ledger production 2000+ baris di Apps Script owner
- URL `/exec`, secret, PIN, PDF deterministic rules, PO page review-first
- Write-once frontend (retries=1), chunk 12

## Catatan produksi

Production live sudah `6.5.4+AUTO-MONTH-REALTIME-DATA-ONLY` dan lebih lengkap daripada paket Stage-2 di repo.
Jangan menimpa production Code.gs secara buta; gunakan diff / patch selektif.

## Deploy yang masih wajib owner

1. Review diff Code.gs repo vs production sebelum tempel.
2. Save → Deploy new version (Execute as Me, Anyone) hanya jika patch disetujui.
3. Jalankan `setupEnvironment()` sekali jika SPREADSHEET_ID belum ada.
4. Tempel `docs/refreshWeeklyPODashboard.gs` di bawah jika belum ada.
