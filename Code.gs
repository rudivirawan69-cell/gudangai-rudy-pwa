/**
 * BACKEND GudangAI-69 V6.5.4+V6.4.15-COMPAT-DYNAMIC-MASTER
 * ---------------------------------------------------------
 * - Compatible with frontend api.js V6.4.15 (write-once, batch, Status PO)
 * - Dynamic Master: counts derived at runtime from Stock CV + Stock PT (no hard-coded 191 / 43)
 * - PO B7 flow preserved; CS items filtered by divisi == "CS" at runtime
 * - Anti double-submit: requestId / transactionId / nonce + CacheService idempotency ledger
 * - Spreadsheet is the single source of truth for master data
 * DEPLOY: paste full file → New version → Deploy (Anyone)
 */
var SPREADSHEET_ID_FALLBACK = '1YAJKGm5JHQH_eYrDMeZEorfGTHhHxu9L4t4pYp7rqww';
var VERSION = '6.5.4+V6.4.15-COMPAT-DYNAMIC-MASTER';
var TITLE = 'BACKEND GudangAI-69 V6.5.4 DYNAMIC-MASTER';
var TZ = 'Asia/Jakarta';
var PO_SHEET_NAMES = ['purchase order', 'Purchase Order', 'Purchase order', 'PO', 'PURCHASE ORDER'];
var DASHBOARD_SHEET_NAMES = ['Dashboard', 'dashboard', 'DASHBOARD', 'Beranda'];
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
