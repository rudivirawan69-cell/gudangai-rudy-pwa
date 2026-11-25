# Rubee — Perbaikan Analisis Stok Live (25 Nov 2026)

## Status
Perbaikan Worker dan patch kompatibilitas untuk Code.gs 6.6.6 disiapkan pada branch `fix/rubee-stock-live-read-20261125`. PR masih Draft, belum di-merge, dan belum di-deploy ke production.

## Baseline Code.gs yang digunakan
Sumber patch adalah file Library operator yang sudah dikonfirmasi sebagai salinan Code.gs terpasang:
`Code.gs.6.6.6-HOLD-SIMPLE-AGENT-KNOWLEDGE.gs` (versi `6.6.6+HOLD-SIMPLE+AGENT-KNOWLEDGE`).

Jangan mengganti backend terpasang dengan Code.gs dari GitHub `main`, karena file di `main` masih versi 6.6.5.

## Temuan
1. Routing intent Worker sebelumnya dapat memicu lebih dari satu action untuk permintaan umum "Analisis Stok", termasuk pencarian nama barang.
2. Respons sukses dari sejumlah action baca Code.gs 6.6.6 belum konsisten menyertakan `sourceReadAt`, padahal Worker memvalidasi timestamp sumber.
3. `getTransactionHistory` belum menyertakan identitas `sheet` baik pada hasil kosong maupun hasil berisi.

## Perubahan Worker
- Intent analisis stok umum diarahkan eksklusif ke `getAllStock`.
- Pencarian nama barang tetap memakai `searchByName` hanya untuk query spesifik.
- Ditambahkan tes intent dan tes integrasi untuk memastikan `getAllStock` dipanggil dengan `entitas: ALL` dan payload diteruskan ke konteks AI.

## Patch Code.gs 6.6.6
Patch diff lengkap tersedia di:
`patches/Code.gs-6.6.6-source-read-at.patch`

Patch tersebut:
- Menambahkan helper `withSourceReadAt_` yang memberi timestamp Apps Script hanya pada respons sukses berbentuk object.
- Membungkus action baca pada jalur `doPost` dan `doGet`, termasuk stok, risiko stok, riwayat, dashboard, konfigurasi, status, knowledge, dan metadata operasional.
- Tidak membungkus action tulis seperti `addTransaction`, `syncTransaction`, `bulkTransaction`, `writePurchaseOrder_`, `writePORecommendations`, atau `recordPOArrival`.
- Menambahkan `sheet: sheetName` pada kedua respons sukses `getTransactionHistory`, termasuk hasil kosong.
- Mempertahankan respons gagal tanpa menambahkan timestamp seolah-olah pembacaan berhasil.

Timestamp dibuat di Apps Script setelah action baca mengembalikan hasil; Worker/gateway tidak boleh mengarang timestamp sumber.

## Pemeriksaan lokal yang telah dijalankan
- Syntax check Node.js pada kandidat Code.gs 6.6.6: lulus.
- Uji helper: respons sukses mendapat timestamp ISO yang valid.
- Uji helper: respons gagal tidak diberi timestamp.
- Uji respons kosong: struktur tetap valid.
- Uji `getTransactionHistory`: identitas sheet ada pada hasil kosong dan hasil berisi.
- Pemeriksaan dispatch: action tulis utama tetap tidak dibungkus helper timestamp.

Pemeriksaan ini adalah validasi statis/lokal. Belum membuktikan runtime Apps Script atau data spreadsheet production.

## Batas dan deployment
- Tidak ada perubahan pada spreadsheet.
- File Code.gs yang terpasang belum diubah dan belum di-deploy.
- PR belum di-merge.
- Belum ada pengujian pembacaan data live.
- Target Worker production yang dimaksud operator adalah `gudangai-rudy-pwa-69`; build Cloudflare yang menunjuk ke Worker lain harus ditelusuri dan diperbaiki sebelum deploy.
- Setelah review dan CI lulus, patch harus diterapkan pada salinan 6.6.6 yang terpasang, diuji pada deployment Apps Script yang sesuai, lalu Worker diuji dengan permintaan read-only.
