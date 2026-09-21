# Deploy align V6.6.3 — 21 Sep 2026

## Urutan wajib
1. Paste Code.gs OPTIMIZED BULK di Apps Script → Save
2. Jalankan `setupConfigSheet` lalu `setupEnvironment`
3. Cek sheet Config: VERSION harus `6.6.3+OPT-BULK+HOLD-SHORT+DASH-PC`
4. Deploy → Manage deployments → New version → Deploy
5. Push main (repo ini) → Vercel auto
6. Hard refresh PWA / buka ulang APK
7. Di Settings PWA: pastikan URL Web App = deployment terbaru + API Secret benar

## Uji cepat
- Ping / health dari Settings
- 1 item keluar HOLD (stok kurang) → keterangan `order …, sisa … kurang …`
- Batch 15 item keluar
- Status PO di Beranda
