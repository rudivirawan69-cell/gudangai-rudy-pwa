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

const lightSync = section("function syncDivisionStockLightweight_()", "function removeChartByTitle_()");
for (const forbidden of ["setValue(", "setValues(", "setFormula(", "setFormulas(", "clearContent(", "clear("]) {
  assert.ok(!lightSync.includes(forbidden), "Lightweight sync contains forbidden spreadsheet writer: " + forbidden);
}

const fullSync = section("function syncDivisionStock(options)", "function logDailySnapshot()");
assert.ok(fullSync.includes(".setFormulas("), "Full sync must restore formulas in column F.");
assert.ok(!fullSync.includes("dest.getRange(1, 1, oldRows, 7).clearContent("),
  "Full sync must not clear A:G as one block.");

const dashboardDiag = section("function diagnoseDashboard()", "function clearDashboardCharts_()");
assert.ok(!dashboardDiag.includes("setValue(") && !dashboardDiag.includes("setValues(") &&
  !dashboardDiag.includes("clearContent("), "Dashboard diagnostics must be read-only.");

const setup = section("function setupEnvironment()", "function generateRandomSecret()");
assert.ok(setup.includes("installManagedTriggers_(ss)"));
assert.ok(!setup.includes("formatDashboardLayout693_("), "Setup must not run the legacy Dashboard layout migration.");

const layoutWriter = section("function formatDashboardLayout693_()", "function writeDashboardData693_(d)");
assert.ok(layoutWriter.includes("skipped:true") && !layoutWriter.includes("clearDashboardCharts_"));
assert.ok(!source.includes('newTrigger("refreshStatusStockLight_")'));

console.log("PASS: Code.gs syntax and V7 static safety contract");
console.log("PASS: lightweight division sync performs no spreadsheet cell writes");
console.log("PASS: full division rebuild restores formula-driven column F");
console.log("PASS: Dashboard diagnostics/layout setup cannot clear or rebuild charts");
console.log("PASS: managed edit trigger uses onEditRouter_ only");
