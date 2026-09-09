# GudangAI RUDY — Deploy Notes (10 Sep 2026)

## 1. Apps Script (Anda eksekusi manual)

1. Buka spreadsheet → Extensions → Apps Script.
2. Terapkan patch:
   - Alias `addTransactionBatch`
   - `getStatusPO` + helper kode unik
   - `getWeeklyVolume_` + label Volume Minggu Ini
   - `onEdit` ringan (hanya clear cache)
   - Chart donat mulai baris 34/36
3. Save → **Deploy → New deployment** (Web app, Execute as Me, Anyone).
4. Salin URL Web App → paste di Settings PWA.

## 2. PWA (Vercel)

Repo: `rudivirawan69-cell/gudangai-rudy-pwa`  
Framework: Vite + React + Tailwind

Build command: `npm run build`  
Output: `dist`

Setelah push ke `main`, Vercel akan rebuild otomatis jika project sudah terhubung ke repo ini.

## 3. Endpoint penting setelah deploy Apps Script

- `?action=getStatusPO` → Status PO detail
- `?action=getDashboardData` → Ringkasan dashboard
- POST `addTransactionBatch` / `bulkTransaction` → kirim keranjang

## 4. Catatan InputPage

File `src/pages/InputPage.jsx` di repo sempat placeholder. Pastikan halaman Input lengkap (voice, PDF, auto kode unik PO) sebelum production.

## 5. Sinkronisasi

| Fitur | Spreadsheet | PWA |
|-------|-------------|-----|
| Volume Minggu Ini | Dashboard No. 3 | (opsional ringkas) |
| Status PO | Dashboard No. 5 | Beranda Status PO |
| Stok | Stock CV/PT | Halaman Stok |
| Transaksi | Barang masuk/keluar | Input + batch |
