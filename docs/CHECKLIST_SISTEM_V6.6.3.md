# Checklist Sistem GudangAI RUDY — V6.6.3 + Input Multi-Sumber

**Tanggal:** 18 September 2026  
**Status backend:** Deploy Apps Script dijadwalkan besok pagi  
**Status frontend:** Fitur Tempel Teks Order + Foto Rekap Order (OCR) siap diterapkan

---

## A. Checklist Deploy Backend (besok pagi)

| No | Langkah | Status | Catatan |
|----|---------|--------|--------|
| 1 | Buka Apps Script → pastikan Code.gs = V6.6.3 full (BULK_OPTIMIZED) | ☐ | BACKEND_VERSION = `6.6.3+PO-ROW4-6-STATUS-6COL-DASH` |
| 2 | Save | ☐ | |
| 3 | Jalankan `setupEnvironment()` sekali | ☐ | |
| 4 | Deploy → Manage deployments → New version | ☐ | Execute as: Me · Anyone |
| 5 | Pastikan URL Web App + API_SECRET di PWA Settings benar | ☐ | |
| 6 | Uji health/status → versi 6.6.3 | ☐ | |

---

## B. Checklist Uji Pasca-Deploy Backend

| No | Uji | Hasil diharapkan | Status |
|----|-----|------------------|--------|
| 1 | Batch 15–20 item barang keluar | Sukses total, < 60 detik | ☐ |
| 2 | Batch 40–80 item | Sukses atau partial bersih (bukan timeout) | ☐ |
| 3 | Status PO Dashboard (section 4 & 5) | Data terisi, bukan semua 0 | ☐ |
| 4 | Grafik Donat Status PO | Muncul setelah `refreshDashboard(true)` | ☐ |
| 5 | Shortage HOLD | Qty 0 + keterangan HOLD jika stok kurang | ☐ |
| 6 | Antrian → tombol Sukses | Berfungsi jika data sudah tertulis | ☐ |

---

## C. Mekanisme Input Barang Keluar (semua jalur)

Semua jalur memakai pipeline validasi yang sama:

`teks → parseLinesFromText → validateItems (deterministic + alias) → applyStockAwareFallback → keranjang`

| No | Mekanisme | Status | Keterangan |
|----|-----------|--------|------------|
| 1 | Cari nama manual | ✅ | Pertahankan |
| 2 | Suara (Chrome) | ✅ | Pertahankan |
| 3 | QR / Barcode | ✅ | Pertahankan |
| 4 | PDF / Validasi | ✅ >90% | Pertahankan |
| 5 | **Tempel Teks Order** | ✅ Baru | Textarea → validasi sama PDF |
| 6 | **Foto Rekap Order (OCR)** | ✅ Baru | Kamera/galeri → OCR → validasi sama PDF |

---

## D. Bug yang diperbaiki

### D1. Mode Kamera belum membaca foto rekap order
- **Perbaikan:** Mode **Foto Rekap Order** — ambil foto dari kamera atau galeri → Tesseract OCR → pipeline validasi PDF.

### D2. Belum ada Tempel Teks Order
- **Perbaikan:** Tombol **Tempel Teks Order** → textarea → Validasi Teks → keranjang (pipeline sama).

---

## E. Aturan penerapan (jangan diubah)

1. Deterministic rules sebelum matchByAlias.
2. Parenthesis tidak di-strip sebelum keputusan semantik.
3. Item non-master dilewati.
4. Ambigu hanya jika ada kandidat master.
5. Keterangan dikosongkan — user isi manual.
6. Write-once + idempotency tetap.
7. Batch timeout → antrian (bukan auto-serial).

---

## F. Urutan kerja

1. Deploy frontend (InputPage dengan Tempel Teks + Foto Rekap).
2. Besok pagi: Deploy Code.gs V6.6.3 ke Apps Script.
3. Uji checklist B + uji semua mekanisme input.
