/**
 * PATCH: writePurchaseOrder_
 * --------------------------
 * Salin fungsi ini ke project Apps Script production (file Code.gs yang 2000+ baris).
 * Ganti fungsi writePurchaseOrder_ yang ada dengan versi di bawah.
 * JANGAN overwrite seluruh file production.
 *
 * Setelah paste:
 * 1. Save
 * 2. Deploy → New version
 * 3. Test submitPO dari PWA
 */

function writePurchaseOrder_(body) {
  body = body || {};
  var requestId = String(body.requestId || body.transactionId || '').trim();
  var cache = CacheService.getScriptCache();
  if (requestId) {
    var cacheKey = 'PO_IDEMP_' + requestId;
    if (cache.get(cacheKey)) {
      return {
        success: true,
        status: 'DUPLICATE',
        idempotent: true,
        message: 'PO sudah pernah diproses',
        version: VERSION
      };
    }
  }

  var items = body.items || body.poItems || [];
  if (!items || !items.length) {
    var res = {
      success: true,
      status: 'OK',
      message: 'Tidak ada item untuk ditulis',
      version: VERSION,
      written: 0
    };
    try {
      var cs = getCSItemsForPO_();
      res.csItemCount = cs.length;
    } catch (e) {}
    try {
      res.dashboardSync = updateDashboardStatusPO_();
    } catch (e2) {}
    return res;
  }

  var ss = openSS_();
  var sh = findPoSheet_(ss);
  if (!sh) {
    return {
      success: false,
      error: 'Sheet Purchase Order tidak ditemukan',
      version: VERSION
    };
  }

  // Merge by normalized nama (CV + PT)
  var map = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var qty = Number(it.qty) || 0;
    if (qty <= 0) continue;
    var nama = String(it.nama || '').trim();
    if (!nama) continue;
    var key = nama.toLowerCase();
    if (!map[key]) {
      map[key] = {
        nama: nama,
        size: String(it.size || '').trim(),
        satuan: String(it.satuan || 'Pack').trim(),
        poCV: 0,
        poPT: 0
      };
    }
    var entity = String(it.entity || it.entitas || '').toUpperCase();
    if (entity === 'CV') map[key].poCV += qty;
    else map[key].poPT += qty;
  }

  var rows = [];
  for (var k in map) {
    if (!map.hasOwnProperty(k)) continue;
    var r = map[k];
    if (r.poCV + r.poPT <= 0) continue;
    rows.push(r);
  }

  if (!rows.length) {
    return {
      success: false,
      error: 'Semua qty 0 setelah filter',
      version: VERSION
    };
  }

  var tglKedatangan = String(body.tglKedatangan || body.tanggalKedatangan || '').trim();
  if (!tglKedatangan) {
    var d = new Date();
    d.setDate(d.getDate() + 2);
    tglKedatangan = Utilities.formatDate(d, TZ, 'dd MMM yyyy');
  }

  // Clear existing data rows then write fresh
  var last = Math.max(sh.getLastRow(), PO_DATA_START_ROW);
  if (last >= PO_DATA_START_ROW) {
    sh.getRange(PO_DATA_START_ROW, 2, last, 9).clearContent();
  }

  var values = [];
  for (var n = 0; n < rows.length; n++) {
    var row = rows[n];
    values.push([
      n + 1,
      row.nama,
      row.size,
      row.satuan,
      row.poCV || 0,
      row.poPT || 0,
      row.poCV + row.poPT,
      tglKedatangan
    ]);
  }

  sh.getRange(PO_DATA_START_ROW, 2, PO_DATA_START_ROW + values.length - 1, 9).setValues(values);

  if (requestId) {
    try {
      cache.put('PO_IDEMP_' + requestId, '1', 21600);
    } catch (ce) {}
  }

  var dash = null;
  try {
    dash = updateDashboardStatusPO_();
  } catch (de) {}

  return {
    success: true,
    status: 'APPLIED',
    written: values.length,
    message: 'PO ditulis ' + values.length + ' baris',
    dashboardSync: dash,
    version: VERSION
  };
}
