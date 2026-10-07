/**
 * ============================================================
 * BACKEND GudangAI-69 V6.6.5 — Apps Script Unified Dashboard & Operations
 * ============================================================
 * Spreadsheet Target : COLD STORAGE (auto-detect bulan)
 * Versi              : 6.6.5+DEPLOY-READY — realtime divisi + timestamp + dashboard charts + PO date simple
 * Tanggal            : 24 September 2026
 *
 * GABUNGAN TERBAIK V6.0 + V6.1 + V6.2:
 *
 * DARI V6.0 (Production Hardened):
 * - writeAuditLogSecure() — log audit transaksi lengkap
 * - verifyRowStillEmptyPath2() — verifikasi baris sebelum tulis
 * - findSafeEmptyRowAdaptively() — cari baris kosong dengan scan + buffer
 * - sendErrorEmailWithCooldown() — email error tanpa spam
 * - maybeArchiveAuditLog() — arsip log otomatis
 * - processEmailQueue() + installQueueTrigger() — akses Claude via email draft
 * - isDuplicateTransaction() — dedup fingerprint stabil
 * - testAddTransaction() — fungsi test
 *
 * DARI V6.1 (Auto-Detect):
 * - SPREADSHEET_ID dinamis (active → PropertiesService → fallback)
 * - validateTransactionDate() — validasi tanggal dalam bulan aktif
 * - getActiveMonth() — auto-detect bulan dari nama spreadsheet
 *
 * DARI V6.2 (New Features):
 * - Proteksi stok kurang dengan Qty penuh, Keterangan, dan clamp Stock Akhir
 * - resolveKodeFromNama() — input by name + fuzzy match + confidence
 * - SPECIAL_NAME_MAP + SIZE_MAP_CS
 * - syncDivisionStock() — 7 tabel divisi (DAPUR1/2, MIE, PACKING, CS, BAHAN BAKU, REKANAN)
 * - logDailySnapshot() — snapshot stok harian jam 23:00
 * - getDashboardData() — endpoint siap PWA
 * - writePORecommendations() — format tabel formal (baris 4 tanggal, data baris 6+)
 * - updateLastUpdateTimestamp() — timestamp untuk Dashboard
 *
 * CATATAN PENTING:
 * - Kolom D & E DILINDUNGI — script TIDAK menulis ke kolom ini
 * - Nama & Satuan diisi otomatis oleh VLOOKUP di sheet
 * - Total master data transaksi: 191 item; Stock CV + Stock PT tetap source of truth master.
 * - Data Stok Per Divisi: khusus BAHAN BAKU membaca Sisa Stok dari sheet "Stock Bahan Baku" (28 item); divisi lain tetap dari Stock CV/PT.
 *
 * TRIGGER (via setupEnvironment):
 * - sendDailyStockReport     → setiap hari jam 07:00
 * - weeklyPOAutomation       → Senin jam 08:00
 * - logDailySnapshot         → setiap hari jam 23:00
 * - processEmailQueue        → disabled/fail-closed; tidak menulis transaksi
 * ============================================================
 */



/**
 * SOURCE BASELINE:
 * - Current public repo Code.gs: V6.4.8+SYNC (compatibility contract).
 * - Production safety baseline retained from Code_GudangAI_V6.4.4_PATCHED.gs.
 * This file intentionally merges the two: no working safety path is removed;
 * expensive structure/dashboard rebuilds are taken off automatic triggers.
 */
// ============================================================
// 1. KONFIGURASI GLOBAL
// ============================================================
const SPREADSHEET_ID_FALLBACK = ""; // Fail-closed: target wajib berasal dari bound spreadsheet / Script Properties
const ADMIN_EMAIL = "rudivirawan69@gmail.com";
const TIMEZONE = "GMT+7";
const DATE_FORMAT = "d-MMM-yyyy";
const MAX_QTY = 100000;
const MAX_RETRY = 5;
const WRITE_COLUMNS = 6; // Kolom B s.d. G
const DUP_CACHE_TTL_SEC = 60;
const MASTER_CACHE_TTL_SEC = 1800;
const MAINTENANCE_CACHE_TTL_SEC = 21600;
const IDEMPOTENCY_SCAN_LIMIT = 2000;
const DIRTY_FLAG_KEY = "GUDANGAI_DATA_DIRTY";
const CACHE_MAINTENANCE_KEY = "GUDANGAI_CACHE_MAINTENANCE";
const SCAN_BUFFER_ROWS = 25;
const COOLDOWN_EMAIL_MS = 10 * 60 * 1000; // 10 menit
const AUDIT_LOG_ARCHIVE_THRESHOLD = 5000;
const QUEUE_SUBJECT_TAG = "GUDANGAI_QUEUE";
const CONFIG_SHEET_NAME = "Config";
const APP_TITLE = "BACKEND GudangAI-69 V6.6.5 DEPLOY";
const BACKEND_VERSION = "6.6.5+DEPLOY-READY";
const PO_DATE_ROW = 4;
const PO_HEADER_ROW = 5;
const PO_DATA_START_ROW = 6;
const PO_DATA_START_COL = 2; // B
const PO_DATA_NUM_COLS = 8; // B:I
const PO_LOCK_TIMEOUT_MS = 20000;
const PO_SECTION_CURRENT_ROW = 31;
const PO_DASHBOARD_MAX_VISIBLE_ROWS = 50;
const OPS_TITLE_ROWS = 2;
const OPS_HEADER_ROW = 3;
const OPS_DATA_START_ROW = 4;
const UI_PRIMARY = "#1F4E79";
const UI_PRIMARY_LIGHT = "#D9EAF7";
const UI_ROW_ALT = "#EAF2F8";
const UI_BORDER = "#B7C9D6";
const UI_TEXT = "#17324D";
const SYNC_HEARTBEAT_INTERVAL_SEC = 60;
const CIRCUIT_FAILURE_WINDOW_MS = 2 * 60 * 1000;
const CIRCUIT_FAILURE_THRESHOLD = 5;
const STOCK_VERSION_KEY = "GUDANGAI_STOCK_VERSION";
const MASTER_VERSION_KEY = "GUDANGAI_MASTER_VERSION";
const LAST_UPDATE_ISO_KEY = "LAST_UPDATE_ISO";
const SYNC_METRICS_KEY = "GUDANGAI_SYNC_METRICS";
const IDEMPOTENCY_SHEET_NAME = "Idempotency Ledger";
const IDEMPOTENCY_HEADERS = [
  "CreatedAt", "UpdatedAt", "TransactionID", "Nonce", "RequestID", "DeviceID",
  "Operation", "Sheet", "Entitas", "KodeBarang", "Qty", "Tanggal", "Status",
  "Row", "WriteOccurred", "ErrorCode", "Details"
];
const MAX_IDENTITY_LENGTH = 160;
const MAX_KETERANGAN_LENGTH = 4500;
const MASTER_SHEETS_READ_ONLY = ["Stock CV", "Stock PT"];

// Mapping bulan Indonesia untuk auto-detect
const BULAN_MAP = {
  "JANUARI": 1, "FEBRUARI": 2, "MARET": 3, "APRIL": 4,
  "MEI": 5, "JUNI": 6, "JULI": 7, "AGUSTUS": 8,
  "SEPTEMBER": 9, "OKTOBER": 10, "NOVEMBER": 11, "DESEMBER": 12
};

// Special mapping nama → kode (wajib untuk nama ambigu)
const SPECIAL_NAME_MAP = {
  "ice cream indolakto": "CV-0030",
  "es cream indolakto": "CV-0030",
  "ice cream vanilla": "CV-0030",
  "es cream vanilla": "CV-0030"
};

// Size map untuk divisi CS (dipakai PO + Data Stok Per Divisi)
const SIZE_MAP_CS = {
  "CV-0001":"500 gram","CV-0002":"500 gram","CV-0003":"115/1kg","CV-0004":"500 gram",
  "CV-0005":"P:10-20cm/D:4-6cm","CV-0007":"2 kg","CV-0008":"500 gram","CV-0009":"1 kg",
  "CV-0028":"500 gram","CV-0030":"8 liter","CV-0032":"500 gram","CV-0033":"500 gram",
  "CV-0061":"parting 20","CV-0062":"8 liter","CV-0084":"500 gram","CV-0090":"420 gram",
  "CV-0091":"500 gram",  "CV-0095":"24 pcs","CV-0096":"40 pcs","CV-0098":"1 kg","CV-0099":"1 kg",
  "PT-0001":"500 gram","PT-0002":"500 gram","PT-0005":"115/1kg","PT-0006":"P:10-20cm/D:4-6cm",
  "PT-0007":"500 gram","PT-0008":"2 kg","PT-0009":"500 gram","PT-0029":"8 liter",
  "PT-0035":"500 gram","PT-0037":"1 kg","PT-0044":"500 gram","PT-0051":"500 gram",
  "PT-0053":"480 gram","PT-0056":"24 pcs","PT-0057":"40 pcs",  "PT-0058":"1 kg","PT-0059":"1 kg",
  "WK-0012":"500 gram","WK-0020":"500 gram","WK-0023":"500 gram","WK-0031":"parting 20",
  "WK-0032":"8 liter"
};

// Whitelist sheet transaksi
const SHEET_CONFIG = {
  "Barang masuk":  { headerRow: 3, kodeColAbsolute: 3, cols: ["Tanggal","Kode Barang","Nama Barang","Satuan","QTY","Keterangan"] },
  "Barang keluar": { headerRow: 3, kodeColAbsolute: 3, cols: ["Tanggal","Kode Barang","Nama Barang","Satuan","QTY","Keterangan"] },
  "Barang Rusak":  { headerRow: 3, kodeColAbsolute: 3, cols: ["Tanggal","Kode Barang","Nama Barang","Satuan","Jumlah","Keterangan"] }
};


// ============================================================
// 2. KONEKSI SPREADSHEET — DINAMIS [V6.1]
// ============================================================
let _cachedSS = null;
let _resolvedSpreadsheetId = null;

function getSpreadsheetId() {
  if (_resolvedSpreadsheetId) return _resolvedSpreadsheetId;
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) { _resolvedSpreadsheetId = active.getId(); return _resolvedSpreadsheetId; }
  } catch (e) {}
  try {
    const stored = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    if (stored) { _resolvedSpreadsheetId = stored; return _resolvedSpreadsheetId; }
  } catch (e) {}
  _resolvedSpreadsheetId = SPREADSHEET_ID_FALLBACK;
  return _resolvedSpreadsheetId;
}

function getSS() {
  if (!_cachedSS) {
    _cachedSS = SpreadsheetApp.openById(getSpreadsheetId());
  }
  return _cachedSS;
}

function getConfigSheet_() {
  const ss = getSS();
  return ss.getSheetByName(CONFIG_SHEET_NAME) || ss.insertSheet(CONFIG_SHEET_NAME);
}

function readConfig_() {
  const sheet = getConfigSheet_();
  const lastRow = sheet.getLastRow();
  const config = {};
  if (lastRow < 4) return config;
  const rows = sheet.getRange(4, 1, lastRow - 3, 2).getValues();
  rows.forEach(function(row) {
    const key = String(row[0] || "").trim();
    if (key) config[key] = row[1];
  });
  return config;
}

function setupConfigSheet() {
  const sheet = getConfigSheet_();
  const existing = readConfig_();
  const inferred = getActiveMonthFromName_();
  const inferredKey = inferred.nama !== "UNKNOWN" ? (inferred.tahun + "-" + String(inferred.bulan).padStart(2, "0")) : "";
  // Jika nama spreadsheet mengenali bulan/tahun, itu menjadi sumber periode aktif.
  // PERIODE_AKTIF lama tidak boleh membawa periode bulan sebelumnya.
  const period = inferredKey || String(existing.PERIODE_AKTIF || "");
  if (!period) throw new Error("PERIODE_AKTIF tidak dapat ditentukan. Pastikan nama spreadsheet memuat bulan + tahun aktif atau setActivePeriod() secara eksplisit.");
  const values = [
    ["PERIODE_AKTIF", period],
    ["TIMEZONE", String(existing.TIMEZONE || "GMT+7")],
    ["SPREADSHEET_ID", getSpreadsheetId()],
    ["APP_TITLE", APP_TITLE],
    ["VERSION", BACKEND_VERSION],
    ["LAST_PERIOD_CHANGE", existing.LAST_PERIOD_CHANGE || new Date()],
    ["PO_WEEK_KEY", String(existing.PO_WEEK_KEY || "")]
  ];

  // Struktur visual standar: 2 baris identitas + 1 baris header data.
  if (sheet.getMaxColumns() < 2) sheet.insertColumnsAfter(sheet.getMaxColumns(), 2 - sheet.getMaxColumns());
  sheet.getRange("A1:B2").breakApart();
  sheet.getRange("A1:B1").merge().setValue(APP_TITLE);
  sheet.getRange("A2:B2").merge().setValue("Konfigurasi sistem • periode aktif • parameter sinkronisasi • update terakhir");
  sheet.getRange("A3:B3").setValues([["KEY", "VALUE"]]);
  sheet.getRange(4, 1, values.length, 2).setValues(values);
  sheet.getRange(4, 2).setNumberFormat("@");
  formatConfigSheet_(sheet);
  return { success: true, sheet: CONFIG_SHEET_NAME, period: period, title: APP_TITLE };
}
function getActiveMonthFromName_() {
  const name = getSS().getName().toUpperCase();
  for (const [bulanStr, bulanNum] of Object.entries(BULAN_MAP)) {
    if (name.includes(bulanStr)) {
      const tahunMatch = name.match(/'(\d{2})\b/) || name.match(/\b(20\d{2})\b/);
      const tahun = tahunMatch ? (tahunMatch[1].length === 2 ? 2000 + parseInt(tahunMatch[1]) : parseInt(tahunMatch[1])) : new Date().getFullYear();
      return { bulan: bulanNum, tahun: tahun, nama: bulanStr };
    }
  }
  const now = new Date();
  return { bulan: now.getMonth() + 1, tahun: now.getFullYear(), nama: "UNKNOWN" };
}

function parseActivePeriod_(period) {
  if (Object.prototype.toString.call(period) === "[object Date]" && !isNaN(period.getTime())) {
    period = Utilities.formatDate(period, "GMT+7", "yyyy-MM");
  }
  const match = String(period || "").trim().match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
  if (!match) return { valid: false, error: "PERIODE_AKTIF harus berformat YYYY-MM, contoh 2026-09." };
  const bulan = Number(match[2]);
  const nama = Object.keys(BULAN_MAP).find(function(key) { return BULAN_MAP[key] === bulan; });
  return { valid: true, bulan: bulan, tahun: Number(match[1]), nama: nama, value: match[1] + "-" + match[2] };
}

function setActivePeriod(period) {
  const parsed = parseActivePeriod_(period);
  if (!parsed.valid) return { success: false, error: parsed.error };
  const sheet = getConfigSheet_();
  if (sheet.getLastRow() < 4) setupConfigSheet();
  const last = sheet.getLastRow();
  const rows = sheet.getRange(4, 1, Math.max(1, last - 3), 2).getValues();
  let periodRow = -1;
  rows.forEach(function(row, index) { if (String(row[0]).trim() === "PERIODE_AKTIF") periodRow = index + 4; });
  if (periodRow < 0) { setupConfigSheet(); periodRow = 4; }
  sheet.getRange(periodRow, 2).setNumberFormat("@").setValue(parsed.value);
  const lastChangeRow = rows.findIndex(function(row) { return String(row[0]).trim() === "LAST_PERIOD_CHANGE"; });
  if (lastChangeRow >= 0) sheet.getRange(lastChangeRow + 4, 2).setValue(new Date());
  clearMasterCache();
  return { success: true, activeMonth: parsed, message: "Periode aktif diperbarui ke " + parsed.value + "." };
}

function setupNewPeriod(period) {
  const changed = setActivePeriod(period);
  if (!changed.success) return changed;
  setupConfigSheet();
  try { formatOperationalSheets_(); } catch (e) {}
  try { syncDivisionStock(); } catch (e2) {}
  try { refreshDashboard(); } catch (e3) {}
  return { success: true, activeMonth: changed.activeMonth, message: "Periode baru siap. Data transaksi lama tidak dihapus; gunakan tanggal/periode untuk pemisahan laporan." };
}

function getActiveMonth() {
  const inferred = getActiveMonthFromName_();
  if (inferred.nama !== "UNKNOWN") return inferred;
  const config = readConfig_();
  const configured = parseActivePeriod_(config.PERIODE_AKTIF);
  if (configured.valid) return { bulan: configured.bulan, tahun: configured.tahun, nama: configured.nama };
  return inferred;
}

function parseTransactionDate_(value) {
  // Parser deterministik: jangan bergantung pada Date.parse() untuk "Agu",
  // "Sep", atau format lokal Indonesia karena hasilnya tidak konsisten.
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getTime());
  }

  const raw = String(value == null ? "" : value).trim();
  if (!raw) return null;

  // ISO: yyyy-mm-dd atau yyyy-mm-ddTHH:mm:ss...
  let m = raw.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})(?:[T\\s].*)?$/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) return dt;
    return null;
  }

  // d-MMM-yyyy / dd-MMM-yyyy, termasuk singkatan bulan Indonesia.
  m = raw.toUpperCase().match(/^(\\d{1,2})[-\\/ ]([A-ZÀ-Ÿ]{3,9})[-\\/ ](\\d{4})$/);
  if (m) {
    const monthMap = {
      JAN:1, JANUARI:1, FEB:2, FEBRUARI:2, MAR:3, MARET:3, APR:4, APRIL:4,
      MAY:5, MEI:5, JUN:6, JUNI:6, JUL:7, JULI:7, AUG:8, AGU:8, AGUSTUS:8,
      SEP:9, SEPT:9, SEPTEMBER:9, OCT:10, OKT:10, OKTOBER:10,
      NOV:11, NOVEMBER:11, DEC:12, DES:12, DESEMBER:12
    };
    const mo = monthMap[m[2]];
    if (!mo) return null;
    const y = Number(m[3]), d = Number(m[1]);
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) return dt;
    return null;
  }

  // Fallback hanya untuk Date.parse format standar.
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeTransactionDateKey_(value) {
  const parsed = parseTransactionDate_(value);
  if (!parsed) return String(value == null ? "" : value).trim();
  return Utilities.formatDate(parsed, TIMEZONE, "yyyy-MM-dd");
}

function validateTransactionDate(dateStr) {
  const activeMonth = getActiveMonth();
  const inputDate = parseTransactionDate_(dateStr);
  if (!inputDate) {
    return { valid: false, error: "Format tanggal tidak valid: '" + dateStr + "'. Gunakan d-MMM-yyyy atau yyyy-MM-dd." };
  }
  if (inputDate.getMonth() + 1 !== activeMonth.bulan || inputDate.getFullYear() !== activeMonth.tahun) {
    return { valid: false, error: "Tanggal '" + dateStr + "' tidak sesuai spreadsheet aktif (" + activeMonth.nama + " " + activeMonth.tahun + ")." };
  }
  return { valid: true, normalized: Utilities.formatDate(inputDate, TIMEZONE, "yyyy-MM-dd") };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
// 3. ENTRY POINT: doPost / doGet
// ============================================================
function doPost(e) {
  const t0 = Date.now();
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: "Payload kosong" });
    }
    const parsedBody = JSON.parse(e.postData.contents);
    const body = normalizeIncomingRequest_(parsedBody);
    if (parsedBody && parsedBody.schemaVersion && String(parsedBody.schemaVersion) !== "1.0") {
      return jsonResponse({ success: false, status: "REJECTED", code: "UNSUPPORTED_SCHEMA_VERSION", requestId: body.requestId || null, error: "schemaVersion tidak didukung." });
    }
    const secret = PropertiesService.getScriptProperties().getProperty("API_SECRET");
    if (!secret) {
      return jsonResponse({ success: false, status: "REJECTED", code: "API_SECRET_NOT_CONFIGURED", requestId: body.requestId || null, error: "Backend belum dikonfigurasi. Jalankan setupEnvironment() terlebih dahulu." });
    }
    if (!body.secret || body.secret !== secret) {
      return jsonResponse({ success: false, status: "REJECTED", code: "UNAUTHORIZED", requestId: body.requestId || null, error: "Unauthorized" });
    }
    const action = body.action || "addTransaction";
    switch (action) {
      case "validateTransaction": return jsonResponse(validateTransactionRequest_(body));
      case "validateImportedItems": return jsonResponse(validateImportedItems_(body));
      case "getRequestStatus": return jsonResponse(getRequestStatus_(body));
      case "syncTransaction": return jsonResponse(syncTransaction(body));
      case "syncBatch":
      case "bulkSync": return jsonResponse(bulkTransaction(Object.assign({}, body, { _syncMode: true })));
      case "getTransactionStatus": return jsonResponse(getTransactionStatus(body));
      case "bootstrap": return jsonResponse(getPwaBootstrap(body));
      case "addTransaction": return jsonResponse(addTransaction(body));
      case "addTransactionBatch": return jsonResponse(bulkTransaction(Object.assign({}, body, { transactions: body.transactions || body.items || body.rows })));
      case "bulkTransaction": return jsonResponse(bulkTransaction(body));
      case "getStock":
      case "getStockByCode": return jsonResponse(getStockByCode(body.kode || body.kodeBarang, body.entitas));
      case "getAllStock":
      case "getStockAll": return jsonResponse(getAllStock(body.entitas || body.entity || "ALL"));
      case "getLowStock": return jsonResponse(getLowStock());
      case "getTransactionHistory": return jsonResponse(getTransactionHistory(body));
      case "searchByName": return jsonResponse(searchByName(body.query || body.q || body.nama));
      case "getDashboard":
      case "getDashboardData": return jsonResponse(getDashboardData());
      case "getDashboardLegacy": return jsonResponse(getDashboard());
      case "refreshDashboard": return jsonResponse(refreshDashboard(body.force === true || body.force === "true"));
      case "syncDivision":
      case "syncDivisionStock": return jsonResponse(syncDivisionStock());
      case "writePO":
      case "writePORecommendations":
      case "generatePO": return jsonResponse(writePORecommendations());
      case "writePurchaseOrder":
      case "submitPO":
      case "sendPO": return jsonResponse(writePurchaseOrder_(body));
      case "runPOAnalysis":
      case "getPOAnalysis": return jsonResponse(analyzePORecommendations_());
      case "logDailySnapshot": return jsonResponse(logDailySnapshot());
      case "clearMasterCache": return jsonResponse(clearMasterCache());
      case "maintenanceCleanup": return jsonResponse(maintenanceCleanup(true));
      case "getConfig": return jsonResponse({ success: true, config: readConfig_(), activeMonth: getActiveMonth(), title: APP_TITLE });
      case "diagnoseStockFormulas": return jsonResponse(diagnoseStockFormulaPatterns_());
      case "setupConfig": return jsonResponse(setupConfigSheet());
      case "setActivePeriod": return jsonResponse(setActivePeriod(body.period || body.periode || body.activePeriod));
      case "setupNewPeriod": return jsonResponse(setupNewPeriod(body.period || body.periode || body.activePeriod));
      case "status": return jsonResponse({ success: true, status: "OK", version: BACKEND_VERSION, requestId: body.requestId, title: APP_TITLE, spreadsheet: getSS().getName(), activeMonth: getActiveMonth(), serverTime: new Date().toISOString() });
      case "ping": return jsonResponse(getHealthStatus_(body));
      case "healthCheck": return jsonResponse(getHealthStatus_(body));
      case "getStockDelta": return jsonResponse(getStockDelta(body));
      case "getStatusPO": return jsonResponse(getStatusPO());
      case "recordPOArrival": return jsonResponse(recordPOArrival(body));
      case "getPORequestStatus": return jsonResponse(getPORequestStatus(body));
      case "refreshDashboardPO": return jsonResponse(refreshDashboardPOSection_());
      case "getSyncMetrics": return jsonResponse(getSyncMetrics());
      default: return jsonResponse({ success: false, error: "Action tidak dikenali: " + action });
    }
  } catch (err) {
    try { sendErrorEmailWithCooldown("doPost", err, { requestId: (typeof body !== "undefined" && body) ? body.requestId : "" }); } catch (notifyErr) {}
    return jsonResponse({ success: false, status: "REJECTED", code: "SERVER_ERROR", requestId: (typeof body !== "undefined" && body) ? body.requestId : null, error: err.message, _meta: { execMs: Date.now() - t0 } });
  }
}

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const action = params.action || "status";
  const secret = PropertiesService.getScriptProperties().getProperty("API_SECRET");
  if (!secret) {
    return jsonResponse({ success: false, status: "REJECTED", code: "API_SECRET_NOT_CONFIGURED", error: "Backend belum dikonfigurasi. Jalankan setupEnvironment() terlebih dahulu." });
  }
  if (!params.secret || params.secret !== secret) {
    return jsonResponse({ success: false, status: "REJECTED", code: "UNAUTHORIZED", error: "Unauthorized" });
  }
  // GET sengaja read-only. Semua write/admin action harus POST agar tidak
  // terpanggil oleh browser prefetch, crawler, atau pembukaan ulang URL.
  const blocked = ["addTransaction", "syncTransaction", "bulkTransaction", "writePO", "writePORecommendations", "writePurchaseOrder", "submitPO", "sendPO",
    "refreshDashboard", "refreshAllData", "syncDivision", "syncDivisionStock", "logDailySnapshot",
    "setupConfig", "setActivePeriod", "setupNewPeriod"];
  if (blocked.indexOf(action) >= 0) {
    return jsonResponse({ success: false, status: "REJECTED", code: "GET_WRITE_BLOCKED", error: "Operasi write/admin harus menggunakan POST terautentikasi." });
  }
  switch (action) {
    case "status":
    case "healthCheck":
    case "ping": return jsonResponse(getHealthStatus_({ requestId: e.parameter.requestId }));
    case "getConfig": return jsonResponse({ success: true, config: readConfig_(), activeMonth: getActiveMonth(), title: APP_TITLE, version: BACKEND_VERSION });
    case "runPOAnalysis":
    case "getPOAnalysis": return jsonResponse(analyzePORecommendations_());
    case "diagnoseStockFormulas": return jsonResponse(diagnoseStockFormulaPatterns_());
    case "getStock":
    case "getStockByCode": return jsonResponse(getStockByCode(e.parameter.kode || e.parameter.kodeBarang, e.parameter.entitas));
    case "getAllStock":
    case "getStockAll": return jsonResponse(getAllStock(e.parameter.entitas || e.parameter.entity || "ALL"));
    case "getLowStock": return jsonResponse(getLowStock());
    case "getDashboard":
    case "getDashboardData": return jsonResponse(getDashboardData());
    case "getDashboardLegacy": return jsonResponse(getDashboard());
    case "getTransactionHistory": return jsonResponse(getTransactionHistory({ sheet: e.parameter.sheet, limit: e.parameter.limit }));
    case "getTransactionStatus": return jsonResponse(getTransactionStatus({ transactionId: e.parameter.transactionId, nonce: e.parameter.nonce, sheet: e.parameter.sheet }));
    case "searchByName": return jsonResponse(searchByName(e.parameter.query || e.parameter.q));
    case "getLastUpdate": return jsonResponse({ success: true, timestamp: getLastUpdateTimestamp() });
    case "maintenanceCleanup": return jsonResponse(maintenanceCleanup(false));
    case "bootstrap": return jsonResponse(getPwaBootstrap({ entitas: e.parameter.entitas || "ALL" }));
    case "getStockDelta": return jsonResponse(getStockDelta({ sinceTimestamp: e.parameter.sinceTimestamp, entitas: e.parameter.entitas || "ALL" }));
    case "getStatusPO": return jsonResponse(getStatusPO());
    case "getPORequestStatus": return jsonResponse(getPORequestStatus({ requestId: e.parameter.requestId, transactionId: e.parameter.transactionId }));
    case "getSyncMetrics": return jsonResponse(getSyncMetrics());
    default: return jsonResponse({ success: false, status: "REJECTED", code: "UNKNOWN_ACTION", error: "Action tidak dikenali: " + action });
  }
}


// ============================================================
// 4. TRANSAKSI UTAMA — MERGED V6.0 safety + V6.1 validation + V6.2 features
// ============================================================
function normalizeIdentity_(value, fieldName, required) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) {
    if (required) throw new Error(fieldName + " wajib diisi untuk sinkronisasi outbox.");
    return "";
  }
  if (raw.length > MAX_IDENTITY_LENGTH || /[\u0000-\u001F\u007F]/.test(raw) || /[;|]/.test(raw)) {
    throw new Error(fieldName + " tidak valid atau terlalu panjang. Karakter ; dan | tidak diizinkan.");
  }
  return raw;
}

function normalizeIncomingRequest_(input) {
  const source = (input && typeof input === "object") ? input : {};
  const body = Object.assign({}, source);
  const payload = (source.payload && typeof source.payload === "object") ? source.payload : null;
  if (payload) {
    Object.keys(payload).forEach(function(key) {
      if (body[key] === undefined) body[key] = payload[key];
    });
    body.action = source.action || source.operation || payload.action || "addTransaction";
    if (!body.transactionId && source.offlineContext) body.transactionId = source.offlineContext.transactionId;
    if (!body.nonce && source.offlineContext) body.nonce = source.offlineContext.nonce;
    // Envelope offline dengan operation addTransaction tetap masuk gate sync.
    if (body.action === "addTransaction" && source.queueApproved === true && source.offlineContext && source.offlineContext.createdOffline === true) {
      body.action = "syncTransaction";
    }
    if ((body.action === "syncTransaction" || body.action === "addTransaction") && Array.isArray(body.transactions)) {
      body.action = "bulkTransaction";
      body._syncMode = true;
    }
  }
  if (!body.requestId) body.requestId = "REQ-" + Utilities.getUuid();
  if (!body.client || typeof body.client !== "object") body.client = {};
  if (!body.offlineContext || typeof body.offlineContext !== "object") body.offlineContext = {};
  return body;
}

function getIdempotencyLedgerSheet_() {
  const ss = getSS();
  let sheet = ss.getSheetByName(IDEMPOTENCY_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(IDEMPOTENCY_SHEET_NAME);
  if (sheet.getMaxColumns() < IDEMPOTENCY_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), IDEMPOTENCY_HEADERS.length - sheet.getMaxColumns());
  }

  // Jalur transaksi harus ringan: hanya memastikan struktur minimum ada.
  // Formatter penuh dijalankan oleh setupEnvironment()/maintenance, bukan setiap write.
  ensureOperationalHeaderLayout_(sheet, IDEMPOTENCY_HEADERS);
  const title = "IDEMPOTENCY LEDGER — GUDANGAI 69";
  const subtitle = "Perlindungan anti-double-write • request identity • status penulisan • audit teknis";
  const first = String(sheet.getRange(1, 1).getDisplayValue() || "");
  if (first !== title) {
    sheet.getRange(1, 1, 2, IDEMPOTENCY_HEADERS.length).breakApart();
    sheet.getRange(1, 1, 1, IDEMPOTENCY_HEADERS.length).merge().setValue(title);
    sheet.getRange(2, 1, 1, IDEMPOTENCY_HEADERS.length).merge().setValue(subtitle);
  }
  const header = sheet.getRange(OPS_HEADER_ROW, 1, 1, IDEMPOTENCY_HEADERS.length).getValues()[0];
  if (header.join("|") !== IDEMPOTENCY_HEADERS.join("|")) sheet.getRange(OPS_HEADER_ROW, 1, 1, IDEMPOTENCY_HEADERS.length).setValues([IDEMPOTENCY_HEADERS]);
  try { sheet.setFrozenRows(OPS_HEADER_ROW); } catch (e) {}
  return sheet;
}

function mapIdempotencyRow_(row, rowNumber) {
  const r = row || [];
  return {
    rowNumber: rowNumber,
    createdAt: r[0] || "", updatedAt: r[1] || "", transactionId: String(r[2] || ""), nonce: String(r[3] || ""),
    requestId: String(r[4] || ""), deviceId: String(r[5] || ""), operation: String(r[6] || ""),
    sheet: String(r[7] || ""), entitas: String(r[8] || ""), kodeBarang: String(r[9] || ""),
    qty: r[10], tanggal: String(r[11] || ""), status: String(r[12] || ""), dataRow: r[13] || "",
    writeOccurred: String(r[14] || ""), errorCode: String(r[15] || ""), details: String(r[16] || "")
  };
}

function findIdempotencyRecord_(transactionId, nonce) {
  const sheet = getSS().getSheetByName(IDEMPOTENCY_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < OPS_DATA_START_ROW) return null;
  const lastRow = sheet.getLastRow();
  const rowCount = Math.min(IDEMPOTENCY_SCAN_LIMIT, lastRow - OPS_HEADER_ROW);
  const startRow = Math.max(OPS_DATA_START_ROW, lastRow - rowCount + 1);
  const rows = sheet.getRange(startRow, 1, rowCount, IDEMPOTENCY_HEADERS.length).getValues();
  const tx = String(transactionId || "").trim();
  const no = String(nonce || "").trim();
  for (let i = rows.length - 1; i >= 0; i--) {
    const rec = mapIdempotencyRow_(rows[i], startRow + i);
    if ((tx && rec.transactionId === tx) || (no && rec.nonce === no)) return rec;
  }
  return null;
}

function appendIdempotencyRecord_(record) {
  const sheet = getIdempotencyLedgerSheet_();
  const now = new Date().toISOString();
  const values = [[
    record.createdAt || now, now, record.transactionId || "", record.nonce || "", record.requestId || "", record.deviceId || "",
    record.operation || "syncTransaction", record.sheet || "", record.entitas || "", record.kodeBarang || "", record.qty == null ? "" : record.qty,
    record.tanggal || "", record.status || "IN_PROGRESS", record.dataRow || "", record.writeOccurred == null ? "unknown" : record.writeOccurred,
    record.errorCode || "", redactSensitiveString_(String(record.details || "")).substring(0, 5000)
  ]];
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, IDEMPOTENCY_HEADERS.length).setValues(values);
  return mapIdempotencyRow_(values[0], sheet.getLastRow());
}

function updateIdempotencyRecord_(record, patch) {
  if (!record || !record.rowNumber) return null;
  const sheet = getSS().getSheetByName(IDEMPOTENCY_SHEET_NAME);
  if (!sheet) return null;
  const merged = Object.assign({}, record, patch || {});
  const now = new Date().toISOString();
  const values = [[
    merged.createdAt || now, now, merged.transactionId || "", merged.nonce || "", merged.requestId || "", merged.deviceId || "",
    merged.operation || "syncTransaction", merged.sheet || "", merged.entitas || "", merged.kodeBarang || "", merged.qty == null ? "" : merged.qty,
    merged.tanggal || "", merged.status || "IN_PROGRESS", merged.dataRow || "", merged.writeOccurred == null ? "unknown" : merged.writeOccurred,
    merged.errorCode || "", redactSensitiveString_(String(merged.details || "")).substring(0, 5000)
  ]];
  sheet.getRange(record.rowNumber, 1, 1, IDEMPOTENCY_HEADERS.length).setValues(values);
  return mapIdempotencyRow_(values[0], record.rowNumber);
}

function identityMarker_(transactionId, nonce) {
  // Identity markers MUST NOT be written into kolom Keterangan sheet transaksi.
  // ID unik (transactionId / nonce / requestId) disimpan di sheet Idempotency Ledger saja.
  // Fungsi ini dipertahankan agar call-site lama tidak error, tetapi selalu mengembalikan string kosong.
  return "";
}

function appendIdentityMarker_(keterangan, transactionId, nonce) {
  // Hanya kembalikan keterangan user (maksimal panjang). Jangan sisipkan GUDANGAI_TX / NONCE.
  // Read-back dan anti-duplikat mengandalkan Idempotency Ledger, bukan kolom Keterangan.
  const base = String(keterangan || "").trim();
  return base.substring(0, MAX_KETERANGAN_LENGTH);
}

function readBackTransactionByIdentity_(identity, preferredSheet) {
  const targetId = String(identity && identity.transactionId || "").trim();
  const targetNonce = String(identity && identity.nonce || "").trim();
  const sheetNames = preferredSheet ? [preferredSheet] : Object.keys(SHEET_CONFIG);
  for (let s = 0; s < sheetNames.length; s++) {
    const sheetName = sheetNames[s];
    if (!(sheetName in SHEET_CONFIG)) continue;
    const config = SHEET_CONFIG[sheetName];
    const sheet = getSS().getSheetByName(sheetName);
    if (!sheet) continue;
    const last = getRealLastDataRow(sheet, config);
    if (last <= config.headerRow) continue;
    const rows = sheet.getRange(config.headerRow + 1, 2, last - config.headerRow, 6).getValues();
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      const note = String(r[5] || "");
      const txMatch = targetId && new RegExp("(?:^|[;|]\\s*)GUDANGAI_TX=" + targetId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&") + "(?:;|$)").test(note);
      const nonceMatch = targetNonce && new RegExp("(?:^|[;|]\\s*)GUDANGAI_NONCE=" + targetNonce.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&") + "(?:;|$)").test(note);
      if (!txMatch && !nonceMatch) continue;
      return {
        matched: true, sheet: sheetName, row: config.headerRow + 1 + i,
        tanggal: normalizeTransactionDateKey_(r[0]), kodeBarang: String(r[1] || "").trim(),
        namaBarang: r[2], satuan: r[3], qty: Number(r[4]) || 0, keterangan: note,
        transactionId: targetId || null, nonce: targetNonce || null
      };
    }
  }
  return { matched: false, transactionId: targetId || null, nonce: targetNonce || null };
}

function identityPayloadMatches_(record, body) {
  if (!record) return true;
  return String(record.sheet) === String(body.sheet) && String(record.entitas).toUpperCase() === String(body.entitas).toUpperCase() &&
    String(record.kodeBarang) === String(body.kodeBarang) && Number(record.qty) === Number(body.qty) &&
    String(record.tanggal || "") === String(body.tanggal || "");
}

function validateImportedItems_(body) {
  const entity = String(body && (body.entitas || body.entity) || "").trim().toUpperCase();
  if (["CV", "PT"].indexOf(entity) < 0) return { success: false, status: "REJECTED", code: "ENTITY_REQUIRED", error: "entitas wajib CV atau PT." };
  const raw = (body && (body.items || body.rows || body.data)) || [];
  if (!Array.isArray(raw) || !raw.length) return { success: false, status: "REJECTED", code: "ITEMS_REQUIRED", error: "items wajib berisi minimal satu item." };
  if (raw.length > 200) return { success: false, status: "REJECTED", code: "ITEMS_LIMIT", error: "Maksimal 200 item per validasi." };
  const out = [], seen = {};
  let matched = 0, review = 0, rejected = 0;
  raw.forEach(function(item, idx) {
    const kode = String(item.kode || item.kodeBarang || "").trim();
    const nama = String(item.nama || item.name || item.nameFromPdf || "").trim();
    const qty = Number(item.qty);
    if (!nama && !kode) { rejected++; out.push({ index: idx + 1, status: "REJECTED", code: "NAME_REQUIRED", confidence: 0, error: "Nama barang/kode kosong." }); return; }
    if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) { rejected++; out.push({ index: idx + 1, status: "REJECTED", code: "INVALID_QTY", confidence: 0, nama: nama, kode: kode, error: "Qty tidak valid." }); return; }
    let resolved = null, confidence = 0, matchType = "";
    if (kode) {
      const stock = getStockByCode(kode, entity);
      if (stock && stock.success) { resolved = stock; confidence = 100; matchType = "CODE_EXACT"; }
    }
    if (!resolved && nama) {
      const r = resolveKodeFromNama(nama);
      if (r && r.success) {
        const stock = getStockByCode(r.kode, entity);
        if (stock && stock.success) { resolved = stock; confidence = Number(String(r.confidence || "0").replace("%", "")) || 0; matchType = r.flags && r.flags.indexOf("FUZZY_MATCH") >= 0 ? "FUZZY" : "NAME_EXACT"; }
      }
    }
    if (!resolved) {
      rejected++;
      out.push({ index: idx + 1, status: "UNMATCHED", code: "MASTER_NOT_FOUND", confidence: 0, nama: nama, kode: kode || null, qty: qty, error: "Tidak cocok dengan master " + entity + "." });
      return;
    }
    const finalKode = String(resolved.kode || kode).trim();
    const duplicateKey = entity + "|" + finalKode;
    if (seen[duplicateKey]) {
      out.push({ index: idx + 1, status: "DUPLICATE_MERGE", code: "DUPLICATE_MASTER_ITEM", confidence: confidence, kode: finalKode, nama: resolved.nama || nama, qty: qty, error: "Item master sama; gabungkan qty sebelum kirim." });
      review++;
      return;
    }
    seen[duplicateKey] = true;
    const status = confidence >= 100 ? "MATCHED" : "REVIEW";
    if (status === "MATCHED") matched++; else review++;
    out.push({ index: idx + 1, status: status, code: status === "MATCHED" ? "MASTER_MATCH" : "FUZZY_REVIEW", confidence: confidence, kode: finalKode, nama: resolved.nama || nama, satuan: resolved.satuan || item.satuan || "", qty: qty, matchType: matchType });
  });
  const total = raw.length;
  const pct = total ? Math.round((matched / total) * 100) : 0;
  return { success: rejected === 0 && review === 0, status: rejected === 0 && review === 0 ? "VALIDATED" : "REVIEW_REQUIRED", code: rejected ? "VALIDATION_FAILED" : (review ? "VALIDATION_REVIEW" : "VALIDATION_OK"), entity: entity, total: total, matched: matched, review: review, rejected: rejected, confidencePct: pct, items: out, serverTime: new Date().toISOString(), masterVersion: getCurrentSyncVersions_().masterVersion };
}

function getRequestStatus_(body) {
  const requestId = String(body && (body.requestId || body.transactionId) || "").trim();
  if (!requestId) return { success: false, status: "REJECTED", code: "IDENTITY_REQUIRED", error: "requestId wajib diisi." };
  const tx = String(body && body.transactionId || "").trim();
  const nonce = String(body && body.nonce || "").trim();
  if (tx || nonce) return getTransactionStatus({ requestId: requestId, transactionId: tx || requestId, nonce: nonce || tx || requestId, sheet: body.sheet });
  const sh = getSS().getSheetByName(IDEMPOTENCY_SHEET_NAME);
  if (!sh || sh.getLastRow() < OPS_DATA_START_ROW) return { success: false, status: "NOT_FOUND", code: "REQUEST_NOT_FOUND", requestId: requestId, writeOccurred: false };
  const last = sh.getLastRow();
  const start = Math.max(OPS_DATA_START_ROW, last - IDEMPOTENCY_SCAN_LIMIT + 1);
  const rows = sh.getRange(start, 1, last - start + 1, IDEMPOTENCY_HEADERS.length).getValues();
  for (let i = rows.length - 1; i >= 0; i--) {
    const rec = mapIdempotencyRow_(rows[i], start + i);
    if (rec.requestId !== requestId) continue;
    const rb = readBackTransactionByIdentity_({ transactionId: rec.transactionId, nonce: rec.nonce }, rec.sheet);
    if (rb && rb.matched && rec.status !== "APPLIED") updateIdempotencyRecord_(rec, { status: "APPLIED", dataRow: rb.row, writeOccurred: true, errorCode: "" });
    return { success: rb.matched || rec.status === "APPLIED", status: rb.matched ? "APPLIED" : (rec.status || "UNKNOWN"), code: rb.matched ? "READBACK_CONFIRMED" : (rec.errorCode || "REQUEST_FOUND"), requestId: requestId, transactionId: rec.transactionId, nonce: rec.nonce, writeOccurred: rb.matched ? true : rec.writeOccurred, readBack: rb, record: rec };
  }
  return { success: false, status: "NOT_FOUND", code: "REQUEST_NOT_FOUND", requestId: requestId, writeOccurred: false };
}

function getTransactionStatus(body) {
  const transactionId = String(body && (body.transactionId || (body.offlineContext && body.offlineContext.transactionId)) || "").trim();
  const nonce = String(body && (body.nonce || (body.offlineContext && body.offlineContext.nonce)) || "").trim();
  if (!transactionId && !nonce) return { success: false, status: "REJECTED", code: "IDENTITY_REQUIRED", error: "transactionId atau nonce wajib diisi." };
  const rec = findIdempotencyRecord_(transactionId, nonce);
  const readBack = readBackTransactionByIdentity_({ transactionId: transactionId, nonce: nonce }, body.sheet);
  if (rec) {
    if (readBack.matched && rec.status !== "APPLIED") {
      const updated = updateIdempotencyRecord_(rec, { status: "APPLIED", dataRow: readBack.row, writeOccurred: true, errorCode: "" });
      return { success: true, status: "APPLIED", code: "READBACK_CONFIRMED", transactionId: transactionId || rec.transactionId, nonce: nonce || rec.nonce, record: updated, readBack: readBack };
    }
    return { success: rec.status === "APPLIED", status: rec.status, code: rec.errorCode || "LEDGER_FOUND", transactionId: transactionId || rec.transactionId, nonce: nonce || rec.nonce, writeOccurred: rec.writeOccurred, retryable: rec.status === "FAILED" && rec.writeOccurred === "false", record: rec, readBack: readBack };
  }
  if (readBack.matched) return { success: true, status: "APPLIED", code: "READBACK_FOUND", transactionId: transactionId || null, nonce: nonce || null, writeOccurred: true, readBack: readBack };
  return { success: false, status: "NOT_FOUND", code: "IDENTITY_NOT_FOUND", transactionId: transactionId || null, nonce: nonce || null, writeOccurred: false, readBack: readBack };
}

/**
 * Membuat representasi snapshot stok yang stabil/deterministik.
 *
 * Prinsip:
 * - Tidak mengubah urutan all.items yang dikirim ke client.
 * - Hanya salinan array yang di-sort untuk kebutuhan hashing.
 * - Urutan ditentukan oleh entitas lalu kode (case-insensitive).
 * - Field hashing dibatasi pada data yang relevan sehingga field sementara
 *   atau perubahan urutan internal tidak memicu false full-sync.
 */
function buildStableStockSnapshot_(items) {
  if (!Array.isArray(items)) return "[]";

  const normalized = items.map(function(item) {
    const stockAmanRaw = item && item.stockAman;
    return {
      kode: String(item && item.kode || "").trim(),
      nama: String(item && item.nama || "").trim(),
      satuan: String(item && item.satuan || "").trim(),
      stockAkhir: Number(item && item.stockAkhir) || 0,
      stockAman: stockAmanRaw == null ? null : (Number(stockAmanRaw) || 0),
      divisi: String(item && item.divisi || "").trim(),
      entitas: String(item && item.entitas || "").trim().toUpperCase(),
      stockValue: Number(item && (item.stockValue != null ? item.stockValue : item.nilaiStok)) || 0
    };
  });

  normalized.sort(function(a, b) {
    const ea = a.entitas;
    const eb = b.entitas;
    if (ea < eb) return -1;
    if (ea > eb) return 1;
    const ka = a.kode.toUpperCase();
    const kb = b.kode.toUpperCase();
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });

  return JSON.stringify(normalized);
}

function getPwaBootstrap(body) {
  const entitas = String(body && body.entitas || "ALL").toUpperCase();
  const all = getAllStock(entitas === "CV" || entitas === "PT" ? entitas : "ALL");
  if (!all.success) return all;

  const capturedAt = new Date().toISOString();

  // PATCH: checksum bootstrap deterministik.
  // Urutan array dari getAllStock() tidak digunakan langsung untuk hashing.
  // Dengan demikian reorder item tanpa perubahan data tidak menghasilkan versi baru.
  const stableItems = buildStableStockSnapshot_(all.items);
  const stableRecords = JSON.parse(stableItems);

  // Master version: identitas master + parameter stok aman/divisi.
  const masterText = JSON.stringify(stableRecords.map(function(i) {
    return [i.kode, i.entitas, i.nama, i.satuan, i.divisi, i.stockAman];
  }));

  // Stock version: hanya nilai stok yang relevan untuk perubahan stok.
  const stockText = JSON.stringify(stableRecords.map(function(i) {
    return [i.kode, i.entitas, i.stockAkhir, i.stockValue];
  }));

  const masterVersion = sha256Short_(masterText);
  const stockVersion = sha256Short_(stockText);
  const checksum = stockVersion;
  const snapshotId = "SNAP-" + Utilities.formatDate(new Date(), TIMEZONE, "yyyyMMdd-HHmmss") + "-" + checksum;

  setSyncVersions_(masterVersion, stockVersion, capturedAt);

  return {
    success: true,
    status: "OK",
    version: BACKEND_VERSION,
    serverTime: capturedAt,
    capturedAt: capturedAt,
    snapshotId: snapshotId,
    activePeriod: getActiveMonth(),
    lastUpdate: getLastUpdateTimestamp(),
    masterVersion: masterVersion,
    stockVersion: stockVersion,
    checksum: checksum,
    entity: entitas,
    count: all.count,
    items: all.items
  };
}

function syncTransaction(body) {
  const request = normalizeIncomingRequest_(body);
  if (request.queueApproved !== true) return { success: false, status: "REJECTED", code: "QUEUE_APPROVAL_REQUIRED", requestId: request.requestId, error: "queueApproved=true wajib untuk sinkronisasi outbox." };
  let transactionId = "", nonce = "";
  try {
    transactionId = normalizeIdentity_(request.transactionId || (request.offlineContext && request.offlineContext.transactionId), "transactionId", false);
    nonce = normalizeIdentity_(request.nonce || (request.offlineContext && request.offlineContext.nonce) || transactionId, "nonce", true);
  } catch (e) { return { success: false, status: "REJECTED", code: "INVALID_IDENTITY", requestId: request.requestId, error: e.message }; }
  if (!transactionId) transactionId = nonce;
  request.transactionId = transactionId;
  request.nonce = nonce;
  request.action = "addTransaction";
  request._syncMode = true;
  const validation = validateTransactionRequest_(request, { requireDate: true, requireEntity: true });
  if (!validation.valid) return Object.assign(validation, { requestId: request.requestId, transactionId: transactionId, nonce: nonce, status: "REJECTED", writeOccurred: false });
  return addTransaction(request);
}

function addTransaction(body) {
  const t0 = Date.now();
  if (!body || typeof body !== "object") return { success: false, status: "REJECTED", code: "INVALID_BODY", error: "Body kosong / tidak valid" };
  const request = normalizeIncomingRequest_(body);
  const sheetName = String(request.sheet || "").trim();
  if (!(sheetName in SHEET_CONFIG)) return { success: false, status: "REJECTED", code: "SHEET_NOT_ALLOWED", requestId: request.requestId, error: "Sheet tidak diizinkan: " + sheetName };
  const config = SHEET_CONFIG[sheetName];
  const ss = getSS();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, status: "REJECTED", code: "SHEET_NOT_FOUND", requestId: request.requestId, error: "Sheet fisik tidak ditemukan: " + sheetName };

  const validation = validateTransactionRequest_(request, { requireDate: !!request._syncMode, requireEntity: true });
  if (!validation.valid) return Object.assign(validation, { requestId: request.requestId, status: "REJECTED", writeOccurred: false });

  const entitas = String(validation.entitas || normalizeEntityGroup_(request.entitas, request.kodeBarang).entitas || "").trim().toUpperCase();
  const kode = String(request.kodeBarang || "").trim();
  const numericQty = Number(request.qty);
  const formattedDate = request.tanggal || Utilities.formatDate(new Date(), TIMEZONE, DATE_FORMAT);
  const expectedDateKey = normalizeTransactionDateKey_(formattedDate);
  const finalDateCheck = validateTransactionDate(formattedDate);
  if (!finalDateCheck.valid) return { success: false, status: "REJECTED", code: "INVALID_DATE", requestId: request.requestId, transactionId: request.transactionId || null, error: finalDateCheck.error, writeOccurred: false };
  const originalKeterangan = String(request.keterangan || "").trim();
  const holdReference = request.holdTransactionId || request.realisasiHoldId || request.holdId || null;
  const holdCheck = validateHoldReference_(holdReference);
  if (!holdCheck.valid) return { success: false, status: "REJECTED", code: "HOLD_REFERENCE_REJECTED", requestId: request.requestId, error: holdCheck.error, writeOccurred: false };

  let transactionId;
  let nonce;
  try {
    transactionId = normalizeIdentity_(request.transactionId, "transactionId", false);
    nonce = normalizeIdentity_(request.nonce || transactionId, "nonce", !!request._syncMode);
    if (!transactionId) transactionId = nonce || ("TX-" + Utilities.formatDate(new Date(), TIMEZONE, "yyyyMMdd-HHmmss") + "-" + Utilities.getUuid().substring(0, 8));
    if (!nonce) nonce = transactionId;
  } catch (e) {
    return { success: false, status: "REJECTED", code: "INVALID_IDENTITY", requestId: request.requestId, error: e.message, writeOccurred: false };
  }

  const client = request.client || {};
  const deviceId = String(client.deviceId || "").trim();
  const operation = request._syncMode ? "syncTransaction" : "addTransaction";
  const lock = LockService.getScriptLock();
  let ledgerRecord = null;
  let attempts = 0;
  let targetRow = -1;
  let writeTouched = false;
  let lastError = null;
  let success = false;
  let finalQty = numericQty;
  let keterangan = originalKeterangan;
  let shortageMode = false;
  let availableQtyAtDecision = null;
  let normalizationStatus = { success: true, mode: "NOT_REQUIRED" };
  const flags = [];

  try {
    if (!lock.tryLock(15000)) return { success: false, status: "UNKNOWN", code: "LOCK_TIMEOUT", requestId: request.requestId, transactionId: transactionId, nonce: nonce, writeOccurred: "unknown", error: "Lock backend tidak tersedia; lakukan read-back sebelum retry." };
    try {
      ledgerRecord = findIdempotencyRecord_(transactionId, nonce);
      if (ledgerRecord && !identityPayloadMatches_(ledgerRecord, { sheet: sheetName, entitas: entitas, kodeBarang: kode, qty: numericQty, tanggal: expectedDateKey })) {
        return { success: false, status: "CONFLICT", code: "IDENTITY_REUSE_CONFLICT", requestId: request.requestId, transactionId: transactionId, nonce: nonce, writeOccurred: false, error: "Identity sudah pernah dipakai untuk payload berbeda." };
      }
      if (ledgerRecord) {
        const priorRead = readBackTransactionByIdentity_({ transactionId: transactionId, nonce: nonce }, sheetName);
        if (priorRead.matched) {
          ledgerRecord = updateIdempotencyRecord_(ledgerRecord, { status: "APPLIED", dataRow: priorRead.row, writeOccurred: true, errorCode: "" });
          return { success: true, status: "APPLIED", code: "IDEMPOTENT_REPLAY", requestId: request.requestId, transactionId: transactionId, nonce: nonce, sheet: sheetName, row: priorRead.row, kode: kode, qty: priorRead.qty, originalQty: numericQty, readBack: priorRead, replayed: true };
        }
        if (ledgerRecord.status === "UNKNOWN" || ledgerRecord.writeOccurred === "unknown") {
          return { success: false, status: "UNKNOWN", code: "READBACK_REQUIRED", requestId: request.requestId, transactionId: transactionId, nonce: nonce, writeOccurred: "unknown", error: "Identity memiliki percobaan ambigu; gunakan getTransactionStatus sebelum retry." };
        }
        ledgerRecord = updateIdempotencyRecord_(ledgerRecord, { status: "IN_PROGRESS", requestId: request.requestId, deviceId: deviceId, errorCode: "", writeOccurred: false });
      } else {
        ledgerRecord = appendIdempotencyRecord_({ transactionId: transactionId, nonce: nonce, requestId: request.requestId, deviceId: deviceId, operation: operation, sheet: sheetName, entitas: entitas, kodeBarang: kode, qty: numericQty, tanggal: expectedDateKey, status: "IN_PROGRESS", writeOccurred: false, details: "Claimed before write" });
      }

      const stockInfo = getStockByCode(kode, entitas);
      if (!stockInfo || !stockInfo.success) throw new Error("Kode Barang Tidak Dikenal atau entitas tidak cocok: " + kode);
      if (sheetName === "Barang keluar" && numericQty > 0) {
        const sisa = Math.max(0, Number(stockInfo.stockAkhir) || 0);
        availableQtyAtDecision = sisa;
        const kekurangan = Math.max(0, numericQty - sisa);
        if (kekurangan > 0) {
          shortageMode = true;
          finalQty = 0;
          const structured = "Input pending " + numericQty + " > sisa stock " + sisa + " > kurang " + kekurangan;
          keterangan = keterangan ? (keterangan + " | " + structured) : structured;
          flags.push("STOCK_KURANG", "STOCK_KURANG_HOLD", "QTY_HOLD_0");
          try {
            MailApp.sendEmail(ADMIN_EMAIL, "[GudangAI][STOCK KURANG] " + kode + " " + (stockInfo.nama || ""),
              "Entitas: " + entitas + "\nItem: " + kode + " — " + (stockInfo.nama || "") + "\nOrder keluar: " + numericQty + "\nStok tersedia: " + sisa + "\nKekurangan: " + kekurangan + "\n\nHOLD: Qty transaksi ditulis 0.");
          } catch (mailErr) { console.error("Email stock kurang gagal: " + mailErr.message); }
        }
      }
      keterangan = appendIdentityMarker_(keterangan, transactionId, nonce);

      while (attempts < MAX_RETRY && !success) {
        attempts++;
        try {
          targetRow = findSafeEmptyRowAdaptively(sheet, config);
          if (!verifyRowStillEmptyPath2(sheet, targetRow)) throw new Error("Baris target " + targetRow + " terisi proses paralel.");
          // Hanya kolom writable: B:C dan F:G. Kolom D:E tetap terlindungi.
          sheet.getRange(targetRow, 2, 1, 2).setValues([[formattedDate, kode]]);
          writeTouched = true;
          sheet.getRange(targetRow, 6, 1, 2).setValues([[finalQty, keterangan]]);
          // HARD RULE: transaksi API tidak pernah menulis/mengubah Stock CV/Stock PT.
          // Stock CV/PT adalah MASTER/SOURCE OF TRUTH dan hanya dibaca untuk validasi stok.
          normalizationStatus = { success: true, mode: "MASTER_READ_ONLY_ENFORCED" };
          SpreadsheetApp.flush();
          const vBC = sheet.getRange(targetRow, 2, 1, 2).getValues()[0];
          const vFG = sheet.getRange(targetRow, 6, 1, 2).getValues()[0];
          if (normalizeTransactionDateKey_(vBC[0]) !== expectedDateKey || String(vBC[1] || "").trim() !== kode || Number(vFG[0]) !== finalQty || String(vFG[1] || "") !== keterangan) {
            throw new Error("Verifikasi integritas gagal di baris " + targetRow + ".");
          }
          success = true;
        } catch (err) {
          lastError = err;
          if (!shouldRetryWrite_(writeTouched)) break;
          if (attempts < MAX_RETRY) Utilities.sleep(Math.pow(2, attempts) * 1000);
        }
      }
    } finally {
      if (lock.hasLock()) lock.releaseLock();
    }
  } catch (outerErr) {
    lastError = outerErr;
  }

  const execMs = Date.now() - t0;
  if (success) {
    ledgerRecord = updateIdempotencyRecord_(ledgerRecord, { status: "APPLIED", dataRow: targetRow, writeOccurred: true, errorCode: "", details: JSON.stringify({ shortage: shortageMode, attempts: attempts, execMs: execMs }) });
    writeAuditLogSecure("WRITE_TRANSACTION", "SUCCESS", { requestId: request.requestId, transactionId: transactionId, nonce: nonce, deviceId: deviceId, sheet: sheetName, row: targetRow, entitas: entitas, kode: kode, qty: finalQty, originalQty: numericQty, shortage: shortageMode, retries: attempts - 1, execMs: execMs }, "", transactionId);
    if (shortageMode) writeAuditLogSecure("SHORTAGE_HOLD", "HOLD_CREATED", { requestId: request.requestId, transactionId: transactionId, nonce: nonce, entitas: entitas, kode: kode, orderQty: numericQty, availableQty: availableQtyAtDecision == null ? 0 : availableQtyAtDecision, holdQty: 0, keterangan: keterangan }, "", transactionId);
    else if (holdReference) writeAuditLogSecure("HOLD_REALIZATION", "REALIZED", { holdTransactionId: holdReference, realizationTransactionId: transactionId, entitas: entitas, kode: kode, qty: finalQty }, "", transactionId);
    updateLastUpdateTimestamp();
    clearMasterCache();
    try { syncDivisionStockLightweight_(); } catch (divErr) { console.error("syncDivisionStockLightweight_ gagal: " + divErr.message); }
    const readBack = readBackTransactionByIdentity_({ transactionId: transactionId, nonce: nonce }, sheetName);
    const syncVersions = getCurrentSyncVersions_();
    const appliedResponse = { success: true, status: "APPLIED", code: "TRANSACTION_APPLIED", requestId: request.requestId, transactionId: transactionId, nonce: nonce, sheet: sheetName, row: targetRow, masterVersion: syncVersions.masterVersion, stockVersion: syncVersions.stockVersion, entitas: entitas, kode: kode, qty: finalQty, originalQty: numericQty, shortage: shortageMode, stockPolicy: shortageMode ? "STOCK_KURANG_HOLD_QTY_0" : "NORMAL", normalization: normalizationStatus, holdTransactionId: holdReference || null, flags: flags, retries: attempts - 1, execMs: execMs, writeOccurred: true, readBack: readBack, message: shortageMode ? "HOLD: Qty ditulis 0; realisasi harus dibuat sebagai transaksi Barang keluar baru setelah stok tersedia." : "Transaksi berhasil di " + sheetName + " baris " + targetRow + "." };
    recordSyncMetric_(appliedResponse);
    return appliedResponse;
  }

  const possible = writeTouched ? "unknown" : false;
  const status = writeTouched ? "UNKNOWN" : "FAILED";
  const code = writeTouched ? "PARTIAL_WRITE_READBACK_REQUIRED" : "WRITE_FAILED";
  const errorText = lastError ? String(lastError.message || lastError) : "Kesalahan tidak diketahui";
  if (ledgerRecord) updateIdempotencyRecord_(ledgerRecord, { status: status, dataRow: targetRow > 0 ? targetRow : "", writeOccurred: possible, errorCode: code, details: errorText });
  if (writeTouched) {
    const rb = readBackTransactionByIdentity_({ transactionId: transactionId, nonce: nonce }, sheetName);
    if (rb.matched) {
      const finalRec = ledgerRecord ? updateIdempotencyRecord_(ledgerRecord, { status: "APPLIED", dataRow: rb.row, writeOccurred: true, errorCode: "" }) : null;
      return { success: true, status: "APPLIED", code: "READBACK_CONFIRMED_AFTER_ERROR", requestId: request.requestId, transactionId: transactionId, nonce: nonce, sheet: sheetName, row: rb.row, entitas: entitas, kode: kode, qty: rb.qty, writeOccurred: true, readBack: rb, ledger: finalRec };
    }
  }
  try { sendErrorEmailWithCooldown("addTransaction - " + sheetName, lastError, { requestId: request.requestId, transactionId: transactionId, nonce: nonce, sheet: sheetName, entitas: entitas, kodeBarang: kode, qty: numericQty, tanggal: formattedDate }); } catch (notifyErr) {}
  writeAuditLogSecure("WRITE_TRANSACTION", status, { requestId: request.requestId, transactionId: transactionId, nonce: nonce, sheet: sheetName, entitas: entitas, kode: kode, qty: numericQty, writeTouched: writeTouched }, errorText, transactionId);
  const failedResponse = { success: false, status: status, code: code, requestId: request.requestId, transactionId: transactionId, nonce: nonce, sheet: sheetName, entitas: entitas, kode: kode, qty: numericQty, writeOccurred: possible, retryable: !writeTouched, error: writeTouched ? "Status tidak pasti; lakukan getTransactionStatus sebelum retry." : errorText };
  recordSyncMetric_(failedResponse);
  return failedResponse;
}

function bulkTransaction(body) {
  if (body && (body._syncMode || body.offlineContext || body.operation === "syncTransaction") && body.queueApproved !== true) {
    return { success: false, status: "REJECTED", code: "QUEUE_APPROVAL_REQUIRED", batchId: body.batchId || null, error: "queueApproved=true wajib untuk bulk outbox." };
  }
  var list = (body && (body.transactions || body.items || body.rows)) || [];
  if (!list.length) return { success: false, error: "transactions array kosong" };
  if (list.length > 200) return { success: false, error: "Batch melebihi batas 200 transaksi" };

  var batchId = String(body.batchId || body.transactionId || body.nonce || ("BATCH-" + Utilities.getUuid())).trim();
  var batchCache = CacheService.getScriptCache();
  var cachedBatch = batchCache.get("batchResult_" + batchId);
  if (cachedBatch) {
    try {
      var previous = JSON.parse(cachedBatch);
      previous.replayed = true;
      return previous;
    } catch (e) { batchCache.remove("batchResult_" + batchId); }
  }

  var t0 = Date.now();
  var sheetName = String(body.sheet || (list[0] && list[0].sheet) || "").trim();
  var entitas = String(body.entitas || body.entity || (list[0] && (list[0].entitas || list[0].entity)) || "").trim().toUpperCase();
  if (!(sheetName in SHEET_CONFIG)) {
    return { success: false, status: "REJECTED", code: "SHEET_NOT_ALLOWED", batchId: batchId, error: "Sheet tidak diizinkan: " + sheetName };
  }
  if (["CV", "PT"].indexOf(entitas) < 0) {
    return { success: false, status: "REJECTED", code: "ENTITY_REQUIRED", batchId: batchId, error: "entitas wajib CV atau PT." };
  }

  var config = SHEET_CONFIG[sheetName];
  var ss = getSS();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return { success: false, status: "REJECTED", code: "SHEET_NOT_FOUND", batchId: batchId, error: "Sheet fisik tidak ditemukan: " + sheetName };
  }

  // Preflight — validasi semua dulu tanpa write
  var prepared = [];
  var validationErrors = [];
  var seenKeys = {};
  for (var i = 0; i < list.length; i++) {
    var original = list[i] || {};
    var tx = Object.assign({}, original);
    if (!tx.sheet) tx.sheet = sheetName;
    if (!tx.entitas) tx.entitas = entitas;
    if (tx.queueApproved !== true && body.queueApproved === true) tx.queueApproved = true;
    if (!tx.client && body.client) tx.client = body.client;
    tx.transactionId = String(tx.transactionId || (batchId + "-" + String(i + 1).padStart(3, "0")));
    if (!tx.nonce) tx.nonce = tx.transactionId;
    var check = validateTransactionRequest_(tx, { requireDate: !!tx._syncMode || !!body._syncMode, requireEntity: true });
    if (!check.valid) {
      validationErrors.push({ index: i + 1, error: check.error });
      continue;
    }
    var normalizedKode = String(check.kode || tx.kodeBarang || tx.kode || "").trim();
    var duplicateKey = String(tx.sheet) + "|" + normalizedKode + "|" + String(tx.qty);
    if (seenKeys[duplicateKey]) {
      validationErrors.push({ index: i + 1, error: "Duplikat item dalam batch: " + normalizedKode + " qty " + tx.qty });
      continue;
    }
    seenKeys[duplicateKey] = true;
    tx.kodeBarang = normalizedKode;
    prepared.push(tx);
  }
  if (validationErrors.length > 0) {
    var rejected = { success: false, status: "PRECHECK_REJECTED", batchId: batchId, total: list.length, validationErrors: validationErrors, results: [] };
    batchCache.put("batchResult_" + batchId, JSON.stringify(rejected), DUP_CACHE_TTL_SEC);
    return rejected;
  }

  // Load stok 1x (untuk shortage HOLD pada keluar)
  var stockMap = {};
  try {
    var allStock = getAllStock(entitas);
    if (allStock && allStock.success && allStock.items) {
      allStock.items.forEach(function(it) {
        stockMap[String(it.kode || "").trim()] = {
          stockAkhir: clampStockToZero_(it.stockAkhir),
          nama: it.nama || "",
          entitas: it.entitas || entitas
        };
      });
    }
  } catch (eStock) {
    console.error("bulkTransaction stock load: " + eStock.message);
  }

  var isKeluar = sheetName === "Barang keluar";
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { success: false, status: "UNKNOWN", code: "LOCK_TIMEOUT", batchId: batchId, writeOccurred: "unknown", error: "Lock backend tidak tersedia; lakukan read-back sebelum retry." };
  }

  var results = [];
  var successCount = 0;
  var failCount = 0;
  var writeTouched = false;
  var rowsToWrite = [];

  try {
    for (var p = 0; p < prepared.length; p++) {
      var item = prepared[p];
      var prior = findIdempotencyRecord_(item.transactionId, item.nonce);
      // Reconcile before every re-write. IN_PROGRESS/UNKNOWN may mean the previous
      // request actually committed but the client timed out before receiving the response.
      if (prior && prior.status !== "APPLIED") {
        try {
          var priorReadBack = readBackTransactionByIdentity_({ transactionId: item.transactionId, nonce: item.nonce }, sheetName);
          if (priorReadBack && priorReadBack.matched) {
            updateIdempotencyRecord_(prior, { status: "APPLIED", dataRow: priorReadBack.row, writeOccurred: true, errorCode: "" });
            results.push({ success: true, status: "APPLIED", code: "READBACK_CONFIRMED", batchId: batchId, batchIndex: p + 1, transactionId: item.transactionId, nonce: item.nonce, requestId: item.requestId || "", clientItemId: item.clientItemId || item.requestId || "", sheet: sheetName, row: priorReadBack.row, kode: priorReadBack.kodeBarang, qty: priorReadBack.qty, replayed: true, writeOccurred: true });
            successCount++;
            continue;
          }
        } catch (reconcileErr) {
          console.error("bulkTransaction reconciliation gagal: " + reconcileErr.message);
        }
      }
      if (prior && prior.status === "APPLIED") {
        results.push({
          success: true, status: "APPLIED", code: "IDEMPOTENT_REPLAY",
          batchId: batchId, batchIndex: p + 1,
          transactionId: item.transactionId, nonce: item.nonce,
          requestId: item.requestId || "",
          clientItemId: item.clientItemId || item.requestId || "",
          sheet: sheetName, kode: item.kodeBarang,
          qty: prior.qty != null ? prior.qty : item.qty, replayed: true
        });
        successCount++;
        continue;
      }

      var numericQty = Number(item.qty) || 0;
      var formattedDate = item.tanggal || Utilities.formatDate(new Date(), TIMEZONE, DATE_FORMAT);
      var finalDateCheck = validateTransactionDate(formattedDate);
      if (!finalDateCheck.valid) {
        results.push({ success: false, status: "REJECTED", code: "INVALID_DATE", batchId: batchId, batchIndex: p + 1, error: finalDateCheck.error, kode: item.kodeBarang });
        failCount++;
        break;
      }

      var finalQty = numericQty;
      var keterangan = String(item.keterangan || "").trim();
      var shortageMode = false;
      var availableQty = null;

      if (isKeluar && numericQty > 0) {
        var st = stockMap[item.kodeBarang];
        var sisa = st ? Math.max(0, Number(st.stockAkhir) || 0) : 0;
        availableQty = sisa;
        var kekurangan = Math.max(0, numericQty - sisa);
        if (kekurangan > 0) {
          shortageMode = true;
          finalQty = 0;
          var structured = "HOLD; orderQty: " + numericQty + "; availableQty: " + sisa + "; shortageQty: " + kekurangan + "; followUp: verifikasi pembelian manual";
          keterangan = keterangan ? (keterangan + " | " + structured) : structured;
        }
        if (st) st.stockAkhir = Math.max(0, sisa - (shortageMode ? 0 : finalQty));
      }

      keterangan = appendIdentityMarker_(keterangan, item.transactionId, item.nonce);

      try {
        if (prior) {
          updateIdempotencyRecord_(prior, { status: "IN_PROGRESS", requestId: item.requestId || batchId, writeOccurred: false });
        } else {
          appendIdempotencyRecord_({
            transactionId: item.transactionId, nonce: item.nonce,
            requestId: item.requestId || batchId, deviceId: (item.client && item.client.deviceId) || "",
            operation: "bulkTransaction", sheet: sheetName, entitas: entitas,
            kodeBarang: item.kodeBarang, qty: numericQty, tanggal: normalizeTransactionDateKey_(formattedDate),
            status: "IN_PROGRESS", writeOccurred: false, details: "Batch claim " + batchId
          });
        }
      } catch (ledErr) { console.error("ledger claim: " + ledErr.message); }

      rowsToWrite.push({
        index: p, date: formattedDate, kode: item.kodeBarang,
        qty: finalQty, originalQty: numericQty, ket: keterangan,
        txId: item.transactionId, nonce: item.nonce,
        requestId: item.requestId || item.clientItemId || "",
        clientItemId: item.clientItemId || item.requestId || "",
        shortage: shortageMode, availableQty: availableQty
      });
    }

    if (rowsToWrite.length === 0 && failCount === 0) {
      var replayResp = {
        success: true, status: "COMMITTED", batchId: batchId,
        total: prepared.length, successCount: successCount, failCount: 0,
        results: results, replayed: true, execMs: Date.now() - t0
      };
      batchCache.put("batchResult_" + batchId, JSON.stringify(replayResp), DUP_CACHE_TTL_SEC);
      return replayResp;
    }

    if (rowsToWrite.length > 0) {
      var startRow = findSafeEmptyRowAdaptively(sheet, config);
      var needEnd = startRow + rowsToWrite.length - 1;
      if (sheet.getMaxRows() < needEnd) {
        try { sheet.insertRowsAfter(sheet.getMaxRows(), needEnd - sheet.getMaxRows() + 10); } catch (insErr) {}
      }
      if (!verifyRowStillEmptyPath2(sheet, startRow)) {
        startRow = findSafeEmptyRowAdaptively(sheet, config);
      }

      var bcValues = [];
      var fgValues = [];
      for (var r = 0; r < rowsToWrite.length; r++) {
        bcValues.push([rowsToWrite[r].date, rowsToWrite[r].kode]);
        fgValues.push([rowsToWrite[r].qty, rowsToWrite[r].ket]);
      }

      sheet.getRange(startRow, 2, rowsToWrite.length, 2).setValues(bcValues);
      writeTouched = true;
      sheet.getRange(startRow, 6, rowsToWrite.length, 2).setValues(fgValues);
      SpreadsheetApp.flush();

      for (var v = 0; v < rowsToWrite.length; v++) {
        var rowNum = startRow + v;
        var rw = rowsToWrite[v];
        var vBC = sheet.getRange(rowNum, 2, 1, 2).getValues()[0];
        var vFG = sheet.getRange(rowNum, 6, 1, 2).getValues()[0];
        var ok = (normalizeTransactionDateKey_(vBC[0]) === normalizeTransactionDateKey_(rw.date) || String(vBC[0]) === String(rw.date))
          && String(vBC[1] || "").trim() === rw.kode
          && Number(vFG[0]) === Number(rw.qty);

        if (ok) {
          successCount++;
          try {
            var rec = findIdempotencyRecord_(rw.txId, rw.nonce);
            if (rec) updateIdempotencyRecord_(rec, { status: "APPLIED", dataRow: rowNum, writeOccurred: true, errorCode: "" });
          } catch (uErr) {}
          results.push({
            success: true, status: "APPLIED", code: "TRANSACTION_APPLIED",
            batchId: batchId, batchIndex: rw.index + 1,
            transactionId: rw.txId, nonce: rw.nonce,
            requestId: rw.requestId || "",
            clientItemId: rw.clientItemId || rw.requestId || "",
            sheet: sheetName, row: rowNum, kode: rw.kode,
            qty: rw.qty, originalQty: rw.originalQty,
            shortage: rw.shortage, writeOccurred: true
          });
          if (rw.shortage) {
            try {
              writeAuditLogSecure("SHORTAGE_HOLD", "HOLD_CREATED", {
                batchId: batchId, transactionId: rw.txId, entitas: entitas, kode: rw.kode,
                orderQty: rw.originalQty, availableQty: rw.availableQty, holdQty: 0
              }, "", rw.txId);
            } catch (aErr) {}
          }
        } else {
          failCount++;
          try {
            var rec2 = findIdempotencyRecord_(rw.txId, rw.nonce);
            if (rec2) updateIdempotencyRecord_(rec2, { status: "UNKNOWN", dataRow: rowNum, writeOccurred: "unknown", errorCode: "VERIFY_FAILED" });
          } catch (u2) {}
          results.push({
            success: false, status: "UNKNOWN", code: "VERIFY_FAILED",
            batchId: batchId, batchIndex: rw.index + 1,
            transactionId: rw.txId, nonce: rw.nonce,
            requestId: rw.requestId || "",
            clientItemId: rw.clientItemId || rw.requestId || "",
            kode: rw.kode,
            writeOccurred: "unknown", error: "Verifikasi integritas gagal di baris " + rowNum
          });
          break;
        }
      }
    }

    updateLastUpdateTimestamp();
    clearMasterCache();
    try { syncDivisionStockLightweight_(); } catch (divErr) { console.error("syncDivisionStockLightweight_ gagal: " + divErr.message); }
  } catch (outerErr) {
    failCount++;
    try { sendErrorEmailWithCooldown("bulkTransaction", outerErr, { batchId: batchId, sheet: sheetName, count: prepared.length }); } catch (n) {}
    results.push({ success: false, status: writeTouched ? "UNKNOWN" : "FAILED", code: writeTouched ? "PARTIAL_WRITE_READBACK_REQUIRED" : "WRITE_FAILED", batchId: batchId, error: String(outerErr.message || outerErr) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }

  var response = {
    success: failCount === 0 && successCount === prepared.length,
    status: failCount === 0 ? "COMMITTED" : (writeTouched ? "PARTIAL_FAILURE_REVIEW_REQUIRED" : "FAILED"),
    batchId: batchId,
    total: prepared.length,
    successCount: successCount,
    failCount: failCount,
    failedIndex: failCount ? (results.length ? results[results.length - 1].batchIndex : null) : null,
    resumable: failCount > 0,
    retryPolicy: failCount > 0 ? "READBACK_FIRST_FOR_UNKNOWN; RESUME_UNSENT_ITEMS_ONLY" : "NONE",
    results: results,
    execMs: Date.now() - t0,
    writeOccurred: writeTouched
  };
  try { batchCache.put("batchResult_" + batchId, JSON.stringify(response), DUP_CACHE_TTL_SEC); } catch (cErr) {}
  try {
    writeAuditLogSecure("BULK_TRANSACTION", response.success ? "SUCCESS" : "PARTIAL_FAILURE", {
      batchId: batchId, total: prepared.length, successCount: successCount, failCount: failCount, execMs: response.execMs
    }, response.success ? "" : "Jangan ulangi batch sebelum review.", batchId);
  } catch (logErr) {}
  return response;
}


function normalizeEntityGroup_(entitas, kode) {
  const rawEntity = String(entitas || "").trim().toUpperCase();
  const rawCode = String(kode || "").trim().toUpperCase();
  const codePrefix = rawCode.split("-")[0];
  const cvPrefixes = ["CV", "BBCV"];
  const ptPrefixes = ["PT", "WK", "MM", "BBPT"];
  const codeGroup = cvPrefixes.indexOf(codePrefix) >= 0 ? "CV" : ptPrefixes.indexOf(codePrefix) >= 0 ? "PT" : "";
  const entityGroup = cvPrefixes.indexOf(rawEntity) >= 0 ? "CV" : ptPrefixes.indexOf(rawEntity) >= 0 ? "PT" : rawEntity;
  if (codeGroup && entityGroup && codeGroup !== entityGroup) return { valid: false, error: "Entitas/kode bertentangan: " + rawEntity + " / " + rawCode };
  if (codeGroup) return { valid: true, entitas: codeGroup, source: "CODE_PREFIX" };
  if (entityGroup === "CV" || entityGroup === "PT") return { valid: true, entitas: entityGroup, source: "ENTITY" };
  return { valid: false, error: "Entitas wajib CV/PT atau kode prefix CV/BBCV/PT/WK/MM/BBPT." };
}

function validateTransactionRequest_(tx, options) {
  const opts = options || {};
  if (!tx || typeof tx !== "object") return { valid: false, status: "REJECTED", code: "INVALID_TRANSACTION", error: "Transaksi tidak valid" };
  const sheetName = String(tx.sheet || "");
  if (!(sheetName in SHEET_CONFIG)) return { valid: false, status: "REJECTED", code: "SHEET_NOT_ALLOWED", error: "Sheet tidak diizinkan: " + tx.sheet };
  if (Object.prototype.hasOwnProperty.call(tx, "namaBarang") || Object.prototype.hasOwnProperty.call(tx, "nama") || Object.prototype.hasOwnProperty.call(tx, "satuan")) {
    return { valid: false, status: "REJECTED", code: "PROTECTED_FIELD", error: "Kolom Nama Barang/Satuan diproteksi; kirim hanya tanggal, kodeBarang, qty, dan keterangan." };
  }
  const allowed = ["action", "operation", "schemaVersion", "sheet", "entitas", "kodeBarang", "qty", "tanggal", "keterangan", "transactionId", "nonce", "holdTransactionId", "realisasiHoldId", "holdId", "requestId", "queueApproved", "client", "offlineContext", "secret", "_syncMode", "batchId", "deviceId"];
  const unknown = Object.keys(tx).filter(function(k) { return allowed.indexOf(k) < 0 && k !== "payload"; });
  if (unknown.length) return { valid: false, status: "REJECTED", code: "UNKNOWN_FIELD", error: "Field tidak diizinkan: " + unknown.join(", ") };
  const kode = String(tx.kodeBarang || "").trim();
  const entityGroup = normalizeEntityGroup_(tx.entitas, kode);
  if (opts.requireEntity !== false && !entityGroup.valid) return { valid: false, status: "REJECTED", code: "ENTITY_REQUIRED", error: entityGroup.error };
  const entitas = entityGroup.valid ? entityGroup.entitas : "";
  if (!kode) return { valid: false, status: "REJECTED", code: "CODE_REQUIRED", error: "kodeBarang wajib diisi" };
  const qty = Number(tx.qty);
  if (isNaN(qty) || qty < 0 || qty > MAX_QTY) return { valid: false, status: "REJECTED", code: "INVALID_QTY", error: "qty tidak valid" };
  if (opts.requireDate && !tx.tanggal) return { valid: false, status: "REJECTED", code: "DATE_REQUIRED", error: "tanggal wajib diisi untuk sinkronisasi outbox." };
  if (tx.tanggal) {
    const dateCheck = validateTransactionDate(tx.tanggal);
    if (!dateCheck.valid) return { valid: false, status: "REJECTED", code: "INVALID_DATE", error: dateCheck.error };
  }
  const stock = getStockByCode(kode, entitas);
  if (!stock || !stock.success) return { valid: false, status: "REJECTED", code: "CODE_ENTITY_MISMATCH", error: "Kode Barang Tidak Dikenal atau entitas tidak cocok: " + kode };
  if (String(stock.entitas || "").toUpperCase() !== entitas) return { valid: false, status: "REJECTED", code: "ENTITY_MISMATCH", error: "Entitas tidak cocok untuk " + kode };
  return { valid: true, status: "VALIDATED", kode: kode, nama: stock.nama || "", entitas: stock.entitas, stockAkhir: stock.stockAkhir };
}



// ============================================================
// 5. RESOLVE NAMA → KODE [V6.2]
// ============================================================
function resolveKodeFromNama(namaInput) {
  const namaLower = String(namaInput).toLowerCase().trim();
  if (!namaLower) return { success: false, error: "Nama kosong" };

  if (SPECIAL_NAME_MAP[namaLower]) {
    return { success: true, kode: SPECIAL_NAME_MAP[namaLower], nama: namaInput, confidence: "100%", flags: ["SPECIAL_MAP"] };
  }

  const all = getAllStock("ALL");
  if (!all.success) return { success: false, error: "Gagal baca master" };

  const exact = all.items.filter(i => String(i.nama).toLowerCase().trim() === namaLower);
  if (exact.length === 1) return { success: true, kode: exact[0].kode, nama: exact[0].nama, confidence: "100%" };
  if (exact.length > 1) {
    return { success: false, error: "Nama ambigu: " + exact.map(i => i.kode).join(", "), flags: ["AMBIGUOUS_EXACT"], candidates: exact };
  }

  const fuzzy = all.items.filter(i => {
    const n = String(i.nama).toLowerCase();
    return n.includes(namaLower) || namaLower.includes(n);
  });
  if (fuzzy.length === 1) return { success: true, kode: fuzzy[0].kode, nama: fuzzy[0].nama, confidence: "85%", flags: ["FUZZY_MATCH"] };
  if (fuzzy.length > 1) {
    return { success: false, error: "Beberapa nama mirip. Konfirmasi kode.", flags: ["AMBIGUOUS_SIMILAR"], candidates: fuzzy.map(i => ({ kode: i.kode, nama: i.nama })) };
  }
  return { success: false, error: "Nama tidak ditemukan: \"" + namaInput + "\". STOP.", confidence: "0%" };
}


// ============================================================
// 6. ROW FINDING + VERIFY [V6.0 robust version]
// ============================================================
function getRealLastDataRow(sheet, config) {
  const startRow = config.headerRow + 1;
  const totalRows = sheet.getMaxRows();
  if (totalRows < startRow) return startRow - 1;
  const numRows = totalRows - startRow + 1;
  const kodeColValues = sheet.getRange(startRow, config.kodeColAbsolute, numRows, 1).getValues();
  for (let i = kodeColValues.length - 1; i >= 0; i--) {
    if (kodeColValues[i][0] !== "" && kodeColValues[i][0] !== null) {
      return startRow + i;
    }
  }
  return startRow - 1;
}

function findSafeEmptyRowAdaptively(sheet, config) {
  const realLastRow = getRealLastDataRow(sheet, config);
  const startRow = Math.max(config.headerRow + 1, realLastRow - SCAN_BUFFER_ROWS);
  const maxRows = sheet.getMaxRows();
  const scanEndRow = Math.min(maxRows, realLastRow + SCAN_BUFFER_ROWS);
  const numRowsToScan = Math.max(1, scanEndRow - startRow + 1);
  const bcValues = sheet.getRange(startRow, 2, numRowsToScan, 2).getValues();
  const fgValues = sheet.getRange(startRow, 6, numRowsToScan, 2).getValues();
  for (let i = 0; i < numRowsToScan; i++) {
    const leftEmpty = bcValues[i].every(function(cell) { return cell === "" || cell === null || cell === undefined; });
    const rightEmpty = fgValues[i].every(function(cell) { return cell === "" || cell === null || cell === undefined; });
    if (leftEmpty && rightEmpty) return startRow + i;
  }
  const appendRow = realLastRow + 1;
  if (appendRow > maxRows) {
    try {
      sheet.insertRowsAfter(maxRows, 100);
    } catch (insertErr) {
      try { sheet.insertRows(maxRows + 1, 100); }
      catch (insertErr2) {
        throw new Error("[V6.3] Gagal tambah baris di '" + sheet.getName() + "'. Proteksi sheet-level? Tambah baris manual atau buka proteksi. Error: " + insertErr.message);
      }
    }
  }
  return appendRow;
}

function isRowEmpty(row) {
  return row.every(function(cell) { return cell === "" || cell === null || cell === undefined; });
}

function shouldRetryWrite_(writeTouched) {
  return !writeTouched;
}

function verifyRowStillEmptyPath2(sheet, row) {
  const bc = sheet.getRange(row, 2, 1, 2).getValues()[0];
  const fg = sheet.getRange(row, 6, 1, 2).getValues()[0];
  return (bc[0] === "" || bc[0] === null) && (bc[1] === "" || bc[1] === null) &&
         (fg[0] === "" || fg[0] === null) && (fg[1] === "" || fg[1] === null);
}


// ============================================================
// 7. DEDUP [V6.0]
// ============================================================
function isHoldReferenceAlreadyRealized_(holdId) {
  const target = String(holdId || "").trim();
  if (!target) return false;
  const log = getSS().getSheetByName("System Log");
  if (!log || log.getLastRow() < OPS_DATA_START_ROW) return false;
  const rows = log.getRange(OPS_DATA_START_ROW, 2, log.getLastRow() - OPS_HEADER_ROW, 4).getValues();
  return rows.some(function(row) {
    const action = String(row[1] || "");
    const details = String(row[3] || "");
    // Details ditulis sebagai JSON; cocokkan field, bukan substring.
    if (action !== "HOLD_REALIZATION") return false;
    try {
      const obj = JSON.parse(details);
      return String(obj.holdTransactionId || "") === target;
    } catch (e) {
      return details.indexOf('"holdTransactionId":"' + target + '"') >= 0;
    }
  });
}

function validateHoldReference_(holdId) {
  const target = String(holdId || "").trim();
  if (!target) return { valid: true, holdId: null };
  const log = getSS().getSheetByName("System Log");
  if (!log || log.getLastRow() < OPS_DATA_START_ROW) return { valid: false, error: "Referensi HOLD tidak ditemukan: " + target };
  const rows = log.getRange(OPS_DATA_START_ROW, 2, log.getLastRow() - OPS_HEADER_ROW, 5).getValues();
  let foundHold = false;
  rows.forEach(function(row) {
    const txId = String(row[0] || "");
    const action = String(row[1] || "");
    const status = String(row[2] || "");
    const details = String(row[3] || "");
    if (txId === target && action === "SHORTAGE_HOLD" && status === "HOLD_CREATED") foundHold = true;
  });
  if (!foundHold) return { valid: false, error: "Transaction HOLD tidak valid atau tidak ditemukan: " + target };
  if (isHoldReferenceAlreadyRealized_(target)) return { valid: false, error: "HOLD sudah direalisasikan sebelumnya: " + target };
  return { valid: true, holdId: target };
}

function isDuplicate(kode, qty, keterangan, sheetName) {
  const cache = CacheService.getScriptCache();
  const scope = String(sheetName || "").trim();
  const normalizedKode = String(kode || "").trim();
  const normalizedQty = String(qty == null ? "" : qty).trim();
  const normalizedKeterangan = String(keterangan || "").trim();
  const rawKey = [scope, normalizedKode, normalizedQty, normalizedKeterangan].join("|");
  let digestKey = rawKey.replace(/[^A-Za-z0-9_.:-]/g, "_").substring(0, 180);
  try {
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, rawKey);
    digestKey = Utilities.base64EncodeWebSafe(digest).substring(0, 180);
  } catch (e) {}
  const key = "fingerprint60_" + digestKey;
  if (cache.get(key)) return true;
  cache.put(key, "1", 60);
  return false;
}

function isDuplicateTransaction(sheetName, kode, qty, nonce) {
  const nonceText = String(nonce || "").trim();
  if (!nonceText) return false;
  const rec = findIdempotencyRecord_(nonceText, nonceText);
  if (rec && rec.status === "APPLIED") return true;
  if (rec && rec.status === "UNKNOWN") return true;
  const cache = CacheService.getScriptCache();
  const cacheKey = "dedup_nonce_" + nonceText.replace(/[^A-Za-z0-9_.:-]/g, "_").substring(0, 180);
  if (cache.get(cacheKey)) return true;
  cache.put(cacheKey, "seen", DUP_CACHE_TTL_SEC);
  return false;
}



// ============================================================
// 8. MASTER DATA CACHE [V6.0]
// ============================================================
function lookupMasterDataCached(kode) {
  const map = getMasterMap();
  return map[kode] || null;
}

function getMasterMap() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("masterMap");
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  return rebuildAndCacheMasterMap();
}

function rebuildAndCacheMasterMap() {
  const ss = getSS();
  const map = {};
  ["Stock CV", "Stock PT"].forEach(function(sheetName) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 4 || lastCol < 1) return;

    // Jangan mengasumsikan Kode/Nama/Satuan selalu berada di B:D.
    // Master bisa berubah posisi kolom; gunakan header seperti getAllStock().
    const headers = sheet.getRange(3, 1, 1, lastCol).getValues()[0];
    const lower = headers.map(function(h) { return String(h || "").toLowerCase().trim(); });
    const cKode = lower.findIndex(function(h) { return h.includes("kode"); });
    const cNama = lower.findIndex(function(h) { return h.includes("nama"); });
    const cSatuan = lower.findIndex(function(h) { return h.includes("satuan"); });
    if (cKode < 0) return;

    const data = sheet.getRange(4, 1, lastRow - 3, lastCol).getValues();
    for (let i = 0; i < data.length; i++) {
      const kode = String(data[i][cKode] || "").trim();
      if (!kode || /^total\\b/i.test(kode)) continue;

      // Key entity|kode mencegah collision bila suatu hari CV dan PT
      // memakai kode yang sama.
      const key = (sheetName === "Stock CV" ? "CV|" : "PT|") + kode;
      map[key] = {
        nama: cNama >= 0 ? data[i][cNama] : "",
        satuan: cSatuan >= 0 ? data[i][cSatuan] : "",
        rowIndex: i + 4,
        sheet: sheetName
      };

      // Backward-compatible alias hanya jika kode unik.
      if (!map[kode]) map[kode] = map[key];
      else if (map[kode] !== map[key]) delete map[kode];
    }
  });
  try { CacheService.getScriptCache().put("masterMap", JSON.stringify(map), MASTER_CACHE_TTL_SEC); } catch (e) {}
  return map;
}

function clearMasterCache() {
  try { CacheService.getScriptCache().removeAll(["masterMap"]); } catch (e) {}
  _cachedSS = null;
  _resolvedSpreadsheetId = null;
  return { success: true, message: "Cache master dibersihkan." };
}


// ============================================================
// 9. STOCK API [V6.0 + V6.2 merged]
// ============================================================
function clampStockToZero_(value) {
  const n = Number(value);
  return isNaN(n) || n < 0 ? 0 : n;
}

/**
 * Menormalkan Stock Akhir pada sumber Stock CV/PT.
 * Formula asli dipertahankan dengan pembungkus MAX(0, formula).
 * ArrayFormula/spill tidak disentuh; jalur read API tetap melakukan clamp.
 */
function diagnoseStockFormulaPatterns_() {
  const ss = getSS();
  const sheets = ["Stock CV", "Stock PT"];
  const result = { success: true, generatedAt: new Date().toISOString(), sheets: [] };
  sheets.forEach(function(name) {
    const sh = ss.getSheetByName(name);
    const entry = { sheet: name, exists: !!sh, rows: 0, stockAkhirColumn: null, patterns: { rowFormula: 0, arrayFormulaAnchor: 0, value: 0, protected: 0, negativeValues: 0 }, samples: [] };
    if (!sh || sh.getLastRow() < 4) { result.sheets.push(entry); return; }
    entry.rows = sh.getLastRow() - 3;
    const headers = sh.getRange(3, 1, 1, sh.getLastColumn()).getValues()[0];
    const cAkhir = headers.findIndex(function(h) { return String(h).toLowerCase().trim().includes("stock akhir"); }) + 1;
    entry.stockAkhirColumn = cAkhir || null;
    if (!cAkhir) { result.sheets.push(entry); return; }
    const values = sh.getRange(4, cAkhir, entry.rows, 1).getValues();
    const formulas = sh.getRange(4, cAkhir, entry.rows, 1).getFormulas();
    for (let i = 0; i < entry.rows; i++) {
      const formula = formulas[i][0];
      const value = Number(values[i][0]);
      if (formula && /ARRAYFORMULA/i.test(formula)) entry.patterns.arrayFormulaAnchor++;
      else if (formula) entry.patterns.rowFormula++;
      else entry.patterns.value++;
      if (!isNaN(value) && value < 0) entry.patterns.negativeValues++;
      if (entry.samples.length < 5 && (formula || (!isNaN(value) && value < 0))) {
        entry.samples.push({ row: i + 4, formula: formula || null, value: values[i][0], protected: isProtectedCell_(sh, i + 4, cAkhir) });
      }
      if (isProtectedCell_(sh, i + 4, cAkhir)) entry.patterns.protected++;
    }
    result.sheets.push(entry);
  });
  return result;
}

function isProtectedCell_(sheet, row, column) {
  try {
    const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE) || [];
    return protections.some(function(protection) {
      const range = protection.getRange();
      return row >= range.getRow() && row < range.getRow() + range.getNumRows() &&
             column >= range.getColumn() && column < range.getColumn() + range.getNumColumns();
    });
  } catch (e) {
    return false;
  }
}

function wrapFormulaNonNegative_(formula) {
  const f = String(formula || "").trim();
  if (!f || f.charAt(0) !== "=") return "";
  if (/MAX\s*\(\s*0/i.test(f)) return f;
  if (/ARRAYFORMULA\s*\(/i.test(f)) {
    const start = f.search(/ARRAYFORMULA\s*\(/i);
    const open = f.indexOf("(", start);
    const inner = f.substring(open + 1, f.length - (f.endsWith(")") ? 1 : 0));
    return "=ARRAYFORMULA(IFERROR(IF((" + inner + ")<0,0," + inner + "),0))";
  }
  return "=MAX(0,(" + f.substring(1) + "))";
}

function enforceNonNegativeStock_(kode) {
  // DEPRECATED / FAIL-CLOSED.
  // Stock CV dan Stock PT adalah MASTER/SOURCE OF TRUTH.
  // Fungsi ini sengaja TIDAK BOLEH melakukan setValue(), setFormula(), clear(),
  // insert/delete row, atau perubahan struktur apa pun pada Stock CV/PT.
  const targetKode = String(kode || "").trim();
  if (!targetKode) return { success: false, mode: "MASTER_READ_ONLY", error: "Kode kosong" };
  try {
    const cv = getStockByCode(targetKode, "CV");
    const pt = getStockByCode(targetKode, "PT");
    const found = (cv && cv.success ? cv : (pt && pt.success ? pt : null));
    if (!found) return { success: false, mode: "MASTER_READ_ONLY", error: "Kode tidak ditemukan pada master: " + targetKode };
    const stockAkhir = Number(found.stockAkhir);
    return {
      success: true,
      mode: "MASTER_READ_ONLY",
      sheet: found.entitas === "CV" ? "Stock CV" : "Stock PT",
      kode: targetKode,
      stockAkhir: isFinite(stockAkhir) ? stockAkhir : 0,
      reviewRequired: stockAkhir < 0
    };
  } catch (err) {
    return { success: false, mode: "MASTER_READ_ONLY", error: String(err && err.message || err) };
  }
}

function getStockByCode(kode, requestedEntitas) {
  const normalizedKode = String(kode || "").trim();
  const requestedEntityRaw = String(requestedEntitas || "").trim().toUpperCase();
  const requestedEntityInfo = normalizeEntityGroup_(requestedEntityRaw, normalizedKode);
  const requestedEntity = requestedEntityInfo.valid ? requestedEntityInfo.entitas : requestedEntityRaw;
  if (!normalizedKode) return { success: false, error: "Kode kosong" };
  if (requestedEntityInfo.valid === false && requestedEntityRaw) return { success: false, error: requestedEntityInfo.error };

  const map = getMasterMap();
  const cacheKey = requestedEntity ? (requestedEntity + "|" + normalizedKode) : normalizedKode;
  const masterData = map[cacheKey] || (requestedEntity ? null : map[normalizedKode]);

  if (!masterData) {
    // Fallback wajib: gunakan sumber header-based yang sama dengan getAllStock.
    const all = getAllStock("ALL");
    const matches = all.success ? all.items.filter(function(item) {
      return String(item.kode || "").trim() === normalizedKode &&
             (!requestedEntity || String(item.entitas || "").toUpperCase() === requestedEntity);
    }) : [];
    if (matches.length === 0) {
      return { success: false, error: requestedEntity ? "Kode/entitas tidak ditemukan: " + normalizedKode + "/" + requestedEntity : "Kode tidak ditemukan: " + normalizedKode };
    }
    if (matches.length > 1) return { success: false, error: "Kode ambigu antar entitas: " + normalizedKode };
    const found = matches[0];
    return {
      success: true, kode: found.kode, nama: found.nama, satuan: found.satuan,
      stockAkhir: clampStockToZero_(found.stockAkhir), stockAman: found.stockAman,
      stockValue: found.stockValue, divisi: found.divisi, entitas: found.entitas
    };
  }

  const ss = getSS();
  const sheet = ss.getSheetByName(masterData.sheet);
  if (!sheet) return { success: false, error: "Sheet master hilang: " + masterData.sheet };

  const headers = sheet.getRange(3, 1, 1, sheet.getLastColumn()).getValues()[0];
  let rowVals = sheet.getRange(masterData.rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Self-healing: cek apakah kode di rowIndex masih benar
  const kodeCol = headers.findIndex(h => String(h).toLowerCase().includes("kode"));
  if (kodeCol >= 0 && String(rowVals[kodeCol]).trim() !== normalizedKode) {
    clearMasterCache();
    const freshMap = rebuildAndCacheMasterMap();
    if (!freshMap[normalizedKode]) return { success: false, error: "Kode hilang dari master setelah refresh: " + normalizedKode };
    rowVals = sheet.getRange(freshMap[normalizedKode].rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
  }

  const result = { success: true, kode: normalizedKode, entitas: masterData.sheet === "Stock CV" ? "CV" : "PT" };
  if (requestedEntity && result.entitas !== requestedEntity) return { success: false, error: "Entitas tidak cocok untuk " + normalizedKode };
  headers.forEach(function(h, idx) {
    const key = String(h).toLowerCase().trim();
    if (key.includes("nama")) result.nama = rowVals[idx];
    if (key.includes("satuan")) result.satuan = rowVals[idx];
    if (key.includes("stock akhir")) result.stockAkhir = clampStockToZero_(rowVals[idx]);
    if (key.includes("stock aman")) result.stockAman = rowVals[idx];
    if (key.includes("stock awal")) result.stockAwal = rowVals[idx];
    if (key.includes("stock value") || key.includes("nilai stok") || key.includes("nilai stock") || key.includes("value")) result.stockValue = rowVals[idx];
    if (key.includes("divisi")) result.divisi = rowVals[idx];
  });
  return result;
}

function getAllStock(entitas) {
  const ss = getSS();
  const sheets = entitas === "CV" ? ["Stock CV"] : entitas === "PT" ? ["Stock PT"] : ["Stock CV", "Stock PT"];
  const items = [];

  sheets.forEach(function(name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const headerRow = 3;
    const last = sheet.getLastRow();
    if (last <= headerRow) return;
    const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    const data = sheet.getRange(headerRow + 1, 1, last - headerRow, sheet.getLastColumn()).getValues();
    const label = name === "Stock CV" ? "CV" : "PT";

    data.forEach(function(row) {
      const kode = String(row[headers.findIndex(h => String(h).toLowerCase().includes("kode"))] || "").trim();
      if (!kode || kode.startsWith("Total")) return;
      const item = { kode: kode, entitas: label };
      headers.forEach(function(h, idx) {
        const key = String(h).toLowerCase().trim();
        if (key.includes("nama")) item.nama = row[idx];
        if (key.includes("satuan")) item.satuan = row[idx];
        if (key.includes("stock akhir")) item.stockAkhir = clampStockToZero_(row[idx]);
        if (key.includes("stock aman")) item.stockAman = row[idx];
        if (key.includes("stock value") || key.includes("nilai stok") || key.includes("nilai stock") || key.includes("value")) item.stockValue = row[idx];
        if (key.includes("divisi")) item.divisi = row[idx];
      });
      items.push(item);
    });
  });

  // Dashboard/API master count includes the dedicated Bahan Baku source.
  // CV/PT remain untouched; Stock Bahan Baku contributes its own unique items
  // so the combined dashboard master returns to 191 items.
  if (entitas === "ALL") {
    const bb = typeof getBahanBakuStockMap_ === "function" ? getBahanBakuStockMap_() : null;
    const shBB = ss.getSheetByName("Stock Bahan Baku");
    if (bb && bb.success && shBB) {
      const existing = {};
      items.forEach(function(item) { existing[String(item.kode || "").trim()] = true; });
      const lastRow = shBB.getLastRow();
      const lastCol = shBB.getLastColumn();
      const headerRow = Number(bb.headerRow || 0);
      if (lastRow > headerRow && lastCol > 0) {
        const hdr = shBB.getRange(headerRow, 1, 1, lastCol).getValues()[0];
        const idxKode = hdr.findIndex(function(h) { return String(h || "").toLowerCase().includes("kode"); });
        const idxNama = hdr.findIndex(function(h) { return String(h || "").toLowerCase().includes("nama"); });
        const idxSatuan = hdr.findIndex(function(h) { return String(h || "").toLowerCase().includes("satuan"); });
        const rowsBB = shBB.getRange(headerRow + 1, 1, lastRow - headerRow, lastCol).getValues();
        rowsBB.forEach(function(row) {
          const kode = String(idxKode >= 0 ? row[idxKode] : "").trim();
          if (!kode || /^total\\b/i.test(kode) || existing[kode]) return;
          items.push({
            kode: kode,
            entitas: "BAHAN BAKU",
            nama: idxNama >= 0 ? row[idxNama] : "",
            satuan: idxSatuan >= 0 ? row[idxSatuan] : "",
            stockAkhir: bb.map[kode] !== undefined ? bb.map[kode] : 0,
            stockAman: 0,
            stockValue: 0,
            divisi: "BAHAN BAKU"
          });
          existing[kode] = true;
        });
      }
    }
  }

  return { success: true, count: items.length, items: items };
}

function getLowStock() {
  const all = getAllStock("ALL");
  if (!all.success) return all;
  const low = all.items.filter(function(i) {
    const akhir = Number(i.stockAkhir) || 0;
    const aman = Number(i.stockAman) || 0;
    return aman > 0 && akhir < aman;
  });
  low.sort(function(a, b) { return (Number(a.stockAkhir) || 0) - (Number(b.stockAkhir) || 0); });
  return { success: true, count: low.length, items: low };
}

function getTransactionHistory(params) {
  const sheetName = params.sheet || "Barang keluar";
  if (!(sheetName in SHEET_CONFIG)) return { success: false, error: "Sheet tidak valid" };
  const config = SHEET_CONFIG[sheetName];
  const sheet = getSS().getSheetByName(sheetName);
  if (!sheet) return { success: false, error: "Sheet tidak ditemukan" };
  const last = getRealLastDataRow(sheet, config);
  if (last < config.headerRow + 1) return { success: true, count: 0, data: [] };
  const numRows = last - config.headerRow;
  const data = sheet.getRange(config.headerRow + 1, 1, numRows, sheet.getLastColumn()).getValues();
  const limit = params.limit ? Math.min(Number(params.limit), data.length) : data.length;
  const result = data.slice(-limit).reverse().map(function(row, index) {
    const note = String(row[6] || "");
    const txMatch = note.match(/GUDANGAI_TX=([^;|]+)/);
    const nonceMatch = note.match(/GUDANGAI_NONCE=([^;|]+)/);
    return { row: last - index, tanggal: row[1], kode: row[2], nama: row[3], satuan: row[4], qty: row[5], keterangan: row[6], transactionId: txMatch ? txMatch[1] : null, nonce: nonceMatch ? nonceMatch[1] : (txMatch ? txMatch[1] : null) };
  });
  return { success: true, count: result.length, data: result };
}

function searchByName(q) {
  if (!q) return { success: false, error: "Query kosong" };
  const all = getAllStock("ALL");
  if (!all.success) return all;
  const qLow = q.toLowerCase();
  const found = all.items.filter(function(i) {
    return String(i.nama || "").toLowerCase().includes(qLow) || String(i.kode || "").toLowerCase().includes(qLow);
  });
  return { success: true, count: found.length, items: found };
}


// ============================================================
// 10. AUDIT LOG [V6.0] + FORMAT TABEL PERSISTEN
// ============================================================
function ensureOperationalHeaderLayout_(sheet, expectedHeaders) {
  if (!sheet || !expectedHeaders || !expectedHeaders.length) return;
  const cols = expectedHeaders.length;
  if (sheet.getMaxColumns() < cols) sheet.insertColumnsAfter(sheet.getMaxColumns(), cols - sheet.getMaxColumns());
  if (sheet.getLastRow() < 1) return;

  const row1 = sheet.getRange(1, 1, 1, cols).getDisplayValues()[0].map(function(v) { return String(v || "").trim().toUpperCase(); });
  const row3 = sheet.getMaxRows() >= 3 ? sheet.getRange(3, 1, 1, cols).getDisplayValues()[0].map(function(v) { return String(v || "").trim().toUpperCase(); }) : [];
  const expected = expectedHeaders.map(function(v) { return String(v || "").trim().toUpperCase(); });
  const row1IsHeader = row1.join("|") === expected.join("|");
  const row3IsHeader = row3.join("|") === expected.join("|");

  // Migrasi aman: layout lama header row 1/data row 2+ -> title row 1, subtitle row 2, header row 3/data row 4+.
  if (row1IsHeader && !row3IsHeader) {
    sheet.insertRowsBefore(1, 2);
  }
}

function styleOperationalHeader_(sheet, lastCol, title, subtitle, headerValues) {
  if (!sheet) return;
  const cols = Math.max(lastCol || 1, headerValues ? headerValues.length : 1);
  if (sheet.getMaxColumns() < cols) sheet.insertColumnsAfter(sheet.getMaxColumns(), cols - sheet.getMaxColumns());

  sheet.getRange(1, 1, 2, cols).breakApart();
  sheet.getRange(1, 1, 1, cols).merge().setValue(title)
    .setFontWeight("bold").setFontSize(14).setFontColor("#FFFFFF")
    .setBackground(UI_PRIMARY).setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange(2, 1, 1, cols).merge().setValue(subtitle)
    .setFontWeight("bold").setFontSize(10).setFontColor(UI_TEXT)
    .setBackground(UI_PRIMARY_LIGHT).setHorizontalAlignment("left").setVerticalAlignment("middle")
    .setWrap(true);
  if (headerValues) {
    sheet.getRange(OPS_HEADER_ROW, 1, 1, headerValues.length).setValues([headerValues])
      .setFontWeight("bold").setFontSize(10).setFontColor("#FFFFFF")
      .setBackground(UI_PRIMARY).setHorizontalAlignment("center").setVerticalAlignment("middle")
      .setWrap(true).setBorder(true, true, true, true, true, true, UI_BORDER, SpreadsheetApp.BorderStyle.SOLID);
  }
  sheet.setRowHeight(1, 28);
  sheet.setRowHeight(2, 24);
  sheet.setRowHeight(OPS_HEADER_ROW, 28);
  sheet.setFrozenRows(OPS_HEADER_ROW);
}

function applyTableBodyStyle_(sheet, startRow, rowCount, colCount, numberFormatColumns) {
  if (!sheet || rowCount <= 0) return;
  const range = sheet.getRange(startRow, 1, rowCount, colCount);
  range.setFontColor(UI_TEXT).setVerticalAlignment("middle")
    .setBorder(true, true, true, true, true, true, UI_BORDER, SpreadsheetApp.BorderStyle.SOLID);
  for (let i = 0; i < rowCount; i++) {
    sheet.getRange(startRow + i, 1, 1, colCount).setBackground(i % 2 === 0 ? UI_ROW_ALT : "#FFFFFF");
  }
  if (numberFormatColumns) numberFormatColumns();
}

function formatConfigSheet_(sheet) {
  if (!sheet) return;
  styleOperationalHeader_(sheet, 2, APP_TITLE, "Konfigurasi sistem • periode aktif • parameter sinkronisasi • update terakhir", ["KEY", "VALUE"]);
  const rows = Math.max(0, sheet.getLastRow() - OPS_HEADER_ROW);
  if (rows) {
    applyTableBodyStyle_(sheet, OPS_DATA_START_ROW, rows, 2);
    sheet.getRange(OPS_DATA_START_ROW, 1, rows, 1).setFontWeight("bold").setHorizontalAlignment("left");
    sheet.getRange(OPS_DATA_START_ROW, 2, rows, 1).setHorizontalAlignment("center");
  }
  sheet.setColumnWidth(1, 210);
  sheet.setColumnWidth(2, 360);
  try { if (sheet.getFilter()) sheet.getFilter().remove(); } catch (e) {}
  if (sheet.getLastRow() >= OPS_HEADER_ROW) sheet.getRange(OPS_HEADER_ROW, 1, Math.max(1, sheet.getLastRow() - OPS_HEADER_ROW + 1), 2).createFilter();
}

function formatSystemLogSheet_(sheet) {
  if (!sheet) return;
  const headers = ["Timestamp", "TransactionID", "Aksi/Action", "Status", "Rincian/Details", "Pesan Error"];
  ensureOperationalHeaderLayout_(sheet, headers);
  styleOperationalHeader_(sheet, 6, "SYSTEM LOG — GUDANGAI 69", "Audit transaksi • status write • detail teknis • arsip otomatis", headers);
  const rows = Math.max(0, sheet.getLastRow() - OPS_HEADER_ROW);
  if (rows) {
    applyTableBodyStyle_(sheet, OPS_DATA_START_ROW, rows, 6);
    sheet.getRange(OPS_DATA_START_ROW, 1, rows, 4).setHorizontalAlignment("center");
    sheet.getRange(OPS_DATA_START_ROW, 5, rows, 2).setHorizontalAlignment("left").setWrap(true);
  }
  sheet.setColumnWidth(1, 145); sheet.setColumnWidth(2, 105); sheet.setColumnWidth(3, 145);
  sheet.setColumnWidth(4, 90); sheet.setColumnWidth(5, 300); sheet.setColumnWidth(6, 220);
  try { if (sheet.getFilter()) sheet.getFilter().remove(); } catch (e) {}
  if (sheet.getLastRow() >= OPS_HEADER_ROW) sheet.getRange(OPS_HEADER_ROW, 1, Math.max(1, sheet.getLastRow() - OPS_HEADER_ROW + 1), 6).createFilter();
}

function formatDailySnapshotsSheet_(sheet) {
  if (!sheet) return;
  const headers = ["Tanggal", "Total Item", "Stabil", "Kritis", "Waspada", "Total Stok", "Catatan"];
  ensureOperationalHeaderLayout_(sheet, headers);
  styleOperationalHeader_(sheet, 7, "DAILY SNAPSHOTS — GUDANGAI 69", "Ringkasan stok harian • snapshot otomatis • histori tidak dihapus", headers);
  const rows = Math.max(0, sheet.getLastRow() - OPS_HEADER_ROW);
  if (rows) {
    applyTableBodyStyle_(sheet, OPS_DATA_START_ROW, rows, 7);
    sheet.getRange(OPS_DATA_START_ROW, 1, rows, 1).setNumberFormat("yyyy-mm-dd").setHorizontalAlignment("center");
    sheet.getRange(OPS_DATA_START_ROW, 2, rows, 5).setNumberFormat("#,##0").setHorizontalAlignment("center");
    sheet.getRange(OPS_DATA_START_ROW, 7, rows, 1).setHorizontalAlignment("left").setWrap(true);
  }
  sheet.setColumnWidth(1, 110); sheet.setColumnWidth(2, 105); sheet.setColumnWidth(3, 90);
  sheet.setColumnWidth(4, 90); sheet.setColumnWidth(5, 90); sheet.setColumnWidth(6, 110); sheet.setColumnWidth(7, 200);
  try { if (sheet.getFilter()) sheet.getFilter().remove(); } catch (e) {}
  if (sheet.getLastRow() >= OPS_HEADER_ROW) sheet.getRange(OPS_HEADER_ROW, 1, Math.max(1, sheet.getLastRow() - OPS_HEADER_ROW + 1), 7).createFilter();
}

function formatIdempotencyLedgerSheet_(sheet) {
  if (!sheet) return;
  ensureOperationalHeaderLayout_(sheet, IDEMPOTENCY_HEADERS);
  styleOperationalHeader_(sheet, IDEMPOTENCY_HEADERS.length, "IDEMPOTENCY LEDGER — GUDANGAI 69", "Perlindungan anti-double-write • request identity • status penulisan • audit teknis", IDEMPOTENCY_HEADERS);
  const rows = Math.max(0, sheet.getLastRow() - OPS_HEADER_ROW);
  if (rows) {
    applyTableBodyStyle_(sheet, OPS_DATA_START_ROW, rows, IDEMPOTENCY_HEADERS.length);
    sheet.getRange(OPS_DATA_START_ROW, 1, rows, 2).setHorizontalAlignment("center");
    sheet.getRange(OPS_DATA_START_ROW, 3, rows, 13).setHorizontalAlignment("center").setWrap(false);
    sheet.getRange(OPS_DATA_START_ROW, 17, rows, 1).setHorizontalAlignment("left").setWrap(true);
  }
  const widths = [130,130,125,110,125,110,115,110,75,105,75,100,100,60,85,95,260];
  widths.forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });
  try { if (sheet.getFilter()) sheet.getFilter().remove(); } catch (e) {}
  if (sheet.getLastRow() >= OPS_HEADER_ROW) sheet.getRange(OPS_HEADER_ROW, 1, Math.max(1, sheet.getLastRow() - OPS_HEADER_ROW + 1), IDEMPOTENCY_HEADERS.length).createFilter();
}

function formatOperationalSheets_() {
  const ss = getSS();
  formatConfigSheet_(ss.getSheetByName(CONFIG_SHEET_NAME));
  formatSystemLogSheet_(ss.getSheetByName("System Log"));
  formatDailySnapshotsSheet_(ss.getSheetByName("Daily Snapshots"));
  formatIdempotencyLedgerSheet_(ss.getSheetByName(IDEMPOTENCY_SHEET_NAME));
  const logSheets = ss.getSheets().filter(function(sheet) { return sheet.getName().indexOf("System Log Archive ") === 0; });
  logSheets.forEach(formatSystemLogSheet_);
}

function shortId_(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (s.length <= 10) return s;
  return s.slice(0, 4) + "…" + s.slice(-5);
}

function writeAuditLogSecure(action, status, details, errorMsg, txId) {
  try {
    const ss = getSS();
    let logSheet = ss.getSheetByName("System Log");
    if (!logSheet) {
      logSheet = ss.insertSheet("System Log");
      styleOperationalHeader_(logSheet, 6, "SYSTEM LOG — GUDANGAI 69", "Audit transaksi • status write • detail teknis • arsip otomatis", ["Timestamp", "TransactionID", "Aksi/Action", "Status", "Rincian/Details", "Pesan Error"]);
    }
    const detailStr = redactSensitiveString_((typeof details === "object") ? JSON.stringify(details) : String(details || ""));
    logSheet.getRange(Math.max(OPS_DATA_START_ROW, logSheet.getLastRow() + 1), 1, 1, 6).setValues([[
      Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss"),
      shortId_(txId), action, status, detailStr.substring(0, 900), String(errorMsg || "").substring(0, 700)
    ]]);
    // Formatting hanya dilakukan saat setup/maintenance, bukan setiap transaksi.
    maybeArchiveAuditLog();
  } catch (logErr) {
    console.error("writeAuditLogSecure gagal: " + logErr.message);
  }
}

function maybeArchiveAuditLog() {
  try {
    const ss = getSS();
    const logSheet = ss.getSheetByName("System Log");
    if (!logSheet) return;
    const rowCount = logSheet.getLastRow();
    if (rowCount < AUDIT_LOG_ARCHIVE_THRESHOLD) return;
    const archiveName = "System Log Archive " + Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM");
    let archiveSheet = ss.getSheetByName(archiveName);
    if (!archiveSheet) archiveSheet = ss.insertSheet(archiveName);
    const dataRange = logSheet.getRange(1, 1, rowCount, 6).getValues();
    archiveSheet.getRange(archiveSheet.getLastRow() + 1, 1, dataRange.length, 6).setValues(dataRange);
    formatSystemLogSheet_(archiveSheet);
    logSheet.clear();
    formatSystemLogSheet_(logSheet);
  } catch (e) { console.error("maybeArchiveAuditLog error: " + e.message); }
}


function redactSensitiveString_(value) {
  return String(value || "").replace(/("?(?:secret|apiSecret|api_secret|token|authorization)"?\s*:\s*")[^"]*(")/gi, "$1[REDACTED]$2");
}

// ============================================================
// 11. ERROR EMAIL WITH COOLDOWN [V6.0]
// ============================================================
function sendErrorEmailWithCooldown(location, error, body) {
  try {
    const cache = CacheService.getScriptCache();
    const bodyObj = (body && typeof body === "object") ? body : {};
    const identity = [bodyObj.transactionId || bodyObj.nonce || "", bodyObj.sheet || location, bodyObj.kodeBarang || "", bodyObj.qty == null ? "" : bodyObj.qty, bodyObj.tanggal || ""].join("|");
    const cooldownKey = ("errorEmail_" + location + "_" + identity).replace(/[^A-Za-z0-9_:-]/g, "_").substring(0, 240);
    const durableKey = ("emailSent_" + location + "_" + identity).replace(/[^A-Za-z0-9_:-]/g, "_").substring(0, 240);
    const props = PropertiesService.getScriptProperties();
    const sentAt = Number(props.getProperty(durableKey) || 0);
    if ((sentAt && Date.now() - sentAt < 24 * 60 * 60 * 1000) || cache.get(cooldownKey)) return;

    const bodyStr = redactSensitiveString_((typeof body === "object") ? JSON.stringify(body, null, 2) : String(body || ""));
    const errStack = (error && error.stack) ? error.stack : (error ? error.message : "Unknown error");

    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: "[GudangAI ERROR] " + location,
      body: "Lokasi: " + location + "\n\nError:\n" + errStack + "\n\nBody:\n" + bodyStr.substring(0, 3000)
    });
    props.setProperty(durableKey, String(Date.now()));
    cache.put(cooldownKey, "sent", Math.floor(COOLDOWN_EMAIL_MS / 1000));
  } catch (mailErr) {
    console.error("sendErrorEmailWithCooldown gagal: " + mailErr.message);
  }
}

// Compatibility alias retained from V6.4.4 SHORTAGE HOLD QTY 0.
// It delegates to the cooldown-safe implementation so errors cannot spam email.
function sendErrorEmail(title, err, body) {
  return sendErrorEmailWithCooldown(title, err, body || {});
}

// Header lookup helper retained for legacy agents and sheet utilities.
function getHeaderIndex(sheet, headerRow, headerName) {
  const lastCol = sheet.getLastColumn();
  if (!lastCol) return -1;
  const headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const target = String(headerName || "").trim().toLowerCase();
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i] || "").trim().toLowerCase() === target) return i + 1;
  }
  return -1;
}


// ============================================================
// 12. SYNC DIVISION STOCK [V6.2]
// ============================================================
/**
 * Sinkronisasi ringan Data Stok Per Divisi — hanya memperbarui kolom Sisa Stok
 * dari Stock CV/PT tanpa rebuild struktur tabel. Dipanggil setelah transaksi sukses
 * agar sheet selalu real-time.
 */

/**
 * Membaca sumber stok khusus DIVISI BAHAN BAKU.
 *
 * HARD RULE:
 * - Bahan Baku TIDAK lagi mengambil Sisa Stok dari Stock CV / Stock PT.
 * - Sumber tunggal Sisa Stok Bahan Baku = sheet "Stock Bahan Baku".
 * - Pembacaan header dibuat dinamis agar tidak mengunci posisi kolom.
 * - Fungsi ini READ-ONLY terhadap sheet sumber.
 */
function getBahanBakuStockMap_() {
  const ss = getSS();
  const sh = ss.getSheetByName("Stock Bahan Baku");
  if (!sh) {
    return { success: false, error: 'Sheet "Stock Bahan Baku" tidak ditemukan', map: {}, count: 0, codes: [] };
  }

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return { success: false, error: 'Sheet "Stock Bahan Baku" kosong', map: {}, count: 0, codes: [] };
  }

  // Cari header pada beberapa baris pertama: wajib ada Kode + Stock Akhir/Sisa Stock.
  const scanRows = Math.min(5, lastRow);
  const top = sh.getRange(1, 1, scanRows, lastCol).getValues();
  let headerRow = -1;
  let headers = [];
  let idxKode = -1;
  let idxStock = -1;

  for (let r = 0; r < top.length; r++) {
    const h = top[r].map(function(v) { return String(v || "").toLowerCase().trim(); });
    const k = h.findIndex(function(v) { return v.indexOf("kode") >= 0; });
    const st = h.findIndex(function(v) {
      return v.indexOf("stock akhir") >= 0 ||
             v.indexOf("sisa stock") >= 0 ||
             v.indexOf("sisa stok") >= 0 ||
             v === "sisa";
    });
    if (k >= 0 && st >= 0) {
      headerRow = r + 1;
      headers = h;
      idxKode = k;
      idxStock = st;
      break;
    }
  }

  if (headerRow < 0) {
    return {
      success: false,
      error: 'Header "Kode" dan "Stock Akhir/Sisa Stock" tidak ditemukan di "Stock Bahan Baku"',
      map: {}, count: 0, codes: []
    };
  }

  const rows = sh.getRange(headerRow + 1, 1, lastRow - headerRow, lastCol).getValues();
  const map = {};
  const codes = [];

  rows.forEach(function(row) {
    const kode = String(row[idxKode] || "").trim();
    if (!kode || /^total\b/i.test(kode) || /^kode\b/i.test(kode)) return;

    const raw = row[idxStock];
    const num = Number(raw);
    // Angka valid = stok. Sel kosong dianggap 0; teks error tidak dianggap valid.
    const stock = raw === "" || raw == null ? 0 : (isFinite(num) ? num : null);
    if (stock === null) return;

    map[kode] = clampStockToZero_(stock);
    codes.push(kode);
  });

  return {
    success: true,
    sheet: "Stock Bahan Baku",
    headerRow: headerRow,
    count: codes.length,
    codes: codes,
    map: map
  };
}

/**
 * Menggabungkan source stok:
 * - CV/PT tetap dari Stock CV + Stock PT.
 * - Kode BAHAN BAKU selalu dioverride dari Stock Bahan Baku.
 */
function applyBahanBakuStockSource_(stockMap) {
  const bb = getBahanBakuStockMap_();
  if (!bb.success) return bb;

  Object.keys(bb.map).forEach(function(kode) {
    stockMap[kode] = bb.map[kode];
  });

  return bb;
}

function syncDivisionStockLightweight_() {
  const ss = getSS();
  const dest = ss.getSheetByName("Data Stok Per Divisi");
  if (!dest || dest.getLastRow() < 5) {
    // Belum pernah di-build; bangun penuh sekali.
    return syncDivisionStock({ force: true });
  }

  // Sumber default tetap Stock CV/PT untuk seluruh divisi selain BAHAN BAKU.
  const stockMap = {};
  ["Stock CV", "Stock PT"].forEach(function(name) {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 4) return;
    const lastCol = sh.getLastColumn();
    const hdr = sh.getRange(3, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).toLowerCase().trim(); });
    const cK = hdr.findIndex(function(h) { return h.indexOf("kode") >= 0; });
    const cA = hdr.findIndex(function(h) { return h.indexOf("stock akhir") >= 0; });
    if (cK < 0 || cA < 0) return;
    const rows = sh.getRange(4, 1, sh.getLastRow() - 3, lastCol).getValues();
    rows.forEach(function(row) {
      const k = String(row[cK] || "").trim();
      if (k && !/^Total/i.test(k)) stockMap[k] = clampStockToZero_(row[cA]);
    });
  });

  // HARD RULE: BAHAN BAKU mengambil stok hanya dari Stock Bahan Baku.
  // Bila source baru tidak valid, jangan menimpa Data Stok Per Divisi dengan data CV/PT.
  const bbSource = applyBahanBakuStockSource_(stockMap);
  if (!bbSource.success) {
    console.error("Sumber Stock Bahan Baku tidak valid: " + bbSource.error);
    return { success: false, error: bbSource.error, mode: "BAHAN_BAKU_SOURCE_REQUIRED" };
  }

  // Scan area Data Stok Per Divisi: kolom B = Kode, kolom F = Sisa Stok (layout 7 kolom).
  const last = Math.min(dest.getLastRow(), 5000);
  if (last < 5) return { success: false, error: "Layout divisi kosong" };
  const data = dest.getRange(1, 1, last, 7).getValues();
  const updates = [];
  for (let i = 0; i < data.length; i++) {
    const kode = String(data[i][1] || "").trim();
    if (!kode || kode === "Kode Barang" || /^DIVISI/i.test(String(data[i][0] || "")) || /^TOTAL/i.test(String(data[i][0] || "")) || /^No$/i.test(String(data[i][0] || ""))) continue;
    if (Object.prototype.hasOwnProperty.call(stockMap, kode)) {
      const current = Number(data[i][5]);
      const next = stockMap[kode];
      if (current !== next) updates.push({ row: i + 1, value: next });
    }
  }

  updates.forEach(function(u) {
    dest.getRange(u.row, 6).setValue(u.value);
  });

  const stamp = Utilities.formatDate(new Date(), TIMEZONE, "dd-MMM-yyyy HH:mm:ss");
  dest.getRange(2, 1).setValue("Sisa Stok = CV/PT; BAHAN BAKU = Stock Bahan Baku | Update: " + stamp);
  clearDataDirty_();
  return {
    success: true,
    updatedCells: updates.length,
    bahanBakuCount: bbSource.count,
    bahanBakuSource: "Stock Bahan Baku",
    mode: "lightweight",
    message: updates.length + " sel Sisa Stok diperbarui real-time."
  };
}

/**
 * Hapus chart Dashboard berdasarkan judul agar tidak menumpuk.
 */
function removeChartByTitle_(sheet, chartTitle) {
  if (!sheet) return;
  try {
    const charts = sheet.getCharts() || [];
    const target = String(chartTitle || "").trim().toLowerCase();
    charts.forEach(function(chart) {
      try {
        const opts = chart.getOptions();
        const title = String((opts && (opts.get("title") || opts.title)) || "").trim().toLowerCase();
        if (title === target || (target && title.indexOf(target) >= 0)) {
          sheet.removeChart(chart);
        }
      } catch (e) {
        // Fallback: hapus semua chart di area yang sama jika opsi tidak terbaca.
      }
    });
  } catch (err) {
    console.error("removeChartByTitle_ gagal: " + err.message);
  }
}

function syncDivisionStock(options) {
  options = options || {};
  const ss = getSS();
  const src = ss.getSheetByName("Stock awal");
  const dest = ss.getSheetByName("Data Stok Per Divisi");
  if (!src || !dest) return { success: false, error: "Sheet Stock awal / Data Stok Per Divisi tidak ditemukan" };

  const data = src.getDataRange().getValues();
  if (data.length < 2) return { success: false, error: "Stock awal kosong" };
  const header = data[0].map(h => String(h).toLowerCase().trim());
  const idxKode = header.findIndex(h => h.includes("kode"));
  const idxNama = header.findIndex(h => h.includes("nama"));
  const idxSatuan = header.findIndex(h => h.includes("satuan"));
  const idxDivisi = header.findIndex(h => h.includes("divisi"));
  if (idxKode === -1 || idxDivisi === -1) return { success: false, error: "Header Stock awal tidak lengkap" };

  // Default source: Stock CV/PT. Hanya BAHAN BAKU dioverride oleh source baru.
  const stockMap = {};
  ["Stock CV", "Stock PT"].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 4) return;
    const lastCol = sh.getLastColumn();
    const hdr = sh.getRange(3, 1, 1, lastCol).getValues()[0].map(h => String(h).toLowerCase().trim());
    const cK = hdr.findIndex(h => h.includes("kode"));
    const cA = hdr.findIndex(h => h.includes("stock akhir"));
    if (cK < 0 || cA < 0) return;
    const rows = sh.getRange(4, 1, sh.getLastRow() - 3, lastCol).getValues();
    rows.forEach(row => {
      const k = String(row[cK] || "").trim();
      if (k && !/^Total/i.test(k)) stockMap[k] = clampStockToZero_(row[cA]);
    });
  });

  const bbSource = applyBahanBakuStockSource_(stockMap);
  if (!bbSource.success) {
    return { success: false, error: bbSource.error, mode: "BAHAN_BAKU_SOURCE_REQUIRED" };
  }

  const groups = { "DAPUR 1":[], "DAPUR 2":[], "MIE":[], "PACKING":[], "CS":[], "BAHAN BAKU":[], "REKANAN":[] };
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const kode = String(row[idxKode] || "").trim();
    if (!kode) continue;
    let div = String(row[idxDivisi] || "").trim().toUpperCase();
    if (kode.startsWith("BBCV-") || kode.startsWith("BBPT-")) div = "BAHAN BAKU";
    if (!groups[div]) continue;
    groups[div].push([
      kode,
      idxNama !== -1 ? row[idxNama] : "",
      idxSatuan !== -1 ? row[idxSatuan] : "",
      div,
      stockMap[kode] !== undefined ? stockMap[kode] : 0,
      div === "CS" ? (SIZE_MAP_CS[kode] || "") : ""
    ]);
  }

  const order = ["DAPUR 1","DAPUR 2","MIE","PACKING","CS","BAHAN BAKU","REKANAN"];
  const out = [
    ["TABEL DATA STOK PER DIVISI — V6.5 OPTIMIZED", "", "", "", "", "", ""],
    ["Sisa Stok = CV/PT; BAHAN BAKU = Stock Bahan Baku | Update: " + Utilities.formatDate(new Date(), TIMEZONE, "dd-MMM-yyyy HH:mm:ss"), "", "", "", "", "", ""]
  ];
  order.forEach(div => {
    const items = groups[div] || [];
    out.push(["DIVISI : " + div, "", "", "", "", "", ""]);
    out.push(["TOTAL PRODUK : " + items.length + " ITEM", "", "", "", "", "", ""]);
    out.push(div === "CS" ? ["No","Kode Barang","Nama Barang","Satuan","Divisi","Sisa Stok","Size"] : ["No","Kode Barang","Nama Barang","Satuan","Divisi","Sisa Stok","Keterangan"]);
    items.forEach((item, idx) => out.push([idx + 1].concat(item)));
    out.push(["","","","","","",""]);
  });

  const neededRows = Math.max(out.length, 4);
  if (dest.getMaxRows() < neededRows) dest.insertRowsAfter(dest.getMaxRows(), neededRows - dest.getMaxRows());
  if (dest.getMaxColumns() < 7) dest.insertColumnsAfter(dest.getMaxColumns(), 7 - dest.getMaxColumns());

  const oldRows = Math.max(neededRows, Math.min(dest.getLastRow(), 5000));
  try { dest.getRange(1, 1, oldRows, 7).breakApart(); } catch (e) {}
  dest.getRange(1, 1, oldRows, 7).clearContent();
  dest.getRange(1, 1, out.length, 7).setValues(out);
  dest.getRange(1, 1, 1, 7).merge().setFontWeight("bold").setFontSize(14);
  dest.getRange(2, 1, 1, 7).merge().setFontStyle("italic").setFontSize(9);

  let r = 3;
  order.forEach(div => {
    const count = (groups[div] || []).length;
    dest.getRange(r, 1, 1, 7).merge().setFontWeight("bold"); r += 2;
    dest.getRange(r, 1, 1, 7).setFontWeight("bold"); r += 1 + count + 1;
  });
  dest.setFrozenRows(3);
  updateLastUpdateTimestamp();

  const total = order.reduce((sum,d) => sum + (groups[d]||[]).length, 0);
  clearDataDirty_();
  return {
    success: true,
    total: total,
    bahanBakuCount: bbSource.count,
    bahanBakuSource: "Stock Bahan Baku",
    message: total + " item disinkronisasi tanpa rebuild struktur global."
  };
}


// ============================================================
// 13. DAILY SNAPSHOT + DASHBOARD [V6.2]
// ============================================================
function logDailySnapshot() {
  const ss = getSS();
  let snapSheet = ss.getSheetByName("Daily Snapshots");
  if (!snapSheet) snapSheet = ss.insertSheet("Daily Snapshots");
  if (snapSheet.getLastRow() < OPS_HEADER_ROW) formatDailySnapshotsSheet_(snapSheet);

  const all = getAllStock("ALL");
  if (!all.success) return;
  let stabil = 0, kritis = 0, waspada = 0, totalStok = 0;
  all.items.forEach(function(i) {
    const akhir = Number(i.stockAkhir) || 0;
    const aman = Number(i.stockAman) || 0;
    totalStok += akhir;
    if (aman <= 0) { stabil++; return; }
    const pct = (akhir / aman) * 100;
    if (pct <= 30) kritis++; else if (pct <= 60) waspada++; else stabil++;
  });

  const row = Math.max(OPS_DATA_START_ROW, snapSheet.getLastRow() + 1);
  snapSheet.getRange(row, 1, 1, 7).setValues([[
    Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd"),
    all.count, stabil, kritis, waspada, totalStok, "Auto V6.3"
  ]]);
  snapSheet.getRange(row, 1, 1, 7).setFontColor(UI_TEXT).setVerticalAlignment("middle")
    .setBorder(true, true, true, true, true, true, UI_BORDER, SpreadsheetApp.BorderStyle.SOLID)
    .setBackground((row - OPS_DATA_START_ROW) % 2 === 0 ? UI_ROW_ALT : "#FFFFFF");
  snapSheet.getRange(row, 1).setNumberFormat("yyyy-mm-dd").setHorizontalAlignment("center");
  snapSheet.getRange(row, 2, 1, 5).setNumberFormat("#,##0").setHorizontalAlignment("center");
  snapSheet.getRange(row, 7).setHorizontalAlignment("left").setWrap(true);
}

function updateLastUpdateTimestamp() {
  try {
    const now = new Date();
    const props = PropertiesService.getScriptProperties();
    const formatted = Utilities.formatDate(now, TIMEZONE, "yyyy-MM-dd HH:mm:ss");
    props.setProperty("LAST_UPDATE", formatted);
    props.setProperty(LAST_UPDATE_ISO_KEY, now.toISOString());
    // Stempel waktu tampil di bagian atas sheet operasional (real-time).
    try { stampVisibleUpdateTimestamp_(formatted); } catch (stampErr) {
      console.error("stampVisibleUpdateTimestamp_ gagal: " + stampErr.message);
    }
  } catch(e) {}
}

/**
 * Menulis "Update terakhir: ..." di baris 2 (atau area subtitle) pada sheet kunci.
 * Dipanggil setiap ada perubahan data agar waktu di bagian atas selalu mutakhir.
 */
function stampVisibleUpdateTimestamp_(formatted) {
  const ss = getSS();
  const stamp = "Update terakhir: " + (formatted || Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss"));
  const targets = [
    { name: "Dashboard", range: "A2" },
    { name: "Data Stok Per Divisi", range: "A2" },
    { name: "Config", range: null },
    { name: "purchase order", range: null },
    { name: "Stock CV", range: null },
    { name: "Stock PT", range: null },
    { name: "Stock Bahan Baku", range: null },
    { name: "Barang masuk", range: null },
    { name: "Barang keluar", range: null },
    { name: "Barang Rusak", range: null }
  ];
  targets.forEach(function(t) {
    try {
      const sh = ss.getSheetByName(t.name);
      if (!sh) return;
      if (t.name === "Dashboard") {
        // Dashboard A2 sudah digabung; isi ulang dengan prefix pantauan + waktu.
        const current = String(sh.getRange("A2").getDisplayValue() || "");
        if (current.indexOf("Update:") >= 0 || current.indexOf("Update terakhir") >= 0) {
          sh.getRange("A2").setValue("Pantauan Stok & Aktivitas — Real Time | " + stamp);
        } else {
          sh.getRange("A2").setValue("Pantauan Stok & Aktivitas — Real Time | " + stamp);
        }
        return;
      }
      if (t.name === "Data Stok Per Divisi") {
        // Baris 2 sudah berisi subtitle; ganti dengan stamp real-time.
        const row2 = sh.getRange(2, 1);
        row2.setValue("Sisa Stok = Stock Akhir CV/PT | " + stamp);
        return;
      }
      if (t.name === "Config") {
        // Config row 2 subtitle
        try {
          const r2 = sh.getRange(2, 1);
          const base = "Konfigurasi sistem • periode aktif • parameter sinkronisasi • " + stamp;
          r2.setValue(base);
        } catch (e) {}
        return;
      }
      // Sheet transaksi / master: tulis di pojok kanan atas jika kolom tersedia, atau baris 1 kolom terakhir.
      // Hindari menimpa header data. Gunakan catatan di Script Properties saja untuk sheet yang dilindungi.
      // Untuk sheet operasional dengan layout title row 1-2, update subtitle bila ada.
    } catch (e) {}
  });
}

function getLastUpdateTimestamp() {
  return PropertiesService.getScriptProperties().getProperty("LAST_UPDATE") || "N/A";
}

function classifyDashboardStock_(stockAkhir, stockAman) {
  // Dashboard/UI contract: absolute stock bands. PO recommendation tetap memakai Stock Aman dinamis.
  const s = Number(stockAkhir) || 0;
  if (s < 10) return "kritis";
  if (s < 20) return "waspada";
  return "aman";
}

function getDashboardData() {
  const all = getAllStock("ALL");
  if (!all.success) return { success: false, error: "Gagal membaca Stock CV/PT" };
  const status = { aman: 0, waspada: 0, kritis: 0 };
  const kritisItems = [];
  const divisions = {};
  let totalStock = 0, totalValueCV = 0, totalValuePT = 0;

  all.items.forEach(function(item) {
    const akhir = Number(item.stockAkhir) || 0;
    const aman = Number(item.stockAman) || 0;
    const statusClass = classifyDashboardStock_(akhir, aman);
    const divisi = normalizeDivision_(item.divisi || "LAINNYA");
    if (!divisions[divisi]) divisions[divisi] = { divisi: divisi, total: 0, aman: 0, waspada: 0, kritis: 0 };
    divisions[divisi].total++;
    totalStock += akhir;
    if (item.entitas === "CV") totalValueCV += toNumber_(item.stockValue || item.nilaiStok || 0);
    else totalValuePT += toNumber_(item.stockValue || item.nilaiStok || 0);
    if (statusClass === "kritis") {
      status.kritis++; divisions[divisi].kritis++;
      kritisItems.push({ kode: item.kode, nama: item.nama, divisi: divisi, sisa: akhir, aman: aman, kurang: Math.max(0, aman - akhir), status: "KRITIS", entitas: item.entitas });
    } else if (statusClass === "waspada") {
      status.waspada++; divisions[divisi].waspada++;
    } else {
      status.aman++; divisions[divisi].aman++;
    }
  });

  kritisItems.sort(function(a, b) { return b.kurang - a.kurang; });
  const activity = getTodayActivity_();
  const trend = getSevenDayTrend_();
  const divisionRows = Object.keys(divisions).map(function(k) { return divisions[k]; });
  divisionRows.sort(function(a, b) { return b.total - a.total; });
  const po = getPOStatus_();
  const total = all.count;
  return {
    success: true, generatedAt: new Date().toISOString(), lastUpdate: getLastUpdateTimestamp(), activeMonth: getActiveMonth(),
    totalItem: total, totalItemAktif: total, totalStok: totalStock,
    aman: status.aman, stabil: status.aman, waspada: status.waspada, kritis: status.kritis,
    status: { aman: status.aman, waspada: status.waspada, kritis: status.kritis,
      percentages: { aman: percent_(status.aman, total), waspada: percent_(status.waspada, total), kritis: percent_(status.kritis, total) } },
    statusPerDivisi: divisionRows, top10Kritis: kritisItems.slice(0, 10),
    aktivitasHariIni: activity, trend7Hari: trend, distribusiStatus: status,
    nilaiStok: { cv: totalValueCV, pt: totalValuePT, selisih: totalValueCV - totalValuePT },
    statusPO: po
  };
}

function getDashboard() { return getDashboardData(); }

function toNumber_(v) { const n = Number(String(v).replace(/[^0-9,.-]/g, "").replace(/,/g, ".")); return isNaN(n) ? 0 : n; }
function percent_(n, d) { return d ? Math.round((n / d) * 1000) / 10 : 0; }
function normalizeDivision_(v) { return String(v || "LAINNYA").trim().toUpperCase().replace(/DAPUR1/g, "DAPUR 1").replace(/DAPUR2/g, "DAPUR 2") || "LAINNYA"; }

function getVolumeSummaryThisWeek_() {
  const now = new Date();
  const day = now.getDay() || 7;
  const start = new Date(now.getTime()); start.setHours(0,0,0,0); start.setDate(start.getDate() - day + 1);
  const end = new Date(start.getTime()); end.setDate(end.getDate() + 7);
  const result = { minggu: getWeekKey_(start), masuk: 0, keluar: 0, rusak: 0, total: 0 };
  ['Barang masuk','Barang keluar','Barang Rusak'].forEach(function(name) {
    const sh = getSS().getSheetByName(name); if (!sh || sh.getLastRow() < 4) return;
    const rows = sh.getRange(4, 2, sh.getLastRow() - 3, 5).getValues();
    rows.forEach(function(r) {
      const d = parseTransactionDate_(r[0]); if (!d || d < start || d >= end) return;
      const q = Math.abs(toNumber_(r[4]));
      if (name === 'Barang masuk') result.masuk += q;
      else if (name === 'Barang keluar') result.keluar += q;
      else result.rusak += q;
    });
  });
  result.total = result.masuk + result.keluar + result.rusak;
  return result;
}

function getTodayActivity_() {
  const result = { masuk: 0, keluar: 0, rusak: 0, total: 0 };
  const today = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
  Object.keys(SHEET_CONFIG).forEach(function(name) {
    const sh = getSS().getSheetByName(name), cfg = SHEET_CONFIG[name];
    if (!sh) return;
    const last = getRealLastDataRow(sh, cfg); if (last <= cfg.headerRow) return;
    const rows = sh.getRange(cfg.headerRow + 1, 2, last - cfg.headerRow, 5).getValues();
    rows.forEach(function(r) {
      const d = normalizeDateKey_(r[0]);
      if (d !== today) return;
      const qty = Math.abs(toNumber_(r[4]));
      if (name === "Barang masuk") result.masuk += qty;
      else if (name === "Barang keluar") result.keluar += qty;
      else result.rusak += qty;
    });
  });
  result.total = result.masuk + result.keluar + result.rusak;
  return result;
}

function normalizeDateKey_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, TIMEZONE, "yyyy-MM-dd");
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? raw : Utilities.formatDate(parsed, TIMEZONE, "yyyy-MM-dd");
}

function getSevenDayTrend_() {
  const labels = [], values = [], now = new Date();
  const snap = getSS().getSheetByName("Daily Snapshots");
  const map = {};
  if (snap && snap.getLastRow() >= OPS_DATA_START_ROW) snap.getRange(OPS_DATA_START_ROW, 1, snap.getLastRow() - OPS_HEADER_ROW, 3).getValues().forEach(function(r) { map[normalizeDateKey_(r[0])] = toNumber_(r[1]); });
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    const key = Utilities.formatDate(d, TIMEZONE, "yyyy-MM-dd");
    labels.push(Utilities.formatDate(d, TIMEZONE, "dd/MM")); values.push(map[key] || (i === 0 ? getAllStock("ALL").count : null));
  }
  return { labels: labels, values: values };
}

function getPOStatus_() {
  const result = {
    aktif: { cv: 0, pt: 0, purchaseOrder: 0, total: 0, itemCount: 0 },
    konfirmasi: { cv: 0, pt: 0, purchaseOrder: 0, total: 0, itemCount: 0 }
  };
  const sh = getSS().getSheetByName("purchase order");
  if (!sh || sh.getLastRow() < PO_HEADER_ROW) return result;

  // Format GudangAI standar: header tabel row 6, data mulai row 7,
  // B=No, C=Nama, D=Size, E=Satuan, F=PO CV, G=PO PT, H=Total, I=Tanggal Kedatangan.
  // Header-based agar tidak salah menjumlahkan nomor item/tanggal/angka lain.
  const headerRow = PO_HEADER_ROW;
  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(headerRow, 1, 1, lastCol).getDisplayValues()[0].map(function(v) {
    return String(v || "").trim().toUpperCase();
  });
  const cCV = headers.findIndex(function(h) { return /PO\\s*CV|CV\\s*PO/.test(h); });
  const cPT = headers.findIndex(function(h) { return /PO\\s*PT|PT\\s*PO/.test(h); });
  const cTotal = headers.findIndex(function(h) { return /^TOTAL$|TOTAL\\s*PO/.test(h); });
  const cStatus = headers.findIndex(function(h) { return /STATUS|KONFIRM/.test(h); });

  if (cCV < 0 && cPT < 0 && cTotal < 0) {
    return result;
  }

  const startRow = PO_DATA_START_ROW;
  const numRows = sh.getLastRow() - startRow + 1;
  if (numRows <= 0) return result;
  const vals = sh.getRange(startRow, 1, numRows, lastCol).getDisplayValues();

  vals.forEach(function(row) {
    const hasItem = row.some(function(v) { return String(v || "").trim() !== ""; });
    if (!hasItem) return;

    const statusText = cStatus >= 0 ? String(row[cStatus] || "").toUpperCase() : "";
    const confirmed = /KONFIRM|CONFIRM|SELESAI|APPROVED/.test(statusText);
    const bucket = confirmed ? result.konfirmasi : result.aktif;

    const cv = cCV >= 0 ? toNumber_(row[cCV]) : 0;
    const pt = cPT >= 0 ? toNumber_(row[cPT]) : 0;
    const total = cTotal >= 0 ? toNumber_(row[cTotal]) : (cv + pt);
    bucket.cv += cv;
    bucket.pt += pt;
    bucket.total += total;
    if (cv || pt || total) bucket.itemCount++;
  });

  return result;
}


// ============================================================
// 14. DASHBOARD GOOGLE SHEETS — REAL-TIME RENDERER
// ============================================================
function diagnoseDashboard() {
  const ss = getSS();
  let sh = ss.getSheetByName("Dashboard");
  if (!sh) sh = ss.insertSheet("Dashboard", 0);
  try {
    sh.getRange("A1:B12").breakApart().clearContent();
    sh.getRange("A1").setValue("DIAGNOSTIK DASHBOARD — MULAI");
    SpreadsheetApp.flush();
    const data = getDashboardData();
    sh.getRange("A2:B8").setValues([
      ["getDashboardData", data.success ? "OK" : "GAGAL"],
      ["Total item", data.totalItemAktif || 0],
      ["Aman", data.aman || 0],
      ["Waspada", data.waspada || 0],
      ["Kritis", data.kritis || 0],
      ["Status per divisi", (data.statusPerDivisi || []).length],
      ["Tahap data", "BERHASIL"]
    ]);
    SpreadsheetApp.flush();
    const result = refreshDashboard();
    sh.getRange("A10:B12").setValues([["refreshDashboard", result.success ? "OK" : "GAGAL"], ["Pesan", result.message || result.error || "Selesai"], ["Waktu", new Date()]]);
    SpreadsheetApp.flush();
    return result;
  } catch (err) {
    sh.getRange("A10:B12").setValues([["refreshDashboard", "ERROR"], ["Pesan", String(err && err.message || err)], ["Stack", String(err && err.stack || "") .substring(0, 500)]]);
    SpreadsheetApp.flush();
    return { success: false, error: String(err && err.message || err) };
  }
}

function refreshAllData(options) {
  options = options || {};
  const maintenance = maintenanceCleanup(false);
  let dashboard = null;
  try {
    dashboard = isDashboardSyncPatchEnabled_()
      ? dashboardSyncPatchRefresh_({ reason: "refreshAllData" })
      : refreshDashboardLive_();
  } catch (e) {
    dashboard = { success: false, error: String(e && e.message || e) };
  }
  return { success: true, maintenance: maintenance, dashboard: dashboard, dirty: isDataDirty_() };
}

function clearDashboardCharts_(sheet) {
  try {
    const charts = sheet.getCharts();
    charts.forEach(function(chart) { sheet.removeChart(chart); });
  } catch (err) {
    console.error("Chart lama tidak dapat dihapus: " + err.message);
  }
}

/**
 * Grafik batang mendatar (horizontal bar) status stok per divisi.
 * Data sumber: statusPerDivisi dari getDashboardData().
 */
function renderDivisionBarChart_(sheet, dataStartRow, data) {
  const col = 16;
  if (sheet.getMaxColumns() < col + 5) sheet.insertColumnsAfter(sheet.getMaxColumns(), col + 5 - sheet.getMaxColumns());
  const header = [["DIVISI", "AMAN", "WASPADA", "KRITIS"]];
  const rows = (data.statusPerDivisi || []).map(function(d) {
    return [d.divisi, Number(d.aman) || 0, Number(d.waspada) || 0, Number(d.kritis) || 0];
  });
  if (!rows.length) rows.push(["-", 0, 0, 0]);
  const block = header.concat(rows);
  sheet.getRange(dataStartRow, col, block.length, 4).setValues(block);
  try { sheet.hideColumns(col, 4); } catch (e) {}
  removeChartByTitle_(sheet, "Status Stok per Divisi");
  const chart = sheet.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(sheet.getRange(dataStartRow, col, block.length, 4))
    .setOption("title", "Status Stok per Divisi")
    .setOption("legend", { position: "bottom" })
    .setOption("isStacked", true)
    .setOption("colors", ["#2E7D32", "#F9A825", "#C62828"])
    .setOption("width", 520)
    .setOption("height", 280)
    .setOption("hAxis", { title: "Jumlah Item", minValue: 0 })
    .setOption("vAxis", { title: "Divisi" })
    .setPosition(11, 8, 0, 0)
    .build();
  sheet.insertChart(chart);
  return { rows: rows.length, chartTitle: "Status Stok per Divisi" };
}

function refreshDashboardLive_() {
  if (isDashboardSyncPatchEnabled_()) return dashboardSyncPatchRefresh_({ reason: "legacy-refreshDashboardLive" });
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return { success: false, error: "Dashboard sedang diproses." };
  try {
    const ss = getSS();
    const sh = ss.getSheetByName("Dashboard");
    if (!sh) return { success: false, code: "DASHBOARD_NOT_FOUND", error: "Sheet Dashboard tidak ditemukan" };

    const data = getDashboardData();
    if (!data || !data.success) return data || { success: false, error: "Data Dashboard kosong" };

    if (sh.getMaxRows() < 100) sh.insertRowsAfter(sh.getMaxRows(), 100 - sh.getMaxRows());
    if (sh.getMaxColumns() < 22) sh.insertColumnsAfter(sh.getMaxColumns(), 22 - sh.getMaxColumns());

    // Header + kartu ringkasan — tidak mengubah merge/layout.
    sh.getRange("A2").setValue("Pantauan Stok & Aktivitas — Real Time | Update: " + (data.lastUpdate || data.generatedAt));
    const cards = [
      ["TOTAL ITEM AKTIF", data.totalItemAktif, "item"],
      ["KRITIS", data.kritis, percent_(data.kritis, data.totalItemAktif) + "%"],
      ["WASPADA", data.waspada, percent_(data.waspada, data.totalItemAktif) + "%"],
      ["AMAN", data.aman, percent_(data.aman, data.totalItemAktif) + "%"]
    ];
    [["A6:C9"],["D6:F9"],["G6:I9"],["J6:L9"]].forEach(function(x, i) {
      sh.getRange(x[0]).setValue(cards[i][0] + "\n\n" + cards[i][1] + " " + cards[i][2]);
    });

    // Tabel sumber chart divisi tetap di A13:F; chart tersembunyi membaca P13:S.
    const divRows = (data.statusPerDivisi || []).map(function(d) {
      return [d.divisi, d.total, d.aman, d.waspada, d.kritis, percent_(d.kritis, d.total) / 100];
    });
    sh.getRange(13, 1, 80, 6).clearContent();
    sh.getRange(12, 1, 1, 6).setValues([["DIVISI", "TOTAL ITEM", "AMAN", "WASPADA", "KRITIS", "% KRITIS"]]);
    if (divRows.length) {
      sh.getRange(13, 1, divRows.length, 6).setValues(divRows);
      sh.getRange(13, 2, divRows.length, 4).setNumberFormat("#,##0").setHorizontalAlignment("center");
      sh.getRange(13, 6, divRows.length, 1).setNumberFormat("0.0%").setHorizontalAlignment("center");
    }

    const hiddenDiv = [["DIVISI", "AMAN", "WASPADA", "KRITIS"]].concat((data.statusPerDivisi || []).map(function(d) {
      return [d.divisi, Number(d.aman) || 0, Number(d.waspada) || 0, Number(d.kritis) || 0];
    }));
    sh.getRange(13, 16, 80, 4).clearContent();
    sh.getRange(13, 16, hiddenDiv.length, 4).setValues(hiddenDiv);

    // Donut PO membaca range P12:Q15; cukup update datanya, chart tidak perlu dibuat ulang.
    const poNow = getStatusPO();
    if (poNow && poNow.success) {
      // Donut memakai U12:V15. Jangan gunakan P:Q karena P:S adalah
      // sumber data grafik status stok per divisi.
      sh.getRange(12, 21, 4, 2).setValues([
        ["STATUS PO", "QTY"],
        ["SELESAI", Number(poNow.summary.itemSelesai || 0)],
        ["SEBAGIAN", Number(poNow.summary.itemSebagian || 0)],
        ["MENUNGGU", Number(poNow.summary.itemMenunggu || 0)]
      ]);
      try { sh.hideColumns(21, 2); } catch (hideDonutErr) {}
    }

    // Tabel PO saat ini + minggu lalu. Fungsi ini sudah dipisahkan agar tidak overlap.
    const poSection = refreshDashboardPOSection_({ renderCharts: false, lightweight: true });
    updateLastUpdateTimestamp();
    clearDataDirty_();

    return {
      success: true,
      sheet: "Dashboard",
      totalItem: data.totalItemAktif,
      statusPerDivisi: data.statusPerDivisi || [],
      poSection: poSection,
      updatedAt: getLastUpdateTimestamp(),
      mode: "LIVE_LIGHTWEIGHT"
    };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function refreshDashboard(force) {
  if (isDashboardSyncPatchEnabled_()) {
    if (force !== true) return { success: true, skippedHeavyRebuild: true, patch: true, lastUpdate: getLastUpdateTimestamp() };
    return dashboardSyncPatchRefresh_({ reason: "manual-refreshDashboard", force: true });
  }
  // Dashboard sheet adalah tampilan sekunder. Jangan rebuild setiap transaksi/onEdit.
  // force=true hanya untuk admin/manual refresh.
  if (force !== true) {
    return { success: true, skippedHeavyRebuild: true, reason: "Dashboard rebuild dinonaktifkan pada jalur otomatis.", lastUpdate: getLastUpdateTimestamp(), dirty: isDataDirty_() };
  }
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) return { success: false, error: "Dashboard sedang diperbarui proses lain." };
  try {
    const ss = getSS();
    let sh = ss.getSheetByName("Dashboard");
    if (!sh) sh = ss.insertSheet("Dashboard", 0);
    const data = getDashboardData();
    if (!data.success) return data;
    if (sh.getMaxRows() < 55) sh.insertRowsAfter(sh.getMaxRows(), 55 - sh.getMaxRows());
    if (sh.getMaxColumns() < 14) sh.insertColumnsAfter(sh.getMaxColumns(), 14 - sh.getMaxColumns());
    // Force rebuild hanya atas permintaan admin. Ini bukan jalur transaksi/onEdit.
    try { clearDashboardCharts_(sh); } catch (e) {}
    sh.getRange(1, 1, Math.min(sh.getMaxRows(), 30), 14).breakApart();
    sh.getRange(1, 1, Math.min(sh.getMaxRows(), 30), 14).clearContent();
    sh.setFrozenRows(3);
    sh.getRange("A1:N1").merge().setValue("DASHBOARD GUDANG NASGOR 69").setFontSize(20).setFontWeight("bold");
    sh.getRange("A2:N2").merge().setValue("Pantauan Stok & Aktivitas — Real Time | Update: " + (data.lastUpdate || data.generatedAt));
    sh.getRange("A4:N4").merge().setValue("RINGKASAN EKSEKUTIF").setFontWeight("bold");
    const cards = [["TOTAL ITEM AKTIF", data.totalItemAktif, "item"], ["KRITIS", data.kritis, percent_(data.kritis, data.totalItemAktif) + "%"], ["WASPADA", data.waspada, percent_(data.waspada, data.totalItemAktif) + "%"], ["AMAN", data.aman, percent_(data.aman, data.totalItemAktif) + "%"]];
    [["A6:C9"],["D6:F9"],["G6:I9"],["J6:L9"]].forEach(function(x, i) { const r = sh.getRange(x[0]); r.merge(); r.setValue(cards[i][0] + "\n\n" + cards[i][1] + " " + cards[i][2]).setFontSize(16).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle"); });
    sh.getRange("A11:F11").merge().setValue("1 GRAFIK STATUS PER DIVISI").setFontWeight("bold");
    sh.getRange("A12:F12").setValues([["DIVISI", "TOTAL ITEM", "AMAN", "WASPADA", "KRITIS", "% KRITIS"]]).setFontWeight("bold");
    const divRows = data.statusPerDivisi.map(function(d) { return [d.divisi, d.total, d.aman, d.waspada, d.kritis, percent_(d.kritis, d.total) / 100]; });
    if (divRows.length) {
      sh.getRange(13, 1, divRows.length, 6).setValues(divRows);
      sh.getRange(13, 2, divRows.length, 4).setNumberFormat("#,##0").setHorizontalAlignment("center");
      sh.getRange(13, 6, divRows.length, 1).setNumberFormat("0.0%").setHorizontalAlignment("center");
    }
    // Grafik batang mendatar (horizontal) status stok per divisi — AMAN / WASPADA / KRITIS.
    let divisionChart = null;
    try { divisionChart = renderDivisionBarChart_(sh, 13, data); } catch (chartDivErr) {
      console.error("renderDivisionBarChart_ gagal: " + chartDivErr.message);
      divisionChart = { error: String(chartDivErr.message || chartDivErr) };
    }
    // Section 2: grafik donat status PO minggu ini. Tidak memakai data dummy.
    const poNow = getStatusPO();
    sh.getRange("H11:N11").merge().setValue("2 GRAFIK DONAT STATUS PO MINGGU INI").setFontWeight("bold");
    if (poNow && poNow.success) {
      try {
        renderPODonutChart_(sh, 12, "Status PO — Minggu Ini", poNow.summary || {}, "Status PO — Minggu Ini");
      } catch (donutErr) {
        console.error("renderPODonutChart_ gagal: " + donutErr.message);
      }
    }
    // Section 3: volume transaksi minggu berjalan.
    const vol = getVolumeSummaryThisWeek_();
    sh.getRange("A22:N22").merge().setValue("3 VOLUME MINGGU INI — " + (vol.minggu || "-")).setFontWeight("bold");
    sh.getRange("A23:H23").setValues([["BARANG MASUK", "BARANG KELUAR", "BARANG RUSAK", "TOTAL VOLUME", "", "", "", ""]]).setFontWeight("bold");
    sh.getRange("A24:D24").setValues([[vol.masuk || 0, vol.keluar || 0, vol.rusak || 0, vol.total || 0]]).setNumberFormat("#,##0").setHorizontalAlignment("center");
    let poSection = null;
    try { poSection = refreshDashboardPOSection_({ renderCharts: false, force: true }); }
    catch (poErr) { poSection = { success: false, error: String(poErr && poErr.message || poErr) }; }
    updateLastUpdateTimestamp();
    clearDataDirty_();
    return {
      success: true, sheet: "Dashboard", updatedAt: getLastUpdateTimestamp(),
      poSection: poSection, divisionChart: divisionChart,
      summary: { total: data.totalItemAktif, aman: data.aman, waspada: data.waspada, kritis: data.kritis }
    };
  } finally { if (lock.hasLock()) lock.releaseLock(); }
}


// ============================================================
// 15. PO RECOMMENDATIONS [V6.2 formal format]
// ============================================================
function getPOTableConstants_() {
  return { headerRow: PO_HEADER_ROW, dataStartRow: PO_DATA_START_ROW, startCol: PO_DATA_START_COL, numCols: PO_DATA_NUM_COLS };
}

function generatePORecommendations() {
  const all = getAllStock("ALL");
  if (!all.success) return [];
  const csItems = all.items.filter(function(i) { return String(i.divisi || "").trim().toUpperCase() === "CS"; });
  if (!csItems.length) {
    throw new Error("MASTER CS TIDAK VALID: tidak ada item CS yang terbaca dari Stock CV/PT. PO dibatalkan untuk mencegah daftar kosong.");
  }
  return csItems.filter(function(i) {
    const akhir = Number(i.stockAkhir) || 0;
    const aman = Number(i.stockAman) || 0;
    return aman > 0 && akhir < aman;
  }).map(function(i) {
    const akhir = Number(i.stockAkhir) || 0;
    const aman = Number(i.stockAman) || 0;
    const kurang = aman - akhir;
    const kodeUpper = String(i.kode || "").trim().toUpperCase();
    const isCV = kodeUpper.indexOf("CV-") === 0 || kodeUpper.indexOf("BBCV-") === 0;
    const isPT = kodeUpper.indexOf("PT-") === 0 || kodeUpper.indexOf("WK-") === 0 || kodeUpper.indexOf("BBPT-") === 0;
    if (!isCV && !isPT) throw new Error("PREFIX ENTITAS PO TIDAK DIKENAL: " + i.kode + ". PO dibatalkan untuk mencegah salah kolom CV/PT.");
    return { kode: i.kode, nama: i.nama, satuan: i.satuan, sisa: akhir, aman: aman, kurang: kurang,
      poCV: isCV ? kurang : 0, poPT: isPT ? kurang : 0 };
  }).sort(function(a, b) { return b.kurang - a.kurang; });
}

function writePORecommendations() {
  const ss = getSS();
  const sheet = ss.getSheetByName("purchase order");
  if (!sheet) return { success: false, error: "Sheet 'purchase order' tidak ditemukan" };

  const recommendations = generatePORecommendations();
  const existingEnd = findPODataEndRow(sheet, PO_DATA_START_ROW);
  const neededEnd = Math.max(existingEnd, PO_DATA_START_ROW + Math.max(0, recommendations.length) - 1);
  const protection = inspectPORangeProtection_(sheet, PO_HEADER_ROW, PO_DATA_START_COL, Math.max(2, neededEnd - PO_HEADER_ROW + 1), PO_DATA_NUM_COLS);
  if (!protection.safe) return { success: false, error: "PO DIBATALKAN: range tabel Purchase Order terlindungi", reviewRequired: true, protection: protection };

  ensurePOHeader(sheet, PO_HEADER_ROW);
  updatePODateRow4(sheet);
  ensurePORowsCapacity_(sheet, Math.max(PO_DATA_START_ROW, neededEnd));
  clearPOTableData(sheet);

  if (!recommendations.length) {
    return { success: true, message: "Tidak ada item perlu di-PO", count: 0, dataStartRow: PO_DATA_START_ROW };
  }

  const sizeMap = getSizeMapFromDivisiCS();
  const rows = recommendations.map(function(r, i) {
    const size = sizeMap[r.kode] || sizeMap[r.nama] || "";
    const total = (Number(r.poCV) || 0) + (Number(r.poPT) || 0);
    return [i + 1, r.nama || "", size, r.satuan || "", Number(r.poCV) || 0, Number(r.poPT) || 0, total, ""];
  });
  sheet.getRange(PO_DATA_START_ROW, PO_DATA_START_COL, rows.length, PO_DATA_NUM_COLS).setValues(rows);
  const formatting = formatPOTable_(sheet, PO_DATA_START_ROW, rows.length, PO_HEADER_ROW);
  updateLastUpdateTimestamp();
  SpreadsheetApp.flush();
  try { refreshDashboardPOSection_({ renderCharts: false, lightweight: true }); } catch (e) {}

  return { success: true, message: "PO divisi CS ditulis ke format tabel B6:I.", count: recommendations.length,
    division: "CS", eligibleMasterCount: recommendations.length, formatting: formatting,
    dataStartRow: PO_DATA_START_ROW, headerRow: PO_HEADER_ROW,
    generatedAt: Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm") };
}

function normalizePOItem_(item, index) {
  const source = (item && typeof item === "object") ? item : {};
  const poCV = Math.max(0, Math.floor(toNumber_(source.poCV != null ? source.poCV : source.cv)));
  const poPT = Math.max(0, Math.floor(toNumber_(source.poPT != null ? source.poPT : source.pt)));
  const totalCandidate = toNumber_(source.totalQty != null ? source.totalQty : source.total);
  const total = Math.max(0, Math.floor(totalCandidate || (poCV + poPT)));
  const finalTotal = Math.max(total, poCV + poPT);
  return {
    no: Number(source.no) || index + 1,
    kode: String(source.kode || source.kodeBarang || "").trim(),
    nama: String(source.nama || source.name || "").trim(),
    size: String(source.size || "").trim(),
    satuan: String(source.satuan || source.unit || "").trim(),
    poCV: poCV,
    poPT: poPT,
    total: finalTotal,
    tanggalKedatangan: source.tanggalKedatangan || source.arrivalDate || source.tglKedatangan || ""
  };
}

function normalizePOItems_(body) {
  const candidates = body && (body.items || body.rows || body.poItems || body.recommendations);
  if (!Array.isArray(candidates)) return [];
  return candidates.map(normalizePOItem_).filter(function(x) { return x.nama && x.total > 0; })
    .map(function(x, i) { x.no = i + 1; return x; });
}

function poPayloadDigest_(body, items) {
  const canonical = { noPO: String((body && (body.noPO || body.nomorPO || body.poNumber)) || "").trim(),
    tanggal: String((body && (body.tanggal || body.poDate)) || "").trim(), items: items.map(function(x) {
      return [x.no, x.kode, x.nama, x.size, x.satuan, x.poCV, x.poPT, x.total, String(x.tanggalKedatangan || "")];
    }) };
  return sha256Short_(JSON.stringify(canonical));
}

function poSheetMatchesItems_(sheet, items) {
  try {
    const expected = (items || []).map(function(x) {
      return [x.no, x.nama, x.size, x.satuan, x.poCV, x.poPT, x.total, x.tanggalKedatangan || ""];
    });
    if (!expected.length) return false;
    const endRow = findPODataEndRow(sheet, PO_DATA_START_ROW);
    const count = Math.max(0, endRow - PO_DATA_START_ROW + 1);
    if (count !== expected.length) return false;
    const actual = sheet.getRange(PO_DATA_START_ROW, PO_DATA_START_COL, count, PO_DATA_NUM_COLS).getDisplayValues();
    for (let i = 0; i < expected.length; i++) {
      for (let j = 0; j < PO_DATA_NUM_COLS; j++) {
        const a = String(actual[i][j] == null ? "" : actual[i][j]).trim();
        const e = String(expected[i][j] == null ? "" : expected[i][j]).trim();
        if (j >= 4 && j <= 6) {
          if (toNumber_(a) !== toNumber_(e)) return false;
        } else if (a !== e) {
          return false;
        }
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

function writePONumberRow5_(sheet, noPO) {
  const value = String(noPO || "").trim();
  if (!value) return;
  const row = sheet.getRange(5, 1, 1, Math.max(9, sheet.getLastColumn())).getValues()[0];
  for (let i = 0; i < row.length; i++) {
    if (/no\s*(po|:)/i.test(String(row[i] || ""))) {
      sheet.getRange(5, i + 1).setValue("NO PO : " + value);
      return;
    }
  }
  sheet.getRange(5, 2).setValue("NO PO : " + value);
}

function writePurchaseOrder_(body) {
  body = body || {};
  const requestId = String(body.requestId || ("PO-REQ-" + Utilities.getUuid())).trim();
  const deviceId = String(body.deviceId || "").trim();
  const items = normalizePOItems_(body);
  if (!items.length) return { success: false, status: "REJECTED", code: "PO_ITEMS_REQUIRED", requestId: requestId, writeOccurred: false, error: "Final PO tidak berisi item yang valid." };

  const digest = poPayloadDigest_(body, items);
  const prior = findIdempotencyRecord_(requestId, requestId);
  if (prior && prior.operation === "writePurchaseOrder") {
    if (String(prior.details || "").indexOf(digest) < 0 && prior.status === "APPLIED") {
      return { success: false, status: "CONFLICT", code: "PO_IDENTITY_REUSE_CONFLICT", requestId: requestId, writeOccurred: false, error: "RequestID PO sudah pernah digunakan untuk payload berbeda." };
    }
    if (prior.status === "APPLIED" || prior.status === "COMPLETED") {
      try { return Object.assign(JSON.parse(prior.details), { replayed: true, code: "IDEMPOTENT_REPLAY" }); } catch (e) {
        return { success: true, status: "APPLIED", code: "IDEMPOTENT_REPLAY", requestId: requestId, replayed: true, writeOccurred: true };
      }
    }
    if (prior.status === "IN_PROGRESS" || prior.status === "UNKNOWN") {
      // Reconcile terhadap sheet sebelum menolak retry. Jika timeout terjadi setelah
      // setValues(), konten PO yang sama berarti write sudah committed.
      try {
        const sheet = getSS().getSheetByName("purchase order");
        if (sheet && poSheetMatchesItems_(sheet, items)) {
          const reconciledResult = { success: true, status: "APPLIED", code: "READBACK_CONFIRMED", requestId: requestId, transactionId: requestId, operation: "writePurchaseOrder", sheet: "purchase order", dataStartRow: PO_DATA_START_ROW, headerRow: PO_HEADER_ROW, count: items.length, noPO: String(body.noPO || body.nomorPO || body.poNumber || "").trim() || null, totalQty: items.reduce(function(a, x) { return a + Number(x.total || 0); }, 0), writeOccurred: true, replayed: true, message: "PO sebelumnya sudah tersimpan; retry tidak menulis ulang." };
          updateIdempotencyRecord_(prior, { status: "APPLIED", writeOccurred: true, dataRow: PO_DATA_START_ROW, errorCode: "", details: JSON.stringify(Object.assign({}, reconciledResult, { digest: digest })) });
          return reconciledResult;
        }
      } catch (reconcileErr) {}
      return { success: false, status: "UNKNOWN", code: "PO_WRITE_IN_PROGRESS", requestId: requestId, writeOccurred: "unknown", retryable: false, error: "Request PO masih tercatat dalam proses dan isi sheet belum dapat dikonfirmasi. Jangan membuat RequestID baru." };
    }
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(PO_LOCK_TIMEOUT_MS)) {
    return { success: false, status: "UNKNOWN", code: "PO_LOCK_TIMEOUT", requestId: requestId, writeOccurred: "unknown", retryable: true, error: "Server sedang menulis PO lain; gunakan RequestID yang sama saat retry." };
  }

  let ledger = null;
  let writeTouched = false;
  const started = Date.now();
  try {
    const sheet = getSS().getSheetByName("purchase order");
    if (!sheet) return { success: false, status: "REJECTED", code: "PO_SHEET_NOT_FOUND", requestId: requestId, writeOccurred: false, error: "Sheet 'purchase order' tidak ditemukan." };

    // Re-check idempotency after lock to close the race between two simultaneous requests.
    const lockedPrior = findIdempotencyRecord_(requestId, requestId);
    if (lockedPrior && lockedPrior.operation === "writePurchaseOrder" && (lockedPrior.status === "APPLIED" || lockedPrior.status === "COMPLETED")) {
      try { return Object.assign(JSON.parse(lockedPrior.details), { replayed: true, code: "IDEMPOTENT_REPLAY" }); } catch (e) { return { success: true, status: "APPLIED", code: "IDEMPOTENT_REPLAY", requestId: requestId, replayed: true, writeOccurred: true }; }
    }

    const existingEnd = findPODataEndRow(sheet, PO_DATA_START_ROW);
    const neededEnd = PO_DATA_START_ROW + items.length - 1;
    const protection = inspectPORangeProtection_(sheet, PO_HEADER_ROW, PO_DATA_START_COL, Math.max(2, Math.max(existingEnd, neededEnd) - PO_HEADER_ROW + 1), PO_DATA_NUM_COLS);
    if (!protection.safe) return { success: false, status: "REJECTED", code: "PO_RANGE_PROTECTED", requestId: requestId, writeOccurred: false, error: "Range Purchase Order terlindungi.", protection: protection };

    ensurePORowsCapacity_(sheet, Math.max(existingEnd, neededEnd));
    ledger = appendIdempotencyRecord_({ transactionId: requestId, nonce: requestId, requestId: requestId, deviceId: deviceId,
      operation: "writePurchaseOrder", sheet: "purchase order", entitas: "ALL", kodeBarang: "PO",
      qty: items.reduce(function(a, x) { return a + x.total; }, 0), tanggal: body.tanggal || "", status: "IN_PROGRESS", writeOccurred: false,
      details: JSON.stringify({ digest: digest, itemCount: items.length }) });

    ensurePOHeader(sheet, PO_HEADER_ROW);
    updatePODateRow4(sheet);
    if (body.noPO || body.nomorPO || body.poNumber) writePONumberRow5_(sheet, body.noPO || body.nomorPO || body.poNumber);
    clearPOTableData(sheet);

    const rows = items.map(function(x) {
      return [x.no, x.nama, x.size, x.satuan, x.poCV, x.poPT, x.total, x.tanggalKedatangan || ""];
    });
    sheet.getRange(PO_DATA_START_ROW, PO_DATA_START_COL, rows.length, PO_DATA_NUM_COLS).setValues(rows);
    writeTouched = true;
    const formatting = formatPOTable_(sheet, PO_DATA_START_ROW, rows.length, PO_HEADER_ROW);
    SpreadsheetApp.flush();

    const result = { success: true, status: "APPLIED", code: "PO_WRITE_APPLIED", requestId: requestId,
      transactionId: requestId, operation: "writePurchaseOrder", sheet: "purchase order", dataStartRow: PO_DATA_START_ROW,
      headerRow: PO_HEADER_ROW, count: rows.length, noPO: String(body.noPO || body.nomorPO || body.poNumber || "").trim() || null,
      totalQty: rows.reduce(function(a, x) { return a + Number(x[6] || 0); }, 0),
      formatting: formatting, writeOccurred: true, retries: 0, execMs: Date.now() - started,
      message: "Final PO berhasil ditulis ke purchase order B6:I." };

    if (ledger) updateIdempotencyRecord_(ledger, { status: "APPLIED", writeOccurred: true, dataRow: PO_DATA_START_ROW,
      details: JSON.stringify(Object.assign({}, result, { digest: digest })) });
    writeAuditLogSecure("WRITE_PURCHASE_ORDER", "SUCCESS", result, "", requestId);
    updateLastUpdateTimestamp();
    try { refreshDashboardPOSection_({ renderCharts: false, lightweight: true }); } catch (e) {}
    return result;
  } catch (err) {
    let status = writeTouched ? "UNKNOWN" : "FAILED";
    const result = { success: false, status: status, code: writeTouched ? "PO_WRITE_UNKNOWN" : "PO_WRITE_FAILED", requestId: requestId,
      writeOccurred: writeTouched ? "unknown" : false, retryable: !writeTouched, execMs: Date.now() - started,
      error: writeTouched ? "PO sudah menyentuh sheet tetapi hasil respons tidak pasti; baca ulang status PO sebelum retry." : err.message };
    if (ledger) updateIdempotencyRecord_(ledger, { status: status, writeOccurred: writeTouched ? "unknown" : false, errorCode: result.code, details: JSON.stringify({ digest: digest, result: result }) });
    writeAuditLogSecure("WRITE_PURCHASE_ORDER", status, result, err.message, requestId);
    try { sendErrorEmailWithCooldown("writePurchaseOrder", err, { requestId: requestId, action: "writePurchaseOrder" }); } catch (e) {}
    return result;
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function updatePODateRow4(sheet) {
  const todayStr = Utilities.formatDate(new Date(), TIMEZONE, "d MMMM yyyy").toUpperCase();
  const row4 = sheet.getRange(4, 1, 1, Math.max(10, sheet.getLastColumn())).getValues()[0];
  for (let c = 0; c < row4.length; c++) {
    if (String(row4[c]).toUpperCase().indexOf("TANGGAL") >= 0) {
      sheet.getRange(4, c + 1).setValue("TANGGAL : " + todayStr);
      return;
    }
  }
  sheet.getRange(4, 2).setValue("TANGGAL : " + todayStr);
}

function clearPOTableData(sheet) {
  const endRow = findPODataEndRow(sheet, PO_DATA_START_ROW);
  if (endRow >= PO_DATA_START_ROW) sheet.getRange(PO_DATA_START_ROW, PO_DATA_START_COL, endRow - PO_DATA_START_ROW + 1, PO_DATA_NUM_COLS).clearContent();
}

function ensurePORowsCapacity_(sheet, endRow) {
  const target = Math.max(PO_DATA_START_ROW, endRow);
  if (sheet.getMaxRows() < target) sheet.insertRowsAfter(sheet.getMaxRows(), target - sheet.getMaxRows());
}

function findPODataEndRow(sheet, startRow) {
  const start = startRow || PO_DATA_START_ROW;
  const last = Math.min(sheet.getLastRow(), start + 500);
  for (let r = start; r <= last; r++) {
    const v = (String(sheet.getRange(r, PO_DATA_START_COL).getValue()) + " " + String(sheet.getRange(r, PO_DATA_START_COL + 1).getValue())).toLowerCase();
    if (v.indexOf("dibuat oleh") >= 0 || v.indexOf("mengetahui") >= 0) return r - 1;
  }
  for (let r = start; r <= last; r++) if (!sheet.getRange(r, PO_DATA_START_COL + 1).getValue()) return r - 1;
  return last;
}

function ensurePOHeader(sheet, headerRow) {
  const expected = ["NO", "NAMA BARANG", "SIZE", "SATUAN", "PO CV", "PO PT", "TOTAL", "TGL KEDATANGAN"];
  const header = sheet.getRange(headerRow || PO_HEADER_ROW, PO_DATA_START_COL, 1, PO_DATA_NUM_COLS);
  const cur = header.getValues()[0];
  if (expected.some(function(h, i) { return String(cur[i] || "").toUpperCase() !== h; })) header.setValues([expected]);
  header.setFontWeight("bold").setFontSize(10).setBackground(UI_PRIMARY).setFontColor("#FFFFFF")
    .setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true)
    .setBorder(true, true, true, true, true, true, UI_BORDER, SpreadsheetApp.BorderStyle.SOLID);
}

function inspectPORangeProtection_(sheet, row, column, numRows, numColumns) {
  const result = { safe: true, protected: false, ranges: [] };
  try {
    const target = sheet.getRange(row, column, numRows, numColumns);
    const protections = [];
    try { protections.push.apply(protections, sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE) || []); } catch (e) {}
    try { protections.push.apply(protections, sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET) || []); } catch (e) {}
    protections.forEach(function(p) {
      try {
        const pr = p.getRange ? p.getRange() : null;
        if (!pr || rangesIntersect_(target, pr)) { result.safe = false; result.protected = true; result.ranges.push(pr ? pr.getA1Notation() : "SHEET"); }
      } catch (e) { result.safe = false; result.protected = true; result.ranges.push("UNKNOWN_PROTECTION"); }
    });
  } catch (e) { result.safe = false; result.protected = true; result.error = e.message; }
  return result;
}

function rangesIntersect_(a, b) {
  const aR = a.getRow(), aC = a.getColumn(), aR2 = aR + a.getNumRows() - 1, aC2 = aC + a.getNumColumns() - 1;
  const bR = b.getRow(), bC = b.getColumn(), bR2 = bR + b.getNumRows() - 1, bC2 = bC + b.getNumColumns() - 1;
  return aR <= bR2 && aR2 >= bR && aC <= bC2 && aC2 >= bC;
}

function analyzePORecommendations_() {
  try {
    const all = getAllStock("ALL");
    if (!all.success) return { success: false, readOnly: true, error: "Master stok tidak terbaca" };
    const csItems = all.items.filter(function(i) { return String(i.divisi || "").trim().toUpperCase() === "CS"; });
    if (!csItems.length) return { success: false, readOnly: true, reviewRequired: true, error: "MASTER CS TIDAK VALID: tidak ada item CS yang terbaca", division: "CS", eligibleMasterCount: 0 };
    const recommendations = generatePORecommendations();
    return { success: true, readOnly: true, division: "CS", eligibleMasterCount: csItems.length, recommendationCount: recommendations.length, recommendations: recommendations };
  } catch (e) { return { success: false, readOnly: true, reviewRequired: true, error: e.message }; }
}

function formatPOTable_(sheet, dataStart, rowCount, headerRow) {
  const width = PO_DATA_NUM_COLS;
  const protection = inspectPORangeProtection_(sheet, headerRow || PO_HEADER_ROW, PO_DATA_START_COL, rowCount + 1, width);
  if (!protection.safe) return protection;
  ensurePOHeader(sheet, headerRow || PO_HEADER_ROW);
  sheet.getRange(4, 2, 1, width).setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  if (!rowCount) return { safe: true, protected: false, formattedRows: 0, range: sheet.getRange(headerRow || PO_HEADER_ROW, PO_DATA_START_COL, 1, width).getA1Notation() };
  const dataRange = sheet.getRange(dataStart, PO_DATA_START_COL, rowCount, width);
  dataRange.setFontSize(10).setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true)
    .setFontColor(UI_TEXT)
    .setBorder(true, true, true, true, true, true, UI_BORDER, SpreadsheetApp.BorderStyle.SOLID);
  for (let i = 0; i < rowCount; i++) {
    sheet.getRange(dataStart + i, PO_DATA_START_COL, 1, width).setBackground(i % 2 === 0 ? UI_ROW_ALT : "#FFFFFF");
  }
  sheet.getRange(dataStart, PO_DATA_START_COL + 4, rowCount, 3).setNumberFormat("#,##0");
  sheet.getRange(dataStart, PO_DATA_START_COL + 7, rowCount, 1).setNumberFormat("d-MMM-yyyy");
  sheet.setRowHeight(headerRow || PO_HEADER_ROW, 30);
  for (let r = dataStart; r < dataStart + rowCount; r++) sheet.setRowHeight(r, 24);
  return { safe: true, protected: false, formattedRows: rowCount, range: sheet.getRange(headerRow || PO_HEADER_ROW, PO_DATA_START_COL, rowCount + 1, width).getA1Notation() };
}

function getSizeMapFromDivisiCS() {
  const map = Object.assign({}, SIZE_MAP_CS);
  try {
    const ss = getSS();
    const sheet = ss.getSheetByName("Data Stok Per Divisi");
    if (!sheet) return map;
    const data = sheet.getDataRange().getValues();
    let inCS = false, colKode=-1, colNama=-1, colSize=-1;
    for (let i=0; i<data.length; i++) {
      const first = String(data[i][0]||"").toUpperCase();
      if (first.indexOf("DIVISI : CS")>=0 || first.indexOf("DIVISI: CS")>=0) { inCS=true; continue; }
      if (inCS && (first.indexOf("DIVISI :")>=0 || first.indexOf("TOTAL ITEM")>=0)) { inCS=false; continue; }
      if (!inCS) continue;
      const rs = data[i].map(c=>String(c).toLowerCase());
      if (rs.includes("kode barang") || rs[0]==="no") {
        colKode=rs.findIndex(c=>c.includes("kode")); colNama=rs.findIndex(c=>c.includes("nama")); colSize=rs.findIndex(c=>c.includes("size")); continue;
      }
      if (colKode>=0 && colSize>=0) {
        const k=String(data[i][colKode]||"").trim(), n=colNama>=0?String(data[i][colNama]||"").trim():"", s=String(data[i][colSize]||"").trim();
        if (k && s) { map[k]=s; if(n) map[n]=s; }
      }
    }
  } catch(e) {}
  return map;
}


// ============================================================
// 15. LAPORAN EMAIL HARIAN [V6.2]
// ============================================================
function sendDailyStockReport() {
  const ss = getSS();
  const todayStr = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
  const subject = "[GudangAI] Laporan Stok Harian - " + todayStr;

  let kritis = [], waspada = [], stabil = 0;
  ["Stock CV","Stock PT"].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const last = sheet.getLastRow();
    if (last < 4) return;
    const hdr = sheet.getRange(3,1,1,sheet.getLastColumn()).getValues()[0].map(h=>String(h).toLowerCase().trim());
    const cK = hdr.findIndex(h=>h.includes("kode"))+1;
    const cN = hdr.findIndex(h=>h.includes("nama"))+1;
    const cS = hdr.findIndex(h=>h.includes("satuan"))+1;
    const cA = hdr.findIndex(h=>h.includes("stock akhir"))+1;
    const cM = hdr.findIndex(h=>h.includes("stock aman"))+1;
    if (cK===0||cA===0) return;
    const label = name==="Stock CV" ? "CV" : "PT";
    sheet.getRange(4,1,last-3,sheet.getLastColumn()).getValues().forEach(row=>{
      const kode = String(row[cK-1]||"").trim();
      if (!kode || kode.indexOf("Total")===0) return;
      const akhir = clampStockToZero_(row[cA-1]);
      const aman = cM>0 ? Number(row[cM-1])||0 : 0;
      if (aman<=0 && akhir===0) kritis.push({kode,nama:row[cN-1],satuan:row[cS-1],entitas:label,akhir,aman});
      else if (aman>0) {
        const pct = (akhir/aman)*100;
        if (pct<=30) kritis.push({kode,nama:row[cN-1],satuan:row[cS-1],entitas:label,akhir,aman});
        else if (pct<=60) waspada.push({kode,nama:row[cN-1],satuan:row[cS-1],entitas:label,akhir,aman});
        else stabil++;
      } else stabil++;
    });
  });

  let html = "<h2>Laporan Stok Harian GudangAI V6.3 - " + todayStr + "</h2>";
  html += "<p><strong>Stabil:</strong> " + stabil + " | <strong>Kritis:</strong> " + kritis.length + " | <strong>Waspada:</strong> " + waspada.length + "</p>";
  html += "<h3 style='color:red'>KRITIS (" + kritis.length + ")</h3>";
  if (kritis.length) {
    html += "<table border=1 cellpadding=4><tr><th>Entitas</th><th>Kode</th><th>Nama</th><th>Sisa</th><th>Aman</th></tr>";
    kritis.forEach(i => html += "<tr><td>"+i.entitas+"</td><td>"+i.kode+"</td><td>"+i.nama+"</td><td>"+i.akhir+"</td><td>"+i.aman+"</td></tr>");
    html += "</table>";
  }
  if (waspada.length) {
    html += "<h3 style='color:orange'>WASPADA (" + waspada.length + ")</h3>";
    html += "<table border=1 cellpadding=4><tr><th>Entitas</th><th>Kode</th><th>Nama</th><th>Sisa</th><th>Aman</th></tr>";
    waspada.forEach(i => html += "<tr><td>"+i.entitas+"</td><td>"+i.kode+"</td><td>"+i.nama+"</td><td>"+i.akhir+"</td><td>"+i.aman+"</td></tr>");
    html += "</table>";
  }
  html += "<p><em>GudangAI V6.3 — " + getSS().getName() + "</em></p>";
  try { MailApp.sendEmail({ to: ADMIN_EMAIL, subject: subject, htmlBody: html }); } catch(e) {}
  return { success: true, kritis: kritis.length, waspada: waspada.length, stabil };
}


// ============================================================
// 16. WEEKLY PO AUTOMATION
// ============================================================
function getWeekKey_(date) {
  const d = date instanceof Date ? new Date(date.getTime()) : new Date(date || new Date());
  const target = new Date(Date.UTC(Number(Utilities.formatDate(d, TIMEZONE, "yyyy")), Number(Utilities.formatDate(d, TIMEZONE, "MM")) - 1, Number(Utilities.formatDate(d, TIMEZONE, "dd"))));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return target.getUTCFullYear() + "-W" + String(weekNo).padStart(2, "0");
}

function rolloverPOWeekIfNeeded_() {
  const props = PropertiesService.getScriptProperties();
  const currentKey = getWeekKey_(new Date());
  const previousKey = props.getProperty("GUDANGAI_PO_WEEK_KEY") || "";
  if (!previousKey) {
    props.setProperty("GUDANGAI_PO_WEEK_KEY", currentKey);
    return { changed: false, currentKey: currentKey, previousKey: null };
  }
  if (previousKey === currentKey) return { changed: false, currentKey: currentKey, previousKey: previousKey };

  let status = null;
  try { status = getStatusPO(); } catch (e) { status = null; }
  const previousItems = status && status.success ? (status.items || []) : [];
  const snapshot = { weekKey: previousKey, capturedAt: new Date().toISOString(), noPO: status && status.noPO || null,
    summary: status && status.summary || null, items: previousItems };
  props.setProperty("GUDANGAI_PO_LAST_WEEK_STATUS", JSON.stringify(snapshot));
  props.setProperty("GUDANGAI_PO_WEEK_KEY", currentKey);
  return { changed: true, currentKey: currentKey, previousKey: previousKey, count: previousItems.length };
}

function getPreviousPOStatus_() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty("GUDANGAI_PO_LAST_WEEK_STATUS");
  if (!raw) return { weekKey: null, noPO: null, items: [], summary: null };
  try { return JSON.parse(raw); } catch (e) { return { weekKey: null, noPO: null, items: [], summary: null }; }
}

function weeklyPOAutomation() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(PO_LOCK_TIMEOUT_MS)) return { success: false, status: "UNKNOWN", code: "PO_WEEKLY_LOCK_TIMEOUT", error: "Proses PO mingguan sedang dikerjakan proses lain." };
  try {
    const rollover = rolloverPOWeekIfNeeded_();
    const result = writePORecommendations();
    if (result.success) {
      try { refreshDashboardPOSection_({ renderCharts: true, force: true }); } catch (e) { console.error("Dashboard PO mingguan gagal: " + e.message); }
    }
    if (result.success && result.count > 0) {
      try { MailApp.sendEmail(ADMIN_EMAIL,
        "[GudangAI] Rekomendasi PO Mingguan — " + result.count + " item",
        "Sheet 'purchase order' sudah diperbarui ke B6:I.\nTotal item: " + result.count +
        "\nWaktu: " + (result.generatedAt || new Date()) +
        "\nWeek: " + (getWeekKey_(new Date())) +
        "\n\nSilakan cek sheet 'purchase order'.\nTautan: https://docs.google.com/spreadsheets/d/" + getSpreadsheetId()
      ); } catch (e) {}
    }
    return Object.assign({}, result, { rollover: rollover, currentWeek: getWeekKey_(new Date()) });
  } finally { if (lock.hasLock()) lock.releaseLock(); }
}

function emailQueueWriteApproved_(payload) {
  return payload && payload.queueApproved === true && !!(payload.transactionId || payload.nonce || payload.batchId);
}

function emailQueueClaimKey_(payload) {
  const identity = payload.transactionId || payload.nonce || payload.batchId || JSON.stringify({
    action: payload.action, sheet: payload.sheet, kodeBarang: payload.kodeBarang,
    qty: payload.qty, tanggal: payload.tanggal, keterangan: payload.keterangan,
    transactions: payload.transactions
  });
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(identity));
  return "emailQueueClaim_" + Utilities.base64EncodeWebSafe(digest).substring(0, 180);
}

function claimEmailQueuePayload_(payload) {
  const key = emailQueueClaimKey_(payload);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { claimed: false, key: key, error: "Tidak dapat mengunci claim queue." };
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(key)) return { claimed: false, key: key, duplicate: true };
    props.setProperty(key, JSON.stringify({ claimedAt: new Date().toISOString(), action: payload.action || "" }));
    return { claimed: true, key: key };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

// ============================================================
// 17. EMAIL QUEUE — AKSES CLAUDE [V6.0]
// ============================================================
function processEmailQueue() {
  // HARD FAIL-CLOSED: email draft tidak pernah boleh menulis transaksi.
  writeAuditLogSecure("EMAIL_QUEUE", "BLOCKED", { reason: "EMAIL_QUEUE_DISABLED" }, "Email queue execution disabled.", null);
  return { success: false, status: "BLOCKED", code: "EMAIL_QUEUE_DISABLED", writeBlocked: true };
  try {
    const drafts = GmailApp.getDrafts();
    for (let i = 0; i < drafts.length; i++) {
      const draft = drafts[i];
      let msg;
      try { msg = draft.getMessage(); } catch (e) { continue; }

      const subject = msg.getSubject() || "";
      if (subject.indexOf(QUEUE_SUBJECT_TAG) !== 0) continue;

      const bodyText = msg.getPlainBody() || "";
      let payload;
      try {
        const jsonMatch = bodyText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Tidak ditemukan JSON valid di body draft.");
        payload = JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        writeAuditLogSecure("EMAIL_QUEUE", "PARSE_FAILED", { subject: subject, bodyPreview: bodyText.substring(0, 300) }, parseErr.message, null);
        try { draft.deleteDraft(); } catch (e2) {}
        continue;
      }

      let result;
      // Gmail queue sepenuhnya non-eksekusi. Draft lama maupun approved hanya
      // dicatat sebagai blocked lalu dihapus; tidak boleh ada side effect ke spreadsheet.
      result = { success: false, reviewRequired: true, writeBlocked: true, error: "EMAIL_QUEUE_DISABLED: queue Gmail tidak memiliki hak eksekusi; gunakan Web App/API terautentikasi." };

      writeAuditLogSecure("EMAIL_QUEUE", result.success ? "SUCCESS" : "FAILED",
        { payload: payload, result: result }, result.error || "", result.transactionId || null);
      try { draft.deleteDraft(); } catch (e3) {}
    }
  } catch (err) {
    sendErrorEmailWithCooldown("processEmailQueue", err, {});
  }
}

function installQueueTrigger() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "processEmailQueue") {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  Logger.log("Queue write DINONAKTIFKAN; trigger lama dihapus: " + removed);
  return { success: true, disabled: true, removed: removed };
}


// ============================================================
// 18. onEdit TRIGGER [V6.0 + V6.2]
// ============================================================
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheetName = e.range.getSheet().getName();
    const affected = ["Stock CV", "Stock PT", "Stock Bahan Baku", "Stock awal", "purchase order"].indexOf(sheetName) >= 0 || Object.keys(SHEET_CONFIG).indexOf(sheetName) >= 0;
    if (!affected) return;
    // onEdit: invalidasi cache + dirty + stempel waktu. Sinkronisasi divisi real-time bila stok berubah.
    clearMasterCache();
    markDataDirty_(sheetName);
    updateLastUpdateTimestamp();
    if (sheetName === "Stock CV" || sheetName === "Stock PT" || sheetName === "Stock Bahan Baku" || sheetName === "Stock awal") {
      try { syncDivisionStockLightweight_(); } catch (divErr) { console.error("onEdit sync divisi: " + divErr.message); }
    }
    if (sheetName === "Barang masuk" || sheetName === "purchase order") {
      try { refreshDashboardPOSection_({ renderCharts: false, lightweight: true }); } catch (poErr) { console.error("Dashboard PO ringan gagal: " + poErr.message); }
    }
    // Setiap perubahan sumber Dashboard juga memperbarui ringkasan/chart-data tanpa
    // membuat ulang chart. Penulisan transaksi API tetap aman; interval 5 menit
    // menjadi jalur sinkronisasi kedua untuk perubahan yang dibuat oleh PWA/API. 
    if (!isDashboardSyncPatchEnabled_() &&
        ["Stock CV", "Stock PT", "Stock Bahan Baku", "Stock awal", "Barang masuk", "purchase order", "Barang keluar", "Barang Rusak"].indexOf(sheetName) >= 0) {
      try { refreshDashboardLive_(); } catch (dashErr) { console.error("Dashboard live gagal: " + dashErr.message); }
    }
  } catch (err) { console.error("onEdit ringan gagal: " + err.message); }
}


// ============================================================
// 18.5 LIGHTWEIGHT CACHE / MAINTENANCE
// ============================================================
function markDataDirty_(source) {
  try {
    PropertiesService.getScriptProperties().setProperty(DIRTY_FLAG_KEY, JSON.stringify({ dirtyAt: new Date().toISOString(), source: source || "unknown" }));
  } catch (e) {}
}

function clearDataDirty_() {
  try { PropertiesService.getScriptProperties().deleteProperty(DIRTY_FLAG_KEY); } catch (e) {}
}

function isDataDirty_() {
  try { return !!PropertiesService.getScriptProperties().getProperty(DIRTY_FLAG_KEY); } catch (e) { return false; }
}

function maintenanceCleanup(force) {
  const props = PropertiesService.getScriptProperties();
  const now = Date.now();
  let last = 0;
  try { last = Number(props.getProperty(CACHE_MAINTENANCE_KEY) || 0); } catch (e) {}
  if (!force && last && now - last < 6 * 60 * 60 * 1000) {
    return { success: true, skipped: true, reason: "maintenance interval belum jatuh tempo" };
  }
  const removed = [];
  try {
    CacheService.getScriptCache().removeAll(["masterMap", "batchResult_maintenance", "dashboardData", "stockSnapshot"]);
  } catch (e) {}
  // CacheService tidak menyediakan enumerasi semua key; key dinamis akan expire sendiri.
  // Yang bisa dibersihkan dengan aman adalah metadata durable yang memang bersifat sementara.
  try {
    const all = props.getProperties();
    Object.keys(all).forEach(function(key) {
      if (key.indexOf("emailSent_") !== 0 && key.indexOf("emailQueueClaim_") !== 0) return;
      const raw = all[key];
      let ts = Number(raw);
      if (!ts) { try { ts = new Date(JSON.parse(raw).claimedAt).getTime(); } catch (e) {} }
      if (ts && now - ts > 7 * 24 * 60 * 60 * 1000) { props.deleteProperty(key); removed.push(key); }
    });
  } catch (e) {}
  try { props.setProperty(CACHE_MAINTENANCE_KEY, String(now)); } catch (e) {}
  return { success: true, removedProperties: removed.length, cacheService: "TTL-based; static keys invalidated", dirty: isDataDirty_(), ranAt: new Date(now).toISOString() };
}

// ============================================================
// 19. SETUP ENVIRONMENT [V6.3 UNIFIED]
// ============================================================
function setupEnvironment() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Jalankan dari dalam spreadsheet.");

  const props = PropertiesService.getScriptProperties();
  props.setProperty("SPREADSHEET_ID", ss.getId());
  console.log("SPREADSHEET_ID = " + ss.getId() + " (" + ss.getName() + ")");
  try { setupConfigSheet(); } catch (configErr) { console.error("Config sheet gagal dibuat: " + configErr.message); }
  try { getIdempotencyLedgerSheet_(); } catch (ledgerErr) { console.error("Idempotency Ledger gagal dibuat: " + ledgerErr.message); }
  try { formatOperationalSheets_(); } catch (visualErr) { console.error("Format sheet operasional gagal: " + visualErr.message); }

  if (!props.getProperty("API_SECRET")) {
    const secret = Utilities.getUuid().replace(/-/g,"") + Utilities.getUuid().replace(/-/g,"").substring(0,16);
    props.setProperty("API_SECRET", secret);
    console.log("API_SECRET baru dibuat dan disimpan; nilai secret tidak dicetak ke log.");
  } else {
    console.log("API_SECRET sudah ada.");
  }

  // Hapus trigger lama
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (["sendDailyStockReport","weeklyPOAutomation","logDailySnapshot","processEmailQueue","sendWeeklyPOReport","refreshDashboard","refreshAllData","onEdit"].indexOf(fn) >= 0) {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Setup trigger baru
  ScriptApp.newTrigger("sendDailyStockReport").timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger("weeklyPOAutomation").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  ScriptApp.newTrigger("logDailySnapshot").timeBased().everyDays(1).atHour(23).create();
  // processEmailQueue sengaja tidak dijadwalkan; seluruh queue write fail-closed.
  // Dashboard live ringan setiap 5 menit; interval resmi Apps Script mendukung 1/5/10/15/30 menit.
  ScriptApp.newTrigger("refreshAllData").timeBased().everyMinutes(5).create();
  // Installable onEdit trigger agar perubahan manual pada semua sumber stok
  // dapat menjalankan sinkronisasi yang membutuhkan otorisasi SpreadsheetApp.
  ScriptApp.newTrigger("onEdit").forSpreadsheet(ss).onEdit().create();

  _cachedSS = null;
  _resolvedSpreadsheetId = null;
  updateLastUpdateTimestamp();
  // Setup tidak lagi memaksa rebuild Dashboard/Data Stok Per Divisi.
  // Format awal tetap tersedia melalui maintenance/refresh manual.
  try { maintenanceCleanup(true); } catch (maintenanceErr) { console.error("Maintenance awal gagal: " + maintenanceErr.message); }

  const activeMonth = getActiveMonth();
  console.log("=== setupEnvironment BACKEND GudangAI-69 " + BACKEND_VERSION + " SELESAI ===");
  console.log("Spreadsheet: " + ss.getName());
  console.log("Bulan aktif: " + activeMonth.nama + " " + activeMonth.tahun);
  console.log("Trigger: sendDailyStockReport(07:00), weeklyPOAutomation(Senin 08:00), logDailySnapshot(23:00), queue write disabled, refreshAllData(15min)");
  try {
    const masterNow = getAllStock("ALL");
    console.log("Total master data aktual: " + (masterNow && masterNow.count != null ? masterNow.count : 0));
  } catch (countErr) { console.log("Total master data aktual: gagal dibaca — " + countErr.message); }

  return { success: true, spreadsheetId: ss.getId(), spreadsheetName: ss.getName(), activeMonth: activeMonth,
           title: APP_TITLE, configSheet: CONFIG_SHEET_NAME,
           message: "Backend V6.5 optimized siap. Trigger dipertahankan; jalur transaksi/onEdit tidak lagi rebuild struktur Dashboard/Data Stok Per Divisi." };
}

function generateRandomSecret() {
  return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "").substring(0, 16);
}

function resetApiSecret() {
  const newSecret = generateRandomSecret();
  PropertiesService.getScriptProperties().setProperty("API_SECRET", newSecret);
  Logger.log("API_SECRET direset; nilai secret tidak dicetak ke log.");
  return newSecret;
}


// ============================================================
// 20. TEST FUNCTIONS [V6.0]
// ============================================================
function testAddTransaction(executeApproved) {
  const request = { sheet: "Barang masuk", entitas: "CV", kodeBarang: "CV-0001", qty: 1,
    tanggal: Utilities.formatDate(new Date(), TIMEZONE, DATE_FORMAT), keterangan: "TEST DRY-RUN V6.4.4+OUTBOX" };
  if (executeApproved === true) {
    request.transactionId = "TEST-" + Utilities.getUuid();
    request.nonce = request.transactionId;
    request.queueApproved = true;
    request._syncMode = true;
    return syncTransaction(request);
  }
  const result = validateTransactionRequest_(request, { requireDate: true, requireEntity: true });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testConnection() {
  const ss = getSS();
  const month = getActiveMonth();
  Logger.log("Koneksi OK: " + ss.getName() + " | Bulan: " + month.nama + " " + month.tahun);
  return { success: true, name: ss.getName(), month: month, version: BACKEND_VERSION };
}


// ============================================================
// END OF FILE — BACKEND GudangAI-69 V6.4 — UNIFIED
// ============================================================


// ============================================================
// 24. V6.5.3 SYNC HARDENING — CONNECTION / DELTA / STATUS PO
// ============================================================
function sha256Short_(text) {
  try {
    return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text))).substring(0, 32);
  } catch (e) { return ""; }
}

function setSyncVersions_(masterVersion, stockVersion, isoTime) {
  try {
    const props = PropertiesService.getScriptProperties();
    if (masterVersion) props.setProperty(MASTER_VERSION_KEY, masterVersion);
    if (stockVersion) props.setProperty(STOCK_VERSION_KEY, stockVersion);
    if (isoTime) props.setProperty(LAST_UPDATE_ISO_KEY, isoTime);
  } catch (e) {}
}

function getCachedSyncVersions_() {
  const props = PropertiesService.getScriptProperties();
  return { masterVersion: props.getProperty(MASTER_VERSION_KEY) || null, stockVersion: props.getProperty(STOCK_VERSION_KEY) || null, lastUpdateISO: props.getProperty(LAST_UPDATE_ISO_KEY) || null };
}

function getHealthStatus_(body) {
  const now = new Date();
  const versions = getCachedSyncVersions_();
  let ledger = { status: "UNKNOWN", rows: 0 };
  try {
    const sh = getSS().getSheetByName(IDEMPOTENCY_SHEET_NAME);
    ledger = { status: sh ? "OK" : "MISSING", rows: sh ? Math.max(0, sh.getLastRow() - OPS_HEADER_ROW) : 0 };
  } catch (e) { ledger = { status: "ERROR", rows: 0, error: e.message }; }
  return { success: true, status: "OK", code: "HEALTHY", version: BACKEND_VERSION, title: APP_TITLE,
    requestId: body && body.requestId || null, spreadsheet: getSS().getName(), activePeriod: getActiveMonth(),
    serverTime: now.toISOString(), lastUpdate: getLastUpdateTimestamp(), lastUpdateISO: versions.lastUpdateISO || now.toISOString(),
    masterVersion: versions.masterVersion, stockVersion: versions.stockVersion, ledger: ledger,
    sync: { heartbeatSeconds: SYNC_HEARTBEAT_INTERVAL_SEC, circuitFailureThreshold: CIRCUIT_FAILURE_THRESHOLD, circuitWindowMs: CIRCUIT_FAILURE_WINDOW_MS } };
}

function computeDeterministicVersions_(items) {
  const rows = (items || []).map(function(i) {
    return { kode: String(i.kode || "").trim(), nama: String(i.nama || "").trim(), satuan: String(i.satuan || "").trim(), divisi: String(i.divisi || "").trim(), entitas: String(i.entitas || "").trim().toUpperCase(), stockAman: Number(i.stockAman) || 0, stockAkhir: Number(i.stockAkhir) || 0, stockValue: Number(i.stockValue || i.nilaiStok || 0) || 0 };
  }).sort(function(a,b) { return (a.entitas + "|" + a.kode).localeCompare(b.entitas + "|" + b.kode); });
  return { masterVersion: sha256Short_(JSON.stringify(rows.map(function(i){return [i.entitas,i.kode,i.nama,i.satuan,i.divisi,i.stockAman];}))), stockVersion: sha256Short_(JSON.stringify(rows.map(function(i){return [i.entitas,i.kode,i.stockAkhir,i.stockValue];}))) };
}

function getStockDelta(body) {
  const sinceRaw = String(body && (body.sinceTimestamp || body.since || "") || "").trim();
  if (!sinceRaw) return { success: false, status: "REJECTED", code: "SINCE_TIMESTAMP_REQUIRED", error: "sinceTimestamp wajib diisi untuk delta-sync." };
  const since = new Date(sinceRaw);
  if (isNaN(since.getTime())) return { success: false, status: "REJECTED", code: "INVALID_TIMESTAMP", error: "sinceTimestamp tidak valid." };
  const entitas = String(body && body.entitas || "ALL").toUpperCase();
  const log = getSS().getSheetByName("System Log");
  const affected = {};
  if (log && log.getLastRow() >= OPS_DATA_START_ROW) {
    const rows = log.getRange(OPS_DATA_START_ROW,1,log.getLastRow()-OPS_HEADER_ROW,6).getValues();
    rows.forEach(function(r) {
      const ts = new Date(r[0]);
      if (isNaN(ts.getTime()) || ts <= since) return;
      const action = String(r[2] || "");
      if (action !== "WRITE_TRANSACTION") return;
      let d = {}; try { d = JSON.parse(String(r[4] || "{}")); } catch(e) {}
      const e = String(d.entitas || "").toUpperCase();
      const k = String(d.kode || d.kodeBarang || "").trim();
      if (!k || (entitas !== "ALL" && e !== entitas)) return;
      affected[(e || "ALL") + "|" + k] = { entitas: e || null, kode: k };
    });
  }
  const items = [];
  Object.keys(affected).forEach(function(key) {
    const a = affected[key];
    const found = getStockByCode(a.kode, a.entitas || undefined);
    if (found && found.success) items.push(found);
  });
  items.sort(function(a,b){ return (String(a.entitas)+"|"+String(a.kode)).localeCompare(String(b.entitas)+"|"+String(b.kode)); });
  const versions = getCurrentSyncVersions_();
  return { success: true, status: "OK", mode: "DELTA", sinceTimestamp: since.toISOString(), generatedAt: new Date().toISOString(), count: items.length, items: items, masterVersion: versions.masterVersion, stockVersion: versions.stockVersion, lastUpdate: getLastUpdateTimestamp() };
}

function getPOInfoFromHeader_(sheet) {
  // Pembacaan sederhana & efisien: tanggal hanya dari baris 4, No PO dari baris 4/5.
  // Tidak bergantung pada kode unik rumit di keterangan untuk menentukan tanggal PO.
  const width = Math.max(9, sheet.getLastColumn());
  const dateRow = sheet.getRange(PO_DATE_ROW, 1, 1, width).getDisplayValues()[0];
  const headerRow = sheet.getRange(PO_HEADER_ROW, 1, 1, width).getDisplayValues()[0];
  let tanggal = null;
  let noPO = null;

  // 1) Tanggal PO = baris 4 saja
  for (let i = 0; i < dateRow.length; i++) {
    const cell = String(dateRow[i] || "").trim();
    if (!cell) continue;
    const labeled = cell.match(/TANGGAL\s*:\s*(.+)/i);
    if (labeled) {
      tanggal = parseTransactionDate_(labeled[1].trim());
      if (tanggal) break;
    }
    const direct = parseTransactionDate_(cell);
    if (direct) { tanggal = direct; break; }
  }

  // 2) No PO dari baris 4 atau 5 (teks "NO PO : xxx")
  const sources = dateRow.concat(headerRow);
  for (let i = 0; i < sources.length; i++) {
    const cell = String(sources[i] || "");
    const m = cell.match(/NO\s*PO\s*[:#\-]?\s*([A-Za-z0-9._\/\-]+)/i);
    if (m) { noPO = String(m[1]).trim(); break; }
  }

  return {
    noPO: noPO,
    tanggal: tanggal,
    weekKey: tanggal ? getWeekKey_(tanggal) : getWeekKey_(new Date()),
    tanggalText: tanggal ? Utilities.formatDate(tanggal, TIMEZONE, DATE_FORMAT) : null
  };
}

function normalizePONameKey_(value) {
  return String(value == null ? '' : value).toLowerCase().replace(/[“”‘’]/g, '').replace(/\s+/g, ' ').trim();
}

function getPORequestStatus(body) {
  const requestId = String(body && (body.requestId || body.transactionId) || "").trim();
  if (!requestId) return { success: false, status: "REJECTED", code: "IDENTITY_REQUIRED", error: "requestId wajib diisi." };
  const rec = findIdempotencyRecord_(requestId, requestId);
  if (!rec || rec.operation !== "writePurchaseOrder") {
    return { success: false, status: "NOT_FOUND", code: "PO_REQUEST_NOT_FOUND", requestId: requestId, writeOccurred: false };
  }
  const details = String(rec.details || "");
  let payload = null;
  try { payload = JSON.parse(details); } catch (e) {}
  return { success: rec.status === "APPLIED" || rec.status === "COMPLETED", status: rec.status || "UNKNOWN", code: rec.errorCode || "PO_LEDGER_FOUND", requestId: requestId, writeOccurred: rec.writeOccurred, row: rec.dataRow || null, record: rec, result: payload };
}

function recordPOArrival(body) {
  body = body || {};
  const requestId = String(body.requestId || "").trim();
  const transactionId = String(body.transactionId || (requestId ? "POARR-" + requestId : "")).trim();
  const qty = Number(body.qtyDatangBaru != null ? body.qtyDatangBaru : body.qtyDatang);
  if (!requestId) return { success: false, status: "REJECTED", code: "REQUEST_ID_REQUIRED", error: "requestId wajib untuk kedatangan PO." };
  if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) return { success: false, status: "REJECTED", code: "INVALID_QTY", error: "Qty kedatangan harus lebih dari 0 dan <= " + MAX_QTY + "." };

  const ss = getSS();
  const po = ss.getSheetByName("purchase order");
  if (!po) return { success: false, status: "REJECTED", code: "PO_SHEET_NOT_FOUND", error: "Sheet purchase order tidak ditemukan." };
  const last = po.getLastRow();
  if (last < PO_DATA_START_ROW) return { success: false, status: "REJECTED", code: "PO_EMPTY", error: "Tabel purchase order kosong." };

  const rows = po.getRange(PO_DATA_START_ROW, PO_DATA_START_COL, last - PO_DATA_START_ROW + 1, PO_DATA_NUM_COLS).getDisplayValues();
  const wantedNo = body.itemNo == null ? "" : String(body.itemNo).trim();
  const wantedName = normalizePONameKey_(body.nama || "");
  let found = null;
  rows.forEach(function(r, idx) {
    if (found) return;
    const no = String(r[0] || "").trim();
    const nama = String(r[1] || "").trim();
    if (!nama) return;
    if ((wantedNo && no === wantedNo) || (wantedName && normalizePONameKey_(nama) === wantedName)) {
      found = { row: idx + PO_DATA_START_ROW, no: no || String(idx + 1), nama: nama, poCV: toNumber_(r[4]), poPT: toNumber_(r[5]), total: Math.max(0, toNumber_(r[6]) || toNumber_(r[4]) + toNumber_(r[5])) };
    }
  });
  if (!found) return { success: false, status: "REJECTED", code: "PO_ITEM_NOT_FOUND", error: "Item PO tidak ditemukan." };

  const entityInfo = normalizeEntityGroup_(body.entitas || body.entity, body.kode || body.kodeBarang);
  let entitas = entityInfo.valid ? entityInfo.entitas : "";
  if (!entitas) {
    if (found.poCV > 0 && found.poPT <= 0) entitas = "CV";
    else if (found.poPT > 0 && found.poCV <= 0) entitas = "PT";
    else return { success: false, status: "REJECTED", code: "PO_ENTITY_REQUIRED", error: "Item PO memiliki kebutuhan CV dan PT. Pilih entitas kedatangan: CV atau PT." };
  }
  const entityPOQty = entitas === "CV" ? found.poCV : found.poPT;
  if (entityPOQty <= 0) return { success: false, status: "REJECTED", code: "PO_ENTITY_NOT_ELIGIBLE", error: "Item PO tidak memiliki kebutuhan " + entitas + "." };

  let kode = String(body.kode || body.kodeBarang || "").trim();
  if (!kode) {
    const all = getAllStock(entitas);
    const candidates = all.success ? all.items.filter(function(it) { return normalizePONameKey_(it.nama) === normalizePONameKey_(found.nama); }) : [];
    if (candidates.length !== 1) return { success: false, status: "REJECTED", code: "PO_CODE_AMBIGUOUS", error: "Kode master untuk item PO ambigu/tidak ditemukan pada " + entitas + "." };
    kode = candidates[0].kode;
  }
  const stock = getStockByCode(kode, entitas);
  if (!stock || !stock.success) return { success: false, status: "REJECTED", code: "PO_CODE_ENTITY_MISMATCH", error: "Kode item tidak cocok dengan entitas " + entitas + "." };

  const tx = addTransaction({
    action: "addTransaction", operation: "addTransaction", sheet: "Barang masuk", entitas: entitas, kodeBarang: kode, qty: qty,
    tanggal: body.tanggal || Utilities.formatDate(new Date(), TIMEZONE, DATE_FORMAT),
    keterangan: "DATANG PO " + (getPOInfoFromHeader_(po).noPO || "-") + " [ITEM : " + String(found.no).padStart(2, "0") + "]",
    requestId: requestId, transactionId: transactionId, nonce: String(body.nonce || transactionId), queueApproved: true, client: body.client || {}
  });
  if (!tx || tx.success !== true || tx.writeOccurred !== true) return Object.assign({}, tx || { success: false }, { code: (tx && tx.code) || "PO_ARRIVAL_WRITE_FAILED" });
  return { success: true, status: "APPLIED", code: "PO_ARRIVAL_APPLIED", itemNo: found.no, nama: found.nama, kode: kode, entitas: entitas, qtyDatangBaru: qty, transactionId: tx.transactionId, readBack: tx.readBack || null, message: "Kedatangan PO tercatat sebagai Barang masuk." };
}

function getStatusPO() {
  const ss = getSS();
  const po = ss.getSheetByName('purchase order');
  const masuk = ss.getSheetByName('Barang masuk');
  if (!po) return { success: false, status: 'ERROR', code: 'PO_SHEET_NOT_FOUND', error: "Sheet 'purchase order' tidak ditemukan" };
  if (!masuk) return { success: false, status: 'ERROR', code: 'INBOUND_SHEET_NOT_FOUND', error: "Sheet 'Barang masuk' tidak ditemukan" };

  // Tanggal PO dibaca sederhana dari baris 4 (tanpa kode unik rumit).
  const info = getPOInfoFromHeader_(po);
  const noPO = info.noPO;
  const last = po.getLastRow();
  const rows = last >= PO_DATA_START_ROW
    ? po.getRange(PO_DATA_START_ROW, PO_DATA_START_COL, last - PO_DATA_START_ROW + 1, PO_DATA_NUM_COLS).getDisplayValues()
    : [];
  const allStockForPO_ = getAllStock("ALL").items || [];

  // Peta kedatangan:
  // 1) Primer: "No : {noPO}[ ITEM : nn ]" di keterangan Barang masuk (paling akurat).
  // 2) Cadangan sederhana: keterangan mengandung No PO + nama barang (tanpa kode unik item).
  const arrivalsByIndex = {};
  const arrivalsByName = {};
  if (masuk.getLastRow() >= 4) {
    const a = masuk.getRange(4, 2, masuk.getLastRow() - 3, 6).getDisplayValues();
    const safeNoPO = noPO ? String(noPO).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
    const reIndex = safeNoPO
      ? new RegExp('No\\s*:?\\s*' + safeNoPO + '\\s*\\[\\s*ITEM\\s*:\\s*([0-9]+)\\s*\\]', 'i')
      : null;
    a.forEach(function(r) {
      const qty = Math.max(0, toNumber_(r[4]));
      const ket = String(r[5] || '').trim();
      const namaMasuk = String(r[2] || '').trim(); // kolom Nama di sheet transaksi (display)
      if (!ket || qty <= 0) return;
      if (reIndex) {
        const m = ket.match(reIndex);
        if (m) {
          const idx = Number(m[1]);
          if (idx > 0) {
            arrivalsByIndex[idx] = (arrivalsByIndex[idx] || 0) + qty;
            return;
          }
        }
      }
      // Cadangan: No PO ada di keterangan (atau NoPO kosong) + nama barang cocok.
      if (noPO && ket.toLowerCase().indexOf(String(noPO).toLowerCase()) < 0) return;
      if (namaMasuk) {
        const key = normalizePONameKey_(namaMasuk);
        if (key) arrivalsByName[key] = (arrivalsByName[key] || 0) + qty;
      }
    });
  }

  const items = [];
  let totalAktif = 0, totalKonfirmasi = 0, itemMenunggu = 0, itemSebagian = 0, itemSelesai = 0;
  let totalKonfirmasiQty = 0, totalPOQty = 0;
  rows.forEach(function(r, idx) {
    if (!String(r.join('')).trim()) return;
    const no = Number(r[0]) || idx + 1;
    const nama = String(r[1] || '').trim();
    const poCV = toNumber_(r[4]);
    const poPT = toNumber_(r[5]);
    const total = Math.max(0, toNumber_(r[6]) || poCV + poPT);
    if (!nama || total <= 0) return;
    const byIndex = arrivalsByIndex[no] || 0;
    const byName = arrivalsByName[normalizePONameKey_(nama)] || 0;
    // Utamakan index; jika 0, pakai cadangan nama (lebih sederhana, tetap dibatasi No PO).
    const datang = Math.min(total, Math.max(0, byIndex > 0 ? byIndex : byName));
    const belumDatang = Math.max(0, total - datang);
    const status = datang <= 0 ? 'MENUNGGU' : (datang < total ? 'SEBAGIAN' : 'SELESAI');
    totalPOQty += total;
    totalKonfirmasiQty += datang;
    if (status === 'SELESAI') { itemSelesai++; totalKonfirmasi++; }
    else if (status === 'SEBAGIAN') { itemSebagian++; totalAktif++; }
    else { itemMenunggu++; totalAktif++; }
    const cvCandidates = allStockForPO_.filter(function(it) { return it.entitas === "CV" && normalizePONameKey_(it.nama) === normalizePONameKey_(nama); });
    const ptCandidates = allStockForPO_.filter(function(it) { return it.entitas === "PT" && normalizePONameKey_(it.nama) === normalizePONameKey_(nama); });
    items.push({
      no: no, nama: nama, totalPO: total, poCV: poCV, poPT: poPT, kodeCV: cvCandidates.length === 1 ? cvCandidates[0].kode : null, kodePT: ptCandidates.length === 1 ? ptCandidates[0].kode : null,
      qtyDatang: datang, qtyBelumDatang: belumDatang, status: status,
      // kodeUnik tetap disediakan untuk label, tetapi pembacaan tanggal tidak bergantung padanya.
      kodeUnik: noPO ? ('No : ' + noPO + '[ ITEM : ' + String(no).padStart(2, '0') + ' ]') : null,
      progressPct: total ? Math.min(100, Math.round(datang / total * 1000) / 10) : 0
    });
  });

  return {
    success: true, status: 'OK', timestamp: new Date().toISOString(), noPO: noPO,
    tanggalPO: info.tanggal ? Utilities.formatDate(info.tanggal, TIMEZONE, DATE_FORMAT) : (info.tanggalText || null),
    weekKey: info.weekKey,
    summary: {
      totalAktif: totalAktif, totalKonfirmasi: totalKonfirmasi, itemMenunggu: itemMenunggu,
      itemSebagian: itemSebagian, itemSelesai: itemSelesai, totalItem: items.length,
      totalPOQty: totalPOQty, totalKonfirmasiQty: totalKonfirmasiQty,
      totalSisaQty: Math.max(0, totalPOQty - totalKonfirmasiQty)
    },
    items: items
  };
}

function dashboardClearPOArea_(sheet, startRow, endRow) {
  const rows = Math.max(0, endRow - startRow + 1);
  if (!rows) return;
  const cols = 13;
  if (sheet.getMaxRows() < endRow) sheet.insertRowsAfter(sheet.getMaxRows(), endRow - sheet.getMaxRows());
  sheet.getRange(startRow, 1, rows, cols).breakApart().clearContent();
}

function renderPOStatusBlock_(sheet, topRow, title, subtitle, data, items, startCol) {
  const cols = 6;
  const col = Number(startCol || 1);
  sheet.getRange(topRow, col, 1, cols).merge().setValue(title).setFontWeight('bold').setFontSize(12).setFontColor('#FFFFFF').setBackground(UI_PRIMARY).setHorizontalAlignment('left');
  sheet.getRange(topRow + 1, col, 1, cols).merge().setValue(subtitle).setFontSize(9).setFontColor(UI_TEXT).setBackground(UI_PRIMARY_LIGHT).setHorizontalAlignment('left').setWrap(true);
  sheet.getRange(topRow + 3, col, 1, cols).setValues([['NO', 'NAMA BARANG', 'TOTAL QTY', 'DATANG', 'BELUM DATANG', 'STATUS PO']])
    .setFontWeight('bold').setFontSize(9).setFontColor('#FFFFFF').setBackground(UI_PRIMARY).setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true)
    .setBorder(true, true, true, true, true, true, UI_BORDER, SpreadsheetApp.BorderStyle.SOLID);
  const visible = (items || []).slice(0, PO_DASHBOARD_MAX_VISIBLE_ROWS);
  const rows = visible.map(function(x) { return [x.no, x.nama, x.totalPO || 0, x.qtyDatang || 0, x.qtyBelumDatang != null ? x.qtyBelumDatang : Math.max(0, (x.totalPO || 0) - (x.qtyDatang || 0)), x.status || 'MENUNGGU']; });
  if (rows.length) {
    sheet.getRange(topRow + 4, col, rows.length, cols).setValues(rows);
    const bodyRange = sheet.getRange(topRow + 4, col, rows.length, cols);
    bodyRange.setFontColor(UI_TEXT).setVerticalAlignment('middle')
      .setBorder(true, true, true, true, true, true, UI_BORDER, SpreadsheetApp.BorderStyle.SOLID);
    for (let i = 0; i < rows.length; i++) {
      sheet.getRange(topRow + 4 + i, col, 1, cols).setBackground(i % 2 === 0 ? UI_ROW_ALT : '#FFFFFF');
    }
    sheet.getRange(topRow + 4, col, rows.length, 1).setHorizontalAlignment('center');
    sheet.getRange(topRow + 4, col + 2, rows.length, 3).setHorizontalAlignment('center').setNumberFormat('#,##0');
    sheet.getRange(topRow + 4, col + 5, rows.length, 1).setHorizontalAlignment('center').setFontWeight('bold');
  }
  sheet.setRowHeight(topRow, 26); sheet.setRowHeight(topRow + 1, 23); sheet.setRowHeight(topRow + 3, 28);
  return topRow + 4 + Math.max(1, rows.length) - 1;
}

function renderPODonutChart_(sheet, chartStartRow, title, summary, chartTitle) {
  // Donut memakai U:V agar tidak menimpa sumber grafik divisi di P:S.
  const col = 21;
  if (sheet.getMaxColumns() < col + 2) sheet.insertColumnsAfter(sheet.getMaxColumns(), col + 2 - sheet.getMaxColumns());
  const rows = [['STATUS PO', 'QTY'], ['SELESAI', Number(summary.itemSelesai || 0)], ['SEBAGIAN', Number(summary.itemSebagian || 0)], ['MENUNGGU', Number(summary.itemMenunggu || 0)]];
  sheet.getRange(chartStartRow, col, rows.length, 2).setValues(rows);
  try { sheet.hideColumns(col, 2); } catch (e) {}
  removeChartByTitle_(sheet, chartTitle);
  const chart = sheet.newChart().setChartType(Charts.ChartType.PIE).addRange(sheet.getRange(chartStartRow, col, 4, 2))
    .setOption('title', title).setOption('pieHole', 0.55).setOption('legend', {position:'right'})
    .setOption('width', 420).setOption('height', 240).setPosition(chartStartRow, 8, 0, 0).build();
  sheet.insertChart(chart);
}

function refreshDashboardPOSection_(options) {
  options = options || { renderCharts: true };
  const ss = getSS();
  const sh = ss.getSheetByName('Dashboard');
  if (!sh) return { success: false, code: 'DASHBOARD_NOT_FOUND', error: 'Sheet Dashboard tidak ditemukan' };
  if (isDashboardSyncPatchEnabled_() && options._dashboardPatchDelegated !== true) {
    return dashboardSyncPatchRefresh_({ reason: "legacy-refreshDashboardPOSection" });
  }
  const data = getStatusPO();
  if (!data.success) return data;
  const previous = getPreviousPOStatus_();
  const currentTop = PO_SECTION_CURRENT_ROW;
  const currentCount = Math.min(PO_DASHBOARD_MAX_VISIBLE_ROWS, Math.max(1, (data.items || []).length));
  const currentEnd = currentTop + 4 + currentCount - 1;
  // Minggu Lalu WAJIB dimulai setelah blok Minggu Ini.
  // Sebelumnya previousTop = currentTop (31), sehingga tabel Minggu Lalu
  // menimpa tabel Minggu Ini.
  const previousTop = currentEnd + 3;
  const previousItems = previous.items || [];
  const previousCount = Math.min(PO_DASHBOARD_MAX_VISIBLE_ROWS, Math.max(1, previousItems.length));
  const previousEnd = previousTop + 4 + previousCount - 1;
  const chartStart = previousEnd + 3;
  const clearEnd = Math.max(chartStart + 20, Math.min(sh.getMaxRows(), chartStart + 80));
  dashboardClearPOArea_(sh, currentTop, clearEnd);

  const currentSubtitle = 'Periode: ' + (data.tanggalPO || data.weekKey || '-') + ' • No PO: ' + (data.noPO || '-') + ' • Total Qty: ' + (data.summary.totalPOQty || 0) + ' • Datang: ' + (data.summary.totalKonfirmasiQty || 0) + ' • Belum Datang: ' + (data.summary.totalSisaQty || 0);
  renderPOStatusBlock_(sh, currentTop, '4 STATUS PO MINGGU INI', currentSubtitle, data, data.items, 1);

  const previousSubtitle = previous.weekKey ? 'Periode: ' + previous.weekKey + ' • No PO: ' + (previous.noPO || '-') + ' • Data arsip minggu lalu' : 'Belum ada arsip PO minggu lalu.';
  renderPOStatusBlock_(sh, previousTop, '5 STATUS PO MINGGU LALU', previousSubtitle, previous, previousItems, 8);

  [60, 300, 100, 100, 120, 120].forEach(function(w, i) { sh.setColumnWidth(i + 1, w); });
  [60, 300, 100, 100, 120, 120].forEach(function(w, i) { sh.setColumnWidth(i + 8, w); });
  sh.setColumnWidth(7, 24);
  sh.getRange(currentTop, 1, Math.max(1, previousEnd - currentTop + 1), 13).setVerticalAlignment('middle');
  return { success: true, status: 'OK', sectionCurrent: 4, sectionPrevious: 5, noPO: data.noPO,
    currentCount: (data.items || []).length, previousCount: previousItems.length, chartStartRow: chartStart,
    chartsRendered: options.renderCharts !== false, updatedAt: new Date().toISOString() };
}

function getCurrentSyncVersions_() {
  const all=getAllStock("ALL");
  if(!all || !all.success) return getCachedSyncVersions_();
  const versions=computeDeterministicVersions_(all.items||[]);
  setSyncVersions_(versions.masterVersion, versions.stockVersion, new Date().toISOString());
  return versions;
}

function getSyncMetrics() {
  const props=PropertiesService.getScriptProperties(); let metrics={unknown24h:0,retries24h:0,writes24h:0,avgWriteMs24h:0};
  try { const raw=props.getProperty(SYNC_METRICS_KEY); if(raw) metrics=Object.assign(metrics,JSON.parse(raw)); } catch(e) {}
  return {success:true,status:"OK",generatedAt:new Date().toISOString(),metrics:metrics};
}

function recordSyncMetric_(result) {
  try {
    const props=PropertiesService.getScriptProperties(); let m={unknown24h:0,retries24h:0,writes24h:0,totalWriteMs24h:0,avgWriteMs24h:0};
    const raw=props.getProperty(SYNC_METRICS_KEY); if(raw) m=Object.assign(m,JSON.parse(raw));
    if(result && result.status==="UNKNOWN") m.unknown24h++;
    if(result && result.writeOccurred) { m.writes24h++; m.retries24h += Number(result.retries)||0; m.totalWriteMs24h += Number(result.execMs)||0; m.avgWriteMs24h = m.writes24h ? Math.round(m.totalWriteMs24h/m.writes24h) : 0; }
    props.setProperty(SYNC_METRICS_KEY,JSON.stringify(m));
  } catch(e) {}
}

function getConnectionCircuitState_() {
  const key="GUDANGAI_CIRCUIT_STATE"; let state={failures:[],openUntil:0};
  try { const raw=PropertiesService.getScriptProperties().getProperty(key); if(raw) state=Object.assign(state,JSON.parse(raw)); } catch(e) {}
  const now=Date.now(); state.failures=(state.failures||[]).filter(function(ts){return now-ts<CIRCUIT_FAILURE_WINDOW_MS;});
  if(state.openUntil && now>=state.openUntil) state.openUntil=0;
  return state;
}

function noteConnectionFailure_() {
  try { const props=PropertiesService.getScriptProperties(), state=getConnectionCircuitState_(), now=Date.now(); state.failures.push(now); if(state.failures.length>=CIRCUIT_FAILURE_THRESHOLD) state.openUntil=now+CIRCUIT_FAILURE_WINDOW_MS; props.setProperty("GUDANGAI_CIRCUIT_STATE",JSON.stringify(state)); } catch(e) {}
}

function noteConnectionSuccess_() {
  try { PropertiesService.getScriptProperties().deleteProperty("GUDANGAI_CIRCUIT_STATE"); } catch(e) {}
}

// ============================================================
// DASHBOARD_SYNC_PATCH_V1 — ISOLATED DASHBOARD ORCHESTRATOR
// ============================================================
const DASHBOARD_SYNC_PATCH_VERSION = "DASHBOARD_SYNC_PATCH_V1";
const DASHBOARD_SYNC_PATCH_FLAG = "GUDANGAI_DASHBOARD_SYNC_PATCH_ENABLED";
const DASHBOARD_SYNC_PATCH_LAST = "GUDANGAI_DASHBOARD_SYNC_PATCH_LAST";

function isDashboardSyncPatchEnabled_() {
  try { return PropertiesService.getScriptProperties().getProperty(DASHBOARD_SYNC_PATCH_FLAG) === "1"; }
  catch (e) { return false; }
}

function dashboardSyncPatchDisableConflictingTriggers_() {
  const conflicting = ["refreshAllData", "refreshDashboard"];
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (conflicting.indexOf(t.getHandlerFunction()) >= 0) { ScriptApp.deleteTrigger(t); removed++; }
  });
  return removed;
}

function dashboardSyncPatchInstall() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(DASHBOARD_SYNC_PATCH_FLAG, "1");
  const removed = dashboardSyncPatchDisableConflictingTriggers_();
  let created = false;
  const exists = ScriptApp.getProjectTriggers().some(function(t) {
    return t.getHandlerFunction() === "dashboardSyncPatchTick_";
  });
  if (!exists) {
    ScriptApp.newTrigger("dashboardSyncPatchTick_").timeBased().everyMinutes(5).create();
    created = true;
  }
  const first = dashboardSyncPatchRefresh_({ reason: "install" });
  props.setProperty(DASHBOARD_SYNC_PATCH_LAST, new Date().toISOString());
  SpreadsheetApp.flush();
  return { success: !!(first && first.success), patch: DASHBOARD_SYNC_PATCH_VERSION, enabled: true,
    removedConflictingTriggers: removed, createdTrigger: created, trigger: "dashboardSyncPatchTick_(5 menit)", dashboard: first };
}

function dashboardSyncPatchDisable() {
  PropertiesService.getScriptProperties().deleteProperty(DASHBOARD_SYNC_PATCH_FLAG);
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "dashboardSyncPatchTick_") { ScriptApp.deleteTrigger(t); removed++; }
  });
  return { success: true, enabled: false, removedPatchTriggers: removed };
}

function dashboardSyncPatchTick_() {
  if (!isDashboardSyncPatchEnabled_()) return { success: true, skipped: true, reason: "patch disabled" };
  return dashboardSyncPatchRefresh_({ reason: "scheduled" });
}

function dashboardSyncPatchRefresh_(options) {
  options = options || {};
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) return { success: false, status: "BUSY", code: "DASHBOARD_PATCH_LOCKED", error: "Dashboard sedang diproses proses lain." };
  try {
    const ss = getSS();
    const sh = ss.getSheetByName("Dashboard");
    if (!sh) return { success: false, code: "DASHBOARD_NOT_FOUND", error: "Sheet Dashboard tidak ditemukan" };
    const data = getDashboardData();
    if (!data || !data.success) return data || { success: false, error: "Data Dashboard kosong" };
    if (sh.getMaxRows() < 140) sh.insertRowsAfter(sh.getMaxRows(), 140 - sh.getMaxRows());
    if (sh.getMaxColumns() < 22) sh.insertColumnsAfter(sh.getMaxColumns(), 22 - sh.getMaxColumns());

    sh.getRange("A2").setValue("Pantauan Stok & Aktivitas — Real Time | Update: " + (data.lastUpdate || data.generatedAt || new Date().toISOString()));
    const total = Number(data.totalItemAktif || data.totalItem || 0);
    const cards = [
      ["TOTAL ITEM AKTIF", total, "item"],
      ["KRITIS", Number(data.kritis || 0), percent_(data.kritis || 0, total) + "%"],
      ["WASPADA", Number(data.waspada || 0), percent_(data.waspada || 0, total) + "%"],
      ["AMAN", Number(data.aman || 0), percent_(data.aman || 0, total) + "%"]
    ];
    [["A6:C9"],["D6:F9"],["G6:I9"],["J6:L9"]].forEach(function(x, i) {
      sh.getRange(x[0]).setValue(cards[i][0] + "\n\n" + cards[i][1] + " " + cards[i][2]);
    });

    const divRows = (data.statusPerDivisi || []).map(function(d) {
      return [d.divisi, Number(d.total)||0, Number(d.aman)||0, Number(d.waspada)||0, Number(d.kritis)||0, percent_(d.kritis||0,d.total||0)/100];
    });
    sh.getRange(12,1,80,6).clearContent();
    sh.getRange(12,1,1,6).setValues([["DIVISI","TOTAL ITEM","AMAN","WASPADA","KRITIS","% KRITIS"]]).setFontWeight("bold");
    if (divRows.length) sh.getRange(13,1,divRows.length,6).setValues(divRows);
    sh.getRange(13,2,80,4).setNumberFormat("#,##0").setHorizontalAlignment("center");
    sh.getRange(13,6,80,1).setNumberFormat("0.0%").setHorizontalAlignment("center");

    const hiddenDiv = [["DIVISI","AMAN","WASPADA","KRITIS"]].concat((data.statusPerDivisi || []).map(function(d) {
      return [d.divisi,Number(d.aman)||0,Number(d.waspada)||0,Number(d.kritis)||0];
    }));
    sh.getRange(13,16,80,4).clearContent();
    sh.getRange(13,16,hiddenDiv.length,4).setValues(hiddenDiv);
    try { sh.hideColumns(16,4); } catch(e) {}
    try { removeChartByTitle_(sh,"Status Stok per Divisi"); } catch(e) {}
    try { renderDivisionBarChart_(sh,13,data); } catch(e) { console.error("PATCH chart divisi: "+e.message); }

    const poNow = getStatusPO();
    if (poNow && poNow.success) {
      sh.getRange(12,21,4,2).setValues([
        ["STATUS PO","QTY"],
        ["SELESAI",Number(poNow.summary && poNow.summary.itemSelesai || 0)],
        ["SEBAGIAN",Number(poNow.summary && poNow.summary.itemSebagian || 0)],
        ["MENUNGGU",Number(poNow.summary && poNow.summary.itemMenunggu || 0)]
      ]);
      try { sh.hideColumns(21,2); } catch(e) {}
      try { renderPODonutChart_(sh,12,"Status PO — Minggu Ini",poNow.summary||{},"Status PO — Minggu Ini"); } catch(e) { console.error("PATCH donut PO: "+e.message); }
    }

    let poSection;
    try { poSection = refreshDashboardPOSection_({renderCharts:false,lightweight:true,_dashboardPatchDelegated:true}); }
    catch(e) { poSection={success:false,error:String(e && e.message || e)}; }

    updateLastUpdateTimestamp();
    clearDataDirty_();
    SpreadsheetApp.flush();
    const stamp = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty(DASHBOARD_SYNC_PATCH_LAST,stamp);
    return {
      success:true, patch:DASHBOARD_SYNC_PATCH_VERSION, mode:"SINGLE_DASHBOARD_SOURCE",
      totalItem:total, expectedMaster:191, statusPerDivisi:data.statusPerDivisi||[],
      poSection:poSection, updatedAt:stamp,
      pwaApi:{getDashboard:true,getStatusPO:!!(poNow&&poNow.success),getAllStock:true,realtimeReadMode:"PWA polling reads current backend source"}
    };
  } finally { if(lock.hasLock()) lock.releaseLock(); }
}

function dashboardSyncPatchVerify() {
  const ss=getSS(), sh=ss.getSheetByName("Dashboard"), all=getAllStock("ALL"), po=getStatusPO();
  const triggers=ScriptApp.getProjectTriggers().map(function(t){return t.getHandlerFunction();});
  return {success:true,patch:DASHBOARD_SYNC_PATCH_VERSION,enabled:isDashboardSyncPatchEnabled_(),dashboardExists:!!sh,
    totalMaster:all&&all.success?all.count:null,expectedMaster:191,poApi:!!(po&&po.success),
    conflictingTriggersStillPresent:triggers.filter(function(x){return x==="refreshAllData"||x==="refreshDashboard";}),
    patchTriggers:triggers.filter(function(x){return x==="dashboardSyncPatchTick_";}),
    lastSync:PropertiesService.getScriptProperties().getProperty(DASHBOARD_SYNC_PATCH_LAST),checkedAt:new Date().toISOString()};
}
