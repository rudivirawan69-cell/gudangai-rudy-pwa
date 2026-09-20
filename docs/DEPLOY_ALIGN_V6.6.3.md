# Deploy alignment — V6.6.3 OPTIMIZED BULK (2026-09-20)

## Status
- [x] Frontend api.js: sheet resmi, transactions[], queueApproved, chunk 15, timeout 150s
- [x] Code.gs full optimized di `docs/Code_GudangAI_V6.6.3_OPTIMIZED_BULK.gs`
- [x] Root `Code.gs` = pointer + BACKEND_VERSION
- [ ] **Anda:** paste full Code.gs ke Apps Script + Deploy New version
- [ ] Uji batch keluar 20 → 40 → 80 item

## Langkah Apps Script (besok)
1. Download / buka raw: `docs/Code_GudangAI_V6.6.3_OPTIMIZED_BULK.gs`
2. Extensions → Apps Script → ganti seluruh isi Code.gs
3. Save
4. Deploy → Manage deployments → pensil → **New version** → Deploy
5. (Opsional) Pastikan URL Web App sama dengan yang di Settings PWA / DEFAULT_API_URL

## Setelah deploy backend
1. Hard refresh https://gudangai-rudy.vercel.app (atau clear site data)
2. Tes PO (sudah lolos sebelumnya)
3. Tes barang keluar batch 20, lalu 40–80
4. Jika antrian: cek sheet dulu; jika sudah tertulis → Sukses (jangan kirim ulang)

## Kontrak batch (frontend ↔ backend)
| Field | Nilai |
|-------|--------|
| action | addTransactionBatch |
| sheet | Barang keluar / Barang masuk / Barang Rusak |
| entitas | CV atau PT |
| transactions[] | kodeBarang, qty, keterangan, transactionId, nonce, queueApproved |
| queueApproved | true |

## Anti-timeout
Backend optimized = 1 lock + setValues bulk. Frontend chunk 15 × timeout 150s.
