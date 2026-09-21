# Sinkronisasi V6.6.3 — Spreadsheet ↔ PWA ↔ GitHub ↔ Vercel

Tanggal: 2026-09-21

## Komponen

| Lapisan | Sumber kebenaran | Status |
|---------|------------------|--------|
| Backend Apps Script | Code.gs di spreadsheet (paste lokal OPTIMIZED BULK) | V6.6.3+OPT-BULK+HOLD-SHORT+DASH-PC |
| Frontend PWA | repo `rudivirawan69-cell/gudangai-rudy-pwa` branch `main` | api.js aligned |
| Hosting | Vercel auto-deploy dari `main` | https://gudangai-rudy-pwa.vercel.app |

## Kontrak API (wajib sama)

### Tulis transaksi
- Action: `addTransaction` (1 item) atau `addTransactionBatch` → backend `bulkTransaction`
- Sheet: `Barang masuk` | `Barang keluar` | `Barang Rusak` (nama resmi)
- Field: `entitas` (CV/PT), `kodeBarang`, `qty`, `tanggal`, `keterangan`
- Anti-dobel: `transactionId`, `nonce`, `requestId`, `queueApproved: true`
- Payload batch: `transactions[]` (boleh juga `items[]` sebagai alias)

### HOLD shortage (keluar)
- qty ditulis **0**
- keterangan: `order N, sisa X kurang Y` (tanpa followUp)

### Tanggal
- PWA kirim `YYYY-MM-DD` (WIB via localDateYMD)
- Sheet kolom B: `d-MMM-yyyy` contoh `21-Sep-2026`

### Baca
- `getAllStock?entitas=CV|PT|ALL`
- `getStatusPO`
- `getDashboard` / `getDashboardData`
- `submitPO` / `writePurchaseOrder`

## Timeout frontend
- WRITE_TIMEOUT_MS = 150000 (150 detik)
- BATCH_CHUNK_SIZE = 15
- Gagal/timeout → Antrian (fail-closed), bukan kirim ulang buta

## Checklist owner setelah push ini
1. Apps Script: paste Code.gs OPTIMIZED BULK → Save → `setupConfigSheet` → `setupEnvironment`
2. Deploy → Manage deployments → **New version** → Deploy
3. Config sheet harus VERSION mengandung `OPT-BULK+HOLD-SHORT`
4. Hard refresh PWA / buka ulang APK
5. Uji 1 HOLD + batch 15 item keluar

## URL
- PWA: https://gudangai-rudy-pwa.vercel.app
- DEFAULT_API_URL di api.js: lihat `src/data/api.js` (boleh diganti di Settings PWA jika deploy Web App baru)
