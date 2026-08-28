/**
 * GudangAI — Google Apps Script Web App V2.3
 * Spreadsheet ID: 1YAJKGm5JHQH_eYrDMeZEorfGTHhHxu9L4t4pYp7rqww
 *
 * ATURAN MENULIS (sesuai proteksi sheet):
 * - Sheet transaksi: HANYA Tanggal(B), Kode(C), QTY(F), Keterangan(G)
 * - JANGAN tulis Nama(D), Satuan(E) → VLOOKUP
 * - Stock CV/PT: HANYA BACA Stock Akhir, jangan update
 */
var SPREADSHEET_ID = '1YAJKGm5JHQH_eYrDMeZEorfGTHhHxu9L4t4pYp7rqww';

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';
    var entity = (e && e.parameter && e.parameter.entity) || '';
    if (action === 'healthCheck') {
      return jsonResponse({ status: 'ok', version: 'V2.3-PWA', timestamp: new Date().toISOString(), timezone: 'Asia/Jakarta' });
    }
    if (action === 'getStock') {
      if (entity !== 'CV' && entity !== 'PT') return jsonResponse({ error: 'entity harus CV atau PT' });
      var items = getStockFromSheet(entity);
      return jsonResponse({ items: items, entity: entity, count: items.length });
    }
    if (action === 'getStockAll') {
      var cv = getStockFromSheet('CV'), pt = getStockFromSheet('PT');
      return jsonResponse({ CV: { items: cv, count: cv.length }, PT: { items: pt, count: pt.length }, totalItems: cv.length + pt.length });
    }
    return jsonResponse({ error: 'action tidak dikenal', available: ['healthCheck', 'getStock', 'getStockAll'] });
  } catch (err) {
    return jsonResponse({ error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return jsonResponse({ error: 'body kosong' });
    var body = JSON.parse(e.postData.contents);
    var action = body.action || '';
    var entity = body.entity || '';
    var items = body.items || [];
    if (['barangMasuk', 'barangKeluar', 'barangRusak'].indexOf(action) === -1) {
      return jsonResponse({ error: 'action harus: barangMasuk, barangKeluar, barangRusak' });
    }
    if (entity !== 'CV' && entity !== 'PT') return jsonResponse({ error: 'entity harus CV atau PT' });
    if (!Array.isArray(items) || items.length === 0) return jsonResponse({ error: 'items harus array tidak kosong' });

    var stockMap = {};
    var si = getStockFromSheet(entity);
    for (var s = 0; s < si.length; s++) stockMap[si[s].kode] = si[s].stok;

    var result = writeTransaction(action, entity, items, stockMap);
    return jsonResponse({
      success: true,
      action: action,
      entity: entity,
      written: result.written,
      skipped: result.skipped,
      warnings: result.warnings,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse({ error: String(err.message || err) });
  }
}

function normHeader(x) {
  return String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function findCol(headers, keywords) {
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

function parseNumber(v) {
  if (typeof v === 'number') return v;
  var s = String(v || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '').trim();
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function getStockFromSheet(entity) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(entity === 'CV' ? 'Stock CV' : 'Stock PT');
  if (!sheet) throw new Error('Sheet Stock ' + entity + ' tidak ditemukan');

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headerRow = 0;
  for (var r = 0; r < Math.min(5, data.length); r++) {
    var rowStr = data[r].map(function(x) { return normHeader(x); }).join('|');
    if (rowStr.indexOf('kode') >= 0) { headerRow = r; break; }
  }

  var h = data[headerRow].map(normHeader);
  var iK = findCol(h, ['kode barang', 'kode']);
  var iN = findCol(h, ['nama barang', 'nama']);
  var iD = findCol(h, ['divisi']);
  var iS = findCol(h, ['satuan']);
  var iQ = findCol(h, ['stock akhir', 'stok akhir', 'stockakhir', 'stok', 'stock', 'qty', 'jumlah']);

  if (iK < 0) throw new Error('Kolom Kode tidak ditemukan di Stock ' + entity);
  if (iQ < 0) throw new Error('Kolom Stock Akhir tidak ditemukan di Stock ' + entity);

  var items = [];
  for (var i = headerRow + 1; i < data.length; i++) {
    var row = data[i];
    var kode = String(row[iK] || '').trim();
    if (!kode || kode.toLowerCase().indexOf('kode') >= 0) continue;

    items.push({
      kode: kode,
      nama: iN >= 0 ? String(row[iN] || '').trim() : '',
      satuan: iS >= 0 ? String(row[iS] || '').trim() : '',
      divisi: iD >= 0 ? String(row[iD] || '').trim() : '',
      stok: parseNumber(row[iQ]),
      lastUpdate: new Date().toISOString()
    });
  }
  return items;
}

function writeTransaction(action, entity, items, stockMap) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var sheetNames = {
    barangMasuk: ['Barang masuk', 'Barang Masuk', 'barang masuk'],
    barangKeluar: ['Barang keluar', 'Barang Keluar', 'barang keluar'],
    barangRusak: ['Barang Rusak', 'Barang rusak', 'barang rusak']
  };
  var candidates = sheetNames[action] || [];
  var sheet = null;
  for (var c = 0; c < candidates.length; c++) {
    sheet = ss.getSheetByName(candidates[c]);
    if (sheet) break;
  }
  if (!sheet) throw new Error('Sheet transaksi "' + candidates[0] + '" tidak ditemukan');

  var tgl = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy');
  var written = 0, skipped = 0, warnings = [];

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var kode = String(it.kode || '').trim();
    var qty = typeof it.qty === 'number' ? it.qty : parseFloat(it.qty) || 0;
    var ket = String(it.keterangan || '').trim();
    if (!kode) { skipped++; continue; }

    if (action === 'barangKeluar' && stockMap) {
      var cs = stockMap[kode] !== undefined ? stockMap[kode] : null;
      if (cs !== null && cs <= 0) {
        qty = 0;
        ket = '(STOK HABIS)' + (ket ? ' ' + ket : '');
        warnings.push(kode + ': stok 0');
      } else if (cs !== null && qty > cs) {
        var oq = qty;
        qty = cs;
        ket = '(DISESUAIKAN dari ' + oq + ')' + (ket ? ' ' + ket : '');
        warnings.push(kode + ': disesuaikan ' + oq + '→' + qty);
      }
    }

    if (qty === 0 && action === 'barangMasuk') { skipped++; continue; }

    var nr = Math.max(sheet.getLastRow(), 1) + 1;

    // HANYA 4 kolom yang diizinkan
    sheet.getRange(nr, 2).setValue(tgl);
    sheet.getRange(nr, 3).setValue(kode);
    sheet.getRange(nr, 6).setValue(qty);
    sheet.getRange(nr, 7).setValue(ket || entity);

    written++;
  }

  SpreadsheetApp.flush();
  return { written: written, skipped: skipped, warnings: warnings };
}

function jsonResponse(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
