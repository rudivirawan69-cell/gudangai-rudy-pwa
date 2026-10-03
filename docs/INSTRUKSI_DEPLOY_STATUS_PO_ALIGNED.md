# Instruksi Deploy — Status PO Aligned + Dashboard Data-Only (V6.7.0)

Tanggal: 3 Oktober 2026

## Tujuan
1. `getStatusPO` dan panel Dashboard memakai perhitungan yang sama (rekonsiliasi Barang masuk + kolom K).
2. Tombol **Datang / Sebagian / Belum** di PWA menulis ke spreadsheet (kolom J/K) dan untuk **Datang** juga menulis Barang masuk dengan keterangan "DATANG PO … (konfirmasi PWA)".
3. Layout panel PO di sheet Dashboard tetap rapi (A28:F44 & H28:M43) sesuai hasil perbaikan Manus, dengan warna selaras sheet lain.
4. Tidak ada fungsi lama yang menimpa layout atau chart.

## Langkah di Apps Script (WAJIB dilakukan owner)

### 1. Nonaktifkan fungsi yang berpotensi tabrakan
Buka Code.gs → cari dan beri komentar `//` di depan:

```
// function buildMasterExecutiveDashboardV69
// function refreshWeeklyPODashboard
```

(atau semua varian yang mengandung `buildMasterExecutiveDashboard` / `refreshWeeklyPODashboard` versi lama dengan `outputStartRow: 25`).

Simpan (Save). Pastikan tidak ada error syntax.

### 2. Tempel modul baru
1. Buka file: `docs/STATUS_PO_ALIGNED_DASHBOARD_V6.7.gs` di GitHub.
2. Copy **seluruh** isinya.
3. Tempel di **paling bawah** Code.gs (setelah semua kode yang valid).
4. Save.

### 3. Deploy
1. Deploy → Manage deployments → Edit (pensil) → New version.
2. Execute as: **Me**
3. Who has access: **Anyone**
4. Deploy.

### 4. (Opsional tapi disarankan) Format warna panel sekali
1. Di Apps Script, pilih fungsi `setupDashboardPOLayoutOnce` → Run.
2. Izinkan permission jika diminta.
3. Fungsi ini hanya mengatur warna header (cyan/navy), baris selang-seling, border, lalu mengisi data. **Tidak** membuat/menghapus chart.

### 5. Uji di PWA
1. Buka https://gudangai-rudy-pwa.vercel.app → Dashboard.
2. Pastikan Status PO muncul (angka selaras dengan panel Spreadsheet).
3. Tekan tombol **Datang** pada satu item.
4. Periksa:
   - Kolom J/K di sheet `purchase order` ter-update.
   - Ada baris baru di `Barang masuk` dengan keterangan berisi "DATANG PO … (konfirmasi PWA)".
   - Panel Dashboard (Minggu Ini) dan grafik donat ter-refresh (setelah ±15 detik atau refresh manual).
5. Ulangi untuk **Sebagian** dan **Belum**.

## Catatan Keamanan
- Modul ini **tidak** menimpa `addTransaction`, `bulkTransaction`, idempotency ledger, atau sheet Stock CV/PT.
- Chart yang sudah dibangun Manus (status per divisi + donut) **tidak disentuh**.
- Write Barang masuk dari konfirmasi memakai `appendRow` + cek requestId sederhana agar anti-dobel.
- Jika ingin menonaktifkan write Barang masuk otomatis, ubah baris `wroteMasuk = _poWriteBarangMasukConfirm_…` menjadi komentar.

## Frontend PWA
Tidak ada perubahan wajib pada DashboardPage.jsx / api.js untuk rilis ini.
Tombol konfirmasi, donut, dan grafik status divisi sudah selaras secara label dan warna.

## Verifikasi Selesai
- [ ] getStatusPO mengembalikan status yang sama dengan panel Dashboard
- [ ] Tombol Datang menulis J/K + Barang masuk
- [ ] Panel A28:F44 & H28:M43 terisi benar, warna konsisten
- [ ] Chart di Spreadsheet tetap 2 buah (tidak bertambah)
- [ ] Tidak ada error di Apps Script execution log
