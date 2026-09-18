# Deploy Besok Pagi — V6.6.4 FINAL-PREDEPLOY (Zero Drama)

**File resmi backend:** `Code_GudangAI_V6.6.4_FINAL_PREDEPLOY.gs` (attachment audited)  
**Version string:** `6.6.4+FINAL-PREDEPLOY`  
**Frontend:** sudah live (Tempel Teks + Foto Rekap + visual V6.7 + SW v6.7)

---

## Kontrak PWA ↔ GS (sudah cocok — jangan ubah pagi)

| PWA (`api.js`) | Backend V6.6.4 |
|----------------|----------------|
| `action: addTransactionBatch` + `transactions` / `items` | → `bulkTransaction` |
| `sheet`: Barang masuk / Barang keluar / Barang Rusak | Whitelist `SHEET_CONFIG` |
| `entitas`: CV \| PT | Wajib |
| `queueApproved: true` | Wajib untuk batch/outbox |
| `schemaVersion: "1.0"` | Diterima |
| `clientItemId` → requestId / transactionId / nonce | Idempotency ledger |
| `getStatusPO` / `ping` / `getAllStock` | Endpoint ada (GET+POST) |
| Timeout tulis 120s | Bulk `setValues` B:C + F:G |

**Tempel Teks / Foto Rekap:** hanya frontend → keranjang → `submitBarang*`. **Tidak ada endpoint GS baru.**

---

## Langkah deploy (5–10 menit)

1. Spreadsheet → **Extensions → Apps Script**
2. Buka `Code.gs` → select all → hapus → tempel **seluruh** isi V6.6.4 FINAL-PREDEPLOY
3. **Save**
4. Jalankan **`setupEnvironment`** (Run)
5. **Deploy → Manage deployments → Edit → New version → Deploy** (Me / Anyone)
6. Jangan buat URL deployment baru kecuali yang lama rusak

### Verifikasi

- `?action=ping` → JSON, version mengandung **6.6.4**
- Settings PWA → Terhubung
- Batch 15–20 keluar → sheet + lonceng
- Batch 40 → &lt; ~90s
- Status PO Beranda → data muncul

Antrian: cek sheet dulu; sudah tertulis → Sukses (jangan kirim ulang).

---

## Yang tidak perlu pagi

- Ubah URL API / patch frontend / secret di repo / file &lt; 6.6.4
