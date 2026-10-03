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

var STATUS_PO_ALIGNED_VERSION = '6.7.0+PO-ALIGNED-DASH-DATAONLY';

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
function _poComputeArrivalsFromMasuk_(ss, poItems, periodStart) {
  var masukSheet = _poGetSheet_(ss, ['Barang masuk', 'Barang Masuk', 'barang masuk']);
  if (!masukSheet) return {};

  var lastRow = Math.max(masukSheet.getLastRow(), 2);
  if (lastRow < 2) return {};

  var data = masukSheet.getRange(2, 1, lastRow, 8).getValues();
  var arrivals = {};

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var tgl = row[0];
    if (periodStart && tgl instanceof Date && tgl < periodStart) continue;

    var kode = String(row[1] || row[2] || '').trim();
    var nama = String(row[2] || row[3] || row[1] || '').trim();
    var qty = 0;
    for (var c = 3; c <= 7; c++) {
      var v = Number(row[c]);
      if (!isNaN(v) && v > 0) { qty = v; break; }
    }
    if (qty <= 0) continue;

    var keyN = _poNormName_(nama);
    var keyK = _poNormName_(kode);
    if (keyN) arrivals[keyN] = (arrivals[keyN] || 0) + qty;
    if (keyK && keyK !== keyN) arrivals[keyK] = (arrivals[keyK] || 0) + qty;
  }
  return arrivals;
}

/**
 * getStatusPO — versi aligned
 */
function getStatusPO() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var poSheet = _poGetSheet_(ss, ['purchase order', 'Purchase Order', 'Purchase order']);
    if (!poSheet) {
      return { success: false, error: 'Sheet purchase order tidak ditemukan', version: STATUS_PO_ALIGNED_VERSION };
    }

    var lastRow = Math.max(poSheet.getLastRow(), 6);
    if (lastRow < 6) {
      return {
        success: true,
        items: [],
        summary: { totalItem: 0, itemMenunggu: 0, itemSebagian: 0, itemSelesai: 0 },
        version: STATUS_PO_ALIGNED_VERSION
      };
    }

    var data = poSheet.getRange(6, 2, lastRow, 11).getValues();
    var items = [];
    var periodStart = null;

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var no = row[0];
      var nama = String(row[1] || '').trim();
      if (!nama) continue;

      var totalQty = Number(row[6]) || 0;
      var tgl = row[7];
      if (tgl instanceof Date && (!periodStart || tgl < periodStart)) periodStart = tgl;

      var statusCell = String(row[8] || '').toUpperCase();
      var qtyK = Number(row[9]) || 0;

      items.push({
        itemNo: no || (i + 1),
        nama: nama,
        size: String(row[2] || ''),
        satuan: String(row[3] || 'Pack'),
        qtyPO: totalQty,
        qtyDatang: qtyK,
        tglKedatangan: tgl,
        statusCell: statusCell,
        _row: i + 6
      });
    }

    var arrivals = _poComputeArrivalsFromMasuk_(ss, items, periodStart);

    var menunggu = 0, sebagian = 0, selesai = 0;
    var outItems = [];

    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      var key = _poNormName_(it.nama);
      var fromMasuk = arrivals[key] || 0;
      var qtyDatang = Math.max(it.qtyDatang, fromMasuk);

      var status = 'MENUNGGU';
      if (qtyDatang >= it.qtyPO && it.qtyPO > 0) status = 'SELESAI';
      else if (qtyDatang > 0) status = 'SEBAGIAN';
      else if (it.statusCell.indexOf('SELESAI') >= 0 || it.statusCell.indexOf('DATANG') >= 0) status = 'SELESAI';
      else if (it.statusCell.indexOf('SEBAGIAN') >= 0) status = 'SEBAGIAN';

      if (status === 'SELESAI') selesai++;
      else if (status === 'SEBAGIAN') sebagian++;
      else menunggu++;

      outItems.push({
        itemNo: it.itemNo,
        nama: it.nama,
        size: it.size,
        satuan: it.satuan,
        qtyPO: it.qtyPO,
        qtyDatang: qtyDatang,
        tglKedatangan: it.tglKedatangan,
        status: status
      });
    }

    return {
      success: true,
      items: outItems,
      summary: {
        totalItem: outItems.length,
        itemMenunggu: menunggu,
        itemSebagian: sebagian,
        itemSelesai: selesai
      },
      version: STATUS_PO_ALIGNED_VERSION
    };
  } catch (err) {
    return { success: false, error: String(err.message || err), version: STATUS_PO_ALIGNED_VERSION };
  }
}

/**
 * confirmPOStatus — update J/K + tulis Barang masuk bila SELESAI/DATANG
 */
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
  var summary = status.summary || {};

  dash.getRange('A28').setValue('STATUS PO — MINGGU INI');
  dash.getRange('A29').setValue('Total Item');
  dash.getRange('B29').setValue(summary.totalItem || 0);
  dash.getRange('C29').setValue('Datang');
  dash.getRange('D29').setValue(summary.itemSelesai || 0);
  dash.getRange('E29').setValue('Sebagian');
  dash.getRange('F29').setValue(summary.itemSebagian || 0);

  dash.getRange('A30').setValue('Menunggu');
  dash.getRange('B30').setValue(summary.itemMenunggu || 0);

  var headers = ['No', 'Nama', 'Status', 'Qty PO', 'Datang', 'Sisa'];
  dash.getRange('A31:F31').setValues([headers]);
  dash.getRange('A32:F44').clearContent();

  var rows = [];
  for (var i = 0; i < Math.min(items.length, 13); i++) {
    var it = items[i];
    var sisa = Math.max(0, (it.qtyPO || 0) - (it.qtyDatang || 0));
    rows.push([it.itemNo, it.nama, it.status, it.qtyPO, it.qtyDatang, sisa]);
  }
  if (rows.length) {
    dash.getRange(32, 1, 32 + rows.length - 1, 6).setValues(rows);
  }

  dash.getRange('H28').setValue('STATUS PO — SISA DIBAWA / MINGGU LALU');
  dash.getRange('H29').setValue('Total Item');
  dash.getRange('I29').setValue(items.filter(function(x){ return (x.qtyPO||0) > (x.qtyDatang||0); }).length);
  dash.getRange('J29').setValue('Sisa Qty');
  var totalSisa = items.reduce(function(s, x){ return s + Math.max(0, (x.qtyPO||0)-(x.qtyDatang||0)); }, 0);
  dash.getRange('K29').setValue(totalSisa);

  dash.getRange('H31:M31').setValues([['No', 'Nama', 'Status', 'Qty PO', 'Datang', 'Sisa']]);
  dash.getRange('H32:M43').clearContent();

  var sisaRows = [];
  for (var k = 0; k < items.length && sisaRows.length < 12; k++) {
    var it2 = items[k];
    var sisa2 = Math.max(0, (it2.qtyPO || 0) - (it2.qtyDatang || 0));
    if (sisa2 <= 0) continue;
    sisaRows.push([it2.itemNo, it2.nama, it2.status, it2.qtyPO, it2.qtyDatang, sisa2]);
  }
  if (sisaRows.length) {
    dash.getRange(32, 8, 32 + sisaRows.length - 1, 13).setValues(sisaRows);
  }

  try {
    dash.getRange('A200').setValue('HELPER_DONUT_STATUS');
    dash.getRange('A201').setValue('Datang');
    dash.getRange('B201').setValue(summary.itemSelesai || 0);
    dash.getRange('A202').setValue('Sebagian');
    dash.getRange('B202').setValue(summary.itemSebagian || 0);
    dash.getRange('A203').setValue('Menunggu');
    dash.getRange('B203').setValue(summary.itemMenunggu || 0);
  } catch (eH) {}

  SpreadsheetApp.flush();
  return { success: true, version: STATUS_PO_ALIGNED_VERSION, items: items.length };
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
