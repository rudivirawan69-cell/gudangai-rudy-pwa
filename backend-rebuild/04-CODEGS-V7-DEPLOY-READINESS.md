# 04 — Paket Code.gs V7: status deploy dan prosedur aman

Tanggal: 2026-11-01  
Branch: `rebuild/codegs-v7-foundation`  
File sumber: `Code.gs`  
Blob SHA saat audit: `69020b108ddc60c4755c012653e17cca395bba5f`

## File lengkap

File `Code.gs` pada branch ini adalah satu file Apps Script lengkap (4303 baris, 177 deklarasi fungsi). Pemeriksaan statis menemukan **0 nama fungsi duplikat** pada file ini.

URL:
- Editor GitHub: https://github.com/rudivirawan69-cell/gudangai-rudy-pwa/blob/rebuild/codegs-v7-foundation/Code.gs
- Raw: https://raw.githubusercontent.com/rudivirawan69-cell/gudangai-rudy-pwa/rebuild/codegs-v7-foundation/Code.gs

## Fitur yang terkonfirmasi dari inspeksi kode

- GET endpoint bersifat read-only; operasi transaksi/admin dipisahkan ke POST terautentikasi.
- Writer transaksi diarahkan melalui allowlist `SHEET_CONFIG`.
- `syncDivisionStockLightweight_()` hanya audit formula dan tidak menulis kolom F.
- `syncDivisionStock(options)` membangun ulang tabel A:G dengan menulis A:E, formula F melalui `setFormulas`, dan G terpisah.
- Formula F memilih Stock CV, Stock PT (termasuk keluarga PT/WK/MM), atau Stock Bahan Baku (keluarga BBCV/BBPT).
- `onEditRouter_()` menangani edit manual pada Stock CV, Stock PT, Stock Awal, Stock Bahan Baku, jurnal transaksi, dan PO; membersihkan cache, memberi dirty marker, memperbarui timestamp, dan meminta refresh Dashboard.
- Dashboard memiliki satu writer data utama `writeDashboardData693_()` yang dipanggil melalui `refreshDashboardDataLight693_()`.
- Trigger terkelola dipasang oleh `installManagedTriggers_()`: edit handler, Dashboard 10 menit, snapshot harian, laporan harian, dan otomasi PO mingguan.

## Batas yang belum bisa dinyatakan lulus

Pemeriksaan ini statis terhadap GitHub; belum mengakses Apps Script deployment, spreadsheet produksi, trigger aktif di akun, atau data aktual. Maka file **belum boleh disebut production-verified**.

Poin wajib diperiksa pada salinan spreadsheet:
1. Pastikan nama tab jurnal aktual; kode mengacu pada `Barang Rusak`, sedangkan spesifikasi operasional juga pernah menyebut `Barang Rusak/LO`.
2. Pastikan header baris 3 pada Stock CV/PT dan header Stock Bahan Baku cocok dengan deteksi formula.
3. Audit formula count harus sama dengan jumlah item berkode pada Data Stok Per Divisi. Formula helper saat ini menghitung pola kode yang terdeteksi, bukan membuktikan jumlah master Stock Awal = 191.
4. Edit manual satu item di tiap sumber dan jurnal; ukur waktu perubahan formula F, Dashboard, dan timestamp.
5. Uji PWA POST satu transaksi masuk/keluar/rusak dan batch, termasuk idempotency, read-back, timeout, serta kegagalan parsial.
6. Verifikasi rentang Dashboard dan PO aktual sebelum menjalankan refresh; writer Dashboard menggunakan rentang A5:G15, I5:J19, A25:F27, H25:I30, serta kolom tersembunyi P:AE.
7. Pastikan trigger aktif tidak memiliki handler ganda sebelum menjalankan `setupEnvironment()`. Fungsi ini menghapus/membuat trigger yang dikelolanya dan juga dapat membuat Config/ledger serta menulis timestamp.
8. Periksa hasil eksekusi dan Apps Script Executions setelah setup.

## Cara menyalin ke Apps Script

1. Buka branch di atas, buka `Code.gs`, lalu pilih Raw.
2. Salin seluruh isi file ke project Apps Script yang terhubung dengan spreadsheet target. Simpan salinan kode lama sebagai backup terlebih dahulu.
3. Jangan menjalankan `setupEnvironment()` sebelum backup spreadsheet dan pemeriksaan tab/header.
4. Jalankan `testConnection()` terlebih dahulu. Setelah identitas spreadsheet benar, jalankan `setupEnvironment()` satu kali dan berikan izin yang diminta.
5. Jalankan `auditDivisionStockFormulaCells_()` dan `refreshDashboardDataLight693_()`; periksa hasil serta log eksekusi.
6. Deploy sebagai Web App dengan identitas eksekusi dan akses sesuai kebijakan perusahaan; simpan `API_SECRET` di Script Properties dan samakan dengan konfigurasi PWA secara aman. Jangan menaruh secret di repository atau membagikannya di chat.

## Pernyataan rilis

Status: **RECONSTRUCTION CANDIDATE — STATIC AUDIT ONLY**.  
Tidak ada perubahan pada spreadsheet produksi atau deployment Apps Script/Cloudflare dari commit dokumentasi ini. Jangan gunakan file ini sebagai pengganti kode produksi tanpa melewati tes di atas.
