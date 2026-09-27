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
var VERSION = '6.7.0+BATCH80-IDEMPOTENT';
var TITLE = 'BACKEND GudangAI-69 V6.7.0 BATCH80 IDEMPOTENT';
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

  if (a === 'addBatchTransaction') {
    return json_(addBatchTransaction_(body));
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
/**
 * HARD SAFETY:
 * - Sheet sumber: Stock CV / Stock PT = READ ONLY dari backend PWA.
 * - Tidak ada fungsi transaksi PWA yang boleh setValue/setValues pada kedua sheet.
 * - Penulisan PWA hanya di sheet whitelist: Barang masuk, Barang keluar, Barang Rusak.
 * - Nama/Satuan (kolom D/E) tetap dibiarkan untuk VLOOKUP/formula existing.
 */
// TRANSAKSI (addTransaction) — PWA transaction writer (STOCK SOURCE LOCKED)
// ---------------------------------------------------------------------------

function addTransaction_(body) {
  var item = {
    clientItemId: String(body.clientItemId || body.requestId || body.transactionId || '').trim(),
    kodeBarang: body.kodeBarang || body.kode,
    qty: body.qty,
    keterangan: body.keterangan
  };
  var res = addBatchTransaction_({
    sheet: body.sheet,
    entitas: body.entitas || body.entity,
    tanggal: body.tanggal,
    items: [item]
  });
  var r = (res.results && res.results[0]) || {};
  return {
    success: !!r.success,
    status: r.status || (r.success ? 'APPLIED' : 'FAILED'),
    row: r.row || null,
    qty: r.qty || num_(body.qty),
    kode: String(body.kodeBarang || body.kode || '').trim(),
    stockAkhir: null,
    adjusted: false,
    note: '',
    transactionId: body.transactionId || '',
    requestId: body.requestId || '',
    clientItemId: item.clientItemId,
    idempotent: !!r.idempotent,
    error: r.error || ''
  };
}

/**
 * BATCH 80 + IDEMPOTENCY
 * - Satu request dapat membawa sampai 80 item.
 * - Stock CV/PT tidak pernah disentuh.
 * - Penulisan transaksi dilakukan dalam dua operasi range batch:
 *   B:C dan F:G, sehingga D:E/VLOOKUP tetap aman.
 * - Idempotency Ledger menyimpan clientItemId + status + row.
 * - Retry setelah timeout akan dikenali sebagai DUPLICATE/IDEMPOTENT,
 *   sehingga item tidak ditulis dua kali.
 */
function addBatchTransaction_(body) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return { success: false, status: 'RETRY', error: 'Server sedang memproses transaksi lain', results: [] };
  }

  try {
    var sheetName = String(body.sheet || '').trim();
    var entitas = String(body.entitas || body.entity || '').toUpperCase();
    var tanggalRaw = String(body.tanggal || '').trim();
    var raw = Array.isArray(body.items) ? body.items : [];

    if (!sheetName) return { success: false, error: 'sheet wajib', results: [] };
    if (entitas !== 'CV' && entitas !== 'PT') return { success: false, error: 'entitas harus CV atau PT', results: [] };
    if (!raw.length) return { success: false, error: 'items kosong', results: [] };
    if (raw.length > 80) return { success: false, error: 'Maksimal 80 item per batch', results: [] };

    var ss = openSS_();
    var sheet = resolveTransactionSheet_(ss, sheetName);
    if (!sheet) return { success: false, error: 'Sheet transaksi tidak ditemukan: ' + sheetName, results: [] };

    var ledger = ensureIdempotencyLedger_(ss);
    var ledgerMap = readIdempotencyLedger_(ledger);

    var results = [];
    var pending = [];
    var seen = {};

    for (var i = 0; i < raw.length; i++) {
      var it = raw[i] || {};
      var cid = String(it.clientItemId || it.requestId || '').trim();
      var kode = String(it.kodeBarang || it.kode || '').trim();
      var qty = num_(it.qty);
      var ket = String(it.keterangan || '').trim().slice(0, 200);

      if (!cid) {
        results.push({ success: false, error: 'clientItemId kosong', index: i });
        continue;
      }
      if (seen[cid]) {
        results.push({ success: true, status: 'DUPLICATE', idempotent: true, clientItemId: cid });
        continue;
      }
      seen[cid] = true;

      if (!kode || qty <= 0) {
        results.push({ success: false, error: !kode ? 'Kode kosong' : 'Qty tidak valid', clientItemId: cid });
        continue;
      }

      var old = ledgerMap[cid];
      if (old && old.status === 'APPLIED') {
        results.push({ success: true, status: 'DUPLICATE', idempotent: true, clientItemId: cid, row: old.row, qty: old.qty, kode: old.kode });
        continue;
      }

      // PENDING dari request sebelumnya: bila baris target sudah berisi kode+qty,
      // anggap write sudah selesai walaupun respons sebelumnya timeout.
      if (old && old.status === 'PENDING' && old.row) {
        var existing = readTransactionIdentity_(sheet, old.row);
        if (existing.kode === old.kode && Number(existing.qty) === Number(old.qty)) {
          results.push({ success: true, status: 'DUPLICATE', idempotent: true, clientItemId: cid, row: old.row, qty: old.qty, kode: old.kode });
          pending.push({ cid: cid, status: 'APPLIED', row: old.row, kode: old.kode, qty: old.qty, ket: old.ket || '' });
          continue;
        }
      }

      pending.push({ cid: cid, status: 'NEW', kode: kode, qty: qty, ket: ket });
    }

    // Pisahkan item yang harus benar-benar ditulis.
    var toWrite = pending.filter(function (x) { return x.status === 'NEW'; });
    var startRow = toWrite.length ? Math.max(sheet.getLastRow(), 1) + 1 : null;

    // Reserve row + ledger PENDING sebelum write. Ini memberi jejak recovery
    // jika koneksi putus setelah Sheets selesai tetapi sebelum response diterima.
    var pendingRows = [];
    for (var p = 0; p < toWrite.length; p++) {
      toWrite[p].row = startRow + p;
      pendingRows.push([
        toWrite[p].cid, 'PENDING', sheet.getName(), toWrite[p].row,
        toWrite[p].kode, toWrite[p].qty, toWrite[p].ket,
        new Date().toISOString()
      ]);
    }
    if (pendingRows.length) {
      ledger.getRange(ledger.getLastRow() + 1, 1, pendingRows.length, 8).setValues(pendingRows);
    }

    if (toWrite.length) {
      var bc = [];
      var fg = [];
      for (var w = 0; w < toWrite.length; w++) {
        var t = toWrite[w];
        bc.push([formatTransactionDate_(tanggalRaw), t.kode]);
        fg.push([t.qty, t.ket]);
      }

      // JANGAN tulis D:E. Dua batch range tetap mempertahankan formula/VLOOKUP.
      sheet.getRange(startRow, 2, toWrite.length, 2).setValues(bc);
      sheet.getRange(startRow, 6, toWrite.length, 2).setValues(fg);
      SpreadsheetApp.flush();
    }

    // Tandai seluruh NEW sebagai APPLIED dalam satu batch ledger.
    if (toWrite.length) {
      var lastLedgerRow = ledger.getLastRow();
      var ledgerValues = ledger.getRange(2, 1, Math.max(0, lastLedgerRow - 1), 8).getValues();
      var rowByCid = {};
      for (var lr = 0; lr < ledgerValues.length; lr++) {
        var lc = String(ledgerValues[lr][0] || '');
        if (lc) rowByCid[lc] = lr + 2;
      }
      for (var aw = 0; aw < toWrite.length; aw++) {
        var tw = toWrite[aw];
        var lrow = rowByCid[tw.cid];
        if (lrow) {
          ledger.getRange(lrow, 2, 1, 8).setValues([[
            'APPLIED', sheet.getName(), tw.row, tw.kode, tw.qty, tw.ket, new Date().toISOString(), entitas
          ]]);
        }
        results.push({ success: true, status: 'APPLIED', clientItemId: tw.cid, row: tw.row, qty: tw.qty, kode: tw.kode });
      }
    }

    // Update recovered PENDING rows to APPLIED.
    for (var rr = 0; rr < pending.length; rr++) {
      if (pending[rr].status !== 'APPLIED') continue;
      var oldRow = ledgerMap[pending[rr].cid];
      if (!oldRow || !oldRow.ledgerRow) continue;
      ledger.getRange(oldRow.ledgerRow, 2, 1, 8).setValues([[
        'APPLIED', sheet.getName(), pending[rr].row, pending[rr].kode, pending[rr].qty,
        pending[rr].ket || '', new Date().toISOString(), entitas
      ]]);
    }

    // Safety: semua hasil yang berasal dari old APPLIED / recovered PENDING
    // sudah masuk results; jangan pernah mengubah Stock CV/PT.
    var successCount = results.filter(function (x) { return x.success; }).length;
    var failCount = results.filter(function (x) { return !x.success; }).length;

    return {
      success: failCount === 0,
      status: failCount === 0 ? 'APPLIED' : 'PARTIAL',
      total: raw.length,
      successCount: successCount,
      failCount: failCount,
      results: results
    };
  } catch (err) {
    return { success: false, status: 'ERROR', error: String(err.message || err), results: [] };
  } finally {
    try { SpreadsheetApp.flush(); } catch (_) {}
    lock.releaseLock();
  }
}

function resolveTransactionSheet_(ss, sheetName) {
  var candidates = [sheetName];
  if (/masuk/i.test(sheetName)) candidates = candidates.concat(['Barang masuk', 'Barang Masuk']);
  if (/keluar/i.test(sheetName)) candidates = candidates.concat(['Barang keluar', 'Barang Keluar']);
  if (/rusak/i.test(sheetName)) candidates = candidates.concat(['Barang Rusak', 'Barang rusak']);
  for (var i = 0; i < candidates.length; i++) {
    var sh = ss.getSheetByName(candidates[i]);
    if (sh) return sh;
  }
  return null;
}

function formatTransactionDate_(raw) {
  var s = String(raw || '').trim();
  var m = s.match(/^(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{4})$/);
  if (m) return ('0' + m[1]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[3];
  return Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy');
}

function ensureIdempotencyLedger_(ss) {
  var sh = ss.getSheetByName('Idempotency Ledger');
  if (!sh) {
    sh = ss.insertSheet('Idempotency Ledger');
    sh.getRange(1, 1, 1, 8).setValues([[
      'ClientItemID', 'Status', 'Sheet', 'Row', 'Kode', 'Qty', 'Keterangan', 'UpdatedAt'
    ]]);
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 8).setValues([[
      'ClientItemID', 'Status', 'Sheet', 'Row', 'Kode', 'Qty', 'Keterangan', 'UpdatedAt'
    ]]);
  }
  return sh;
}

function readIdempotencyLedger_(sh) {
  var out = {};
  var last = sh.getLastRow();
  if (last < 2) return out;
  var values = sh.getRange(2, 1, last - 1, 8).getValues();
  for (var i = 0; i < values.length; i++) {
    var cid = String(values[i][0] || '').trim();
    if (!cid) continue;
    out[cid] = {
      status: String(values[i][1] || '').toUpperCase(),
      sheet: String(values[i][2] || ''),
      row: Number(values[i][3]) || 0,
      kode: String(values[i][4] || ''),
      qty: num_(values[i][5]),
      ket: String(values[i][6] || ''),
      ledgerRow: i + 2
    };
  }
  return out;
}

function readTransactionIdentity_(sheet, row) {
  if (!row || row > sheet.getMaxRows()) return { kode: '', qty: 0 };
  var v = sheet.getRange(row, 3, 1, 4).getValues()[0]; // C:F
  return { kode: String(v[0] || '').trim(), qty: num_(v[3]) };
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
