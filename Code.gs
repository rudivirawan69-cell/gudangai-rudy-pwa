/**
 * ============================================================
 * BACKEND GudangAI-69 V6.6.5 — Apps Script Unified Dashboard & Operations
 * ============================================================
 * Spreadsheet Target : COLD STORAGE (auto-detect bulan)
 * Versi              : 7.0.0-RECONSTRUCTION-CANDIDATE — formula-safe division stock + managed triggers
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
const BACKEND_VERSION = "7.0.1-PERFORMANCE-CANDIDATE";
const PO_DATE_ROW = 4;
const PO_HEADER_ROW = 5;
const PO_DATA_START_ROW = 6;
const PO_DATA_START_COL = 2; // B
const PO_DATA_NUM_COLS = 8; // B:I
const PO_LOCK_TIMEOUT_MS = 20000;
const PO_SECTION_CURRENT_ROW = 46; // Dashboard PO terkunci mulai row 46; row 28–45 tidak boleh ditulis.
// Dashboard allocates two isolated 20-row blocks: current 46:65 and previous 66:85.
// Four rows per block are reserved for title/subtitle/header, leaving 16 item rows.
const PO_DASHBOARD_MAX_VISIBLE_ROWS = 16;
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
const MAX_KETERANGAN_LENGTH = 200;
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
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) return dt;
    return null;
  }

  // d-MMM-yyyy / dd-MMM-yyyy, termasuk singkatan bulan Indonesia.
  m = raw.toUpperCase().match(/^(\d{1,2})[-\/ ]([A-ZÀ-Ÿ]{3,9})[-\/ ](\d{4})$/);
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
  let body = null;
  const t0 = Date.now();
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: "Payload kosong" });
    }
    const parsedBody = JSON.parse(e.postData.contents);
    body = normalizeIncomingRequest_(parsedBody);
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
      case "getDashboardLegacy": return jsonResponse(getDashboardData());
      case "refreshDashboard": return jsonResponse(refreshDashboardDataLight693_());
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
      case "opsListActivities": return jsonResponse(opsListActivities_());
      case "opsSaveActivity": return jsonResponse(opsSaveActivity_(body.activity || {}));
      case "opsDeleteActivity": return jsonResponse(opsDeleteActivity_(body.id));
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
    "setupConfig", "setActivePeriod", "setupNewPeriod", "opsSaveActivity", "opsDeleteActivity"];
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
    case "getDashboardLegacy": return jsonResponse(getDashboardData());
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


function buildIdempotencyIndex_() {
  const sheet = getIdempotencyLedgerSheet_();
  const lastRow = sheet.getLastRow();
  const rowCount = Math.min(IDEMPOTENCY_SCAN_LIMIT, Math.max(0, lastRow - OPS_HEADER_ROW));
  const startRow = Math.max(OPS_DATA_START_ROW, lastRow - rowCount + 1);
  const rows = rowCount > 0
    ? sheet.getRange(startRow, 1, rowCount, IDEMPOTENCY_HEADERS.length).getValues()
    : [];
  const byTransactionId = Object.create(null);
  const byNonce = Object.create(null);
  for (let i = rows.length - 1; i >= 0; i--) {
    const record = mapIdempotencyRow_(rows[i], startRow + i);
    if (record.transactionId && !byTransactionId[record.transactionId]) byTransactionId[record.transactionId] = record;
    if (record.nonce && !byNonce[record.nonce]) byNonce[record.nonce] = record;
  }
  return {
    sheet: sheet,
    nextRow: Math.max(OPS_DATA_START_ROW, lastRow + 1),
    byTransactionId: byTransactionId,
    byNonce: byNonce
  };
}

function rememberIdempotencyRecord_(index, record) {
  if (!index || !record) return record;
  if (record.transactionId) index.byTransactionId[record.transactionId] = record;
  if (record.nonce) index.byNonce[record.nonce] = record;
  if (record.rowNumber >= index.nextRow) index.nextRow = record.rowNumber + 1;
  return record;
}

function findIdempotencyRecordInIndex_(index, transactionId, nonce) {
  if (!index) return findIdempotencyRecord_(transactionId, nonce);
  const tx = String(transactionId || "").trim();
  const no = String(nonce || "").trim();
  const byTx = tx ? index.byTransactionId[tx] : null;
  const byNo = no ? index.byNonce[no] : null;
  if (byTx && byNo) return Number(byTx.rowNumber) >= Number(byNo.rowNumber) ? byTx : byNo;
  return byTx || byNo || null;
}

function appendIdempotencyRecordIndexed_(record, index) {
  if (!index || !index.sheet) throw new Error("Idempotency index tidak tersedia.");
  const now = new Date().toISOString();
  const values = [[
    record.createdAt || now, now, record.transactionId || "", record.nonce || "", record.requestId || "", record.deviceId || "",
    record.operation || "syncTransaction", record.sheet || "", record.entitas || "", record.kodeBarang || "", record.qty == null ? "" : record.qty,
    record.tanggal || "", record.status || "IN_PROGRESS", record.dataRow || "", record.writeOccurred == null ? "unknown" : record.writeOccurred,
    record.errorCode || "", redactSensitiveString_(String(record.details || "")).substring(0, 5000)
  ]];
  const rowNumber = index.nextRow;
  index.sheet.getRange(rowNumber, 1, 1, IDEMPOTENCY_HEADERS.length).setValues(values);
  const saved = mapIdempotencyRow_(values[0], rowNumber);
  index.nextRow = rowNumber + 1;
  return rememberIdempotencyRecord_(index, saved);
}

function updateIdempotencyRecordIndexed_(record, patch, index) {
  const updated = updateIdempotencyRecord_(record, patch, index && index.sheet);
  return rememberIdempotencyRecord_(index, updated);
}

// Serialize and persist ledger records in contiguous blocks. Bulk transaction paths
// must not issue one Spreadsheet service call per item for claim/plan/APPLIED updates.
function idempotencyRecordValues_(record, now) {
  const merged = record || {};
  return [
    merged.createdAt || now, now, merged.transactionId || "", merged.nonce || "", merged.requestId || "", merged.deviceId || "",
    merged.operation || "syncTransaction", merged.sheet || "", merged.entitas || "", merged.kodeBarang || "", merged.qty == null ? "" : merged.qty,
    merged.tanggal || "", merged.status || "IN_PROGRESS", merged.dataRow || "", merged.writeOccurred == null ? "unknown" : merged.writeOccurred,
    merged.errorCode || "", redactSensitiveString_(String(merged.details || "")).substring(0, 5000)
  ];
}

function appendIdempotencyRecordsIndexed_(records, index) {
  if (!records || !records.length) return [];
  if (!index || !index.sheet) throw new Error("Idempotency index tidak tersedia.");
  const startRow = index.nextRow;
  const now = new Date().toISOString();
  const values = records.map(function(record) { return idempotencyRecordValues_(record, now); });
  index.sheet.getRange(startRow, 1, values.length, IDEMPOTENCY_HEADERS.length).setValues(values);
  const saved = values.map(function(row, offset) {
    return rememberIdempotencyRecord_(index, mapIdempotencyRow_(row, startRow + offset));
  });
  index.nextRow = startRow + values.length;
  return saved;
}

function writeIdempotencyRecordsByRow_(records, index) {
  if (!records || !records.length) return [];
  if (!index || !index.sheet) throw new Error("Idempotency index tidak tersedia.");
  const latestByRow = Object.create(null);
  records.forEach(function(record) {
    if (record && Number(record.rowNumber) >= OPS_DATA_START_ROW) latestByRow[Number(record.rowNumber)] = record;
  });
  const rows = Object.keys(latestByRow).map(Number).sort(function(a, b) { return a - b; });
  if (!rows.length) return [];
  const now = new Date().toISOString();
  const saved = [];
  let offset = 0;
  while (offset < rows.length) {
    const startRow = rows[offset];
    let end = offset + 1;
    while (end < rows.length && rows[end] === rows[end - 1] + 1) end++;
    const blockRows = rows.slice(offset, end);
    const values = blockRows.map(function(rowNumber) {
      return idempotencyRecordValues_(latestByRow[rowNumber], now);
    });
    index.sheet.getRange(startRow, 1, values.length, IDEMPOTENCY_HEADERS.length).setValues(values);
    for (let i = 0; i < values.length; i++) {
      saved.push(rememberIdempotencyRecord_(index, mapIdempotencyRow_(values[i], startRow + i)));
    }
    offset = end;
  }
  return saved;
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

function updateIdempotencyRecord_(record, patch, sheetOverride) {
  if (!record || !record.rowNumber) return null;
  const sheet = sheetOverride || getSS().getSheetByName(IDEMPOTENCY_SHEET_NAME);
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

function appendIdentityMarker_(keterangan, transactionId, nonce) {
  // Hanya kembalikan keterangan user (maksimal panjang). Jangan sisipkan GUDANGAI_TX / NONCE.
  // Read-back dan anti-duplikat mengandalkan Idempotency Ledger, bukan kolom Keterangan.
  const base = String(keterangan || "").trim();
  return base.substring(0, MAX_KETERANGAN_LENGTH);
}

function appendTransactionNoteWithinLimit_(base, suffix) {
  var max = MAX_KETERANGAN_LENGTH;
  var userText = String(base || "").trim();
  var systemText = String(suffix || "").trim();
  if (!systemText) return userText.substring(0, max);
  if (systemText.length >= max) return systemText.substring(0, max);
  var separator = userText ? " | " : "";
  var allowedUserLength = Math.max(0, max - systemText.length - separator.length);
  var safeUserText = userText.substring(0, allowedUserLength).trim();
  return (safeUserText ? safeUserText + separator : "") + systemText;
}

function readBackTransactionByIdentity_(identity, preferredSheet, ledgerIndex) {
  const targetId = String(identity && identity.transactionId || "").trim();
  const targetNonce = String(identity && identity.nonce || "").trim();
  // Legacy marker scan is only needed for old rows. Current transactions keep identity
  // in the ledger; bulk reconciliation can jump directly to the ledger's recorded row.
  const sheetNames = ledgerIndex ? [] : (preferredSheet ? [preferredSheet] : Object.keys(SHEET_CONFIG));
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
  // Fallback ledger: marker GUDANGAI_TX tidak lagi ditulis ke Keterangan (lihat appendIdentityMarker_),
  // sehingga verifikasi memakai baris yang tercatat di Idempotency Ledger.
  try {
    const rec = ledgerIndex
      ? findIdempotencyRecordInIndex_(ledgerIndex, targetId, targetNonce)
      : findIdempotencyRecord_(targetId, targetNonce);
    const rowNo = rec ? Number(rec.dataRow) : 0;
    const sName = preferredSheet || (rec ? rec.sheet : "");
    const eligible = rec && (rec.status === "APPLIED" || rec.status === "UNKNOWN" || String(rec.writeOccurred) === "unknown");
    if (eligible && rowNo > 0 && sName && (sName in SHEET_CONFIG)) {
      const cfg = SHEET_CONFIG[sName];
      const sh = getSS().getSheetByName(sName);
      if (sh && rowNo > cfg.headerRow && rowNo <= sh.getMaxRows()) {
        const r = sh.getRange(rowNo, 2, 1, 6).getValues()[0];
        var ledgerDetails = {};
        try { ledgerDetails = JSON.parse(String(rec.details || "")); } catch (e) {}
        var qtyPresent = r[4] !== "" && r[4] != null;
        var plannedWrite = ledgerDetails && ledgerDetails.planned === true &&
          ledgerDetails.plannedFinalQty != null && ledgerDetails.keteranganHash;
        var qtyOk = plannedWrite
          ? (qtyPresent && Number(r[4]) === Number(ledgerDetails.plannedFinalQty))
          : (qtyPresent && (Number(r[4]) === Number(rec.qty) || Number(r[4]) === 0));
        var noteOk = plannedWrite
          ? sha256Short_(String(r[5] || "")) === String(ledgerDetails.keteranganHash)
          : true;
        if (String(r[1] || "").trim() === String(rec.kodeBarang || "").trim() &&
            normalizeTransactionDateKey_(r[0]) === String(rec.tanggal || "") && qtyOk && noteOk) {
          return {
            matched: true, sheet: sName, row: rowNo,
            tanggal: normalizeTransactionDateKey_(r[0]), kodeBarang: String(r[1] || "").trim(),
            namaBarang: r[2], satuan: r[3], qty: Number(r[4]) || 0, keterangan: String(r[5] || ""),
            transactionId: targetId || null, nonce: targetNonce || null, via: "LEDGER_ROW"
          };
        }
      }
    }
  } catch (fallbackErr) { console.error("readBack fallback ledger gagal: " + fallbackErr.message); }
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
  let verifiedReadBack = null;
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
          keterangan = appendTransactionNoteWithinLimit_(keterangan, structured);
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
          var plannedKeteranganHash = sha256Short_(keterangan);
          if (!plannedKeteranganHash) throw new Error("Fingerprint Keterangan gagal dibuat; transaksi tidak ditulis.");
          ledgerRecord = updateIdempotencyRecord_(ledgerRecord, {
            status: "IN_PROGRESS", dataRow: targetRow, writeOccurred: "unknown", errorCode: "WRITE_PENDING",
            details: JSON.stringify({
              planned: true, plannedFinalQty: finalQty,
              keteranganHash: plannedKeteranganHash, shortage: shortageMode
            })
          });
          if (!ledgerRecord || Number(ledgerRecord.dataRow) !== Number(targetRow)) {
            throw new Error("Write-ahead ledger tidak dapat dikonfirmasi; jurnal transaksi tidak ditulis.");
          }
          // Set konservatif sebelum panggilan Sheets: exception pada setValues bisa terjadi setelah write parsial.
          writeTouched = true;
          // Hanya kolom writable: B:C dan F:G. Kolom D:E tetap terlindungi.
          sheet.getRange(targetRow, 2, 1, 2).setValues([[formattedDate, kode]]);
          sheet.getRange(targetRow, 6, 1, 2).setValues([[finalQty, keterangan]]);
          // HARD RULE: transaksi API tidak pernah menulis/mengubah Stock CV/Stock PT.
          // Stock CV/PT adalah MASTER/SOURCE OF TRUTH dan hanya dibaca untuk validasi stok.
          normalizationStatus = { success: true, mode: "MASTER_READ_ONLY_ENFORCED" };
          SpreadsheetApp.flush();
          const verifiedRow = sheet.getRange(targetRow, 2, 1, 6).getValues()[0];
          if (normalizeTransactionDateKey_(verifiedRow[0]) !== expectedDateKey || String(verifiedRow[1] || "").trim() !== kode || Number(verifiedRow[4]) !== finalQty || String(verifiedRow[5] || "") !== keterangan) {
            throw new Error("Verifikasi integritas gagal di baris " + targetRow + ".");
          }
          verifiedReadBack = {
            matched: true, sheet: sheetName, row: targetRow,
            tanggal: normalizeTransactionDateKey_(verifiedRow[0]), kodeBarang: String(verifiedRow[1] || "").trim(),
            namaBarang: verifiedRow[2], satuan: verifiedRow[3], qty: Number(verifiedRow[4]) || 0,
            keterangan: String(verifiedRow[5] || ""), transactionId: transactionId, nonce: nonce,
            via: "WRITE_VERIFICATION"
          };
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
    // Formula kolom F mengikuti jurnal transaksi secara native; audit 3 range formula
    // tidak perlu dijalankan di jalur respons transaksi.
    const readBack = verifiedReadBack || readBackTransactionByIdentity_({ transactionId: transactionId, nonce: nonce }, sheetName);
    const syncVersions = getCachedSyncVersions_();
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
  var seenIdentities = {};
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
      validationErrors.push({
        batchId: batchId,
        batchIndex: i + 1,
        index: i + 1,
        clientItemId: tx.clientItemId || tx.requestId || "",
        requestId: tx.requestId || "",
        transactionId: tx.transactionId,
        nonce: tx.nonce,
        success: false,
        status: "REJECTED",
        code: check.code || "PRECHECK_REJECTED",
        error: check.error,
      });
      continue;
    }
    var normalizedKode = String(check.kode || tx.kodeBarang || tx.kode || "").trim();
    var identityKey = String(tx.transactionId) + "|" + String(tx.nonce);
    if (seenIdentities[identityKey]) {
      validationErrors.push({ index: i + 1, error: "Duplikat identity dalam batch: " + tx.transactionId });
      continue;
    }
    seenIdentities[identityKey] = true;
    tx.kodeBarang = normalizedKode;
    prepared.push(tx);
  }
  // Item valid tetap diproses walaupun sebagian item gagal preflight.
  // Ini mencegah 1 item invalid menggagalkan seluruh bulkTransaction.
  var preflightResults = validationErrors.slice();

  // Pembacaan seluruh master stok hanya diperlukan untuk validasi shortage Barang keluar.
  // Masuk/Rusak tidak memakai stockMap, jadi jangan membebani request dengan scan master 191 item.
  var isKeluar = sheetName === "Barang keluar";
  var stockMap = {};
  if (isKeluar) {
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
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { success: false, status: "UNKNOWN", code: "LOCK_TIMEOUT", batchId: batchId, writeOccurred: "unknown", error: "Lock backend tidak tersedia; lakukan read-back sebelum retry." };
  }

  var results = preflightResults.slice();
  var successCount = 0;
  var failCount = preflightResults.length;
  var writeTouched = false;
  var rowsToWrite = [];
  var ledgerIndex = null;
  var pendingNewClaims = [];
  var pendingExistingClaims = [];
  var pendingReconciledUpdates = [];

  try {
    // Snapshot ledger satu kali per batch, bukan scan 2.000 baris untuk setiap item.
    ledgerIndex = buildIdempotencyIndex_();
    for (var p = 0; p < prepared.length; p++) {
      var item = prepared[p];
      var prior = findIdempotencyRecordInIndex_(ledgerIndex, item.transactionId, item.nonce);
      // Reconcile before every re-write. IN_PROGRESS/UNKNOWN may mean the previous
      // request actually committed but the client timed out before receiving the response.
      if (prior && prior.status !== "APPLIED") {
        try {
          var priorReadBack = readBackTransactionByIdentity_({ transactionId: item.transactionId, nonce: item.nonce }, sheetName, ledgerIndex);
          if (priorReadBack && priorReadBack.matched) {
            pendingReconciledUpdates.push(Object.assign({}, prior, { status: "APPLIED", dataRow: priorReadBack.row, writeOccurred: true, errorCode: "" }));
            results.push({ success: true, status: "APPLIED", code: "READBACK_CONFIRMED", batchId: batchId, batchIndex: p + 1, transactionId: item.transactionId, nonce: item.nonce, requestId: item.requestId || "", clientItemId: item.clientItemId || item.requestId || "", sheet: sheetName, row: priorReadBack.row, kode: priorReadBack.kodeBarang, qty: priorReadBack.qty, replayed: true, writeOccurred: true });
            successCount++;
            continue;
          }
        } catch (reconcileErr) {
          console.error("bulkTransaction reconciliation gagal: " + reconcileErr.message);
        }
        if (prior.status === "UNKNOWN" || String(prior.writeOccurred) === "unknown") {
          results.push({
            success: false, status: "UNKNOWN", code: "READBACK_REQUIRED",
            batchId: batchId, batchIndex: p + 1,
            transactionId: item.transactionId, nonce: item.nonce,
            requestId: item.requestId || "",
            clientItemId: item.clientItemId || item.requestId || "",
            sheet: sheetName, kode: item.kodeBarang,
            writeOccurred: "unknown",
            error: "Identitas bulk sudah memiliki write intent; read-back belum mengonfirmasi jurnal. Jangan tulis ulang item ini."
          });
          failCount++;
          continue;
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
          var structured = "Input pending " + numericQty + " > sisa stock " + sisa + " > kurang " + kekurangan;
          keterangan = appendTransactionNoteWithinLimit_(keterangan, structured);
        }
        if (st) st.stockAkhir = Math.max(0, sisa - (shortageMode ? 0 : finalQty));
      }

      keterangan = appendIdentityMarker_(keterangan, item.transactionId, item.nonce);

      var claimedRecord = null;
      var claimData = {
        transactionId: item.transactionId, nonce: item.nonce,
        requestId: item.requestId || batchId, deviceId: (item.client && item.client.deviceId) || (prior && prior.deviceId) || "",
        operation: "bulkTransaction", sheet: sheetName, entitas: entitas,
        kodeBarang: item.kodeBarang, qty: numericQty, tanggal: normalizeTransactionDateKey_(formattedDate),
        status: "IN_PROGRESS", dataRow: prior ? prior.dataRow : "", writeOccurred: false,
        errorCode: "", details: "Batch claim " + batchId,
        createdAt: prior && prior.createdAt || new Date().toISOString()
      };
      if (prior) {
        claimedRecord = Object.assign({}, prior, claimData, { rowNumber: prior.rowNumber });
        pendingExistingClaims.push(claimedRecord);
      } else {
        claimedRecord = Object.assign({}, claimData, { rowNumber: ledgerIndex.nextRow + pendingNewClaims.length });
        pendingNewClaims.push(claimedRecord);
      }

      rowsToWrite.push({
        index: p, date: formattedDate, kode: item.kodeBarang,
        qty: finalQty, originalQty: numericQty, ket: keterangan,
        txId: item.transactionId, nonce: item.nonce,
        requestId: item.requestId || item.clientItemId || "",
        clientItemId: item.clientItemId || item.requestId || "",
        shortage: shortageMode, availableQty: availableQty, ledgerRecord: claimedRecord
      });
    }

    // Persist all reconciled/new/existing claims in grouped ranges before touching transaction rows.
    var persistedClaims = [];
    if (pendingNewClaims.length) persistedClaims = persistedClaims.concat(appendIdempotencyRecordsIndexed_(pendingNewClaims, ledgerIndex));
    if (pendingExistingClaims.length) persistedClaims = persistedClaims.concat(writeIdempotencyRecordsByRow_(pendingExistingClaims, ledgerIndex));
    if (pendingReconciledUpdates.length) persistedClaims = persistedClaims.concat(writeIdempotencyRecordsByRow_(pendingReconciledUpdates, ledgerIndex));
    var persistedByRow = Object.create(null);
    persistedClaims.forEach(function(record) { persistedByRow[record.rowNumber] = record; });
    rowsToWrite.forEach(function(rw) {
      if (rw.ledgerRecord && persistedByRow[rw.ledgerRecord.rowNumber]) rw.ledgerRecord = persistedByRow[rw.ledgerRecord.rowNumber];
      if (!rw.ledgerRecord || rw.ledgerRecord.status !== "IN_PROGRESS") throw new Error("Write-ahead ledger claim tidak terkonfirmasi: " + rw.txId);
    });

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
      var startRow = findSafeEmptyBlockAdaptively_(sheet, config, rowsToWrite.length);
      if (!verifyRowsEmptyPath2(sheet, startRow, rowsToWrite.length)) {
        throw new Error("Blok target bulk tidak kosong setelah alokasi; batalkan batch tanpa menimpa baris lama.");
      }

      var bcValues = [];
      var fgValues = [];
      var plannedLedgerUpdates = [];
      for (var r = 0; r < rowsToWrite.length; r++) {
        var planned = rowsToWrite[r];
        var plannedRow = startRow + r;
        var plannedRecord = planned.ledgerRecord;
        if (!plannedRecord) throw new Error("Idempotency ledger hilang sebelum bulk write: " + planned.txId);
        var plannedKeteranganHash = sha256Short_(planned.ket);
        if (!plannedKeteranganHash) throw new Error("Fingerprint Keterangan gagal dibuat untuk " + planned.txId + "; batch tidak ditulis.");
        plannedLedgerUpdates.push(Object.assign({}, plannedRecord, {
          status: "IN_PROGRESS", dataRow: plannedRow, writeOccurred: "unknown", errorCode: "WRITE_PENDING",
          details: JSON.stringify({ planned: true, plannedFinalQty: planned.qty, keteranganHash: plannedKeteranganHash, batchId: batchId })
        }));
        bcValues.push([planned.date, planned.kode]);
        fgValues.push([planned.qty, planned.ket]);
      }
      var persistedPlans = writeIdempotencyRecordsByRow_(plannedLedgerUpdates, ledgerIndex);
      var plansByRow = Object.create(null);
      persistedPlans.forEach(function(record) { plansByRow[record.rowNumber] = record; });
      rowsToWrite.forEach(function(rw, idx) {
        rw.ledgerRecord = plansByRow[rw.ledgerRecord.rowNumber] || rw.ledgerRecord;
        if (!rw.ledgerRecord || Number(rw.ledgerRecord.dataRow) !== Number(startRow + idx) || rw.ledgerRecord.errorCode !== "WRITE_PENDING") {
          throw new Error("Write-ahead ledger bulk tidak dapat dikonfirmasi: " + rw.txId);
        }
      });
      // Flush the write-ahead plan before any transaction row can be written.
      SpreadsheetApp.flush();

      // Set konservatif sebelum panggilan Sheets agar partial-write exception berstatus UNKNOWN.
      writeTouched = true;
      sheet.getRange(startRow, 2, rowsToWrite.length, 2).setValues(bcValues);
      sheet.getRange(startRow, 6, rowsToWrite.length, 2).setValues(fgValues);
      SpreadsheetApp.flush();

      // Verifikasi seluruh batch dalam dua pembacaan blok, bukan dua pembacaan per item.
      var verifiedBC = sheet.getRange(startRow, 2, rowsToWrite.length, 2).getValues();
      var verifiedFG = sheet.getRange(startRow, 6, rowsToWrite.length, 2).getValues();
      for (var v = 0; v < rowsToWrite.length; v++) {
        var rowNum = startRow + v;
        var rw = rowsToWrite[v];
        var vBC = verifiedBC[v];
        var vFG = verifiedFG[v];
        var ok = (normalizeTransactionDateKey_(vBC[0]) === normalizeTransactionDateKey_(rw.date) || String(vBC[0]) === String(rw.date))
          && String(vBC[1] || "").trim() === rw.kode
          && Number(vFG[0]) === Number(rw.qty)
          && String(vFG[1] || "") === String(rw.ket || "");

        if (ok) {
          successCount++;
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
            results.push({
              success: false, status: "UNKNOWN", code: "VERIFY_FAILED",
              batchId: batchId, batchIndex: rw.index + 1,
              transactionId: rw.txId, nonce: rw.nonce,
              requestId: rw.requestId || "",
              clientItemId: rw.clientItemId || rw.requestId || "",
              kode: rw.kode,
              writeOccurred: "unknown", error: "Verifikasi integritas gagal di baris " + rowNum
            });
            // Lanjutkan verifikasi item berikutnya; item valid lain tetap tercatat.
            continue;
        }
      }
      // One grouped ledger update after the entire transaction block has been read back.
      var finalLedgerUpdates = rowsToWrite.map(function(rw, idx) {
        var rowNum = startRow + idx;
        var verified = results.some(function(result) {
          return String(result.transactionId || "") === String(rw.txId) && result.success === true;
        });
        return Object.assign({}, rw.ledgerRecord, verified
          ? { status: "APPLIED", dataRow: rowNum, writeOccurred: true, errorCode: "" }
          : { status: "UNKNOWN", dataRow: rowNum, writeOccurred: "unknown", errorCode: "VERIFY_FAILED" });
      });
      writeIdempotencyRecordsByRow_(finalLedgerUpdates, ledgerIndex);
    }

    updateLastUpdateTimestamp();
    clearMasterCache();
    // Formula Data Stok Per Divisi menghitung ulang otomatis; audit formula penuh
    // dipindahkan dari jalur transaksi ke pemeriksaan terjadwal/manual.
  } catch (outerErr) {
    failCount++;
    // Resolve every planned ledger record consistently with the conservative write boundary.
    try {
      var failureLedgerUpdates = rowsToWrite.filter(function(rw) { return !!rw.ledgerRecord; }).map(function(rw) {
        var rec = rw.ledgerRecord;
        return Object.assign({}, rec, {
          status: writeTouched ? "UNKNOWN" : "FAILED",
          dataRow: writeTouched ? rec.dataRow : "",
          writeOccurred: writeTouched ? "unknown" : false,
          errorCode: writeTouched ? "PARTIAL_WRITE_READBACK_REQUIRED" : "BULK_WRITE_NOT_STARTED",
          details: String(outerErr.message || outerErr).substring(0, 1000)
        });
      });
      if (failureLedgerUpdates.length) writeIdempotencyRecordsByRow_(failureLedgerUpdates, ledgerIndex);
    } catch (ledgerErr) { console.error("bulk failure ledger reconciliation: " + ledgerErr.message); }
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
  const allowed = ["action", "operation", "schemaVersion", "sheet", "entitas", "kodeBarang", "qty", "tanggal", "keterangan", "transactionId", "nonce", "holdTransactionId", "realisasiHoldId", "holdId", "requestId", "clientItemId", "queueApproved", "client", "offlineContext", "secret", "_syncMode", "batchId", "deviceId"];
  const unknown = Object.keys(tx).filter(function(k) { return allowed.indexOf(k) < 0 && k !== "payload"; });
  if (unknown.length) return { valid: false, status: "REJECTED", code: "UNKNOWN_FIELD", error: "Field tidak diizinkan: " + unknown.join(", ") };
  const kode = String(tx.kodeBarang || "").trim();
  const entityGroup = normalizeEntityGroup_(tx.entitas, kode);
  if (opts.requireEntity !== false && !entityGroup.valid) return { valid: false, status: "REJECTED", code: "ENTITY_REQUIRED", error: entityGroup.error };
  const entitas = entityGroup.valid ? entityGroup.entitas : "";
  if (!kode) return { valid: false, status: "REJECTED", code: "CODE_REQUIRED", error: "kodeBarang wajib diisi" };
  const qty = Number(tx.qty);
  if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) return { valid: false, status: "REJECTED", code: "INVALID_QTY", error: "qty harus lebih dari 0 dan tidak boleh melebihi " + MAX_QTY };
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
  // getMaxRows() mencakup seluruh baris kosong/berformat sampai batas sheet.
  // Membaca satu kolom sampai batas itu pada setiap transaksi membuang waktu.
  // getLastRow() adalah batas konten aktual; seluruh data di kolom kode pasti
  // berada di dalam batas ini, termasuk bila ada data yatim di kolom lain.
  const contentEndRow = (typeof sheet.getLastRow === "function") ? sheet.getLastRow() : sheet.getMaxRows();
  const lastContentRow = Math.min(sheet.getMaxRows(), Math.max(startRow - 1, contentEndRow));
  if (lastContentRow < startRow) return startRow - 1;
  const numRows = lastContentRow - startRow + 1;
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
  // Jangan berhenti di realLastRow + buffer: kolom B:C/F:G bisa memiliki data
  // yatim setelah kolom kode. getLastRow() melindungi data tersebut agar tidak tertimpa.
  const contentEndRow = (typeof sheet.getLastRow === "function") ? sheet.getLastRow() : sheet.getMaxRows();
  const lastContentRow = Math.max(realLastRow, contentEndRow);
  const scanEndRow = Math.min(maxRows, Math.max(lastContentRow, realLastRow + SCAN_BUFFER_ROWS));
  const numRowsToScan = Math.max(1, scanEndRow - startRow + 1);
  const bcValues = sheet.getRange(startRow, 2, numRowsToScan, 2).getValues();
  const fgValues = sheet.getRange(startRow, 6, numRowsToScan, 2).getValues();
  for (let i = 0; i < numRowsToScan; i++) {
    const leftEmpty = bcValues[i].every(function(cell) { return cell === "" || cell === null || cell === undefined; });
    const rightEmpty = fgValues[i].every(function(cell) { return cell === "" || cell === null || cell === undefined; });
    if (leftEmpty && rightEmpty) return startRow + i;
  }
  const appendRow = lastContentRow + 1;
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

function verifyRowsEmptyPath2(sheet, startRow, rowCount) {
  var count = Math.max(1, Math.floor(Number(rowCount) || 1));
  var bc = sheet.getRange(startRow, 2, count, 2).getValues();
  var fg = sheet.getRange(startRow, 6, count, 2).getValues();
  for (var i = 0; i < count; i++) {
    for (var c = 0; c < 2; c++) {
      if (bc[i][c] !== "" && bc[i][c] != null) return false;
      if (fg[i][c] !== "" && fg[i][c] != null) return false;
    }
  }
  return true;
}

/**
 * Find an append-safe contiguous block for bulk rows. A single empty first row
 * is not sufficient: every target row must be empty in both B:C and F:G.
 * Scan starts after the final non-empty item code, so historical gaps are never reused.
 */
function findSafeEmptyBlockAdaptively_(sheet, config, rowCount) {
  var count = Math.max(1, Math.floor(Number(rowCount) || 1));
  var start = Math.max(config.headerRow + 1, getRealLastDataRow(sheet, config) + 1);
  var maxRows = sheet.getMaxRows();

  if (start <= maxRows) {
    // Scan hanya sampai konten aktual + buffer yang cukup untuk satu batch.
    // Tidak perlu membaca semua baris kosong/berformat hingga sheet.getMaxRows().
    // Batas getLastRow() tetap menjaga data yatim pada B:C/F:G agar tidak tertimpa.
    var contentEndRow = (typeof sheet.getLastRow === "function") ? sheet.getLastRow() : maxRows;
    var lastContentRow = Math.max(start - 1, contentEndRow);
    var scanEndRow = Math.min(maxRows, Math.max(lastContentRow, start + count + SCAN_BUFFER_ROWS - 1));
    var scanCount = Math.max(count, scanEndRow - start + 1);
    var bc = sheet.getRange(start, 2, scanCount, 2).getValues();
    var fg = sheet.getRange(start, 6, scanCount, 2).getValues();
    var emptyRun = 0;
    for (var i = 0; i < scanCount; i++) {
      var empty = true;
      for (var c = 0; c < 2; c++) {
        if ((bc[i][c] !== "" && bc[i][c] != null) || (fg[i][c] !== "" && fg[i][c] != null)) {
          empty = false; break;
        }
      }
      emptyRun = empty ? emptyRun + 1 : 0;
      if (emptyRun >= count) return start + i - count + 1;
    }
  }

  var insertAfter = sheet.getMaxRows();
  var addRows = Math.max(count, SCAN_BUFFER_ROWS);
  try {
    sheet.insertRowsAfter(insertAfter, addRows);
  } catch (insertErr) {
    try { sheet.insertRows(insertAfter + 1, addRows); }
    catch (insertErr2) {
      throw new Error("Gagal menambah blok baris bulk pada '" + sheet.getName() + "': " + insertErr.message);
    }
  }
  return insertAfter + 1;
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
      if (!kode || /^total\b/i.test(kode)) continue;

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

  const prefix = normalizedKode.toUpperCase().split("-")[0];
  if (prefix === "BBCV" || prefix === "BBPT") {
    const allBB = getAllStock("ALL");
    if (!allBB.success) return { success: false, error: allBB.error || "Gagal membaca master bahan baku" };
    const matchesBB = allBB.items.filter(function(item) {
      return String(item.kode || "").trim() === normalizedKode &&
        (!requestedEntity || String(item.entitas || "").toUpperCase() === requestedEntity);
    });
    if (matchesBB.length !== 1) return { success: false, error: matchesBB.length ? "Kode bahan baku ambigu: " + normalizedKode : "Kode bahan baku tidak ditemukan: " + normalizedKode };
    return Object.assign({ success: true }, matchesBB[0]);
  }

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
  const requested = String(entitas || "ALL").trim().toUpperCase();
  const byKey = {};

  // Daftar master adalah gabungan unik Stock CV + Stock PT + Stock Bahan Baku.
  // Saldo CV/PT tetap dibaca dari sheet masing-masing; kode pada Stock Bahan Baku
  // menimpa saldo kode tersebut dan menambah item BB yang belum ada di CV/PT.
  ["Stock CV", "Stock PT"].forEach(function(name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 4 || sheet.getLastColumn() < 1) return;
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(3, 1, 1, lastCol).getValues()[0];
    const lower = headers.map(function(h) { return String(h || "").toLowerCase().trim(); });
    const cKode = lower.findIndex(function(h) { return h.indexOf("kode") >= 0; });
    if (cKode < 0) return;
    const rows = sheet.getRange(4, 1, sheet.getLastRow() - 3, lastCol).getValues();
    const fallbackEntity = name === "Stock CV" ? "CV" : "PT";
    rows.forEach(function(row) {
      const kode = String(row[cKode] || "").trim();
      if (!kode || /^total\b/i.test(kode)) return;
      const normalized = normalizeEntityGroup_(fallbackEntity, kode);
      const group = normalized.valid ? normalized.entitas : fallbackEntity;
      const item = { kode: kode, entitas: group };
      headers.forEach(function(h, idx) {
        const key = String(h || "").toLowerCase().trim();
        if (key.indexOf("nama") >= 0) item.nama = row[idx];
        if (key.indexOf("satuan") >= 0) item.satuan = row[idx];
        if (key.indexOf("stock akhir") >= 0) item.stockAkhir = clampStockToZero_(row[idx]);
        if (key.indexOf("stock aman") >= 0) item.stockAman = row[idx];
        if (key.indexOf("stock value") >= 0 || key.indexOf("nilai stok") >= 0 || key.indexOf("nilai stock") >= 0 || key === "value") item.stockValue = row[idx];
        if (key.indexOf("divisi") >= 0) item.divisi = row[idx];
      });
      byKey[group + "|" + kode] = Object.assign({}, byKey[group + "|" + kode] || {}, item);
    });
  });

  const bbSheet = ss.getSheetByName("Stock Bahan Baku");
  if (bbSheet) {
    const bb = getBahanBakuStockMap_();
    if (!bb.success) return { success: false, count: 0, items: [], error: bb.error || 'Gagal membaca "Stock Bahan Baku".' };
    // Gunakan hasil pembacaan yang sama dari getBahanBakuStockMap_(); hindari
    // membaca header dan 28+ baris bahan baku untuk kedua kalinya pada setiap request.
    const lastRow = bb.lastRow, lastCol = bb.lastCol;
    const headerRow = bb.headerRow;
    const headers = bb.headers || [];
    const lower = headers.map(function(v) { return String(v || "").toLowerCase().trim(); });
    const cKode = lower.findIndex(function(v) { return v.indexOf("kode") >= 0; });
    const rows = bb.rows || [];
    if (headerRow < 0 || cKode < 0) return { success: false, count: 0, items: [], error: 'Header Kode tidak ditemukan di "Stock Bahan Baku".' };
    rows.forEach(function(row) {
      const kode = String(row[cKode] || "").trim();
      if (!kode || /^total\b/i.test(kode) || !Object.prototype.hasOwnProperty.call(bb.map, kode)) return;
      const groupInfo = normalizeEntityGroup_("", kode);
      if (!groupInfo.valid) { console.warn("Prefix entitas bahan baku tidak dikenal: " + kode); return; }
      const group = groupInfo.entitas, key = group + "|" + kode;
      const item = Object.assign({}, byKey[key] || {}, { kode: kode, entitas: group, stockAkhir: clampStockToZero_(bb.map[kode]) });
      headers.forEach(function(h, idx) {
        const field = String(h || "").toLowerCase().trim();
        if (field.indexOf("nama") >= 0 && row[idx] !== "") item.nama = row[idx];
        if (field.indexOf("satuan") >= 0 && row[idx] !== "") item.satuan = row[idx];
        if (field.indexOf("divisi") >= 0 && row[idx] !== "") item.divisi = row[idx];
        if (field.indexOf("stock aman") >= 0 && row[idx] !== "") item.stockAman = row[idx];
        if ((field.indexOf("stock value") >= 0 || field.indexOf("nilai stok") >= 0 || field.indexOf("nilai stock") >= 0 || field === "value") && row[idx] !== "") item.stockValue = row[idx];
      });
      if (!item.divisi) item.divisi = "BAHAN BAKU";
      byKey[key] = item;
    });
    Object.keys(bb.map).forEach(function(kode) {
      if (Object.keys(byKey).some(function(key) { return key.endsWith("|" + kode); })) return;
      const groupInfo = normalizeEntityGroup_("", kode);
      if (!groupInfo.valid) return;
      byKey[groupInfo.entitas + "|" + kode] = { kode: kode, entitas: groupInfo.entitas, nama: kode, satuan: "", divisi: "BAHAN BAKU", stockAkhir: clampStockToZero_(bb.map[kode]), stockAman: 0, stockValue: 0 };
    });
  }

  const items = Object.keys(byKey).sort().map(function(key) { return byKey[key]; })
    .filter(function(item) { return requested === "ALL" || requested === item.entitas; });
  return { success: true, count: items.length, items: items, source: "Stock CV + Stock PT + Stock Bahan Baku" };
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
  const invalidStockCodes = [];

  rows.forEach(function(row) {
    const kode = String(row[idxKode] || "").trim();
    if (!kode || /^total\b/i.test(kode) || /^kode\b/i.test(kode)) return;
    const raw = row[idxStock];
    const num = Number(raw);
    // Kode barang tetap dihitung walau sel stok kosong/error; nilai stok invalid
    // ditampilkan konservatif sebagai 0 dan dicatat agar item tidak hilang dari total master.
    if (raw !== "" && raw != null && !isFinite(num)) invalidStockCodes.push(kode);
    const stock = raw === "" || raw == null || !isFinite(num) ? 0 : num;
    map[kode] = clampStockToZero_(stock);
    codes.push(kode);
  });

  return {
    success: true,
    sheet: "Stock Bahan Baku",
    headerRow: headerRow,
    lastRow: lastRow,
    lastCol: lastCol,
    headers: top[headerRow - 1],
    rows: rows,
    count: codes.length,
    codes: codes,
    invalidStockCodes: invalidStockCodes,
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

/**
 * V7 — formula-safe Sisa Stok for Data Stok Per Divisi.
 * The source sheets remain authoritative; this code only reads their header layout.
 */
function divisionColumnLetter_(columnNumber) {
  var n = Number(columnNumber) || 0;
  var out = "";
  while (n > 0) {
    var rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function getDivisionStockFormulaSources_() {
  var ss = getSS();
  function scanSource(sheetName, fixedHeaderRow) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return { success:false, error:"Sheet sumber tidak ditemukan: " + sheetName };
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastCol < 1 || lastRow < 2) return { success:false, error:"Sheet sumber kosong: " + sheetName };
    var start = fixedHeaderRow || 1;
    var end = fixedHeaderRow || Math.min(5, lastRow);
    var headerRow = 0, idxKode = -1, idxStock = -1;
    for (var r = start; r <= end; r++) {
      var headers = sh.getRange(r, 1, 1, lastCol).getDisplayValues()[0].map(function(v) {
        return String(v || "").toLowerCase().trim();
      });
      var k = headers.findIndex(function(v) { return v.indexOf("kode") >= 0; });
      var st = headers.findIndex(function(v) {
        return v.indexOf("stock akhir") >= 0 || v.indexOf("sisa stock") >= 0 ||
          v.indexOf("sisa stok") >= 0 || v === "sisa";
      });
      if (k >= 0 && st >= 0) {
        headerRow = r; idxKode = k; idxStock = st; break;
      }
    }
    if (!headerRow) return { success:false, error:"Header Kode/Stock Akhir tidak ditemukan: " + sheetName };
    return {
      success:true, sheetName:sheetName, headerRow:headerRow, dataStartRow:headerRow+1,
      kodeColumn:divisionColumnLetter_(idxKode+1), stockColumn:divisionColumnLetter_(idxStock+1)
    };
  }
  var cv = scanSource("Stock CV", 3);
  if (!cv.success) return cv;
  var pt = scanSource("Stock PT", 3);
  if (!pt.success) return pt;
  var bb = scanSource("Stock Bahan Baku", 0);
  if (!bb.success) return bb;
  return { success:true, cv:cv, pt:pt, bb:bb };
}

function divisionStockLookupExpression_(source, codeCell) {
  var sheetRef = "'" + source.sheetName.replace(/'/g, "''") + "'";
  return "INDEX(" + sheetRef + "!$" + source.stockColumn + "$" + source.dataStartRow +
    ":$" + source.stockColumn + ",MATCH(" + codeCell + "," + sheetRef + "!$" +
    source.kodeColumn + "$" + source.dataStartRow + ":$" + source.kodeColumn + ",0))";
}

function divisionFormulaArgumentSeparator_() {
  // Indonesian Google Sheets locale requires semicolons between formula arguments.
  var locale = "";
  try { locale = String(getSS().getSpreadsheetLocale() || "").toLowerCase(); } catch (e) {}
  return /^(id|de|fr|es|it|pt|nl|ru|tr|pl|sv|da|fi|no|cs|sk|hu|ro|uk|el|he|ar|th|vi|ja|ko|zh)/.test(locale) ? ";" : ",";
}

function buildDivisionStockFormula_(rowNumber, kode, sources) {
  var codeCell = "$B$" + rowNumber;
  var code = String(kode || "").trim().toUpperCase();
  var sep = divisionFormulaArgumentSeparator_();
  if (/^BB(CV|PT)-/.test(code)) return "=IFERROR(" + divisionStockLookupExpression_(sources.bb, codeCell) + sep + "0)";
  if (/^CV-/.test(code)) return "=IFERROR(" + divisionStockLookupExpression_(sources.cv, codeCell) + sep + "0)";
  if (/^(PT|WK|MM)-/.test(code)) return "=IFERROR(" + divisionStockLookupExpression_(sources.pt, codeCell) + sep + "0)";
  return "=0";
}

// Repairs only formula cells in column F; does not rebuild or clear the table.
function repairDivisionStockFormulas() {
  var ss = getSS();
  var sh = ss.getSheetByName("Data Stok Per Divisi");
  if (!sh) return { success:false, error:'Sheet "Data Stok Per Divisi" tidak ditemukan' };
  var sources = getDivisionStockFormulaSources_();
  if (!sources.success) return { success:false, error:sources.error };
  var lastRow = Math.min(sh.getLastRow(), 5000);
  var codes = sh.getRange(1, 2, lastRow, 1).getDisplayValues();
  var repaired = 0, failed = [];
  for (var i = 0; i < lastRow; i++) {
    var kode = String(codes[i][0] || "").trim();
    if (!/^[A-Z]{2,6}-[A-Z0-9-]*\d[A-Z0-9-]*$/i.test(kode)) continue;
    try {
      sh.getRange(i + 1, 6).setFormula(buildDivisionStockFormula_(i + 1, kode, sources));
      repaired++;
    } catch (e) { failed.push({ row:i + 1, kode:kode, error:String(e.message || e) }); }
  }
  SpreadsheetApp.flush();
  var audit = auditDivisionStockFormulaCells_();
  updateLastUpdateTimestamp();
  return {
    success:failed.length === 0 && audit.success,
    repaired:repaired, formulaCount:audit.formulaCount, itemCount:audit.itemCount,
    failed:failed, audit:audit, locale:ss.getSpreadsheetLocale(),
    separator:divisionFormulaArgumentSeparator_(),
    message:failed.length ? "Sebagian formula gagal ditulis." : "Formula kolom F ditulis ulang; verifikasi hasil melalui audit."
  };
}

function auditDivisionStockFormulaCells_() {
  var ss = getSS();
  var sh = ss.getSheetByName("Data Stok Per Divisi");
  if (!sh) return { success:false, error:'Sheet "Data Stok Per Divisi" tidak ditemukan' };
  var lastRow = Math.min(sh.getLastRow(), 5000);
  if (lastRow < 1) return { success:false, error:"Data Stok Per Divisi kosong", itemCount:0, formulaCount:0, missing:[], formulaErrors:[] };
  var codes = sh.getRange(1, 2, lastRow, 1).getDisplayValues();
  var formulas = sh.getRange(1, 6, lastRow, 1).getFormulas();
  var results = sh.getRange(1, 6, lastRow, 1).getDisplayValues();
  var itemCount = 0, formulaCount = 0, missing = [], formulaErrors = [];
  for (var i = 0; i < lastRow; i++) {
    var kode = String(codes[i][0] || "").trim();
    if (!/^[A-Z]{2,6}-[A-Z0-9-]*\d[A-Z0-9-]*$/i.test(kode)) continue;
    itemCount++;
    if (String(formulas[i][0] || "").charAt(0) === "=") formulaCount++;
    else missing.push({ row:i+1, kode:kode });
    var shown = String(results[i][0] || "").trim();
    if (/^#(ERROR!|REF!|VALUE!|N\/A|NAME\?|NUM!|DIV\/0!)/i.test(shown)) {
      formulaErrors.push({ row:i+1, kode:kode, result:shown, formula:formulas[i][0] || "" });
    }
  }
  return { success:missing.length===0 && formulaErrors.length===0, itemCount:itemCount, formulaCount:formulaCount, missing:missing, formulaErrors:formulaErrors };
}

/**
 * Formula-safe lightweight sync.
 * Spreadsheet formulas recalculate from Stock CV/PT/Stock Bahan Baku automatically.
 * This function deliberately performs ZERO writes to column F.
 */
function syncDivisionStockLightweight_() {
  SpreadsheetApp.flush();
  var audit = auditDivisionStockFormulaCells_();
  if (!audit.success) {
    return {
      success:false, error:"Ada sel Sisa Stok tanpa formula; tidak ada sel F yang ditulis.",
      mode:"FORMULA_AUDIT_ONLY", formulaProtected:true, itemCount:audit.itemCount,
      formulaCount:audit.formulaCount, missing:audit.missing
    };
  }
  clearDataDirty_();
  return {
    success:true, updatedCells:0, formulaProtected:true, itemCount:audit.itemCount,
    formulaCount:audit.formulaCount, mode:"FORMULA_RECALC_ONLY",
    message:"Sisa Stok diperbarui oleh formula spreadsheet; backend tidak menulis kolom F."
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
  var ss = getSS();
  var src = ss.getSheetByName("Stock Awal");
  var dest = ss.getSheetByName("Data Stok Per Divisi");
  if (!src || !dest) return { success:false, error:"Sheet Stock Awal / Data Stok Per Divisi tidak ditemukan" };

  var formulaSources = getDivisionStockFormulaSources_();
  if (!formulaSources.success) return { success:false, error:formulaSources.error, phase:"PREFLIGHT_FORMULA_SOURCES" };

  var data = src.getDataRange().getValues();
  if (data.length < 2) return { success:false, error:"Stock Awal kosong" };
  var header = data[0].map(function(h) { return String(h).toLowerCase().trim(); });
  var idxKode = header.findIndex(function(h) { return h.indexOf("kode") >= 0; });
  var idxNama = header.findIndex(function(h) { return h.indexOf("nama") >= 0; });
  var idxSatuan = header.findIndex(function(h) { return h.indexOf("satuan") >= 0; });
  var idxDivisi = header.findIndex(function(h) { return h.indexOf("divisi") >= 0; });
  if (idxKode < 0 || idxDivisi < 0) return { success:false, error:"Header Stock Awal tidak lengkap" };

  // Read-only preflight: no write to Stock CV, Stock PT, or Stock Bahan Baku.
  var stockMap = {};
  ["Stock CV", "Stock PT"].forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 4) return;
    var lastCol = sh.getLastColumn();
    var hdr = sh.getRange(3, 1, 1, lastCol).getDisplayValues()[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var cK = hdr.findIndex(function(h) { return h.indexOf("kode") >= 0; });
    var cA = hdr.findIndex(function(h) { return h.indexOf("stock akhir") >= 0; });
    if (cK < 0 || cA < 0) return;
    var rows = sh.getRange(4, 1, sh.getLastRow()-3, lastCol).getValues();
    rows.forEach(function(row) {
      var kode = String(row[cK] || "").trim();
      if (kode && !/^total/i.test(kode)) stockMap[kode] = clampStockToZero_(row[cA]);
    });
  });
  var bbSource = applyBahanBakuStockSource_(stockMap);
  if (!bbSource.success) return { success:false, error:bbSource.error, mode:"BAHAN_BAKU_SOURCE_REQUIRED" };

  var groups = { "DAPUR 1":[], "DAPUR 2":[], "MIE":[], "PACKING":[], "CS":[], "BAHAN BAKU":[], "REKANAN":[] };
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var kode = String(row[idxKode] || "").trim();
    if (!kode) continue;
    var div = normalizeDivision_(row[idxDivisi]);
    if (kode.indexOf("BBCV-") === 0 || kode.indexOf("BBPT-") === 0) div = "BAHAN BAKU";
    if (!groups[div]) continue;
    groups[div].push([
      kode, idxNama >= 0 ? row[idxNama] : "", idxSatuan >= 0 ? row[idxSatuan] : "",
      div, "", div === "CS" ? (SIZE_MAP_CS[kode] || "") : ""
    ]);
  }

  var order = ["DAPUR 1","DAPUR 2","MIE","PACKING","CS","BAHAN BAKU","REKANAN"];
  var out = [
    ["TABEL DATA STOK PER DIVISI — V7 FORMULA-SAFE", "", "", "", "", "", ""],
    ["Sisa Stok = formula dari Stock CV/PT; BAHAN BAKU = Stock Bahan Baku | Update: " +
      Utilities.formatDate(new Date(), TIMEZONE, "dd-MMM-yyyy HH:mm:ss"), "", "", "", "", "", ""]
  ];
  var formulaByRow = [];
  order.forEach(function(div) {
    var items = groups[div] || [];
    out.push(["DIVISI : " + div, "", "", "", "", "", ""]);
    out.push(["TOTAL PRODUK : " + items.length + " ITEM", "", "", "", "", "", ""]);
    out.push(div === "CS"
      ? ["No","Kode Barang","Nama Barang","Satuan","Divisi","Sisa Stok","Size"]
      : ["No","Kode Barang","Nama Barang","Satuan","Divisi","Sisa Stok","Keterangan"]);
    items.forEach(function(item, idx) {
      var outputRow = out.length + 1;
      var kode = item[0];
      out.push([idx + 1, kode, item[1], item[2], div, "", item[5]]);
      formulaByRow[outputRow - 1] = buildDivisionStockFormula_(outputRow, kode, formulaSources);
    });
    out.push(["","","","","","",""]);
  });

  var neededRows = Math.max(out.length, 4);
  if (dest.getMaxRows() < neededRows) dest.insertRowsAfter(dest.getMaxRows(), neededRows - dest.getMaxRows());
  if (dest.getMaxColumns() < 7) dest.insertColumnsAfter(dest.getMaxColumns(), 7 - dest.getMaxColumns());

  // Controlled rebuild: clear only the managed A:G table, then restore F as formulas.
  // No writes are performed to the source sheets Stock CV/PT/Stock Bahan Baku.
  var oldRows = Math.max(neededRows, Math.min(dest.getLastRow(), 5000));
  try { dest.getRange(1, 1, oldRows, 7).breakApart(); } catch (e) {}
  dest.getRange(1, 1, oldRows, 5).clearContent();
  dest.getRange(1, 6, oldRows, 1).clearContent();
  dest.getRange(1, 7, oldRows, 1).clearContent();

  dest.getRange(1, 1, out.length, 5).setValues(out.map(function(r) { return r.slice(0,5); }));
  dest.getRange(1, 6, out.length, 1).setFormulas(out.map(function(r, i) { return [formulaByRow[i] || ""]; }));
  dest.getRange(1, 7, out.length, 1).setValues(out.map(function(r) { return [r[6]]; }));

  dest.getRange(1, 1, 1, 7).merge().setFontWeight("bold").setFontSize(14);
  dest.getRange(2, 1, 1, 7).merge().setFontStyle("italic").setFontSize(9);
  var r = 3;
  order.forEach(function(div) {
    var count = (groups[div] || []).length;
    dest.getRange(r, 1, 1, 7).merge().setFontWeight("bold"); r += 2;
    dest.getRange(r, 1, 1, 7).setFontWeight("bold"); r += 1 + count + 1;
  });
  dest.setFrozenRows(3);
  SpreadsheetApp.flush();

  var formulaAudit = auditDivisionStockFormulaCells_();
  if (!formulaAudit.success) {
    return { success:false, error:"Rebuild selesai tetapi verifikasi formula F tidak lengkap.", formulaAudit:formulaAudit };
  }
  updateLastUpdateTimestamp();
  clearDataDirty_();
  var total = order.reduce(function(sum, d) { return sum + (groups[d] || []).length; }, 0);
  return {
    success:true, total:total, bahanBakuCount:bbSource.count, bahanBakuSource:"Stock Bahan Baku",
    formulaProtected:true, formulaCount:formulaAudit.formulaCount,
    message:total + " item dibangun ulang; kolom F berisi formula, bukan nilai tetap."
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
  // Hanya tiga lokasi metadata yang memang menampilkan waktu update.
  // Sheet transaksi/master tidak perlu disentuh pada setiap write.
  try {
    const dashboard = ss.getSheetByName("Dashboard");
    if (dashboard) dashboard.getRange("A2").setValue("Pantauan Stok & Aktivitas — Real Time | " + stamp);
  } catch (e) { console.error("Timestamp Dashboard gagal: " + e.message); }
  try {
    const division = ss.getSheetByName("Data Stok Per Divisi");
    if (division) division.getRange(2, 1).setValue("Sisa Stok = Stock Akhir CV/PT | " + stamp);
  } catch (e) { console.error("Timestamp Data Stok Per Divisi gagal: " + e.message); }
  try {
    const config = ss.getSheetByName("Config");
    if (config) config.getRange(2, 1).setValue("Konfigurasi sistem • periode aktif • parameter sinkronisasi • " + stamp);
  } catch (e) { console.error("Timestamp Config gagal: " + e.message); }
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

function getPOStatusFromStatusPO_() {
  const st = getStatusPO();
  if (!st || !st.success) return null;
  const out = {
    aktif: { cv: 0, pt: 0, purchaseOrder: 0, total: 0, itemCount: 0 },
    konfirmasi: { cv: 0, pt: 0, purchaseOrder: 0, total: 0, itemCount: 0 }
  };
  (st.items || []).forEach(function(it) {
    const b = it.status === "SELESAI" ? out.konfirmasi : out.aktif;
    b.cv += Number(it.poCV) || 0;
    b.pt += Number(it.poPT) || 0;
    b.total += Number(it.totalPO) || 0;
    b.itemCount++;
  });
  return out;
}

function getPOStatus_() {
  try {
    const viaStatusPO = getPOStatusFromStatusPO_();
    if (viaStatusPO) return viaStatusPO;
  } catch (poErr) { console.error("getPOStatus_ via getStatusPO gagal: " + poErr.message); }
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
  const cCV = headers.findIndex(function(h) { return /PO\s*CV|CV\s*PO/.test(h); });
  const cPT = headers.findIndex(function(h) { return /PO\s*PT|PT\s*PO/.test(h); });
  const cTotal = headers.findIndex(function(h) { return /^TOTAL$|TOTAL\s*PO/.test(h); });
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
  // Read-only diagnostics: never clear or write the Dashboard sheet.
  var data = getDashboardData();
  if (!data || !data.success) return { success:false, error:(data && data.error) || "Dashboard data gagal dibaca" };
  return {
    success:true, readOnly:true, totalItem:data.totalItemAktif || data.totalItem || 0,
    aman:data.aman || 0, waspada:data.waspada || 0, kritis:data.kritis || 0,
    divisionCount:(data.statusPerDivisi || []).length,
    poStatusAvailable:!!data.statusPO,
    lastUpdate:data.lastUpdate || getLastUpdateTimestamp()
  };
}

function clearDashboardCharts_(sheet) {
  if (!sheet) {
    console.error("Dashboard tidak ditemukan; penghapusan grafik dilewati.");
    return { success: false, removed: 0, failed: 0 };
  }

  var charts = sheet.getCharts();
  var removed = 0;
  var failed = 0;

  charts.forEach(function(chart, index) {
    try {
      sheet.removeChart(chart);
      removed++;
    } catch (err) {
      failed++;
      console.error("Grafik lama ke-" + (index + 1) +
        " gagal dihapus: " + String(err && err.message || err));
    }
  });

  console.log("Pembersihan grafik Dashboard: " +
    JSON.stringify({ removed: removed, failed: failed }));
  return { success: failed === 0, removed: removed, failed: failed };
}

/**
 * Grafik batang mendatar (horizontal bar) status stok per divisi.
 * Data sumber: statusPerDivisi dari getDashboardData().
 */
function refreshDashboard(force) {
  // LEGACY FULL REBUILD DISABLED:
  // Versi lama menghapus seluruh chart lalu breakApart/clearContent A1:N30.
  // Ini berisiko menimpa kartu/Top 10/aktivitas yang dikelola layout lain.
  // Dashboard hanya boleh diperbarui oleh writer yang memiliki rentang terkunci.
  return {
    success: true,
    skippedHeavyRebuild: true,
    reason: "Legacy full-dashboard rebuild dinonaktifkan untuk mencegah bentrok layout. Bagian PO menggunakan refreshDashboardPOSection_ mulai row 46.",
    protectedRows: "28:45",
    poStartRow: PO_SECTION_CURRENT_ROW,
    lastUpdate: getLastUpdateTimestamp(),
    dirty: isDataDirty_()
  };
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
function onEditRouter_(e) {
  try {
    if (!e || !e.range) return;
    const sheetName = e.range.getSheet().getName();
    const stockSheets = ["Stock CV", "Stock PT", "Stock Awal", "Stock Bahan Baku"];
    // Manual edits to transaction journals also affect formula-derived Stock Akhir.
    const transactionSheets = ["Barang masuk", "Barang keluar", "Barang Rusak"];
    const stockImpacting = stockSheets.indexOf(sheetName) >= 0 || transactionSheets.indexOf(sheetName) >= 0;
    const affected = stockImpacting || sheetName === "purchase order" || Object.keys(SHEET_CONFIG).indexOf(sheetName) >= 0;
    if (!affected) return;
    clearMasterCache();
    markDataDirty_(sheetName);
    updateLastUpdateTimestamp();
    if (stockImpacting) {
      // Formula Sisa Stok mengikuti perubahan sumber secara native.
      // Flush dipertahankan sebelum refresh Dashboard; audit formula penuh tidak dijalankan
      // pada setiap edit agar tidak membebani input manual.
      try { SpreadsheetApp.flush(); } catch (flushErr) {
        console.error("onEdit flush: " + flushErr.message);
      }
    }
    try { refreshDashboardDataLight693_(); } catch (dashErr) { console.error("Dashboard refresh ringan gagal: " + dashErr.message); }
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
function installManagedTriggers_(spreadsheet) {
  var ss = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Spreadsheet aktif tidak ditemukan.");

  // Remove every known legacy/duplicate handler before installing the single approved set.
  var managed = [
    "sendDailyStockReport","weeklyPOAutomation","logDailySnapshot","processEmailQueue",
    "sendWeeklyPOReport","refreshDashboard","refreshAllData","refreshDashboardDataLight693_",
    "refreshStatusStockLight_","refreshDashboardFinal_","refreshDashboardOperationalV68_",
    "refreshDashboardPODataOnly_","refreshWeeklyPODashboard","buildMasterExecutiveDashboardV69",
    "onEdit","onEditRouter_"
  ];
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (managed.indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t); removed++;
    }
  });

  ScriptApp.newTrigger("sendDailyStockReport").timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger("weeklyPOAutomation").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  ScriptApp.newTrigger("logDailySnapshot").timeBased().everyDays(1).atHour(23).create();
  ScriptApp.newTrigger("refreshDashboardDataLight693_").timeBased().everyMinutes(10).create();
  // Only one installable edit handler is used; there is no simple-trigger function named onEdit.
  ScriptApp.newTrigger("onEditRouter_").forSpreadsheet(ss).onEdit().create();

  return {
    success:true, removedLegacyTriggers:removed,
    handlers:["sendDailyStockReport","weeklyPOAutomation","logDailySnapshot","refreshDashboardDataLight693_","onEditRouter_"],
    dashboardRefreshMinutes:10, queueWriteEnabled:false
  };
}

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

  _cachedSS = null;
  _resolvedSpreadsheetId = null;
  updateLastUpdateTimestamp();
  try { maintenanceCleanup(true); } catch (maintenanceErr) { console.error("Maintenance awal gagal: " + maintenanceErr.message); }

  // Dashboard layout migration is deliberately NOT run from setup.
  // It has separate layout approval and must never clear charts or reposition PO blocks implicitly.
  var triggerSetup = installManagedTriggers_(ss);
  try { refreshDashboardDataLight693_(); } catch (dashboardRefreshErr) { console.error("Refresh Dashboard ringan gagal: " + dashboardRefreshErr.message); }

  const activeMonth = getActiveMonth();
  console.log("=== setupEnvironment BACKEND GudangAI-69 " + BACKEND_VERSION + " SELESAI ===");
  console.log("Spreadsheet: " + ss.getName());
  console.log("Bulan aktif: " + activeMonth.nama + " " + activeMonth.tahun);
  console.log("Trigger terpasang: " + triggerSetup.handlers.join(", "));
  try {
    const masterNow = getAllStock("ALL");
    console.log("Total master data aktual: " + (masterNow && masterNow.count != null ? masterNow.count : 0));
  } catch (countErr) { console.log("Total master data aktual: gagal dibaca — " + countErr.message); }

  return {
    success:true, spreadsheetId:ss.getId(), spreadsheetName:ss.getName(), activeMonth:activeMonth,
    title:APP_TITLE, configSheet:CONFIG_SHEET_NAME, triggerSetup:triggerSetup,
    message:"Backend GudangAI-69 siap. Dashboard layout tidak diubah; hanya satu dashboard refresh trigger 10 menit dipasang."
  };
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
  // Index nama sekali agar lookup kandidat PO O(master + PO), bukan filter master untuk setiap item.
  const stockByNameCV = Object.create(null);
  const stockByNamePT = Object.create(null);
  allStockForPO_.forEach(function(item) {
    const key = normalizePONameKey_(item.nama);
    if (!key) return;
    const target = item.entitas === "CV" ? stockByNameCV : (item.entitas === "PT" ? stockByNamePT : null);
    if (!target) return;
    if (!target[key]) target[key] = [];
    target[key].push(item);
  });

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
    const nameKey = normalizePONameKey_(nama);
    const cvCandidates = stockByNameCV[nameKey] || [];
    const ptCandidates = stockByNamePT[nameKey] || [];
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
  // SAFETY BOUNDARY: PO dashboard is allowed only in A46:M99.
  // Refuse any caller that attempts to clear rows 1–45 or extend beyond row 99.
  const start = Number(startRow);
  const requestedEnd = Number(endRow);
  if (!Number.isInteger(start) || !Number.isInteger(requestedEnd) ||
      start !== PO_SECTION_CURRENT_ROW || requestedEnd < start) {
    throw new Error("PO dashboard clear ditolak: rentang harus dimulai tepat pada row 46.");
  }
  const safeEnd = Math.min(99, requestedEnd);
  if (safeEnd < start) return;
  if (sheet.getMaxRows() < safeEnd) sheet.insertRowsAfter(sheet.getMaxRows(), safeEnd - sheet.getMaxRows());
  sheet.getRange(start, 1, safeEnd - start + 1, 13).breakApart().clearContent();
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

function refreshDashboardPOSection_(options) {
  options = options || { renderCharts: true };
  const ss = getSS();
  const sh = ss.getSheetByName('Dashboard');
  if (!sh) return { success: false, code: 'DASHBOARD_NOT_FOUND', error: 'Sheet Dashboard tidak ditemukan' };
  const data = getStatusPO();
  if (!data.success) return data;
  const previous = getPreviousPOStatus_();
  const currentTop = PO_SECTION_CURRENT_ROW;
  const currentCount = Math.min(PO_DASHBOARD_MAX_VISIBLE_ROWS, Math.max(1, (data.items || []).length));
  const currentEnd = currentTop + 4 + currentCount - 1;
  // Keep the two weekly blocks isolated: current 46:65, previous 66:85.
  const previousTop = currentTop + 20;
  const previousItems = previous.items || [];
  const previousCount = Math.min(PO_DASHBOARD_MAX_VISIBLE_ROWS, Math.max(1, previousItems.length));
  const previousEnd = previousTop + 4 + previousCount - 1;
  // Clear only the reserved PO area; rows 1:45 and columns P:V remain untouched.
  const clearEnd = previousTop + 20 - 1;
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
    currentCount: (data.items || []).length, previousCount: previousItems.length, chartStartRow: currentEnd + 2,
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

/*
 * One-time Dashboard migration.
 * It is intentionally not called by onEdit, weeklyPOAutomation, or the
 * lightweight refresh trigger. This prevents an old trigger from rebuilding
 * the sheet and overwriting the approved layout.
 */
function setupCleanDashboardLayoutOnce() {
  return {
    success:false, skipped:true, readOnly:true,
    reason:"Migrasi layout lama dinonaktifkan karena masih memuat tiga chart dan rentang yang belum direkonsiliasi dengan layout Dashboard yang disetujui."
  };
}

/* DASHBOARD FINAL 6.9.3 — Opsi B: formatting stabil + refresh data ringan */
var DASH693 = {
  head:'#0e7490', sub:'#155e75', alt:'#f0f9ff', white:'#ffffff',
  border:'#bae6fd', critical:'#fee2e2', warning:'#fef9c3', safe:'#dcfce7',
  text:'#0f172a'
};

/**
 * Format konsisten tanpa menghapus isi tabel dan tanpa menyentuh baris 28–45.
 * Tabel Opsi B memakai area A4:G14, I4:N19, A24:F36, H24:L30.
 */
function formatDashboardLayout693_() {
  return {
    success:false, skipped:true, readOnly:true,
    reason:"Writer layout lama dinonaktifkan agar tidak menghapus chart atau menulis ulang area Dashboard sebelum layout final direkonsiliasi."
  };
}

/**
 * Refresh ringan: perbarui data PO mingguan yang sudah punya renderer aman.
 * Tidak menjalankan setup layout, tidak menghapus chart, dan tidak menulis ke sheet purchase order.
 */
function writeDashboardData693_(d) {
  var s=getSS().getSheetByName('Dashboard'); if(!s||!d||!d.success)return {success:false,error:'Dashboard/data tidak valid'};
  var k=(d.top10Kritis||[]).slice(0,10).map(function(x,i){return [i+1,x.kode||'',x.nama||'',x.divisi||'',+x.sisa||0,+x.aman||0,+x.kurang||0]});
  while(k.length<10)k.push(['','','','','','','']);
  s.getRange('A5:G5').setValues([['NO','KODE','NAMA BARANG','DIVISI','STOK AKHIR','STOK AMAN','KEKURANGAN']]);s.getRange('A6:G15').setValues(k);
  s.getRange('I5:J5').setValues([['INDIKATOR','JUMLAH']]);s.getRange('I6:J10').setValues([['Total Item',+(d.totalItemAktif||d.totalItem)||0],['Total Sisa Stok',+d.totalStok||0],['Stok Aman',+d.aman||0],['Stok Waspada',+d.waspada||0],['Stok Kritis',+d.kritis||0]]);
  var t=d.trend7Hari||{labels:[],values:[]},tr=[];for(var i=0;i<7;i++)tr.push([t.labels[i]||'',t.values[i]==null?'':+t.values[i]||0,'','','','']);
  s.getRange('I12:J12').setValues([['TANGGAL','TOTAL ITEM']]);s.getRange('I13:J19').setValues(tr.map(function(r){return [r[0],r[1]]}));
  var v=(d.statusPerDivisi||[]).slice(0,2).map(function(x){var n=+x.total||0,q=+x.kritis||0;return [x.divisi||'',n,+x.aman||0,+x.waspada||0,q,n?Math.round(q/n*1000)/10:0]});while(v.length<2)v.push(['','','','','','']);
  s.getRange('A25:F25').setValues([['DIVISI','TOTAL ITEM','AMAN','WASPADA','KRITIS','% KRITIS']]);s.getRange('A26:F27').setValues(v);
  var a=d.aktivitasHariIni||{};s.getRange('H25:I25').setValues([['AKTIVITAS HARI INI','JUMLAH']]);s.getRange('H26:I30').setValues([['Barang Masuk',+a.masuk||0],['Barang Keluar',+a.keluar||0],['Barang Rusak',+a.rusak||0],['Total Aktivitas',+a.total||0],['Update Terakhir',d.lastUpdate||'N/A']]);
  var dv=(d.statusPerDivisi||[]).map(function(x){return [x.divisi||'',+x.aman||0,+x.waspada||0,+x.kritis||0]});if(!dv.length)dv=[['Tidak ada data',0,0,0]];
  s.getRange(1,16,Math.max(1,dv.length)+1,4).clearContent();s.getRange(1,16,1,4).setValues([['DIVISI','AMAN','WASPADA','KRITIS']]);s.getRange(2,16,dv.length,4).setValues(dv);
  s.getRange('U1:V4').setValues([['STATUS','JUMLAH'],['AMAN',+d.aman||0],['WASPADA',+d.waspada||0],['KRITIS',+d.kritis||0]]);
  var ct=[['TANGGAL','TOTAL ITEM']],tt=d.trend7Hari||{labels:[],values:[]};for(var q=0;q<7;q++)ct.push([tt.labels[q]||'',tt.values[q]==null?'':+tt.values[q]||0]);s.getRange('X1:Y8').setValues(ct);
  var ac=d.aktivitasHariIni||{};s.getRange('AA1:AB4').setValues([['AKTIVITAS','QTY'],['MASUK',+ac.masuk||0],['KELUAR',+ac.keluar||0],['RUSAK',+ac.rusak||0]]);
  var ps=getStatusPO(),p=ps&&ps.summary||{};s.getRange('AD1:AE4').setValues([['STATUS PO','ITEM'],['SELESAI',+p.itemSelesai||0],['SEBAGIAN',+p.itemSebagian||0],['MENUNGGU',+p.itemMenunggu||0]]);try{s.hideColumns(16,16)}catch(e){}
  s.getRange('A2').setValue('Pantauan Stok & Aktivitas — Real Time | Update terakhir: '+Utilities.formatDate(new Date(),TIMEZONE,'yyyy-MM-dd HH:mm:ss'));
  return {success:true,totalItem:d.totalItemAktif||d.totalItem};
}

function refreshDashboardDataLight693_() {
  var l=LockService.getScriptLock();if(!l.tryLock(5000))return {success:false,skipped:true,reason:'Dashboard refresh sedang berjalan'};
  try{var d=getDashboardData();if(!d||!d.success)return {success:false,error:(d&&d.error)||'Gagal membaca dashboard'};
    var w=writeDashboardData693_(d);if(!w.success)return w;
    var p=refreshDashboardPOSection_({renderCharts:false,lightweight:true});if(!p||!p.success)return p||{success:false,error:'Refresh PO gagal'};
    return {success:true,version:'6.9.4-DASHBOARD-REPAIR',mode:'LIGHT_DATA_REFRESH',totalItem:d.totalItemAktif||d.totalItem,po:p.status||'OK',updatedAt:new Date().toISOString()};
  }finally{l.releaseLock();}
}
function ensureSingleDashboardRefreshTrigger_() {
  var legacy = [
    "refreshDashboardDataLight693_","refreshStatusStockLight_","refreshDashboardFinal_",
    "refreshDashboardOperationalV68_","refreshDashboardPODataOnly_","refreshWeeklyPODashboard"
  ];
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (legacy.indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t); removed++;
    }
  });
  ScriptApp.newTrigger("refreshDashboardDataLight693_").timeBased().everyMinutes(10).create();
  return {success:true, handler:"refreshDashboardDataLight693_", intervalMinutes:10, removedLegacy:removed};
}

function installDashboardLightTrigger693_() {
  var trigger = ensureSingleDashboardRefreshTrigger_();
  var initialRefresh = refreshDashboardDataLight693_();
  return {success:true, version:"V7-MANAGED-TRIGGER", trigger:trigger, initialRefresh:initialRefresh};
}
// ============================================================
// V6.6.5+ LIGHT STATUS STOCK + DASHBOARD CARDS
// ============================================================

var LIGHT_DASH_STATUS_START = 3;
var LIGHT_DASH_KRITIS_START = 8;
var LIGHT_DASH_AKTIVITAS_START = 21;

function writeDashboardStatusCardsLight_() {
  return {
    success:false, skipped:true, readOnly:true,
    reason:"Writer kartu Dashboard lama dinonaktifkan; satu-satunya writer data Dashboard adalah refreshDashboardDataLight693_."
  };
}

function refreshStatusStockLight_() {
  // Compatibility alias: delegate to the single managed Dashboard writer.
  return refreshDashboardDataLight693_();
}

function installStatusStockLightTrigger_() {
  // Compatibility alias: never install a second scheduled Dashboard writer.
  return installDashboardLightTrigger693_();
}

function testRefreshStatusStockLight_() {
  var res = refreshStatusStockLight_();
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}
/**
 * Bersihkan sisa STATUS PO lama (baris 39–45)
 * Jalankan SEKALI saja: pilih fungsi ini → Run
 */
function cleanDashboardPORows39to45() {
  return {
    success:false, skipped:true, readOnly:true,
    reason:"Pembersihan baris Dashboard 39:45 dinonaktifkan sampai pemilik layout mengonfirmasi area tersebut."
  };
}


/* ============================================================
 * OPERATIONS HUB — additive module, isolated from stock/PO sheets.
 * Dedicated sheet: Aktivitas Operasional. Calendar operations run server-side.
 * ============================================================ */
var OPS_ACTIVITY_SHEET = "Aktivitas Operasional";
var OPS_ACTIVITY_HEADERS = ["ID Aktivitas","Kategori","Judul","Deskripsi","Penanggung Jawab","Tanggal","Jam","Status","Checklist JSON","Calendar Event ID","Dibuat","Update Terakhir"];

function opsActivitySheet_() {
  var ss = getSS();
  var sh = ss.getSheetByName(OPS_ACTIVITY_SHEET);
  if (!sh) sh = ss.insertSheet(OPS_ACTIVITY_SHEET);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, OPS_ACTIVITY_HEADERS.length).setValues([OPS_ACTIVITY_HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, OPS_ACTIVITY_HEADERS.length).setFontWeight("bold").setBackground("#12304a").setFontColor("#ffffff");
  } else {
    var current = sh.getRange(1, 1, 1, OPS_ACTIVITY_HEADERS.length).getDisplayValues()[0];
    if (String(current[0] || "") !== OPS_ACTIVITY_HEADERS[0]) throw new Error("Header sheet Aktivitas Operasional tidak sesuai; data tidak diubah.");
  }
  return sh;
}
function opsSafeText_(value, max) {
  var s = String(value == null ? "" : value).trim();
  if (s.length > max) throw new Error("Teks melebihi batas " + max + " karakter.");
  return s;
}
function opsParseChecklist_(value) {
  var raw = value;
  if (typeof raw === "string") { try { raw = JSON.parse(raw || "[]"); } catch (e) { raw = []; } }
  if (!Array.isArray(raw)) raw = [];
  return raw.slice(0, 100).map(function(x, i) {
    return { id: opsSafeText_(x && x.id || ("c" + i), 80), text: opsSafeText_(x && x.text, 240), done: !!(x && x.done) };
  }).filter(function(x) { return !!x.text; });
}
function opsFormatActivityRow_(row) {
  var checklist = [];
  try { checklist = opsParseChecklist_(row[8]); } catch (e) {}
  return {
    id: String(row[0] || ""), category: String(row[1] || "order"), title: String(row[2] || ""),
    description: String(row[3] || ""), owner: String(row[4] || ""), date: String(row[5] || ""),
    time: String(row[6] || ""), status: String(row[7] || "open"), checklist: checklist,
    calendarEventId: String(row[9] || ""), createdAt: row[10] ? new Date(row[10]).toISOString() : "",
    updatedAt: row[11] ? new Date(row[11]).toISOString() : ""
  };
}
function opsListActivities_() {
  var sh = opsActivitySheet_(), last = sh.getLastRow();
  if (last < 2) return { success: true, items: [], sheet: OPS_ACTIVITY_SHEET, timestamp: new Date().toISOString() };
  var rows = sh.getRange(2, 1, last - 1, OPS_ACTIVITY_HEADERS.length).getValues();
  var items = rows.filter(function(r) { return String(r[0] || "").trim(); }).map(opsFormatActivityRow_);
  items.sort(function(a,b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  return { success: true, items: items, sheet: OPS_ACTIVITY_SHEET, timestamp: new Date().toISOString() };
}
function opsSyncCalendarEvent_(activity, existingId) {
  var calendar = CalendarApp.getDefaultCalendar();
  if (!activity.date) {
    if (existingId) { try { var oldEvent = calendar.getEventById(existingId); if (oldEvent) oldEvent.deleteEvent(); } catch (e) { throw new Error("Gagal menghapus event Calendar lama: " + (e.message || e)); } }
    return "";
  }
  var start = new Date(activity.date + "T" + (activity.time || "09:00") + ":00+07:00");
  if (isNaN(start.getTime())) throw new Error("Tanggal/jam aktivitas tidak valid untuk Google Calendar.");
  var end = new Date(start.getTime() + 60 * 60 * 1000);
  var event = null;
  if (existingId) { try { event = calendar.getEventById(existingId); } catch (e) { event = null; } }
  var marker = "GudangAI Activity ID: " + activity.id;
  var description = [activity.description || "", activity.owner ? "Penanggung jawab: " + activity.owner : "",
    "Kategori: " + activity.category, "Status: " + activity.status,
    "Checklist: " + activity.checklist.filter(function(x) { return x.done; }).length + "/" + activity.checklist.length + " selesai", marker].filter(Boolean).join("\n");
  // Recovery guard: avoid duplicate Calendar events if event creation succeeded but the Sheet write timed out.
  if (!event) {
    var dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    var dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    var candidates = calendar.getEvents(dayStart, dayEnd);
    for (var ci = 0; ci < candidates.length; ci++) {
      if (String(candidates[ci].getDescription() || "").indexOf(marker) >= 0) { event = candidates[ci]; break; }
    }
  }
  if (event) {
    event.setTitle("[GudangAI] " + activity.title);
    event.setTime(start, end);
    event.setDescription(description);
  } else {
    event = calendar.createEvent("[GudangAI] " + activity.title, start, end, { description: description });
    try { event.addPopupReminder(30); } catch (e) {}
  }
  return event.getId();
}
function opsSaveActivity_(input) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, error: "Aktivitas sedang diproses. Coba kembali." };
  try {
    var sh = opsActivitySheet_(), data = input || {};
    var id = opsSafeText_(data.id, 80) || Utilities.getUuid();
    var category = opsSafeText_(data.category || "order", 40);
    if (["order","team","meeting","logistics"].indexOf(category) < 0) throw new Error("Kategori aktivitas tidak dikenal.");
    var title = opsSafeText_(data.title, 160);
    if (!title) throw new Error("Judul aktivitas wajib diisi.");
    var date = opsSafeText_(data.date, 10);
    if (date && !/^20\d{2}-\d{2}-\d{2}$/.test(date)) throw new Error("Tanggal harus berformat YYYY-MM-DD.");
    var time = opsSafeText_(data.time || "09:00", 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Jam harus berformat HH:mm.");
    var status = data.status === "done" ? "done" : "open";
    var checklist = opsParseChecklist_(data.checklist);
    var last = sh.getLastRow(), rowNo = -1, existing = null;
    if (last >= 2) {
      var ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
      for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) { rowNo = i + 2; break; }
    }
    if (rowNo > 0) existing = sh.getRange(rowNo, 1, 1, OPS_ACTIVITY_HEADERS.length).getValues()[0];
    var activity = { id:id, category:category, title:title, description:opsSafeText_(data.description,1000),
      owner:opsSafeText_(data.owner,120), date:date, time:time, status:status, checklist:checklist };
    var now = new Date(), createdAt = existing && existing[10] ? existing[10] : now;
    // Commit the spreadsheet record first: Calendar permission or service failures must
    // never discard an operational task that was successfully submitted by the operator.
    var calendarId = existing ? String(existing[9] || "") : "";
    var row = [id,category,title,activity.description,activity.owner,date,time,status,JSON.stringify(checklist),calendarId,createdAt,now];
    if (rowNo > 0) sh.getRange(rowNo, 1, 1, row.length).setValues([row]);
    else { sh.appendRow(row); rowNo = sh.getLastRow(); }
    var calendarSynced = false, calendarError = "";
    try {
      calendarId = opsSyncCalendarEvent_(activity, calendarId);
      sh.getRange(rowNo, 10, 1, 3).setValues([[calendarId,createdAt,new Date()]]);
      row[9] = calendarId; row[11] = new Date(); calendarSynced = !date || !!calendarId;
    } catch (calendarErr) {
      calendarError = String(calendarErr && calendarErr.message || calendarErr).substring(0, 500);
    }
    return { success:true, item:opsFormatActivityRow_(row), calendarSynced:calendarSynced,
      calendarError:calendarError, updatedAt:new Date().toISOString() };
  } finally { lock.releaseLock(); }
}
function opsDeleteActivity_(id) {
  var activityId = opsSafeText_(id, 80);
  if (!activityId) throw new Error("ID aktivitas wajib diisi.");
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success:false, error:"Aktivitas sedang diproses. Coba kembali." };
  try {
    var sh = opsActivitySheet_(), last = sh.getLastRow();
    if (last < 2) return { success:false, error:"Aktivitas tidak ditemukan." };
    var rows = sh.getRange(2, 1, last - 1, OPS_ACTIVITY_HEADERS.length).getValues();
    for (var i=0;i<rows.length;i++) {
      if (String(rows[i][0]) !== activityId) continue;
      var eventId = String(rows[i][9] || "");
      if (eventId) { try { var ev = CalendarApp.getDefaultCalendar().getEventById(eventId); if (ev) ev.deleteEvent(); } catch (e) {} }
      sh.deleteRow(i + 2);
      return { success:true, deletedId:activityId, calendarDeleted:!!eventId };
    }
    return { success:false, error:"Aktivitas tidak ditemukan." };
  } finally { lock.releaseLock(); }
}


/**
 * Jalankan satu kali dari Apps Script Editor untuk membuat tab aktivitas
 * dan meminta otorisasi Google Calendar. Tidak menyentuh sheet stok/transaksi.
 */
function setupOperationsHubCalendarAuthorization() {
  var sh = opsActivitySheet_();
  var calendar = CalendarApp.getDefaultCalendar();
  return { success:true, sheet:sh.getName(), calendarName:calendar.getName(), calendarId:calendar.getId(),
    message:"Tab Aktivitas Operasional siap dan akses Google Calendar telah diotorisasi." };
}
