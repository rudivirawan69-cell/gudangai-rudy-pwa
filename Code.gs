/**
 * GudangAI — Google Apps Script Web App V2
 * Spreadsheet ID: 1YAJKGm5JHQH_eYrDMeZEorfGTHhHxu9L4t4pYp7rqww
 *
 * ATURAN KRITIS:
 * - Kolom D (Nama) dan E (Satuan) TIDAK BOLEH ditulis
 * - barangKeluar: stok <= 0 → QTY=0 + "(STOK HABIS)"
 * - barangKeluar: qty > stok → qty=stok + "(DISESUAIKAN)"
 * - barangRusak: tulis apa adanya + keterangan
 */
var SPREADSHEET_ID = '1YAJKGm5JHQH_eYrDMeZEorfGTHhHxu9L4t4pYp7rqww';

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';
    var entity = (e && e.parameter && e.parameter.entity) || '';
    if (action === 'healthCheck') {
      return jsonResponse({ status: 'ok', version: 'V2.0-PWA', timestamp: new Date().toISOString(), timezone: 'Asia/Jakarta' });
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
    return jsonResponse({ error: 'action tidak dikenal', available: ['healthCheck','getStock','getStockAll'] });
  } catch (err) { return jsonResponse({ error: String(err.message || err) }); }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return jsonResponse({ error: 'body kosong' });
    var body = JSON.parse(e.postData.contents);
    var action = body.action || '', entity = body.entity || '', items = body.items || [];
    if (['barangMasuk','barangKeluar','barangRusak'].indexOf(action) === -1) return jsonResponse({ error: 'action harus: barangMasuk, barangKeluar, barangRusak' });
    if (entity !== 'CV' && entity !== 'PT') return jsonResponse({ error: 'entity harus CV atau PT' });
    if (!Array.isArray(items) || items.length === 0) return jsonResponse({ error: 'items harus array tidak kosong' });
    var stockMap = {};
    if (action === 'barangKeluar') {
      var si = getStockFromSheet(entity);
      for (var s = 0; s < si.length; s++) stockMap[si[s].kode] = si[s].stok;
    }
    var result = writeTransaction(action, entity, items, stockMap);
    return jsonResponse({ success: true, action: action, entity: entity, written: result.written, skipped: result.skipped, warnings: result.warnings, timestamp: new Date().toISOString() });
  } catch (err) { return jsonResponse({ error: String(err.message || err) }); }
}

function getStockFromSheet(entity) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(entity === 'CV' ? 'Stock CV' : 'Stock PT');
  if (!sheet) throw new Error('Sheet tidak ditemukan');
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var h = data[0].map(function(x) { return String(x||'').toLowerCase().trim(); });
  var iK = findCol(h,['kode','kode barang','code']), iN = findCol(h,['nama','nama barang','name']),
      iS = findCol(h,['satuan','unit']), iD = findCol(h,['divisi','division','kategori']),
      iQ = findCol(h,['stok','stock','qty','jumlah']);
  if (iK < 0 || iQ < 0) throw new Error('Kolom Kode/Stok tidak ditemukan');
  var items = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i], kode = String(r[iK]||'').trim();
    if (!kode) continue;
    var sv = r[iQ], stok = typeof sv === 'number' ? sv : parseFloat(String(sv).replace(',','.')) || 0;
    items.push({ kode: kode, nama: iN>=0?String(r[iN]||'').trim():'', satuan: iS>=0?String(r[iS]||'').trim():'', divisi: iD>=0?String(r[iD]||'').trim():'', stok: stok, lastUpdate: new Date().toISOString() });
  }
  return items;
}

function writeTransaction(action, entity, items, stockMap) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sn = action==='barangMasuk'?'Barang masuk':action==='barangKeluar'?'Barang keluar':'Barang Rusak';
  var sheet = ss.getSheetByName(sn);
  if (!sheet) throw new Error('Sheet "'+sn+'" tidak ditemukan');
  var tgl = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy');
  var written=0, skipped=0, warnings=[];
  for (var i = 0; i < items.length; i++) {
    var it = items[i], kode = String(it.kode||'').trim();
    var qty = typeof it.qty==='number'?it.qty:parseFloat(it.qty)||0;
    var ket = String(it.keterangan||'').trim();
    if (!kode) { skipped++; continue; }
    if (action === 'barangKeluar' && stockMap) {
      var cs = stockMap[kode] !== undefined ? stockMap[kode] : null;
      if (cs !== null && cs <= 0) { qty = 0; ket = '(STOK HABIS)'+(ket?' '+ket:''); warnings.push(kode+': stok 0'); }
      else if (cs !== null && qty > cs) { var oq=qty; qty=cs; ket='(DISESUAIKAN dari '+oq+')'+(ket?' '+ket:''); warnings.push(kode+': disesuaikan '+oq+'->'+qty); }
    }
    if (qty === 0 && action === 'barangMasuk') { skipped++; continue; }
    var nr = Math.max(sheet.getLastRow(),1)+1;
    sheet.getRange(nr,2).setValue(tgl);
    sheet.getRange(nr,3).setValue(kode);
    sheet.getRange(nr,6).setValue(qty);
    sheet.getRange(nr,7).setValue(ket||entity);
    written++;
  }
  SpreadsheetApp.flush();
  return { written:written, skipped:skipped, warnings:warnings };
}

function findCol(h,c) { for(var i=0;i<c.length;i++){var x=h.indexOf(c[i]);if(x>=0)return x;} return -1; }
function jsonResponse(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
