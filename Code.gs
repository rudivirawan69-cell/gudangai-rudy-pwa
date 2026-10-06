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
  const parts = [];
  if (transactionId) parts.push("GUDANGAI_TX=" + transactionId);
  if (nonce && nonce !== transactionId) parts.push("GUDANGAI_NONCE=" + nonce);
  return parts.join(";");
}

function appendIdentityMarker_(keterangan, transactionId, nonce) {
  const marker = identityMarker_(transactionId, nonce);
  const base = String(keterangan || "").trim();
  if (!marker) return base.substring(0, MAX_KETERANGAN_LENGTH);
  const separator = base ? " | " : "";
  const maxBase = Math.max(0, MAX_KETERANGAN_LENGTH - separator.length - marker.length);
  return base.substring(0, maxBase) + separator + marker;
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