/**
 * ============================================================
 * BACKEND GudangAI-69 V6.6.3 — PO Status Dashboard Final
 * ============================================================
 * Version: 6.6.3+PO-ROW4-6-STATUS-6COL-DASH
 *
 * IMPORTANT:
 * This GitHub root Code.gs is a version pointer.
 * The full production source of truth lives in Apps Script.
 *
 * To deploy:
 * 1. Open the attached file Code_GudangAI_V6.6.3_PO_STATUS_DASHBOARD_FINAL.gs
 * 2. Copy ALL content
 * 3. Paste into Apps Script project (replace existing Code.gs)
 * 4. Save → Deploy → New version (Execute as: Me, Who has access: Anyone)
 *
 * Key features in V6.6.3:
 * - PO data starts row 6, date row 4, header row 5
 * - Status PO 6-column dashboard block
 * - getStatusPO() with arrival matching by No PO [ITEM : nn] + name fallback
 * - refreshDashboardPOSection_ for Minggu Ini / Minggu Lalu
 * - writePurchaseOrder_ / submitPO support
 * - Idempotency ledger + write-once safety retained
 * - Auto-month + deterministic date parse
 *
 * Full file also stored under docs/ when size permits.
 * See commit history and MEMORY.md for baseline rules.
 */

// PLACEHOLDER — replace with full content of
// Code_GudangAI_V6.6.3_PO_STATUS_DASHBOARD_FINAL.gs before production use.
// Backend version string expected by PWA health checks:
const BACKEND_VERSION = "6.6.3+PO-ROW4-6-STATUS-6COL-DASH";
