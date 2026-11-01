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

assert.ok(source.includes('const BACKEND_VERSION = "7.0.0-RECONSTRUCTION-CANDIDATE"'));
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

const readBack = section("function readBackTransactionByIdentity_(", "function identityPayloadMatches_(");
assert.ok(readBack.includes("plannedFinalQty") && readBack.includes("keteranganHash"));
assert.ok(readBack.includes("qtyPresent && Number(r[4]) === Number(ledgerDetails.plannedFinalQty)"));
const singleWrite = section("function addTransaction(body)", "function bulkTransaction(body)");
assert.ok(singleWrite.includes('writeOccurred: "unknown"') && singleWrite.includes("dataRow: targetRow"));
assert.ok(singleWrite.indexOf("updateIdempotencyRecord_(ledgerRecord") <
  singleWrite.indexOf("sheet.getRange(targetRow, 2, 1, 2).setValues("),
  "Single transaction write intent must persist before journal write.");
const bulkWrite = section("function bulkTransaction(body)", "function normalizeEntityGroup_(");
assert.ok(bulkWrite.includes('prior.status === "UNKNOWN"') && bulkWrite.includes('"READBACK_REQUIRED"'));
assert.ok(bulkWrite.includes("dataRow: plannedRow") && bulkWrite.includes('writeOccurred: "unknown"'));
assert.ok(bulkWrite.indexOf("updateIdempotencyRecord_(plannedRecord") <
  bulkWrite.indexOf("sheet.getRange(startRow, 2, rowsToWrite.length, 2).setValues("),
  "Bulk write intent must persist before batch journal write.");

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

console.log("PASS: Code.gs syntax, no duplicate global functions, and V7 static safety contract");
console.log("PASS: lightweight division sync is read-only; full rebuild restores formula-driven column F");
console.log("PASS: dashboard diagnostics and legacy layout migration are disabled safely");
console.log("PASS: CV/PT/WK/MM/BBCV/BBPT entity mapping and mismatch rejection");
console.log("PASS: clientItemId contract; qty zero/negative/over-limit and protected/unknown fields rejected");
console.log("PASS: Stock CV/PT/Stock Bahan Baku formula routing and DAPUR1/DAPUR2 normalization");
console.log("PASS: transaction Keterangan stays free of identity marker text");
