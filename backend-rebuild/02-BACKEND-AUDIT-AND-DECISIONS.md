# 02 — Audit Backend dan Keputusan Rekonstruksi

Tanggal audit: 2026-11-01  
Sumber yang berhasil dibaca: `Code.gs` default branch dan `audit-apps-script/Code_GudangAI_V6.6.5_COMBINED_PRODUCTION_FIXES.gs`.  
Status: audit statis; belum ada akses runtime ke Apps Script atau spreadsheet produksi.

## Temuan kritis

### 1. Dua kandidat tidak boleh digabung secara buta
Keduanya berbagi banyak kode, tetapi konfigurasi PO berbeda:
- Default `Code.gs`: `PO_HEADER_ROW=5`, `PO_DATA_START_ROW=6`, `PO_SECTION_CURRENT_ROW=46`, `PO_DASHBOARD_MAX_VISIBLE_ROWS=16`.
- Combined candidate: menambahkan `STATUS_PO_LAYOUT_VERSION='6.9.0-LOCKED-ROW46'`, `PO_START_ROW=46`, `PO_DASHBOARD_HEADER_ROW=49`, dan `PO_DASHBOARD_MAX_VISIBLE_ROWS=50`.

Kesimpulan: PO pada sheet `purchase order` (B5:I6+) dan PO pada Dashboard (mulai row 46/header row 49) adalah dua layout berbeda. Jangan menyalin konstanta Dashboard ke penulis PO utama.

### 2. Kontrak idempotensi perlu diperbaiki sebelum rilis
- `appendIdentityMarker_()` secara eksplisit hanya mengembalikan keterangan pengguna maksimal 200 karakter dan tidak menulis marker `GUDANGAI_TX` / `GUDANGAI_NONCE`.
- `readBackTransactionByIdentity_()` masih lebih dulu mencari marker tersebut pada kolom Keterangan, lalu memakai ledger sebagai fallback.
- Fallback ledger memeriksa row, kode, tanggal dan qty, tetapi bukan bukti unik yang cukup bila ada transaksi identik berdekatan atau row bergeser.

Tindakan: jadikan ledger sebagai sumber identitas tunggal; simpan row number setelah append; lakukan read-back pada row tersebut dengan validasi semua field yang tersedia; jika ledger tidak dapat membuktikan apakah write terjadi, tandai UNKNOWN dan jangan retry otomatis.

### 3. Nama sheet rusak/LO belum konsisten
`SHEET_CONFIG` pada default Code.gs memakai `Barang Rusak`, sedangkan kebutuhan operasional terdahulu menyebut `Barang Rusak/LO`. Harus dicocokkan dengan nama tab produksi sebelum perubahan.

### 4. Master dan stok
- `Stock CV` dan `Stock PT` dinyatakan read-only untuk writer transaksi.
- Fungsi `enforceNonNegativeStock_()` pada sumber ini sudah fail-closed/read-only.
- Master cache membangun map dari Stock CV/PT, bukan langsung dari Stock Awal. Ini harus diuji terhadap aturan sumber master 191 item dari Stock Awal dan mapping entitas yang disepakati.
- Tidak ada bukti dari audit statis bahwa 191 baris live sudah valid atau semua formula kolom F `Data Stok Per Divisi` masih utuh.

### 5. PO writer berisiko menghapus data yang belum dipahami
`writePurchaseOrder` menghapus isi tabel PO sebelum menulis ulang B6:I. Ini merupakan operasi destructive pada area tabel. Harus ada snapshot/backup, validasi range, dan persetujuan kontrak layout sebelum dipertahankan sebagai writer produksi.

### 6. Konfigurasi spreadsheet
`getConfigSheet_()` otomatis membuat sheet Config jika tidak ada; `setupConfigSheet()` mengubah A1:B... dan merge cells. Fungsi setup harus dipisahkan dari fungsi read-only dan tidak dijalankan otomatis tanpa pemeriksaan.

## Keputusan implementasi

1. Jangan mengganti seluruh Code.gs sekarang.
2. Bekukan kontrak API: GET read-only; transaksi hanya POST; payload tanggal/kode/qty/keterangan <=200 dan idempotency IDs.
3. Buat modul baru secara bertahap di branch rekonstruksi; nama global diberi prefix unik untuk menghindari benturan Apps Script.
4. Buat adapter kompatibilitas agar endpoint PWA tetap sama.
5. Pisahkan writer transaksi, writer PO, dashboard read model, sync stok divisi, dan trigger manager.
6. Writer `Data Stok Per Divisi` harus dilarang menulis kolom F (formula Sisa Stok). Pembaruan manual spreadsheet harus terbaca melalui read model/polling atau mekanisme onEdit yang teruji, bukan klaim realtime tanpa mekanisme.
7. Tidak memasang trigger dan tidak deploy sampai inventaris trigger aktif serta tes spreadsheet nyata tersedia.

## Gate pengujian wajib

- Sintaks seluruh file Apps Script setelah digabung.
- Audit semua pemanggilan `setValue`, `setValues`, `setFormula`, `clearContent`, insert/delete row dan sheet.
- Pastikan tidak ada writer transaksi ke Stock CV/PT, Dashboard, atau kolom F Data Stok Per Divisi.
- Uji nama sheet Barang Rusak/LO dan header aktual.
- Uji 191 item master dan pemetaan CV/PT/WK/MM terhadap Stock Awal.
- Uji formula F tetap ada setelah transaksi dan edit manual.
- Uji idempotensi: sukses, replay, timeout setelah write, timeout sebelum write, dua request serentak, partial bulk.
- Uji PO tanpa kehilangan tabel/format yang tidak dimiliki writer.
- Inventarisasi trigger aktif dan pastikan hanya satu installer pemilik tiap jadwal.
- PWA contract tests dan Cloudflare deploy terpisah dari Apps Script release.

## Batas bukti
Audit ini membaca kode repository, bukan project Apps Script yang sedang terpasang, bukan spreadsheet produksi, dan bukan daftar trigger runtime. Karena itu tidak menyatakan sistem produksi telah berubah atau lulus uji.
