/**
 * BACKEND GudangAI-69 V6.4.9+STATUS-PO-DASH
 * Anti double-write: CacheService by requestId (6 jam)
 * + getStatusPO + sinkron panel STATUS PO di sheet Dashboard
 * DEPLOY: paste → New version → Deploy (Anyone)
 */
var SPREADSHEET_ID_FALLBACK = '1YAJKGm5JHQH_eYrDMeZEorfGTHhHxu9L4t4pYp7rqww';
var VERSION = '6.4.9+STATUS-PO-DASH';
var TITLE = 'BACKEND GudangAI-69 V6.4.9';
var TZ = 'Asia/Jakarta';
var PO_SHEET_NAMES = ['purchase order', 'Purchase Order', 'Purchase order', 'PO', 'PURCHASE ORDER'];
var DASHBOARD_SHEET_NAMES = ['Dashboard', 'dashboard', 'DASHBOARD', 'irang Rusak', 'Beranda'];
var PO_DATA_START_ROW = 6;
var PO_COL = { NO: 2, NAMA: 3, SIZE: 4, SATUAN: 5, PO_CV: 6, PO_PT: 7, TOTAL: 8, TGL: 9 };

function doGet(e) {
  try {
    e = e || {};
    var p = e.parameter || {};
    var action = String(p.action || '').trim();
    var secret = p.secret || '';
    if (!checkSecret_(secret) && action !== '') {
      if (getApiSecret_() && action !== 'ping' && action !== 'status' && action !== 'healthCheck') {
        return json_({ success: false, status: 'REJECTED', code: 'UNAUTHORIZED', error: 'Unauthorized' });
      }
    }
    return route_(action, p, null);
  } catch (err) {
    return json_({ success: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); }
      catch (pe) { return json_({ success: false, error: 'Body JSON tidak valid' }); }
    }
    var secret = body.secret || (e.parameter && e.parameter.secret) || '';
    if (!checkSecret_(secret)) {
      return json_({ success: false, status: 'REJECTED', code: 'UNAUTHORIZED', error: 'Unauthorized' });
    }
    return route_(String(body.action || '').trim(), e.parameter || {}, body);
  } catch (err) {
    return json_({ success: false, error: String(err.message || err) });
  }
}

function route_(action, params, body) {
  body = body || {};
  params = params || {};
  var a = String(action || '').trim();
  if (a === 'status' || a === 'ping' || a === 'healthCheck') return json_(statusPayload_());
  if (a === 'getAllStock' || a === 'getStockAll' || a === 'getStock') {
    var ent = String(body.entitas || body.entity || params.entitas || params.entity || 'CV').toUpperCase();
    if (ent !== 'CV' && ent !== 'PT') return json_({ success: false, error: 'entitas harus CV atau PT' });
    return json_({ success: true, count: getAllStock_(ent).length, items: getAllStock_(ent), entitas: ent });
  }
  if (a === 'addTransaction') return json_(addTransaction_(body));
  if (a === 'addTransactionBatch') return json_(addTransactionBatch_(body));
  if (a === 'generatePO' || a === 'writePurchaseOrder') return json_(writePurchaseOrder_(body));
  if (a === 'getStatusPO' || a === 'statusPO') return json_(getStatusPO_(body, params));
  if (a === 'refreshDashboardPO' || a === 'syncDashboardPO' || a === 'updateDashboardStatusPO') {
    return json_(updateDashboardStatusPO_());
  }
  return json_({
    success: false,
    error: 'UNKNOWN_ACTION',
    available: [
      'status', 'getAllStock', 'addTransaction', 'addTransactionBatch',
      'generatePO', 'writePurchaseOrder', 'getStatusPO', 'refreshDashboardPO'
    ]
  });
}

function getApiSecret_() {
  try { return PropertiesService.getScriptProperties().getProperty('API_SECRET') || ''; } catch (e) { return ''; }
}
function checkSecret_(secret) {
  var expected = getApiSecret_();
  if (!expected) return true;
  return String(secret || '') === expected;
}
function getSpreadsheetId_() {
  try {
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (id) return id;
  } catch (e) {}
  return SPREADSHEET_ID_FALLBACK;
}
function openSS_() { return SpreadsheetApp.openById(getSpreadsheetId_()); }
function statusPayload_() {
  var ss = openSS_();
  return {
    success: true, status: 'OK', version: VERSION, title: TITLE,
    spreadsheet: ss.getName(), serverTime: new Date().toISOString()
  };
}

function checkIdempotent_(requestId) {
  if (!requestId) return null;
  try {
    var hit = CacheService.getScriptCache().get('idemp_' + String(requestId));
    if (hit) {
      var parsed = JSON.parse(hit);
      parsed.idempotent = true;
      parsed.status = parsed.status || 'DUPLICATE';
      return parsed;
    }
  } catch (e) {}
  return null;
}
function saveIdempotent_(requestId, result) {
  if (!requestId || !result) return;
  try {
    CacheService.getScriptCache().put('idemp_' + String(requestId), JSON.stringify({
      success: !!result.success, status: result.status || 'APPLIED',
      row: result.row || null, qty: result.qty, kode: result.kode, idempotent: true
    }), 21600);
  } catch (e) {}
}

function resolveTanggal_(body) {
  if (body && body.tanggal) {
    var raw = String(body.tanggal).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      var p = raw.split('-');
      return p[2] + '/' + p[1] + '/' + p[0];
    }
    return raw;
  }
  return Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy');
}

function getAllStock_(entitas) {
  var ss = openSS_();
  var names = entitas === 'CV' ? ['Stock CV', 'stock CV', 'STOCK CV'] : ['Stock PT', 'stock PT', 'STOCK PT'];
  var sheet = null;
  for (var i = 0; i < names.length; i++) { sheet = ss.getSheetByName(names[i]); if (sheet) break; }
  if (!sheet) throw new Error('Sheet Stock ' + entitas + ' tidak ditemukan');
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headerRow = 0;
  for (var r = 0; r < Math.min(6, data.length); r++) {
    if (data[r].map(function (x) { return norm_(x); }).join('|').indexOf('kode') >= 0) { headerRow = r; break; }
  }
  var h = data[headerRow].map(norm_);
  var iK = findCol_(h, ['kode barang', 'kode']);
  var iN = findCol_(h, ['nama barang', 'nama']);
  var iD = findCol_(h, ['divisi']);
  var iS = findCol_(h, ['satuan']);
  var iQ = findCol_(h, ['stock akhir', 'stok akhir', 'stockakhir', 'stok', 'stock']);
  var iA = findCol_(h, ['stock aman', 'stok aman', 'batas aman', 'min', 'minimum']);
  if (iK < 0 || iQ < 0) throw new Error('Kolom Kode/Stock tidak ditemukan');
  var items = [];
  for (var i = headerRow + 1; i < data.length; i++) {
    var row = data[i];
    var kode = String(row[iK] || '').trim();
    if (!kode || norm_(kode).indexOf('kode') >= 0) continue;
    items.push({
      kode: kode, entitas: entitas,
      nama: iN >= 0 ? String(row[iN] || '').trim() : '',
      divisi: iD >= 0 ? String(row[iD] || '').trim() : '',
      satuan: iS >= 0 ? String(row[iS] || '').trim() : 'Pack',
      stockAkhir: num_(row[iQ]),
      stockAman: iA >= 0 ? num_(row[iA]) : 0
    });
  }
  return items;
}

function addTransaction_(body) {
  var sheetName = String(body.sheet || '').trim();
  var entitas = String(body.entitas || body.entity || '').toUpperCase();
  var kode = String(body.kodeBarang || body.kode || '').trim();
  var qty = num_(body.qty);
  var ket = String(body.keterangan || '').trim();
  var reqId = String(body.requestId || '').trim();

  var cached = checkIdempotent_(reqId);
  if (cached && cached.success) return cached;

  if (!kode) return { success: false, error: 'Kode kosong' };
  if (!sheetName) return { success: false, error: 'sheet wajib' };
  if (entitas !== 'CV' && entitas !== 'PT') return { success: false, error: 'entitas harus CV atau PT' };

  var ss = openSS_();
  var candidates = [sheetName];
  if (/masuk/i.test(sheetName)) candidates = candidates.concat(['Barang masuk', 'Barang Masuk']);
  if (/keluar/i.test(sheetName)) candidates = candidates.concat(['Barang keluar', 'Barang Keluar']);
  if (/rusak/i.test(sheetName)) candidates = candidates.concat(['Barang Rusak', 'Barang rusak']);
  var sheet = null;
  for (var i = 0; i < candidates.length; i++) { sheet = ss.getSheetByName(candidates[i]); if (sheet) break; }
  if (!sheet) return { success: false, error: 'Sheet transaksi tidak ditemukan: ' + sheetName };

  var isKeluar = /keluar/i.test(sheetName);
  var isMasuk = /masuk/i.test(sheetName);
  var isRusak = /rusak/i.test(sheetName);
  var stockResult = updateStock_(ss, entitas, kode, qty, isKeluar, isMasuk, isRusak);
  if (stockResult.error && !stockResult.soft) return { success: false, error: stockResult.error };

  var finalQty = qty;
  var finalKet = ket || entitas;
  if (stockResult.adjusted) {
    finalQty = stockResult.qtyWritten;
    if (stockResult.note) finalKet = (finalKet ? finalKet + ' ' : '') + stockResult.note;
  }

  var tgl = resolveTanggal_(body);
  var nr = Math.max(sheet.getLastRow(), 1) + 1;
  sheet.getRange(nr, 2).setValue(tgl);
  sheet.getRange(nr, 3).setValue(kode);
  sheet.getRange(nr, 6).setValue(finalQty);
  sheet.getRange(nr, 7).setValue(finalKet);
  SpreadsheetApp.flush();

  if (isMasuk) {
    try { updateDashboardStatusPO_(); } catch (e) {}
  }

  var result = {
    success: true, status: 'APPLIED', row: nr, qty: finalQty, kode: kode,
    stockAkhir: stockResult.stockAkhir, adjusted: !!stockResult.adjusted,
    note: stockResult.note || '', transactionId: body.transactionId || '', requestId: reqId
  };
  saveIdempotent_(reqId, result);
  return result;
}

function addTransactionBatch_(body) {
  var list = body.items || body.rows || [];
  if (!list.length) return { success: false, error: 'items kosong' };
  var written = [], errors = [];
  for (var i = 0; i < list.length; i++) {
    var it = list[i] || {};
    var one = {
      sheet: body.sheet, entitas: body.entitas || body.entity,
      kodeBarang: it.kodeBarang || it.kode, qty: it.qty, keterangan: it.keterangan || '',
      tanggal: body.tanggal || it.tanggal || '',
      requestId: it.requestId || ((body.requestId || 'BATCH') + '-' + i),
      transactionId: (body.transactionId || 'BATCH') + '-' + i,
      nonce: (body.nonce || 'BATCH') + '-' + i
    };
    var res = addTransaction_(one);
    if (res && res.success) written.push({ kode: one.kodeBarang, qty: res.qty, row: res.row, status: res.status });
    else errors.push((one.kodeBarang || '?') + ': ' + ((res && res.error) || 'gagal'));
  }
  try { updateDashboardStatusPO_(); } catch (e) {}
  if (written.length === list.length) return { success: true, status: 'APPLIED', written: written.length, details: written };
  if (written.length > 0) return { success: false, written: written.length, error: 'Sebagian gagal (' + written.length + '/' + list.length + '). ' + errors.join('; '), details: written };
  return { success: false, error: errors.join('; ') || 'Batch gagal' };
}

function updateStock_(ss, entitas, kode, qty, isKeluar, isMasuk, isRusak) {
  var names = entitas === 'CV' ? ['Stock CV', 'stock CV', 'STOCK CV'] : ['Stock PT', 'stock PT', 'STOCK PT'];
  var sheet = null;
  for (var i = 0; i < names.length; i++) { sheet = ss.getSheetByName(names[i]); if (sheet) break; }
  if (!sheet) return { soft: true, error: 'Sheet Stock tidak ditemukan' };
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { soft: true, error: 'Sheet Stock kosong' };
  var headerRow = 0;
  for (var r = 0; r < Math.min(6, data.length); r++) {
    if (data[r].map(function (x) { return norm_(x); }).join('|').indexOf('kode') >= 0) { headerRow = r; break; }
  }
  var h = data[headerRow].map(norm_);
  var iK = findCol_(h, ['kode barang', 'kode']);
  var iQ = findCol_(h, ['stock akhir', 'stok akhir', 'stockakhir', 'stok', 'stock']);
  if (iK < 0 || iQ < 0) return { soft: true, error: 'Kolom tidak ditemukan' };
  var targetRow = -1, current = 0;
  for (var i = headerRow + 1; i < data.length; i++) {
    if (String(data[i][iK] || '').trim() === kode) { targetRow = i + 1; current = num_(data[i][iQ]); break; }
  }
  if (targetRow < 0) return { soft: true, error: 'Kode ' + kode + ' tidak ada', stockAkhir: null };
  var newStock = current, qtyWritten = qty, adjusted = false, note = '';
  if (isMasuk) newStock = current + qty;
  else if (isKeluar || isRusak) {
    if (current <= 0) { qtyWritten = 0; newStock = 0; adjusted = true; note = '(STOK HABIS)'; }
    else if (qty > current) { qtyWritten = current; newStock = 0; adjusted = true; note = '(DISESUAIKAN)'; }
    else { newStock = current - qty; qtyWritten = qty; }
  } else { newStock = Math.max(0, current - qty); qtyWritten = Math.min(qty, current); }
  sheet.getRange(targetRow, iQ + 1).setValue(newStock);
  return { stockAkhir: newStock, qtyWritten: qtyWritten, adjusted: adjusted, note: note, previous: current };
}

function writePurchaseOrder_(body) {
  var res = { success: false, error: 'Gunakan PO dari PWA — endpoint tersedia' };
  try {
    var sync = updateDashboardStatusPO_();
    res.dashboardSync = sync;
  } catch (e) {}
  return res;
}

function findPoSheet_(ss) {
  for (var i = 0; i < PO_SHEET_NAMES.length; i++) {
    var sh = ss.getSheetByName(PO_SHEET_NAMES[i]);
    if (sh) return sh;
  }
  var all = ss.getSheets();
  for (var j = 0; j < all.length; j++) {
    var n = norm_(all[j].getName());
    if (n.indexOf('purchase') >= 0 || n === 'po' || n.indexOf('order') >= 0) return all[j];
  }
  return null;
}

function findDashboardSheet_(ss) {
  for (var i = 0; i < DASHBOARD_SHEET_NAMES.length; i++) {
    var sh = ss.getSheetByName(DASHBOARD_SHEET_NAMES[i]);
    if (sh) return sh;
  }
  var all = ss.getSheets();
  for (var j = 0; j < all.length; j++) {
    var n = norm_(all[j].getName());
    if (n.indexOf('dashboard') >= 0 || n.indexOf('beranda') >= 0) return all[j];
  }
  return ss.getSheets()[0] || null;
}

function computeStatusPO_(ss) {
  var poSheet = findPoSheet_(ss);
  if (!poSheet) {
    return {
      success: false,
      error: 'Sheet Purchase Order tidak ditemukan',
      summary: emptySummary_(),
      items: [],
      noPO: null
    };
  }

  var last = poSheet.getLastRow();
  var lastCol = Math.max(poSheet.getLastColumn(), 10);
  if (last < PO_DATA_START_ROW) {
    return { success: true, summary: emptySummary_(), items: [], noPO: null, sheet: poSheet.getName() };
  }

  var values = poSheet.getRange(1, 1, last, lastCol).getValues();

  var noPO = null;
  for (var r = 0; r < Math.min(5, values.length); r++) {
    for (var c = 0; c < values[r].length; c++) {
      var cell = String(values[r][c] || '').trim();
      if (/^PO[\s\-_]?\d+/i.test(cell) || /^\d{5,}$/.test(cell)) {
        noPO = cell;
        break;
      }
      var low = norm_(cell);
      if (low.indexOf('no') >= 0 && low.indexOf('po') >= 0 && c + 1 < values[r].length) {
        var next = String(values[r][c + 1] || '').trim();
        if (next) noPO = next;
      }
    }
    if (noPO) break;
  }

  var items = [];
  var totalAktif = 0, totalKonfirmasi = 0;
  var sumCV = 0, sumPT = 0;
  var itemMenunggu = 0, itemSebagian = 0, itemSelesai = 0;

  for (var i = PO_DATA_START_ROW - 1; i < values.length; i++) {
    var row = values[i];
    var no = row[PO_COL.NO - 1];
    var nama = String(row[PO_COL.NAMA - 1] || '').trim();
    if (!nama) continue;
    if (norm_(nama).indexOf('nama') >= 0) continue;

    var qtyCV = num_(row[PO_COL.PO_CV - 1]);
    var qtyPT = num_(row[PO_COL.PO_PT - 1]);
    var qtyTotal = num_(row[PO_COL.TOTAL - 1]);
    if (!qtyTotal) qtyTotal = qtyCV + qtyPT;
    if (qtyTotal <= 0 && qtyCV <= 0 && qtyPT <= 0) continue;

    var size = String(row[PO_COL.SIZE - 1] || '').trim();
    var satuan = String(row[PO_COL.SATUAN - 1] || '').trim() || 'Pack';
    var tglRencana = row[PO_COL.TGL - 1];
    var tglStr = '';
    if (tglRencana instanceof Date) {
      tglStr = Utilities.formatDate(tglRencana, TZ, 'yyyy-MM-dd');
    } else if (tglRencana) {
      tglStr = String(tglRencana).trim();
    }

    var qtyDatang = 0;
    if (lastCol >= 10) qtyDatang = num_(row[9]);
    if (lastCol >= 11 && !qtyDatang) qtyDatang = num_(row[10]);

    var status = 'Menunggu';
    if (qtyDatang <= 0) {
      status = 'Menunggu';
      itemMenunggu++;
    } else if (qtyDatang + 0.0001 >= qtyTotal) {
      status = 'Selesai';
      itemSelesai++;
    } else {
      status = 'Sebagian';
      itemSebagian++;
    }

    totalAktif += Math.max(0, qtyTotal - qtyDatang);
    totalKonfirmasi += qtyDatang;
    sumCV += qtyCV;
    sumPT += qtyPT;

    items.push({
      itemNo: no || (items.length + 1),
      nama: nama,
      size: size,
      satuan: satuan,
      qtyPO: qtyTotal,
      qtyCV: qtyCV,
      qtyPT: qtyPT,
      qtyDatang: qtyDatang,
      status: status,
      tglRencana: tglStr
    });
  }

  var summary = {
    totalItem: items.length,
    itemMenunggu: itemMenunggu,
    itemSebagian: itemSebagian,
    itemSelesai: itemSelesai,
    totalAktif: totalAktif,
    totalKonfirmasi: totalKonfirmasi,
    poCV: sumCV,
    poPT: sumPT,
    poAktif: totalAktif,
    poKonfirmasi: totalKonfirmasi
  };

  return {
    success: true,
    noPO: noPO,
    summary: summary,
    items: items,
    sheet: poSheet.getName()
  };
}

function emptySummary_() {
  return {
    totalItem: 0, itemMenunggu: 0, itemSebagian: 0, itemSelesai: 0,
    totalAktif: 0, totalKonfirmasi: 0, poCV: 0, poPT: 0, poAktif: 0, poKonfirmasi: 0
  };
}

function getStatusPO_(body, params) {
  var ss = openSS_();
  var data = computeStatusPO_(ss);
  try {
    var dash = writeStatusPOToDashboard_(ss, data);
    data.dashboardUpdated = !!dash.success;
    data.dashboardNote = dash.note || '';
  } catch (e) {
    data.dashboardUpdated = false;
    data.dashboardNote = String(e.message || e);
  }
  return data;
}

function writeStatusPOToDashboard_(ss, statusData) {
  var dash = findDashboardSheet_(ss);
  if (!dash) return { success: false, note: 'Sheet Dashboard tidak ditemukan' };

  var summary = (statusData && statusData.summary) ? statusData.summary : emptySummary_();
  var poAktif = num_(summary.poAktif != null ? summary.poAktif : summary.totalAktif);
  var poKonfirmasi = num_(summary.poKonfirmasi != null ? summary.poKonfirmasi : summary.totalKonfirmasi);
  var poCV = num_(summary.poCV);
  var poPT = num_(summary.poPT);
  var itemAktif = num_(summary.totalItem) - num_(summary.itemSelesai);

  var range = dash.getDataRange();
  var values = range.getValues();
  var writes = 0;

  var labelMap = [
    { keys: ['po aktif', 'aktif po', 'qty aktif'], value: poAktif },
    { keys: ['po konfirmasi', 'konfirmasi', 'qty konfirmasi', 'po confirm'], value: poKonfirmasi },
    { keys: ['po cv', 'qty po cv', 'cv po'], value: poCV },
    { keys: ['po pt', 'qty po pt', 'pt po'], value: poPT },
    { keys: ['item menunggu', 'menunggu'], value: num_(summary.itemMenunggu) },
    { keys: ['item sebagian', 'sebagian'], value: num_(summary.itemSebagian) },
    { keys: ['item selesai', 'selesai'], value: num_(summary.itemSelesai) }
  ];

  for (var r = 0; r < values.length; r++) {
    for (var c = 0; c < values[r].length; c++) {
      var label = norm_(values[r][c]);
      if (!label) continue;

      for (var m = 0; m < labelMap.length; m++) {
        var matched = false;
        for (var k = 0; k < labelMap[m].keys.length; k++) {
          if (label === labelMap[m].keys[k] || label.indexOf(labelMap[m].keys[k]) >= 0) {
            matched = true;
            break;
          }
        }
        if (!matched) continue;

        var targetCol = c + 1;
        try {
          dash.getRange(r + 1, targetCol + 1).setValue(labelMap[m].value);
          writes++;
        } catch (e) {}
      }

      if (label.indexOf('status po') >= 0 || label === '5 status po') {
        try {
          var ts = Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm');
          if (c + 2 < 40) dash.getRange(r + 1, c + 3).setValue('sync ' + ts);
        } catch (e2) {}
      }
    }
  }

  if (writes === 0) {
    try {
      dash.getRange(26, 12).setValue(poAktif);
      dash.getRange(26, 14).setValue(poKonfirmasi);
      dash.getRange(27, 12).setValue(poCV);
      dash.getRange(28, 12).setValue(poPT);
      writes = 4;
    } catch (e3) {
      return { success: false, note: 'Gagal tulis fallback: ' + String(e3.message || e3) };
    }
  }

  SpreadsheetApp.flush();
  return {
    success: true,
    note: 'STATUS PO diperbarui (' + writes + ' sel)',
    writes: writes,
    summary: {
      poAktif: poAktif,
      poKonfirmasi: poKonfirmasi,
      poCV: poCV,
      poPT: poPT,
      itemAktif: itemAktif
    }
  };
}

function updateDashboardStatusPO_() {
  var ss = openSS_();
  var data = computeStatusPO_(ss);
  var written = writeStatusPOToDashboard_(ss, data);
  return {
    success: !!written.success,
    version: VERSION,
    noPO: data.noPO,
    summary: data.summary,
    dashboard: written,
    itemCount: (data.items || []).length
  };
}

function findCol_(headers, keywords) {
  var i, j;
  for (j = 0; j < keywords.length; j++) for (i = 0; i < headers.length; i++) if (headers[i] === keywords[j]) return i;
  for (j = 0; j < keywords.length; j++) for (i = 0; i < headers.length; i++) if (headers[i].indexOf(keywords[j]) >= 0) return i;
  return -1;
}
function norm_(x) { return String(x || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function num_(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  var s = String(v == null ? '' : v).replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '').trim();
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
