/**
 * GudangAI RUDY — Modul Dashboard PO Mingguan
 * Tempel SELURUH isi file ini di BAGIAN PALING BAWAH Code.gs production (2000+ baris).
 * JANGAN mengganti / menghapus kode yang sudah ada.
 *
 * Setelah tempel:
 * 1. Save
 * 2. Deploy → Manage deployments → Edit → New version → Deploy
 * 3. Jalankan sekali: setupWeeklyPOLayoutOnce()
 * 4. (Opsional) Jalankan testWeeklyPOCalculation()
 *
 * Yang diisi:
 * - No.4  PO Minggu Ini          (daftar item PO aktif minggu berjalan)
 * - No.5  Status PO Minggu Lalu  (DATANG / SEBAGIAN DATANG / BELUM DATANG)
 * Tinggi dinamis max 15 baris, tidak menimpa grafik donat.
 */

var WEEKLY_PO_CFG = {
  dashSheetName: 'Dashboard',
  poSheetNames: ['purchase order', 'Purchase Order', 'PO'],
  masukSheetNames: ['Barang masuk', 'Barang Masuk'],
  outputStartRow: 25,          // baris mulai blok No.4 / No.5 (sesuaikan jika layout beda)
  maxRows: 15,
  labelCol: 1,                 // kolom A
  valueCol: 2,                 // kolom B
  statusCol: 3                 // kolom C (untuk status)
};

/**
 * Setup layout sekali saja (judul + header).
 * Jalankan dari editor Apps Script: pilih fungsi → Run.
 */
function setupWeeklyPOLayoutOnce() {
  var lock = LockService.getDocumentLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, error: 'Lock timeout' };
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(WEEKLY_PO_CFG.dashSheetName);
    if (!sh) return { success: false, error: 'Sheet Dashboard tidak ditemukan' };

    var r = WEEKLY_PO_CFG.outputStartRow;
    // Judul No.4
    sh.getRange(r, 1).setValue('4. PO MINGGU INI');
    sh.getRange(r, 1).setFontWeight('bold');
    // Header tabel
    sh.getRange(r + 1, 1, r + 1, 4).setValues([['No', 'Nama Barang', 'Qty Total', 'Status']]);
    sh.getRange(r + 1, 1, r + 1, 4).setFontWeight('bold');

    // Judul No.5 (di bawah area data max 15 baris)
    var r5 = r + 2 + WEEKLY_PO_CFG.maxRows + 1;
    sh.getRange(r5, 1).setValue('5. STATUS PO MINGGU LALU');
    sh.getRange(r5, 1).setFontWeight('bold');
    sh.getRange(r5 + 1, 1, r5 + 1, 4).setValues([['No', 'Nama Barang', 'Qty PO', 'Status']]);
    sh.getRange(r5 + 1, 1, r5 + 1, 4).setFontWeight('bold');

    return { success: true, message: 'Layout No.4 & No.5 disiapkan di baris ' + r };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Refresh data No.4 (minggu ini) + No.5 (minggu lalu).
 * Dipanggil dari updateDashboardStatusPO_ di Code.gs lama.
 */
function refreshWeeklyPODashboard_() {
  var lock = LockService.getDocumentLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, error: 'Lock timeout' };
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dash = ss.getSheetByName(WEEKLY_PO_CFG.dashSheetName);
    if (!dash) return { success: false, error: 'Dashboard not found' };

    var poSh = _findSheet_(ss, WEEKLY_PO_CFG.poSheetNames);
    var masukSh = _findSheet_(ss, WEEKLY_PO_CFG.masukSheetNames);

    var thisWeek = _getWeekRange_(0);   // minggu berjalan
    var lastWeek = _getWeekRange_(-1);  // minggu lalu

    var poItems = poSh ? _readPOItems_(poSh) : [];
    var masukItems = masukSh ? _readMasukItems_(masukSh) : [];

    // No.4 — PO Minggu Ini (item yang tgl kedatangan atau dibuat di minggu ini)
    var current = poItems.filter(function (it) {
      return _inRange_(it.tgl, thisWeek.start, thisWeek.end);
    });
    _writePOBlock_(dash, WEEKLY_PO_CFG.outputStartRow + 2, current, masukItems, false);

    // No.5 — Status PO Minggu Lalu
    var previous = poItems.filter(function (it) {
      return _inRange_(it.tgl, lastWeek.start, lastWeek.end);
    });
    var r5 = WEEKLY_PO_CFG.outputStartRow + 2 + WEEKLY_PO_CFG.maxRows + 3;
    _writePOBlock_(dash, r5, previous, masukItems, true);

    return {
      success: true,
      thisWeekCount: current.length,
      lastWeekCount: previous.length,
      message: 'Dashboard PO mingguan diperbarui'
    };
  } catch (err) {
    return { success: false, error: String(err) };
  } finally {
    lock.releaseLock();
  }
}

/** Alias publik jika dipanggil manual */
function refreshWeeklyPODashboard() {
  return refreshWeeklyPODashboard_();
}

function testWeeklyPOCalculation() {
  var res = refreshWeeklyPODashboard_();
  Logger.log(JSON.stringify(res));
  return res;
}

/* ===================== HELPER ===================== */

function _findSheet_(ss, names) {
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (sh) return sh;
  }
  return null;
}

function _getWeekRange_(offsetWeeks) {
  var now = new Date();
  var day = now.getDay(); // 0=Minggu
  var diffToMon = day === 0 ? -6 : 1 - day;
  var mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon + (offsetWeeks * 7));
  mon.setHours(0, 0, 0, 0);
  var sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { start: mon, end: sun };
}

function _inRange_(d, start, end) {
  if (!d) return false;
  var t = d.getTime ? d.getTime() : new Date(d).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function _readPOItems_(sh) {
  var last = sh.getLastRow();
  if (last < 6) return [];
  // Asumsi: baris 6+ kolom B=Nama, E=PO CV, F=PO PT, G=Total, H=Tgl Kedatangan
  var data = sh.getRange(6, 2, last, 9).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var nama = String(row[0] || '').trim();
    if (!nama) continue;
    var total = Number(row[5]) || (Number(row[3]) || 0) + (Number(row[4]) || 0);
    if (total <= 0) continue;
    var tgl = row[6];
    if (!(tgl instanceof Date)) {
      try { tgl = new Date(tgl); } catch (e) { tgl = null; }
    }
    out.push({ nama: nama, qty: total, tgl: tgl });
  }
  return out;
}

function _readMasukItems_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  // Asumsi umum: kolom keterangan / nama + qty. Sesuaikan indeks jika layout beda.
  var data = sh.getRange(2, 1, last, 8).getValues();
  var map = {};
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var ket = String(row[3] || row[2] || '').trim().toLowerCase();
    var qty = Number(row[4] || row[2] || 0);
    if (!ket || qty <= 0) continue;
    map[ket] = (map[ket] || 0) + qty;
  }
  return map;
}

function _statusOf_(nama, qtyPO, masukMap) {
  var key = String(nama || '').trim().toLowerCase();
  var received = 0;
  // exact + partial match sederhana
  for (var k in masukMap) {
    if (k.indexOf(key) >= 0 || key.indexOf(k) >= 0) {
      received += masukMap[k];
    }
  }
  if (received <= 0) return 'BELUM DATANG';
  if (received >= qtyPO) return 'DATANG';
  return 'SEBAGIAN DATANG';
}

function _writePOBlock_(sh, startRow, items, masukMap, withStatus) {
  var max = WEEKLY_PO_CFG.maxRows;
  // Clear area
  sh.getRange(startRow, 1, startRow + max - 1, 4).clearContent();

  var rows = [];
  for (var i = 0; i < Math.min(items.length, max); i++) {
    var it = items[i];
    var status = withStatus ? _statusOf_(it.nama, it.qty, masukMap) : '';
    rows.push([i + 1, it.nama, it.qty, status]);
  }
  if (rows.length) {
    sh.getRange(startRow, 1, startRow + rows.length - 1, 4).setValues(rows);
  }
}

/**
 * Hook yang dipanggil dari updateDashboardStatusPO_ yang sudah ada.
 * Tambahkan 1 baris di akhir fungsi updateDashboardStatusPO_ lama:
 *
 *   try { refreshWeeklyPODashboard_(); } catch (e) {}
 *
 */
