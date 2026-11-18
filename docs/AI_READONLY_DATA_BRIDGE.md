# Agent Rubee — Read-only Spreadsheet Bridge

Branch ini menambahkan fondasi aman untuk membaca data spreadsheet melalui Worker Cloudflare. Worker memverifikasi Supabase bearer token, mengizinkan action allowlist, meneruskan secret Apps Script hanya dari environment server, dan menambahkan provenance `source`, `action`, `readAt`, `actor`, serta `permissions`.

## Environment Worker

Konfigurasikan melalui secret/variable Cloudflare, bukan file frontend dan bukan Git:

- `GUDANGAI_SHEETS_API_URL`: URL Apps Script Web App `/exec` berawalan `https://`.
- `GUDANGAI_SHEETS_API_SECRET`: API secret yang cocok dengan Script Properties backend.

Jika salah satu belum ada, `/api/agent/health` tetap hidup tetapi melaporkan `dataToolsConfigured: false`; `/api/data` menolak dengan `DATA_TOOLS_NOT_CONFIGURED`.

## Endpoint

`POST /api/data` memerlukan `Authorization: Bearer <Supabase access token>` dan JSON:

```json
{"action":"getDashboardData"}
```

Action yang diizinkan hanya action baca yang cocok dengan dispatcher `doPost` Code.gs. Termasuk `getConfig`, `getDashboardData`, `getAllStock`, `getStockByCode`, `searchByName`, `getLowStock`, `getTransactionHistory`, `getStatusPO`, `getStockDelta`, `getSyncMetrics`, `getLastUpdate`, `getPOAnalysis`, dan `getStockoutRisk`. Action yang tidak tersedia pada dispatcher tidak boleh diiklankan oleh agent; write/admin tetap ditolak Worker.

`getStockoutRisk` adalah action baca baru di Code.gs: ia membandingkan stok live dengan transaksi `Barang keluar` pada jendela 30 hari, melaporkan estimasi cakupan hari dan kandidat yang diproyeksikan habis dalam 3 hari. Item tanpa arus keluar masuk daftar review terpisah, bukan diperlakukan sebagai aman. Hasil adalah estimasi, bukan kepastian; bandingkan dengan PO aktif sebelum rekomendasi.

Tidak ada endpoint ini yang boleh meneruskan transaksi, PO write, ganti periode, penghapusan, atau arbitrary function ke Apps Script. Write tetap menggunakan kontrak PWA/backend yang sudah ada, dengan idempotency, audit, dan read-back. Penambahan action ke source repo tidak otomatis memperbarui Apps Script Web App aktif; rilis Code.gs tetap merupakan gate terpisah.

## Aktivasi berikutnya

1. Set environment Worker melalui dashboard/CLI resmi.
2. Uji `health`, `status`, dan `getDashboardData` dari akun operator terautentikasi.
3. Tambahkan tool read-only ke Agent Rubee dengan sumber dan timestamp di setiap jawaban.
4. Baru setelah itu rancang draft action dan approval untuk operasi tulis.
