/**
 * GudangAI RUDY — Modul Konfirmasi Status PO + Refresh Chart Dashboard
 * Tempel di BAGIAN BAWAH Code.gs production. JANGAN replace seluruh file.
 *
 * Setelah tempel:
 * 1. Save
 * 2. Deploy → Manage deployments → Edit → New version → Deploy
 * 3. Tambah di router doPost:
 *      if (action === 'confirmPOStatus') return confirmPOStatus_(body);
 * 4. PWA: Atur → API Secret terisi
 * 5. Uji: Beranda → ketuk baris PO → Selesai / Sebagian / Menunggu
 */

function confirmPOStatus_(body) {
  body = body || {};
  var lock = LockService.getDocumentLock();
  try { lock.waitLock(20000); } catch (e) {
    return { success: false, error: 'Lock timeout — coba lagi' };
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var nama = String(body.nama || '').trim();
    var noPO = String(body.noPO || body.no || '').trim();
    var status = String(body.status || 'SELESAI').toUpperCase();
    var qty = Number(body.qty) || 0;
    var datangIn = Number(body.datang) || 0;
    var rowIndex = body.rowIndex != null ? Number(body.rowIndex) : null;

    if (!nama && !noPO && !(rowIndex > 0)) {
      return { success: false, error: 'nama / noPO / rowIndex wajib' };
    }
    if (status.indexOf('SELESAI') >= 0 || status === 'DATANG') status = 'SELESAI';
    else if (status.indexOf('SEBAGIAN') >= 0) status = 'SEBAGIAN';
    else status = 'MENUNGGU';

    var poSh = _findSheetPO_(ss);
    if (!poSh) return { success: false, error: 'Sheet Purchase Order tidak ditemukan' };

    var updated = _updatePORowStatus_(poSh, {
      nama: nama, noPO: noPO, status: status, qty: qty, datang: datangIn, rowIndex: rowIndex
    });

    var dashResult = null;
    try { dashResult = refreshDashboardAfterPOConfirm_(); }
    catch (eDash) { dashResult = { success: false, error: String(eDash) }; }

    return {
      success: true,
      status: status,
      updated: updated,
      dashboard: dashResult,
      message: 'PO ' + (nama || noPO) + ' → ' + status
    };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function _findSheetPO_(ss) {
  var names = ['purchase order', 'Purchase Order', 'PO', 'Purchase order'];
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (sh) return sh;
  }
  var all = ss.getSheets();
  for (var j = 0; j < all.length; j++) {
    var n = String(all[j].getName() || '').toLowerCase();
    if (n.indexOf('purchase') >= 0 || n === 'po') return all[j];
  }
  return null;
}

function _updatePORowStatus_(sh, opt) {
  var last = Math.max(sh.getLastRow(), 6);
  var lastCol = Math.max(sh.getLastColumn(), 9);
  var headers = sh.getRange(5, 1, 5, lastCol).getValues()[0];
  if (!headers || !headers.join('')) headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];

  function colOf(re) {
    for (var c = 0; c < headers.length; c++) {
      if (re.test(String(headers[c] || ''))) return c + 1;
    }
    return 0;
  }

  var colNama = colOf(/nama/i) || 2;
  var colTotal = colOf(/total|qty/i) || 7;
  var colDatang = colOf(/datang/i) || 0;
  var colBelum = colOf(/belum/i) || 0;
  var colStatus = colOf(/status/i) || 9;
  var colNo = colOf(/^no\.?$|no\s*po/i) || 1;
  var dataStart = 6;
  var range = sh.getRange(dataStart, 1, last, lastCol).getValues();
  var targetRow = -1;

  if (opt.rowIndex && opt.rowIndex >= dataStart) {
    targetRow = opt.rowIndex - dataStart;
  } else {
    for (var i = 0; i < range.length; i++) {
      var row = range[i];
      var nama = String(row[colNama - 1] || '').trim();
      var no = String(row[colNo - 1] || '').trim();
      if (opt.noPO && no && String(opt.noPO) === no) { targetRow = i; break; }
      if (opt.nama && nama && nama.toLowerCase() === String(opt.nama).toLowerCase()) { targetRow = i; break; }
    }
  }

  if (targetRow < 0 || targetRow >= range.length) {
    return { found: false, error: 'Baris PO tidak ditemukan' };
  }

  var sheetRow = dataStart + targetRow;
  var totalQty = Number(range[targetRow][colTotal - 1]) || Number(opt.qty) || 0;
  var datang = opt.status === 'SELESAI' ? totalQty
    : opt.status === 'SEBAGIAN' ? (Number(opt.datang) || Math.ceil(totalQty / 2))
    : 0;
  var belum = Math.max(0, totalQty - datang);

  sh.getRange(sheetRow, colStatus).setValue(opt.status);
  if (colDatang) sh.getRange(sheetRow, colDatang).setValue(datang);
  if (colBelum) sh.getRange(sheetRow, colBelum).setValue(belum);
  SpreadsheetApp.flush();
  return { found: true, sheetRow: sheetRow, status: opt.status, datang: datang, belum: belum, totalQty: totalQty };
}

function refreshDashboardAfterPOConfirm_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dash = ss.getSheetByName('Dashboard');
  if (!dash) return { success: false, error: 'Sheet Dashboard tidak ada' };

  var hooks = ['refreshWeeklyPODashboard_', 'updateDashboardStatusPO_', 'refreshDashboardPOSection_', 'updateDashboard_'];
  var called = [];
  for (var i = 0; i < hooks.length; i++) {
    try {
      if (typeof this[hooks[i]] === 'function') {
        this[hooks[i]]();
        called.push(hooks[i]);
      }
    } catch (e) {}
  }

  try {
    var charts = dash.getCharts();
    for (var c = 0; c < charts.length; c++) {
      dash.updateChart(charts[c].modify().build());
    }
  } catch (eChart) {}

  SpreadsheetApp.flush();
  return { success: true, hooks: called, charts: (dash.getCharts() || []).length };
}

function testConfirmPOStatus() {
  var res = confirmPOStatus_({ nama: 'Bakso Sapi', status: 'SELESAI', qty: 4 });
  Logger.log(JSON.stringify(res));
  return res;
}
