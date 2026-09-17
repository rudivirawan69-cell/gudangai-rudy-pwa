/**
 * BACKEND GudangAI-69 V6.6.3+PO-ROW4-6-STATUS-6COL-DASH
 *
 * Full source file is provided by owner as attachment:
 * Code_GudangAI_V6.6.3_PO_STATUS_DASHBOARD_FINAL.gs (~169 KB)
 *
 * DEPLOY TO APPS SCRIPT (source of truth):
 * 1. Open Apps Script project bound to the Cold Storage spreadsheet
 * 2. Replace entire Code.gs with the full attached file content
 * 3. Save
 * 4. Run setupEnvironment() once if needed
 * 5. Deploy → Manage deployments → New version
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Confirm DEFAULT_API_URL in PWA Settings matches the new Web App URL if it changed
 *
 * Key changes in this version:
 * - PO table: date row 4, header row 5, data from row 6, columns B:I
 * - getStatusPO() returns items with status MENUNGGU / SEBAGIAN / SELESAI
 * - Matching arrivals via "No : {noPO}[ ITEM : nn ]" + name fallback
 * - Dashboard sections 4 (Minggu Ini) and 5 (Minggu Lalu)
 * - refreshDashboardPOSection_ lightweight update path
 * - Retains V6.5 idempotency, write-once, auto-month, shortage HOLD policy
 *
 * Do not paste partial patches over production. Use the complete file.
 */
