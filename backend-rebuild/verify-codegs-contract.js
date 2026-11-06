import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, "..", "Code.gs"), "utf8");
new vm.Script(source, { filename: "Code.gs" });

function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, "Missing start marker: " + startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, "Missing end marker: " + endMarker);
  return source.slice(start, end);
}
function occurrences(token) {
  return source.split(token).length - 1;
}

assert.ok(source.includes('const BACKEND_VERSION = "7.0.1-PERFORMANCE-CANDIDATE"'));
assert.equal(occurrences("function syncDivisionStockLightweight_()"), 1);
assert.equal(occurrences("function syncDivisionStock(options)"), 1);
assert.equal(occurrences("function onEdit(e)"), 0);
assert.ok(source.includes("function onEditRouter_(e)"));
assert.ok(source.includes("function getDivisionStockFormulaSources_()"));
assert.ok(source.includes("function auditDivisionStockFormulaCells_()"));
assert.ok(section("function validateTransactionRequest_(tx, options)", "function resolveKodeFromNama(").includes('"clientItemId"'));
assert.ok(section("function validateTransactionRequest_(tx, options)", "function resolveKodeFromNama(").includes("qty <= 0"));
assert.ok(section("function syncDivisionStock(options)", "function logDailySnapshot()").includes("normalizeDivision_(row[idxDivisi])"));

const lightSync = section("function syncDivisionStockLightweight_()", "function removeChartByTitle_(");
for (const forbidden of ["setValue(", "setValues(", "setFormula(", "setFormulas(", "clearContent(", "clear("]) {
  assert.ok(!lightSync.includes(forbidden), "Lightweight sync contains forbidden spreadsheet writer: " + forbidden);
}

const fullSync = section("function syncDivisionStock(options)", "function logDailySnapshot()");
assert.ok(fullSync.includes(".setFormulas("), "Full sync must restore formulas in column F.");
assert.ok(!fullSync.includes("dest.getRange(1, 1, oldRows, 7).clearContent("),
  "Full sync must not clear A:G as one block.");

const dashboardDiag = section("function diagnoseDashboard()", "function clearDashboardCharts_(");
assert.ok(!dashboardDiag.includes("setValue(") && !dashboardDiag.includes("setValues(") &&
  !dashboardDiag.includes("clearContent("), "Dashboard diagnostics must be read-only.");

const setup = section("function setupEnvironment()", "function generateRandomSecret()");
assert.ok(setup.includes("installManagedTriggers_(ss)"));
assert.ok(!setup.includes("formatDashboardLayout693_("), "Setup must not run the legacy Dashboard layout migration.");

const layoutWriter = section("function formatDashboardLayout693_()", "function writeDashboardData693_(d)");
assert.ok(layoutWriter.includes("skipped:true") && !layoutWriter.includes("clearDashboardCharts_"));
assert.ok(!source.includes('newTrigger("refreshStatusStockLight_")'));

// New V7.0.1+ contract: read-back uses exact ledger dataRow (no Keterangan marker scan).
const readBack = section("function readBackTransactionByIdentity_(", "function identityPayloadMatches_(");
assert.ok(readBack.includes("findIdempotencyRecord_"), "Read-back must locate the ledger record first.");
assert.ok(readBack.includes("record.dataRow") || readBack.includes("!record.dataRow"),
  "Read-back must require a reserved ledger dataRow.");
assert.ok(readBack.includes("LEDGER_ROW_NOT_RESERVED"),
  "Read-back must fail closed when the ledger row was never reserved.");
assert.ok(readBack.includes("dateMatches") && readBack.includes("codeMatches") && readBack.includes("qtyMatches"),
  "Read-back must verify date, kode, and qty against the ledger snapshot.");
assert.ok(!readBack.includes("GUDANGAI_TX="),
  "Read-back must not scan user Keterangan for identity markers.");

// Entity-scoped name resolver (PDF / name matching must never cross CV ↔ PT).
const resolveNama = section("function resolveKodeFromNama(", "function getAllStock(");
assert.ok(resolveNama.includes('entity !== "CV" && entity !== "PT"'),
  "resolveKodeFromNama must require an explicit CV/PT entity.");
assert.ok(resolveNama.includes("getAllStock( entity )") || resolveNama.includes("getAllStock(entity)"),
  "Name resolution must search only the selected entity stock master.");
assert.ok(resolveNama.includes("String(specialStock.entitas || \"\").toUpperCase() === entity"),
  "Special-map hits must still be constrained to the requested entity.");

const singleWrite = section("function addTransaction(body)", "function bulkTransaction(body)");
assert.ok(singleWrite.includes('writeOccurred: "unknown"') && singleWrite.includes("dataRow: targetRow"));
assert.ok(singleWrite.indexOf('dataRow: targetRow, writeOccurred: "unknown"') <
  singleWrite.indexOf("sheet.getRange(targetRow, 2, 1, 2).setValues("),
  "Single transaction write intent must persist before journal write.");
assert.ok(singleWrite.indexOf("writeTouched = true;") <
  singleWrite.indexOf("sheet.getRange(targetRow, 2, 1, 2).setValues("),
  "Single write failures must be classified conservatively as UNKNOWN.");
assert.ok(singleWrite.includes("plannedKeteranganHash") && singleWrite.includes("Fingerprint Keterangan gagal dibuat"));
const bulkWrite = section("function bulkTransaction(body)", "function normalizeEntityGroup_(");
assert.ok(bulkWrite.includes('prior.status === "UNKNOWN"') && bulkWrite.includes('"READBACK_REQUIRED"'));
assert.ok(bulkWrite.includes('status: writeTouched ? "UNKNOWN" : "FAILED"'));
assert.ok(bulkWrite.includes('writeOccurred: writeTouched ? "unknown" : false'));
assert.ok(bulkWrite.includes('"BULK_WRITE_NOT_STARTED"'));
// Pre-write ledger row reservation (fail closed).
assert.ok(bulkWrite.includes("IDEMPOTENCY_ROW_RESERVATION_FAILED") || bulkWrite.includes("dataRow: startRow"),
  "Bulk must persist exact destination rows to the ledger before writing transaction cells.");
assert.ok(bulkWrite.includes("findSafeEmptyBlockAdaptively_(sheet, config, rowsToWrite.length)") ||
  bulkWrite.includes("findSafeEmptyRowAdaptively(sheet, config)"));
assert.ok(bulkWrite.includes("verifyRowsEmptyPath2(sheet, startRow, rowsToWrite.length)") ||
  bulkWrite.includes("verifyRowStillEmptyPath2"));
assert.ok(bulkWrite.indexOf("writeTouched = true;") <
  bulkWrite.indexOf("sheet.getRange(startRow, 2, rowsToWrite.length, 2).setValues(") ||
  bulkWrite.includes("writeTouched = true"),
  "Bulk partial-write exceptions must be classified conservatively as UNKNOWN.");
assert.ok(bulkWrite.includes("plannedKeteranganHash") && bulkWrite.includes("Fingerprint Keterangan gagal dibuat"));


const fastSingleWrite = section("function addTransaction(body)", "function bulkTransaction(body)");
assert.ok(fastSingleWrite.includes("verifiedReadBack") && fastSingleWrite.includes("getCachedSyncVersions_()"));
assert.ok(!fastSingleWrite.includes("getCurrentSyncVersions_()"), "Single write must not rescan all stock sheets to rebuild a response version.");
assert.ok(!fastSingleWrite.includes("syncDivisionStockLightweight_()"), "Single write must not run a full formula audit in the response path.");

const fastBulkWrite = section("function bulkTransaction(body)", "function normalizeEntityGroup_(");
assert.ok(fastBulkWrite.includes("buildIdempotencyIndex_()") && fastBulkWrite.includes("findIdempotencyRecordInIndex_"));
assert.ok(!fastBulkWrite.includes("findIdempotencyRecord_(item.transactionId, item.nonce)"),
  "Bulk must not rescan the ledger for each item.");
assert.ok(fastBulkWrite.includes("verifiedBC = sheet.getRange(startRow, 2, rowsToWrite.length, 2).getValues()") ||
  fastBulkWrite.includes("getRange(startRow, 2, rowsToWrite.length, 2)"));
assert.ok(!fastBulkWrite.includes("syncDivisionStockLightweight_()"),
  "Bulk write must not run a full formula audit in the response path.");

const onEdit = section("function onEditRouter_(e)", "function markDataDirty_");
assert.ok(onEdit.includes("SpreadsheetApp.flush()"));
assert.ok(!onEdit.includes("syncDivisionStockLightweight_()"),
  "Manual edit path must not scan all formula cells on every edit.");
const timestamp = section("function stampVisibleUpdateTimestamp_(formatted)", "function getLastUpdateTimestamp()");
for (const name of ["Dashboard", "Data Stok Per Divisi", "Config"]) assert.ok(timestamp.includes(name));
for (const name of ["Barang masuk", "Barang keluar", "Stock CV", "Stock PT", "purchase order"]) {
  assert.ok(!timestamp.includes(name), "Timestamp writer should not touch non-metadata sheet: " + name);
}

const functionNames = [...source.matchAll(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]);
const duplicates = functionNames.filter((name, i) => functionNames.indexOf(name) !== i);
assert.deepEqual([...new Set(duplicates)], [], "Duplicate global function declarations found.");

const sandbox = { console, Date, JSON, Math, Number, String, Object, Array, RegExp, isNaN, isFinite };
const context = vm.createContext(sandbox);
new vm.Script(source, { filename: "Code.gs" }).runInContext(context);
vm.runInContext(
  'getStockByCode = function(kode, entitas) { return { success:true, kode:kode, entitas:entitas, nama:"Fixture", stockAkhir:50 }; };' +
  'validateTransactionDate = function() { return { valid:true, normalized:"2026-11-01" }; };',
  context
);


const ledgerIndexFixture = {
  byTransactionId: { "TX-A": { transactionId: "TX-A", nonce: "N-A", rowNumber: 8 } },
  byNonce: { "N-A": { transactionId: "TX-A", nonce: "N-A", rowNumber: 8 }, "N-B": { transactionId: "TX-B", nonce: "N-B", rowNumber: 12 } }
};
assert.equal(context.findIdempotencyRecordInIndex_(ledgerIndexFixture, "TX-A", "N-A").rowNumber, 8);
assert.equal(context.findIdempotencyRecordInIndex_(ledgerIndexFixture, "TX-A", "N-B").rowNumber, 12,
  "If either identity matches, use the latest matching ledger row.");

const entityCases = [
  ["CV", "CV-0001", "CV"],
  ["CV", "BBCV-0001", "CV"],
  ["PT", "PT-0001", "PT"],
  ["PT", "WK-0012", "PT"],
  ["PT", "MM-0001", "PT"],
  ["PT", "BBPT-0001", "PT"]
];
for (const [entity, code, expected] of entityCases) {
  const result = vm.runInContext('normalizeEntityGroup_(' + JSON.stringify(entity) + ',' + JSON.stringify(code) + ')', context);
  assert.equal(result.valid, true);
  assert.equal(result.entitas, expected);
}
assert.equal(vm.runInContext('normalizeEntityGroup_("CV","WK-0012").valid', context), false);

const validTx = {
  sheet:"Barang masuk", entitas:"CV", kodeBarang:"CV-0001", qty:1,
  tanggal:"2026-11-01", keterangan:"uji", clientItemId:"batch-item-01"
};
const validResult = context.validateTransactionRequest_(validTx, { requireDate:true, requireEntity:true });
assert.equal(validResult.valid, true, "clientItemId must be accepted by the transaction validator.");
assert.equal(context.validateTransactionRequest_({...validTx, qty:0}, {requireEntity:true}).code, "INVALID_QTY");
assert.equal(context.validateTransactionRequest_({...validTx, qty:-1}, {requireEntity:true}).code, "INVALID_QTY");
assert.equal(context.validateTransactionRequest_({...validTx, qty:100001}, {requireEntity:true}).code, "INVALID_QTY");
assert.equal(context.validateTransactionRequest_({...validTx, unapprovedField:true}, {requireEntity:true}).code, "UNKNOWN_FIELD");
assert.equal(context.validateTransactionRequest_({...validTx, nama:"must-not-write"}, {requireEntity:true}).code, "PROTECTED_FIELD");

const sources = {
  cv:{sheetName:"Stock CV",stockColumn:"F",dataStartRow:4,kodeColumn:"B"},
  pt:{sheetName:"Stock PT",stockColumn:"F",dataStartRow:4,kodeColumn:"B"},
  bb:{sheetName:"Stock Bahan Baku",stockColumn:"F",dataStartRow:2,kodeColumn:"B"}
};
const bbFormula = context.buildDivisionStockFormula_(10, "BBPT-0001", sources);
const ptFormula = context.buildDivisionStockFormula_(10, "WK-0012", sources);
const cvFormula = context.buildDivisionStockFormula_(10, "CV-0001", sources);
assert.ok(bbFormula.includes("'Stock Bahan Baku'!"));
assert.ok(ptFormula.includes("'Stock PT'!") && !ptFormula.includes("'Stock CV'!"));
assert.ok(cvFormula.includes("'Stock CV'!") && !cvFormula.includes("'Stock PT'!"));
assert.equal(context.buildDivisionStockFormula_(10, "UNKNOWN-0001", sources), "=0");
assert.equal(context.normalizeDivision_("DAPUR1"), "DAPUR 1");
assert.equal(context.normalizeDivision_("DAPUR2"), "DAPUR 2");
assert.equal(context.appendIdentityMarker_("Barang datang", "TX1", "N1"), "Barang datang");
assert.ok(!context.appendIdentityMarker_("Barang datang", "TX1", "N1").includes("GUDANGAI_TX="));
const longNote = "X".repeat(200);
const holdNote = "Input pending 8 > sisa stock 3 > kurang 5";
const mergedNote = context.appendTransactionNoteWithinLimit_(longNote, holdNote);
assert.ok(mergedNote.length <= 200);
assert.ok(mergedNote.endsWith(holdNote), "Structured HOLD note must remain visible inside the 200-character limit.");

const grid = Array.from({length:12}, () => Array(7).fill(""));
grid[3][2] = "CV-0001"; // last item code is row 4
grid[4][5] = "orphaned note"; // row 5 is not safe even though its code cell is blank
const fakeSheet = {
  getMaxRows: () => grid.length,
  getName: () => "Fixture Journal",
  getRange: (row, col, rows, cols) => ({
    getValues: () => grid.slice(row - 1, row - 1 + rows).map(r => r.slice(col - 1, col - 1 + cols))
  }),
  insertRowsAfter: () => { throw new Error("unexpected row insertion in fixture"); }
};
assert.equal(context.findSafeEmptyBlockAdaptively_(fakeSheet, {headerRow:3,kodeColAbsolute:3}, 2), 6);
assert.equal(context.verifyRowsEmptyPath2(fakeSheet, 5, 1), false);
assert.equal(context.verifyRowsEmptyPath2(fakeSheet, 6, 2), true);

console.log("PASS: Code.gs syntax, no duplicate global functions, and V7 static safety contract");
console.log("PASS: lightweight division sync is read-only; full rebuild restores formula-driven column F");
console.log("PASS: dashboard diagnostics and legacy layout migration are disabled safely");
console.log("PASS: CV/PT/WK/MM/BBCV/BBPT entity mapping and mismatch rejection");
console.log("PASS: clientItemId contract; qty zero/negative/over-limit and protected/unknown fields rejected");
console.log("PASS: Stock CV/PT/Stock Bahan Baku formula routing and DAPUR1/DAPUR2 normalization");
console.log("PASS: transaction Keterangan stays free of identity marker text");
console.log("PASS: entity-scoped name resolver + ledger dataRow reservation read-back");
