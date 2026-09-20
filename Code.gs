/**
 * ============================================================
 * BACKEND GudangAI-69 V6.6.3 — OPTIMIZED BULK (production reference)
 * ============================================================
 * Version: 6.6.3+PO-ROW4-6-STATUS-6COL-DASH+OPTIMIZED-BULK
 *
 * SOURCE OF TRUTH (full file):
 *   docs/Code_GudangAI_V6.6.3_OPTIMIZED_BULK.gs
 *
 * Deploy ke Apps Script (wajib New version):
 *   1. Buka docs/Code_GudangAI_V6.6.3_OPTIMIZED_BULK.gs (raw / download)
 *   2. Copy ALL → paste ke Apps Script Code.gs (replace)
 *   3. Save → Deploy → Manage deployments → Edit → New version → Deploy
 *      Execute as: Me | Who has access: Anyone
 *
 * Yang baru di bulkTransaction:
 *   - 1 lock untuk seluruh batch
 *   - Load stok 1x (getAllStock) → map memori
 *   - setValues bulk (B:C + F:G), flush 1x
 *   - Shortage HOLD tetap (qty 0 + keterangan)
 *   - Idempotency ledger + cache batchResult_
 *
 * Frontend (src/data/api.js) sudah selaras:
 *   sheet resmi, transactions[], queueApproved, chunk 15, timeout 150s
 *
 * Urutan deploy selaras:
 *   1) Apps Script New version dulu
 *   2) PWA hard refresh (Vercel sudah auto dari main)
 */
const BACKEND_VERSION = "6.6.3+PO-ROW4-6-STATUS-6COL-DASH+OPTIMIZED-BULK";
