/**
 * ============================================================
 * STATUS PO ALIGNED + DASHBOARD DATA-ONLY — V6.7.0
 * Tempel SELURUH isi file ini di BAWAH Code.gs production.
 * Tidak menimpa fungsi transaksi, idempotency, atau write-once.
 * Tidak membuat/menghapus chart. Hanya data + format panel PO.
 * ============================================================
 *
 * Yang dilakukan:
 * 1. getStatusPO() — rekonsiliasi qtyDatang dari Barang masuk + kolom K
 *    (selaras dengan perhitungan panel Dashboard Minggu Ini / Lalu)
 * 2. confirmPOStatus() — update J/K + tulis Barang masuk (jika Datang/Selesai)
 *    dengan keterangan "DATANG PO … (konfirmasi PWA)" + idempotency
 * 3. refreshDashboardPODataOnly_() — isi ulang panel A28:F44 & H28:M43
 *    tanpa mengubah chart, merge, atau layout yang sudah dibersihkan Manus
 * 4. setupDashboardPOLayoutOnce() — format warna/header konsisten (opsional)
 *
 * Deploy:
 * 1. Nonaktifkan (//) fungsi lama yang berpotensi tabrakan:
 *    - buildMasterExecutiveDashboardV69
 *    - refreshWeeklyPODashboard (versi lama outputStartRow:25)
 * 2. Tempel file ini di paling bawah Code.gs
 * 3. Save → Deploy New version (Execute as Me, Anyone)
 * 4. (Opsional) jalankan setupDashboardPOLayoutOnce() sekali
 * ============================================================
 */

var STATUS_PO_ALIGNED_VERSION = '6.8.0+WEEK-SYNC';

/**
 * Helper: normalisasi nama untuk matching
 */
function _poNormName_(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

/**
 * Helper: ambil sheet dengan beberapa nama alternatif
 */
function _poGetSheet_(ss, names) {
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (sh) return sh;
  }
  return null;
}

/**
 * Hitung qty datang dari sheet Barang masuk (setelah tgl PO aktif)
 * Matching by nama (normalized) atau kode jika tersedia.
 */
function _poDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return new Date(v.getTime());
  var s = String(v || '').trim();
  if (!s) return null;
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}
function _poStartOfWeek_(d) {
  var x = new Date(d || new Date());
  x.setHours(0, 0, 0, 0);
  var day = x.getDay();
  x.setDate(x.getDate() - (day === 0 ? 6 : day - 1));
  return x;
}
function _poAddDays_(d, n) {
  var x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}
function _poComputeArrivalsFromMasuk_(ss, periodStart, periodEnd) {
  var sh = _poGetSheet_(ss, ['Barang masuk', 'Barang Masuk', 'barang masuk']);
  if (!sh) return {};
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return {};
  var rows = sh.getRange(2, 1, lastRow - 1, 8).getValues();
  var out = {};
  rows.forEach(function(row) {
    var tgl = _poDate_(row[0]);
    if (!tgl || tgl < periodStart || tgl >= periodEnd) return;
    var kode = String(row[1] || row[2] || '').trim();
    var nama = String(row[2] || row[3] || row[1] || '').trim();
    var qty = 0;
    for (var c = 3; c <= 7; c++) {
      var q = Number(row[c]);
      if (!isNaN(q) && q > 0) { qty = q; break; }
    }
    if (qty <= 0) return;
    var nk = _poNormName_(nama), kk = _poNormName_(kode);
    if (nk) out[nk] = (out[nk] || 0) + qty;
    if (kk && kk !== nk) out[kk] = (out[kk] || 0) + qty;
  });
  return out;
}
function _poReadWeekItems_(ss, poSheet, start, end) {
  var lastRow = poSheet.getLastRow();
  if (lastRow < 6) return [];
  var data = poSheet.getRange(6, 2, lastRow - 5, 10).getValues();
  var arrivals = _poComputeArrivalsFromMasuk_(ss, start, end);
  var items = [];
  data.forEach(function(row, idx) {
    var no = row[0], nama = String(row[1] || '').trim();
    if (!nama) return;
    var tgl = _poDate_(row[7]);
    if (!tgl || tgl < start || tgl >= end) return;
    var qtyPO = Number(row[6]) || 0;
    var statusCell = String(row[8] || '').toUpperCase();
    var qtyK = Number(row[9]) || 0;
    var fromMasuk = arrivals[_poNormName_(nama)] || 0;
    var qtyDatang = Math.max(qtyK, fromMasuk);
    var status = 'MENUNGGU';
    if (qtyDatang >= qtyPO && qtyPO > 0) status = 'SELESAI';
    else if (qtyDatang > 0) status = 'SEBAGIAN';
    else if (statusCell.indexOf('SELESAI') >= 0 || statusCell.indexOf('DATANG') >= 0) status = 'SELESAI';
    else if (statusCell.indexOf('SEBAGIAN') >= 0) status = 'SEBAGIAN';
    items.push({
      itemNo: no || (idx + 1),
      nama: nama,
      size: String(row[2] || ''),
      satuan: String(row[3] || 'Pack'),
      qtyPO: qtyPO,
      qtyDatang: qtyDatang,
      tglKedatangan: tgl,
      status: status
    });
  });
  return items;
}
function _poSummary_(items) {
  var s = { totalItem: items.length, itemMenunggu: 0, itemSebagian: 0, itemSelesai: 0 };
  items.forEach(function(it) {
    if (it.status === 'SELESAI') s.itemSelesai++;
    else if (it.status === 'SEBAGIAN') s.itemSebagian++;
    else s.itemMenunggu++;
  });
  return s;
}
function getStatusPO() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var poSheet = _poGetSheet_(ss, ['purchase order', 'Purchase Order', 'Purchase order']);
    if (!poSheet) return { success: false, error: 'Sheet purchase order tidak ditemukan', version: '6.8.0+WEEK-SYNC' };
    var now = new Date();
    var thisStart = _poStartOfWeek_(now);
    var nextStart = _poAddDays_(thisStart, 7);
    var prevStart = _poAddDays_(thisStart, -7);
    var currentItems = _poReadWeekItems_(ss, poSheet, thisStart, nextStart);
    var previousItems = _poReadWeekItems_(ss, poSheet, prevStart, thisStart);
    return {
      success: true,
      version: '6.8.0+WEEK-SYNC',
      weekKey: Utilities.formatDate(thisStart, Session.getScriptTimeZone() || 'Asia/Jakarta', 'dd-MM-yyyy') + ' s/d ' + Utilities.formatDate(_poAddDays_(thisStart, 6), Session.getScriptTimeZone() || 'Asia/Jakarta', 'dd-MM-yyyy'),
      poStartDate: Utilities.formatDate(thisStart, Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd'),
      poEndDate: Utilities.formatDate(_poAddDays_(thisStart, 6), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd'),
      summary: _poSummary_(currentItems),
      items: currentItems,
      previousWeek: {
        weekKey: Utilities.formatDate(prevStart, Session.getScriptTimeZone() || 'Asia/Jakarta', 'dd-MM-yyyy') + ' s/d ' + Utilities.formatDate(_poAddDays_(prevStart, 6), Session.getScriptTimeZone() || 'Asia/Jakarta', 'dd-MM-yyyy'),
        poStartDate: Utilities.formatDate(prevStart, Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd'),
        poEndDate: Utilities.formatDate(_poAddDays_(prevStart, 6), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd'),
        summary: _poSummary_(previousItems),
        items: previousItems
      }
    };
  } catch (err) {
    return { success: false, error: String(err.message || err), version: '6.8.0+WEEK-SYNC' };
  }
}
function confirmPOStatus(body) {
  try {
    body = body || {};
    var itemNo = body.itemNo;
    var nama = String(body.nama || '').trim();
    var qtyDatang = Number(body.qtyDatang);
    if (isNaN(qtyDatang) || qtyDatang < 0) qtyDatang = 0;
    var status = String(body.status || 'SELESAI').toUpperCase();
    var requestId = String(body.requestId || body.transactionId || ('POCONF-' + Date.now()));

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var poSheet = _poGetSheet_(ss, ['purchase order', 'Purchase Order', 'Purchase order']);
    if (!poSheet) {
      return { success: false, error: 'Sheet purchase order tidak ditemukan' };
    }

    var lastRow = Math.max(poSheet.getLastRow(), 6);
    var data = poSheet.getRange(6, 2, lastRow, 3).getValues();

    var foundRow = -1;
    var foundNama = '';
    var foundNo = '';
    for (var i = 0; i < data.length; i++) {
      var no = data[i][0];
      var nm = String(data[i][1] || '').trim();
      if ((itemNo && String(no) === String(itemNo)) ||
          (nama && nm.toLowerCase() === nama.toLowerCase())) {
        foundRow = i + 6;
        foundNama = nm;
        foundNo = no;
        break;
      }
    }

    if (foundRow < 0) {
      return { success: false, error: 'Item PO tidak ditemukan' };
    }

    var qtyPO = Number(poSheet.getRange(foundRow, 8).getValue()) || 0;
    if (status === 'SELESAI' || status === 'DATANG') {
      if (qtyDatang <= 0) qtyDatang = qtyPO;
      status = 'SELESAI';
    } else if (status === 'MENUNGGU' || status === 'BELUM') {
      qtyDatang = 0;
      status = 'MENUNGGU';
    } else {
      status = 'SEBAGIAN';
    }

    poSheet.getRange(foundRow, 10).setValue(status);
    poSheet.getRange(foundRow, 11).setValue(qtyDatang);
    SpreadsheetApp.flush();

    var wroteMasuk = false;
    if (status === 'SELESAI' && qtyDatang > 0) {
      wroteMasuk = _poWriteBarangMasukConfirm_(ss, foundNama, qtyDatang, requestId, foundNo);
    }

    try {
      refreshDashboardPODataOnly_();
    } catch (eDash) {}

    return {
      success: true,
      status: 'APPLIED',
      itemNo: foundNo,
      nama: foundNama,
      qtyDatang: qtyDatang,
      wroteMasuk: wroteMasuk,
      version: STATUS_PO_ALIGNED_VERSION
    };
  } catch (err) {
    return { success: false, error: String(err.message || err) };
  }
}

function confirmPOStatus_(body) {
  return confirmPOStatus(body);
}

function _poWriteBarangMasukConfirm_(ss, nama, qty, requestId, noPO) {
  try {
    var sheet = _poGetSheet_(ss, ['Barang masuk', 'Barang Masuk', 'barang masuk']);
    if (!sheet) return false;

    var last = Math.max(sheet.getLastRow(), 1);
    var startCheck = Math.max(2, last - 49);
    if (last >= 2) {
      var recent = sheet.getRange(startCheck, 1, last, 8).getValues();
      for (var r = 0; r < recent.length; r++) {
        var ket = String(recent[r][5] || recent[r][6] || recent[r][4] || '');
        if (ket.indexOf(requestId) >= 0) return false;
      }
    }

    var today = new Date();
    var tanggal = Utilities.formatDate(today, Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
    var keterangan = 'DATANG PO ' + (noPO || '') + ' ' + nama + ' qty=' + qty + ' (konfirmasi PWA) ' + requestId;

    sheet.appendRow([tanggal, '', nama, qty, '', keterangan, 'PWA-CONFIRM']);
    SpreadsheetApp.flush();
    return true;
  } catch (e) {
    return false;
  }
}

function refreshDashboardPODataOnly_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dash = ss.getSheetByName('Dashboard');
  if (!dash) return { success: false, error: 'Sheet Dashboard tidak ditemukan' };
  var status = getStatusPO();
  if (!status.success) return status;

  var items = status.items || [];
  var previous = status.previousWeek || { items: [], summary: {} };
  var summary = status.summary || {};
  var prevItems = previous.items || [];
  var prevSummary = previous.summary || {};

  dash.getRange('A28:F44').clearContent();
  dash.getRange('H28:M43').clearContent();
  dash.getRange('A28').setValue('STATUS PO — MINGGU INI');
  dash.getRange('A29:F30').setValues([
    ['Total Item', summary.totalItem || 0, 'Datang', summary.itemSelesai || 0, 'Sebagian', summary.itemSebagian || 0],
    ['Menunggu', summary.itemMenunggu || 0, 'Sisa Qty', items.reduce(function(s,x){ return s + Math.max(0,(x.qtyPO||0)-(x.qtyDatang||0)); },0), 'Periode', status.weekKey || '']
  ]);
  dash.getRange('A31:F31').setValues([['No','Nama','Status','Qty PO','Datang','Sisa']]);
  var rows = items.slice(0, 13).map(function(it) {
    return [it.itemNo, it.nama, it.status, it.qtyPO, it.qtyDatang, Math.max(0,(it.qtyPO||0)-(it.qtyDatang||0))];
  });
  if (rows.length) dash.getRange(32,1,rows.length,6).setValues(rows);

  dash.getRange('H28:M28').merge().setValue('STATUS PO — MINGGU LALU');
  dash.getRange('H29:M30').setValues([
    ['Total Item', prevSummary.totalItem || 0, 'Datang', prevSummary.itemSelesai || 0, 'Sebagian', prevSummary.itemSebagian || 0],
    ['Menunggu', prevSummary.itemMenunggu || 0, 'Sisa Qty', prevItems.reduce(function(s,x){ return s + Math.max(0,(x.qtyPO||0)-(x.qtyDatang||0)); },0), 'Periode', previous.weekKey || '']
  ]);
  dash.getRange('H31:M31').setValues([['No','Nama','Status','Qty PO','Datang','Sisa']]);
  var prevRows = prevItems.slice(0, 12).map(function(it) {
    return [it.itemNo, it.nama, it.status, it.qtyPO, it.qtyDatang, Math.max(0,(it.qtyPO||0)-(it.qtyDatang||0))];
  });
  if (prevRows.length) dash.getRange(32,8,prevRows.length,6).setValues(prevRows);

  dash.getRange('A200:B203').setValues([
    ['STATUS PO DONUT','Jumlah'],
    ['Datang', summary.itemSelesai || 0],
    ['Sebagian', summary.itemSebagian || 0],
    ['Menunggu', summary.itemMenunggu || 0]
  ]);
  SpreadsheetApp.flush();
  try { rebuildDashboardChartsV68_(); } catch (eChart) {}
  return { success: true, version: '6.8.0+WEEK-SYNC', current: items.length, previous: prevItems.length };
}

function rebuildDashboardChartsV68_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dash = ss.getSheetByName('Dashboard');
  if (!dash) return { success: false, error: 'Dashboard tidak ditemukan' };

  var divRows = _dashboardDivisionRowsV68_(ss);
  var start = 1;
  var divValues = [['Divisi','Aman','Waspada','Kritis']].concat(divRows);
  dash.getRange(1,27,Math.max(1,divValues.length),4).clearContent();
  dash.getRange(1,27,divValues.length,4).setValues(divValues);
  dash.getRange(30,27,4,2).setValues([
    ['Status','Jumlah'],
    ['Datang', Number(dash.getRange('B201').getValue()) || 0],
    ['Sebagian', Number(dash.getRange('B202').getValue()) || 0],
    ['Menunggu', Number(dash.getRange('B203').getValue()) || 0]
  ]);

  var charts = dash.getCharts();
  charts.forEach(function(ch) {
    var title = '';
    try { title = String(ch.getOptions().get('title') || '').toLowerCase(); } catch (_) {}
    if (title.indexOf('status stok per divisi') >= 0 || title.indexOf('status po') >= 0 || title.indexOf('status po minggu') >= 0) {
      dash.removeChart(ch);
    }
  });

  if (divRows.length) {
    var divChart = dash.newChart()
      .setChartType(Charts.ChartType.BAR)
      .addRange(dash.getRange(1,27,divValues.length,4))
      .setPosition(2,1,0,0)
      .setOption('title','Status Stok per Divisi')
      .setOption('isStacked',true)
      .setOption('legend',{position:'top'})
      .setOption('width',650)
      .setOption('height',320)
      .build();
    dash.insertChart(divChart);
  }

  var donut = dash.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(dash.getRange('AA30:AB33'))
    .setPosition(2,9,0,0)
    .setOption('title','Status PO Minggu Ini')
    .setOption('pieHole',0.55)
    .setOption('legend',{position:'right'})
    .setOption('width',420)
    .setOption('height',320)
    .build();
  dash.insertChart(donut);
  dash.hideColumns(27,4);
  SpreadsheetApp.flush();
  return { success: true, divisions: divRows.length };
}

function _dashboardDivisionRowsV68_(ss) {
  var map = {};
  ['Stock CV','Stock PT'].forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 4) return;
    var lastCol = sh.getLastColumn();
    var rows = sh.getRange(3,1,sh.getLastRow()-2,lastCol).getValues();
    var headers = rows.length ? rows[0].map(function(v){ return String(v || '').toLowerCase().trim(); }) : [];
    var divCol = headers.findIndex(function(h){ return h === 'divisi' || h === 'division' });
    var stockCol = headers.findIndex(function(h){ return h.indexOf('sisa stock') >= 0 || h.indexOf('sisa stok') >= 0 || h === 'stock akhir' || h === 'stok akhir' });
    var minCol = headers.findIndex(function(h){ return h.indexOf('stock aman') >= 0 || h.indexOf('stok aman') >= 0 || h === 'min' });
    if (divCol < 0) return;
    rows.slice(1).forEach(function(row) {
      var div = String(row[divCol] || 'LAINNYA').trim() || 'LAINNYA';
      if (!map[div]) map[div] = { divisi: div, total: 0, aman: 0, waspada: 0, kritis: 0 };
      var stock = stockCol >= 0 ? Number(row[stockCol]) || 0 : 0;
      var min = minCol >= 0 ? Number(row[minCol]) || 0 : 0;
      map[div].total++;
      if (min > 0) {
        if (stock <= 0 || stock <= Math.max(5, Math.floor(min * 0.25))) map[div].kritis++;
        else if (stock < min) map[div].waspada++;
        else map[div].aman++;
      } else {
        if (stock <= 5) map[div].kritis++;
        else if (stock <= 20) map[div].waspada++;
        else map[div].aman++;
      }
    });
  });
  return Object.keys(map).map(function(k) {
    var r = map[k];
    return [r.divisi, r.aman, r.waspada, r.kritis];
  }).sort(function(a,b){ return String(a[0]).localeCompare(String(b[0])); });
}

function setupDashboardPOLayoutOnce() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dash = ss.getSheetByName('Dashboard');
  if (!dash) return { success: false, error: 'Dashboard tidak ditemukan' };

  var headerBg = '#0e7490';
  var headerFg = '#ffffff';
  var altRow = '#f0f9ff';
  var border = '#bae6fd';

  dash.getRange('A28:F28').merge()
    .setBackground(headerBg).setFontColor(headerFg).setFontWeight('bold').setFontSize(11);
  dash.getRange('A31:F31')
    .setBackground('#155e75').setFontColor(headerFg).setFontWeight('bold').setFontSize(9);

  for (var r = 32; r <= 44; r++) {
    var bg = (r % 2 === 0) ? altRow : '#ffffff';
    dash.getRange(r, 1, r, 6).setBackground(bg).setBorder(true, true, true, true, false, false, border, SpreadsheetApp.BorderStyle.SOLID);
  }

  dash.getRange('H28:M28').merge()
    .setBackground(headerBg).setFontColor(headerFg).setFontWeight('bold').setFontSize(11);
  dash.getRange('H31:M31')
    .setBackground('#155e75').setFontColor(headerFg).setFontWeight('bold').setFontSize(9);

  for (var r2 = 32; r2 <= 43; r2++) {
    var bg2 = (r2 % 2 === 0) ? altRow : '#ffffff';
    dash.getRange(r2, 8, r2, 13).setBackground(bg2).setBorder(true, true, true, true, false, false, border, SpreadsheetApp.BorderStyle.SOLID);
  }

  dash.getRange('A29:F30').setBackground('#ecfeff').setFontSize(9);
  dash.getRange('H29:M30').setBackground('#ecfeff').setFontSize(9);

  SpreadsheetApp.flush();
  refreshDashboardPODataOnly_();
  return { success: true, message: 'Layout panel PO diformat + data diisi', version: STATUS_PO_ALIGNED_VERSION };
}
