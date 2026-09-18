# Deploy Besok Pagi — Zero Drama Checklist

**Tujuan:** PWA + Code.gs V6.6.3 sinkron, tanpa revisi ulang.

---

## A. Frontend (sudah di-push malam ini)

| Item | Status |
|------|--------|
| Visual V6.7 (nav kotak tanpa putih, full-screen) | ✅ |
| Performa Android (SW v6.7, lazy pages, viewport-fit) | ✅ |
| Input: Tempel Teks Order + Foto Rekap Order | ✅ (pipeline sama PDF) |
| API `addTransactionBatch` → backend `bulkTransaction` | ✅ sudah cocok |
| **Tidak butuh Code.gs baru** untuk Tempel/Foto | ✅ |

Setelah Vercel Ready: hard refresh / tutup-buka PWA di Android.

---

## B. Backend Apps Script (besok pagi — 5–10 menit)

### Sumber kode (pilih SATU)

1. **File utuh** (disarankan jika ganti seluruh Code.gs):  
   Zip `code gs V6.6.3` / file `Code_GudangAI_V6.6.3_PO_STATUS_DASHBOARD_FINAL_BULK_OPTIMIZED.gs`  
   Version: `6.6.3+PO-ROW4-6-STATUS-6COL-DASH`

2. **Hanya patch bulk** (jika sudah V6.6.3 tanpa optimasi batch):  
   `docs/OPTIMIZE_bulkTransaction_V6.6.3.gs` → ganti **hanya** fungsi `bulkTransaction`

### Langkah exact

1. Spreadsheet → **Extensions → Apps Script**
2. Buka file `Code.gs`
3. **Ganti seluruh isi** dengan file utuh V6.6.3 BULK OPTIMIZED  
   *(atau ganti hanya `function bulkTransaction...` jika patch)*
4. **Save**
5. Jalankan **`setupEnvironment`** sekali (Run) — izinkan permission jika diminta
6. **Deploy → Manage deployments → Edit (pensil) → New version → Deploy**
7. Pastikan: **Execute as: Me**, **Who has access: Anyone**
8. URL Web App **tidak perlu diganti** jika deployment yang sama (hanya New version)

### Verifikasi 2 menit

- `?action=ping` → JSON (bukan HTML error)
- status/version mengandung **6.6.3**
- PWA Settings: URL API + API_SECRET sama dengan Script Properties

---

## C. Uji sinkron PWA ↔ GS (urutan)

| # | Uji | Hasil OK |
|---|-----|----------|
| 1 | Ping / status dari Settings | Terhubung, version 6.6.3 |
| 2 | Input Tempel Teks 3–5 baris → validasi → keranjang | % akurasi, item cocok |
| 3 | Foto Rekap (1 foto jelas) → validasi | Masuk keranjang / flag |
| 4 | PDF validasi (seperti biasa) | ≥90% jika master lengkap |
| 5 | Kirim batch **15–20** item keluar | Sukses / lonceng OK, sheet terisi |
| 6 | Kirim batch **40** (setelah 5 OK) | < 60–90 detik, tidak timeout |
| 7 | Beranda Status PO / donat | Data muncul |

Jika sebagian masuk Antrian: **cek sheet dulu**. Sudah tertulis → tekan **Sukses** (jangan kirim ulang).

---

## D. Yang JANGAN dilakukan besok pagi

- Jangan ganti URL Web App kecuali deployment baru benar-benar URL berbeda
- Jangan auto-serial ulang batch yang sudah timeout
- Jangan overwrite Code.gs dengan versi lama (< 6.6.3)
- Jangan hardcode API_SECRET di repo

---

## E. Ringkas

**Malam ini:** Frontend final (visual + Input Tempel/Foto + perf).  
**Besok pagi:** Tempel Code.gs V6.6.3 → Save → `setupEnvironment` → Deploy New version → uji batch 20.  
**Tidak ada patch Code.gs tambahan** untuk Tempel Teks / Foto Rekap.
