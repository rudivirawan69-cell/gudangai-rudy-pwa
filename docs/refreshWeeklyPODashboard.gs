/**
 * GudangAI - Laporan PO Mingguan untuk area Dashboard No. 5
 * Salin ke project Apps Script yang sama dengan Code.gs
 * Setup: setupWeeklyPOLayoutOnce() sekali, lalu refreshWeeklyPODashboard()
 *
 * Lihat file lengkap di attachment / repo docs.
 * Fungsi utama: refreshWeeklyPODashboard, setupWeeklyPOLayoutOnce,
 * testWeeklyPOCalculation, installOneWeeklyPOTrigger
 *
 * Sumber: purchase order + Barang masuk
 * Output: Dashboard baris mulai outputStartRow (default 25)
 * Status: DATANG | SEBAGIAN DATANG | BELUM DATANG
 * Aman: LockService, tidak menulis sheet sumber
 */

// Full script is maintained in the repository history and local attachments.
// Paste the complete refreshWeeklyPODashboard script into Apps Script editor
// alongside Code.gs, then:
// 1) Run setupWeeklyPOLayoutOnce()
// 2) Run testWeeklyPOCalculation()
// 3) Optionally installOneWeeklyPOTrigger() with autoRefreshOnEdit=false first

function refreshWeeklyPODashboardStub() {
  return {
    success: false,
    message: 'Paste full script from docs/refreshWeeklyPODashboard.gs (complete version) into this Apps Script project.'
  };
}
