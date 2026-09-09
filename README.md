# GudangAI RUDY PWA

Dashboard stok & operasional Cold Storage Nasi Goreng 69.

**Production URL:** https://gudangai-rudy-pwa-k9b7.vercel.app/

**Version:** 0.1.1 (frontend) · Backend Code.gs V6.4.8+SYNC

## Setup Lokal

```bash
npm install
npm run dev
```

## Deploy Google Apps Script

1. Buka [script.google.com](https://script.google.com)
2. Buat project baru (atau buka yang sudah ada), paste isi `Code.gs`
3. Deploy → New deployment → Web app
   - Execute as: Me
   - Who has access: Anyone
4. Salin URL web app
5. Di aplikasi (halaman Atur / Settings) → paste URL tersebut + API Secret (jika diaktifkan) → Uji Koneksi

Spreadsheet ID yang digunakan: `1YAJKGm5JHQH_eYrDMeZEorfGTHhHxu9L4t4pYp7rqww`

**Penting:** Pastikan Script Properties `SPREADSHEET_ID` (jika di-set) atau fallback di Code.gs menunjuk ke spreadsheet yang sama dengan yang dibuka di Google Sheets. Ketidaksesuaian ID adalah penyebab utama stok PWA ≠ spreadsheet.

## Perbaikan V6.4.8 (Sinkronisasi)

- Service Worker tidak lagi meng-cache panggilan API → stok selalu segar.
- Setelah barang masuk / keluar berhasil (atau sebagian), UI memaksa refresh stok.
- Antrian offline disinkronkan lebih agresif saat online / tab aktif.
- Status Aman / Menipis / Kritis mengikuti kolom Stock Aman dari spreadsheet bila tersedia.
- Fallback demo acak hanya dipakai jika URL API belum diatur atau perangkat benar-benar offline.
- Health check stabil (GET status + fallback POST).
- Idempotensi requestId di backend mencegah double-write.

## Ikon PWA

Ikon di-manifest mengarah ke raw GitHub (icon-192.png & icon-512.png) agar selalu tersedia. Untuk same-origin permanen, salin kedua file ke folder `public/` pada deploy berikutnya.

## Vercel

Project terhubung ke repositori ini. Setiap push ke `main` memicu production deploy.

## Default Login

PIN: `6969`

