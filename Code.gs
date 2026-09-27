/**
 * ============================================================================
 * BACKEND GudangAI-69 V6.4.5+STOCK-UPDATE + PO Writer
 * Spreadsheet: COLD STORAGE SEPTEMBER '26
 * ID: 1lJwqvSNZUNBO4ZH-PgVZsgd5Cf57UgCjGJIRD05IeCw
 * ============================================================================
 *
 * DEPLOY:
 * 1) Apps Script → paste SELURUH file ini (ganti semua)
 * 2) Project Settings → Script properties:
 *      API_SECRET = (isi secret yang sama di PWA Atur)
 * 3) Deploy → Manage deployments → Edit → New version → Deploy
 * 4) Pastikan: Execute as ME · Who has access: ANYONE
 *
 * PO SHEET (tab "purchase order") — FORMAT TETAP:
 *   Baris 5 header: B=NO | C=NAMA BARANG | D=SIZE | E=SATUAN | F=PO CV | G=PO PT | H=TOTAL | I=TGL KEDATANGAN
 *   Data mulai baris 6 → kolom B s/d I saja (jangan geser kolom)
 * ============================================================================
 */

var SPREADSHEET_ID_FALLBACK = '1lJwqvSNZUNBO4ZH-PgVZsgd5Cf57UgCjGJIRD05IeCw';
var VERSION = '6.4.5+STOCK-UPDATE';
var TITLE = 'BACKEND GudangAI-69 V6.4.5';
var TZ = 'Asia/Jakarta';

/** Nama tab purchase order (urutan dicoba) */
var PO_SHEET_NAMES = ['purchase order', 'Purchase Order', 'Purchase order', 'PO', 'PURCHASE ORDER'];

/** Baris pertama data PO (header di baris 5) */
var PO_DATA_START_ROW = 6;
/** Kolom: B=2 … I=9 */
var PO_COL = {
  NO: 2,       // B
  NAMA: 3,     // C
  SIZE: 4,     // D
  SATUAN: 5,   // E
  PO_CV: 6,    // F
  PO_PT: 7,    // G
  TOTAL: 8,    // H
  TGL: 9       // I
};

// ---------------------------------------------------------------------------
// ENTRY
// ---------------------------------------------------------------------------

function doGet(e) {
  try {
    e = e || {};
    var p = e.parameter || {};
    var action = String(p.action || '').trim();
    var secret = p.secret || '';
    if (!checkSecret_(secret) && action !== '') {
      if (getApiSecret_() && action !== 'ping') {
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
      try {
        body = JSON.parse(e.postData.contents);
      } catch (pe) {
        return json_({ success: false, error: 'Body JSON tidak valid' });
      }
    }
    var secret = body.secret || (e.parameter && e.parameter.secret) || '';
    if (!checkSecret_(secret)) {
      return json_({ success: false, status: 'REJECTED', code: 'UNAUTHORIZED', error: 'Unauthorized' });
    }
    var action = String(body.action || '').trim();
    return route_(action, e.parameter || {}, body);
  } catch (err) {
    return json_({ success: false, error: String(err.message || err) });
  }
}

function route_(action, params, body) {
  body = body || {};
  params = params || {};
  var a = String(action || '').trim();

  if (a === 'status' || a === 'ping' || a === 'healthCheck') {
    return json_(statusPayload_());
  }

  if (a === 'getAllStock' || a === 'getStockAll' || a === 'getStock') {
    var ent = String(body.entitas || body.entity || params.entitas || params.entity || 'CV').toUpperCase();
    if (ent !== 'CV' && ent !== 'PT') {
      return json_({ success: false, error: 'entitas harus CV atau PT' });
    }
    var items = getAllStock_(ent);
    return json_({ success: true, count: items.length, items: items, entitas: ent });
  }

  if (a === 'addTransaction') {
    return json_(addTransaction_(body));
  }

  if (a === 'generatePO' || a === 'writePurchaseOrder') {
    return json_(writePurchaseOrder_(body));
  }

  return json_({
    success: false,
    error: 'UNKNOWN_ACTION',
    available: ['status', 'getAllStock', 'addTransaction', 'generatePO', 'writePurchaseOrder']
  });
}

// ---------------------------------------------------------------------------
// AUTH / CONFIG
// ---------------------------------------------------------------------------

function getApiSecret_() {
  try {
    return PropertiesService.getScriptProperties().getProperty('API_SECRET') || '';
  } catch (e) {
    return '';
  }
}

function checkSecret_(secret) {
  var expected = getApiSecret_();
  if (!expected) return true; // no secret configured → allow (dev)
  return String(secret || '') === expected;
}

function getSpreadsheetId_() {
  try {
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (id) return id;
  } catch (e) {}
  return SPREADSHEET_ID_FALLBACK;
}

function openSS_() {
  return SpreadsheetApp.openById(getSpreadsheetId_());
}

function statusPayload_() {
  var ss = openSS_();
  var now = new Date();
  return {
    success: true,
    status: 'OK',
    version: VERSION,
    title: TITLE,
    spreadsheet: ss.getName(),
    activeMonth: { bulan: 9, tahun: 2026, nama: 'SEPTEMBER' },
    serverTime: now.toISOString(),
    poSheet: findPoSheet_(ss) ? findPoSheet_(ss).getName() : null
  };
}

// ---------------------------------------------------------------------------
// STOCK
// ---------------------------------------------------------------------------

function getAllStock_(entitas) {
  var ss = openSS_();
  var names = entitas === 'CV'
    ? ['Stock CV', 'stock CV', 'STOCK CV']
    : ['Stock PT', 'stock PT', 'STOCK PT'];
  var sheet = null;
  for (var i = 0; i < names.length; i++) {
    sheet = ss.getSheetByName(names[i]);
    if (sheet) break;
  }
  if (!sheet) throw new Error('Sheet Stock ' + entitas + ' tidak ditemukan');

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headerRow = 0;
  for (var r = 0; r < Math.min(6, data.length); r++) {
    var joined = data[r].map(function (x) { return norm_(x); }).join('|');
    if (joined.indexOf('kode') >= 0) {
      headerRow = r;
      break;
    }
  }

  var h = data[headerRow].map(norm_);
  var iK = findCol_(h, ['kode barang', 'kode']);
  var iN = findCol_(h, ['nama barang', 'nama']);
  var iD = findCol_(h, ['divisi']);
  var iS = findCol_(h, ['satuan']);
  var iQ = findCol_(h, ['stock akhir', 'stok akhir', 'stockakhir', 'stok', 'stock']);
  var iA = findCol_(h, ['stock aman', 'stok aman', 'batas aman', 'min', 'minimum']);

  if (iK < 0) throw new Error('Kolom Kode tidak ditemukan');
  if (iQ < 0) throw new Error('Kolom Stock Akhir tidak ditemukan');

  var items = [];
  for (var i = headerRow + 1; i < data.length; i++) {
    var row = data[i];
    var kode = String(row[iK] || '').trim();
    if (!kode || norm_(kode).indexOf('kode') >= 0) continue;
    items.push({
      kode: kode,
      entitas: entitas,
      nama: iN >= 0 ? String(row[iN] || '').trim() : '',
      divisi: iD >= 0 ? String(row[iD] || '').trim() : '',
      satuan: iS >= 0 ? String(row[iS] || '').trim() : 'Pack',
      stockAkhir: num_(row[iQ]),
      stockAman: iA >= 0 ? num_(row[iA]) : 0
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// TRANSAKSI (addTransaction) — kompat PWA + update stock
// ---------------------------------------------------------------------------

function addTransaction_(body) {
  var sheetName = String(body.sheet || '').trim();
  var entitas = String(body.entitas || body.entity || '').toUpperCase();
  var kode = String(body.kodeBarang || body.kode || '').trim();
  var qty = num_(body.qty);
  var ket = String(body.keterangan || '').trim();

  if (!kode) return { success: false, error: 'Kode kosong' };
  if (!sheetName) return { success: false, error: 'sheet wajib' };
  if (entitas !== 'CV' && entitas !== 'PT') {
    return { success: false, error: 'entitas harus CV atau PT' };
  }

  var ss = openSS_();
  var candidates = [sheetName];
  if (/masuk/i.test(sheetName)) candidates = candidates.concat(['Barang masuk', 'Barang Masuk']);
  if (/keluar/i.test(sheetName)) candidates = candidates.concat(['Barang keluar', 'Barang Keluar']);
  if (/rusak/i.test(sheetName)) candidates = candidates.concat(['Barang Rusak', 'Barang rusak']);

  var sheet = null;
  for (var i = 0; i < candidates.length; i++) {
    sheet = ss.getSheetByName(candidates[i]);
    if (sheet) break;
  }
  if (!sheet) return { success: false, error: 'Sheet transaksi tidak ditemukan: ' + sheetName };

  var isKeluar = /keluar/i.test(sheetName);
  var isMasuk = /masuk/i.test(sheetName);
  var isRusak = /rusak/i.test(sheetName);

  // --- Update Stock CV / Stock PT ---
  var stockResult = updateStock_(ss, entitas, kode, qty, isKeluar, isMasuk, isRusak);
  if (stockResult.error && !stockResult.soft) {
    return { success: false, error: stockResult.error };
  }

  // Sesuaikan qty & keterangan sesuai aturan bisnis
  var finalQty = qty;
  var finalKet = ket || entitas;
  if (stockResult.adjusted) {
    finalQty = stockResult.qtyWritten;
    if (stockResult.note) {
      finalKet = (finalKet ? finalKet + ' ' : '') + stockResult.note;
    }
  }

  var tgl = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy');
  var nr = Math.max(sheet.getLastRow(), 1) + 1;

  // Hanya kolom yang diizinkan (proteksi VLOOKUP) — JANGAN tulis Nama (D) / Satuan (E)
  sheet.getRange(nr, 2).setValue(tgl);   // B Tanggal
  sheet.getRange(nr, 3).setValue(kode);  // C Kode
  sheet.getRange(nr, 6).setValue(finalQty);   // F Qty
  sheet.getRange(nr, 7).setValue(finalKet);   // G Keterangan

  SpreadsheetApp.flush();
  return {
    success: true,
    status: 'APPLIED',
    row: nr,
    qty: finalQty,
    kode: kode,
    stockAkhir: stockResult.stockAkhir,
    adjusted: !!stockResult.adjusted,
    note: stockResult.note || '',
    transactionId: body.transactionId || '',
    requestId: body.requestId || ''
  };
}

/**
 * Update stock di sheet Stock CV / Stock PT.
 * Aturan:
 * - barangMasuk  : stok += qty
 * - barangKeluar : stok -= qty (jika stok <= 0 → qty=0 + "(STOK HABIS)"; jika qty > stok → sesuaikan + "(DISESUAIKAN)")
 * - barangRusak  : stok -= qty (sama seperti keluar, tanpa stok negatif)
 * Jangan menulis kolom Nama / Satuan.
 */
function updateStock_(ss, entitas, kode, qty, isKeluar, isMasuk, isRusak) {
  var names = entitas === 'CV'
    ? ['Stock CV', 'stock CV', 'STOCK CV']
    : ['Stock PT', 'stock PT', 'STOCK PT'];
  var sheet = null;
  for (var i = 0; i < names.length; i++) {
    sheet = ss.getSheetByName(names[i]);
    if (sheet) break;
  }
  if (!sheet) {
    return { soft: true, error: 'Sheet Stock ' + entitas + ' tidak ditemukan (transaksi tetap dicatat)' };
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return { soft: true, error: 'Sheet Stock kosong' };
  }

  var headerRow = 0;
  for (var r = 0; r < Math.min(6, data.length); r++) {
    var joined = data[r].map(function (x) { return norm_(x); }).join('|');
    if (joined.indexOf('kode') >= 0) {
      headerRow = r;
      break;
    }
  }

  var h = data[headerRow].map(norm_);
  var iK = findCol_(h, ['kode barang', 'kode']);
  var iQ = findCol_(h, ['stock akhir', 'stok akhir', 'stockakhir', 'stok', 'stock']);

  if (iK < 0 || iQ < 0) {
    return { soft: true, error: 'Kolom Kode / Stock Akhir tidak ditemukan di Stock ' + entitas };
  }

  var targetRow = -1;
  var current = 0;
  for (var i = headerRow + 1; i < data.length; i++) {
    var k = String(data[i][iK] || '').trim();
    if (k === kode) {
      targetRow = i + 1; // 1-based
      current = num_(data[i][iQ]);
      break;
    }
  }

  if (targetRow < 0) {
    return { soft: true, error: 'Kode ' + kode + ' tidak ada di Stock ' + entitas + ' (transaksi tetap dicatat)', stockAkhir: null };
  }

  var newStock = current;
  var qtyWritten = qty;
  var adjusted = false;
  var note = '';

  if (isMasuk) {
    newStock = current + qty;
  } else if (isKeluar || isRusak) {
    if (current <= 0) {
      qtyWritten = 0;
      newStock = 0;
      adjusted = true;
      note = '(STOK HABIS)';
    } else if (qty > current) {
      qtyWritten = current;
      newStock = 0;
      adjusted = true;
      note = '(DISESUAIKAN)';
    } else {
      newStock = current - qty;
      qtyWritten = qty;
    }
  } else {
    // fallback: treat as keluar
    newStock = Math.max(0, current - qty);
    qtyWritten = Math.min(qty, current);
  }

  // Tulis hanya kolom Stock Akhir (jangan sentuh Nama/Satuan)
  sheet.getRange(targetRow, iQ + 1).setValue(newStock);

  return {
    stockAkhir: newStock,
    qtyWritten: qtyWritten,
    adjusted: adjusted,
    note: note,
    previous: current
  };
}

// ---------------------------------------------------------------------------
// PURCHASE ORDER WRITER — kolom B–I mulai baris 6
// ---------------------------------------------------------------------------

/**
 * Tulis item ke sheet purchase order.
 * Gabungkan baris dengan nama sama (CV+PT di kolom F/G).
 */
function writePurchaseOrder_(body) {
  var ss = openSS_();
  var sheet = findPoSheet_(ss);
  if (!sheet) {
    return {
      success: false,
      error: 'Sheet "purchase order" tidak ditemukan. Nama tab harus: purchase order'
    };
  }

  var rawItems = body.items || body.rows || [];
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { success: false, error: 'items kosong' };
  }

  var clearExisting = !!body.clearExisting;
  var mode = String(body.mode || 'cs').toLowerCase();
  var tglDefault = defaultTglKedatangan_();

  var map = {};
  var order = [];

  for (var i = 0; i < rawItems.length; i++) {
    var it = rawItems[i] || {};
    var nama = String(it.nama || it.namaBarang || it.name || '').trim();
    if (!nama) continue;

    var key = nama.toLowerCase();
    var entity = String(it.entity || it.entitas || '').toUpperCase();
    var poCV = num_(it.poCV != null ? it.poCV : (entity === 'CV' ? (it.qty != null ? it.qty : it.suggestQty) : 0));
    var poPT = num_(it.poPT != null ? it.poPT : (entity === 'PT' ? (it.qty != null ? it.qty : it.suggestQty) : 0));
    if (!entity && it.qty != null && poCV === 0 && poPT === 0) {
      poCV = num_(it.qty);
    }

    if (!map[key]) {
      map[key] = {
        nama: nama,
        size: String(it.size || it.SIZE || '').trim(),
        satuan: String(it.satuan || it.satuanBarang || 'Pack').trim() || 'Pack',
        poCV: 0,
        poPT: 0,
        tgl: String(it.tglKedatangan || it.tgl || tglDefault).trim()
      };
      order.push(key);
    }
    map[key].poCV += poCV;
    map[key].poPT += poPT;
    if (it.size) map[key].size = String(it.size).trim();
    if (it.satuan) map[key].satuan = String(it.satuan).trim();
  }

  var rows = [];
  for (var o = 0; o < order.length; o++) {
    var r = map[order[o]];
    var total = r.poCV + r.poPT;
    if (total <= 0) continue;
    rows.push(r);
  }

  if (rows.length === 0) {
    return { success: false, error: 'Tidak ada baris dengan qty > 0' };
  }

  ensurePoHeader_(sheet);

  if (clearExisting) {
    clearPoData_(sheet);
  }

  var start = PO_DATA_START_ROW;
  if (!clearExisting) {
    var last = sheet.getLastRow();
    start = Math.max(PO_DATA_START_ROW, last + 1);
  }

  // Tulis batch: kolom B–I
  var values = [];
  for (var j = 0; j < rows.length; j++) {
    var row = rows[j];
    var total = row.poCV + row.poPT;
    values.push([
      j + 1,           // B NO
      row.nama,        // C NAMA BARANG
      row.size,        // D SIZE
      row.satuan,      // E SATUAN
      row.poCV,        // F PO CV
      row.poPT,        // G PO PT
      total,           // H TOTAL
      row.tgl          // I TGL KEDATANGAN
    ]);
  }

  sheet.getRange(start, PO_COL.NO, start + values.length - 1, PO_COL.TGL).setValues(values);
  SpreadsheetApp.flush();

  return {
    success: true,
    status: 'APPLIED',
    sheet: sheet.getName(),
    mode: mode,
    written: values.length,
    startRow: start,
    endRow: start + values.length - 1,
    columns: 'B:I',
    message: 'PO tertulis ' + values.length + ' baris ke sheet "' + sheet.getName() + '" mulai baris ' + start
  };
}

function findPoSheet_(ss) {
  for (var i = 0; i < PO_SHEET_NAMES.length; i++) {
    var sh = ss.getSheetByName(PO_SHEET_NAMES[i]);
    if (sh) return sh;
  }
  var all = ss.getSheets();
  for (var j = 0; j < all.length; j++) {
    var n = String(all[j].getName() || '').toLowerCase();
    if (n.indexOf('purchase') >= 0 || n === 'po') return all[j];
  }
  return null;
}

function ensurePoHeader_(sheet) {
  var h = sheet.getRange(5, PO_COL.NO, 5, PO_COL.TGL).getValues()[0];
  var empty = true;
  for (var i = 0; i < h.length; i++) {
    if (String(h[i] || '').trim()) {
      empty = false;
      break;
    }
  }
  if (empty) {
    sheet.getRange(5, PO_COL.NO, 5, PO_COL.TGL).setValues([[
      'NO', 'NAMA BARANG', 'SIZE', 'SATUAN', 'PO CV', 'PO PT', 'TOTAL', 'TGL KEDATANGAN'
    ]]);
  }
}

function clearPoData_(sheet) {
  var last = sheet.getLastRow();
  if (last < PO_DATA_START_ROW) return;
  var maxClear = Math.max(last, PO_DATA_START_ROW);
  var end = Math.min(maxClear, PO_DATA_START_ROW + 199);
  sheet.getRange(PO_DATA_START_ROW, PO_COL.NO, end, PO_COL.TGL).clearContent();
}

function defaultTglKedatangan_() {
  var d = new Date();
  d.setDate(d.getDate() + 2);
  return Utilities.formatDate(d, TZ, 'dd MMM yyyy');
}

// ---------------------------------------------------------------------------
// UTILS
// ---------------------------------------------------------------------------

function norm_(x) {
  return String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function findCol_(headers, keywords) {
  var i, j;
  for (j = 0; j < keywords.length; j++) {
    for (i = 0; i < headers.length; i++) {
      if (headers[i] === keywords[j]) return i;
    }
  }
  for (j = 0; j < keywords.length; j++) {
    for (i = 0; i < headers.length; i++) {
      if (headers[i].indexOf(keywords[j]) >= 0) return i;
    }
  }
  return -1;
}

function num_(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  var s = String(v == null ? '' : v).replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '').trim();
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function json_(o) {
  return ContentService
    .createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Tes manual di editor Apps Script:
 * 1) pilih fungsi testWritePO
 * 2) Run
 */
function testWritePO() {
  var res = writePurchaseOrder_({
    clearExisting: true,
    mode: 'cs',
    items: [
      { nama: 'Ayam Fillet Dada', size: '', satuan: 'Pack', entity: 'CV', qty: 10 },
      { nama: 'Ayam Fillet Dada', size: '', satuan: 'Pack', entity: 'PT', qty: 5 },
      { nama: 'Nugget', satuan: 'Pack', poCV: 20, poPT: 10 }
    ]
  });
  Logger.log(JSON.stringify(res));
}
