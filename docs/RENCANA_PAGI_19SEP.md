# Rencana Aman — 19 September 2026 (Pagi PC)

**Status PR (sudah dibersihkan):**
- Ditutup: #10, #20, #21 (tumpang tindih / outdated)
- Tetap open: **#22** (P1-P3 reliability) — merge nanti setelah Vercel limit hilang
- Tetap open: **#19** (anti double-submit + keterangan kosong) — tinjau saat merge #22

---

## TAHAP 1 — Deploy Backend V6.6.4 (PRIORITAS UTAMA)

File: `Code_GudangAI_V6.6.4_FINAL_PREDEPLOY.gs` (±188 KB)

### Langkah di PC
1. Buka Spreadsheet Cold Storage → **Extensions → Apps Script**
2. Di editor Code.gs: **Ctrl+A → Delete**
3. Buka file V6.6.4 → **Ctrl+A → Ctrl+C** → tempel di Apps Script
4. **Ctrl+S** (Save)
5. Function dropdown → pilih **`setupEnvironment`** → klik **Run**
   - Izinkan OAuth jika muncul (pilih akun owner)
6. **Deploy → Manage deployments → Edit (ikon pensil) → New version → Deploy**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. **Jangan** buat deployment URL baru kecuali yang lama rusak

### Verifikasi cepat (5 menit)
| Cek | Hasil OK |
|-----|----------|
| Buka Web App URL + `?action=ping` | `success: true` + version mengandung `6.6.4` |
| Settings PWA → status koneksi | Terhubung |
| Batch 15–20 barang keluar | Sukses, sheet terisi, lonceng OK |
| Batch ~40 item | Selesai < ~90–120 detik, tidak timeout total |
| Status PO di Beranda | Data muncul (bukan semua 0) |
| Shortage keluar | Qty 0 + keterangan HOLD jika stok kurang |

**Jika item masuk Antrian:** cek sheet dulu. Sudah tertulis → tekan **Sukses** (jangan kirim ulang).

---

## TAHAP 2 — Setelah GS stabil (siang / sore)

1. Uji lapangan input multi-sumber:
   - Tempel Teks Order (3–5 baris)
   - Foto Rekap Order (1 foto jelas)
   - PDF validasi
   - QR / Suara / Cari manual
2. Catat hasil matching (>90% target) dan bug kamera/OCR jika ada
3. Pastikan tidak ada baris dobel di sheet transaksi

---

## TAHAP 3 — Frontend (setelah Vercel rate-limit hilang, ~24 jam dari 18 Sep 17:20)

1. Merge **#22** dengan hati-hati (three-way):
   - Ambil reliability: coalescing, SWR, IndexedDB queue, circuit breaker, adaptive timeout
   - Pertahankan dari main: visual V6.7, Foto Rekap, Tempel Teks, camera flow
   - Jangan timpa: write-once, HOLD, CV/PT, kolom D/E, PO row 4/5/6
2. Tinjau apakah fix #19 sudah tercakup di #22; jika belum, port manual
3. Setelah merge:
   ```
   npm ci
   npm run validate:p1p3
   npm run lint
   npm run build
   ```
4. Preview Vercel → hard refresh PWA di Android

---

## Yang TIDAK dilakukan pagi ini
- Merge #22 sekarang (masih dirty + Vercel limit)
- Ubah URL API di PWA (kecuali deployment benar-benar URL baru)
- Hardcode API_SECRET
- Overwrite Code.gs dengan versi < 6.6.4

---

## Kontak file kunci
- Backend siap deploy: `Code_GudangAI_V6.6.4_FINAL_PREDEPLOY.gs`
- Panduan singkat: `docs/DEPLOY_BESOK_PAGI.md`
- Handoff P1-P3: `docs/GROK_HANDOFF_P1-P3.md` (di branch p1-p3-v6.7-final)

**Setelah deploy GS selesai, balas di chat ini dengan hasil ping + uji batch.**
Saya akan lanjutkan merge frontend + perbaikan sisa.
