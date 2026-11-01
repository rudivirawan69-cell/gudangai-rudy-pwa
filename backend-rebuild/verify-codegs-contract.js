#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const codePath = path.resolve(__dirname, "..", "Code.gs");
const source = fs.readFileSync(codePath, "utf8");
new vm.Script(source, { filename: "Code.gs" });

function extractFunction(name) {
  const start = source.indexOf("function " + name + "(");
  assert.notEqual(start, -1, "Missing function: " + name);
  const open = source.indexOf("{", start);
  let depth = 0, state = "normal";
  for (let i = open; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (state === "line") { if (c === "\n") state = "normal"; continue; }
    if (state === "block") { if (c === "*" && next === "/") { state = "normal"; i++; } continue; }
    if (state === "single" || state === "double" || state === "template") {
      if (c === "\\") { i++; continue; }
      if ((state === "single" && c === "'") || (state === "double" && c === '"') ||
          (state === "template" && c === "`")) state = "normal";
      continue;
    }
    if (c === "/" && next === "/") { state = "line"; i++; continue; }
    if (c === "/" && next === "*") { state = "block"; i++; continue; }
    if (c === "'") { state = "single"; continue; }
    if (c === '"') { state = "double"; continue; }
    if (c === "`") { state = "template"; continue; }
    if (c === "{") depth++;
    if (c === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("Unclosed function: " + name);
}
function countMatches(re) { return (source.match(re) || []).length; }

assert.match(source, /const BACKEND_VERSION = "7\.0\.0-RECONSTRUCTION-CANDIDATE"/);
assert.equal(countMatches(/function syncDivisionStockLightweight_\s*\(/g), 1);
assert.equal(countMatches(/function syncDivisionStock\s*\(/g), 1);
assert.equal(countMatches(/function onEdit\s*\(/g), 0);
assert.match(source, /function onEditRouter_\s*\(/);
assert.match(source, /function getDivisionStockFormulaSources_\s*\(/);
assert.match(source, /function auditDivisionStockFormulaCells_\s*\(/);

const lightSync = extractFunction("syncDivisionStockLightweight_");
assert.doesNotMatch(lightSync, /\.(?:setValue|setValues|setFormula|setFormulas|clearContent|clear)\s*\(/,
  "Lightweight sync must not write spreadsheet cells.");

const fullSync = extractFunction("syncDivisionStock");
assert.match(fullSync, /\.setFormulas\s*\(/, "Full sync must restore formulas in column F.");
assert.doesNotMatch(fullSync, /dest\.getRange\(1,\s*1,\s*oldRows,\s*7\)\.clearContent\s*\(/,
  "Full sync must not clear A:G as one block.");

const dashboardDiag = extractFunction("diagnoseDashboard");
assert.doesNotMatch(dashboardDiag, /\.(?:setValue|setValues|clearContent|clear)\s*\(/,
  "Dashboard diagnostics must be read-only.");
const setup = extractFunction("setupEnvironment");
assert.match(setup, /installManagedTriggers_\(ss\)/);
assert.doesNotMatch(setup, /formatDashboardLayout693_\s*\(/,
  "Setup must not run the legacy Dashboard layout migration.");
assert.doesNotMatch(source, /newTrigger\(["']refreshStatusStockLight_["']\)/);
assert.doesNotMatch(extractFunction("formatDashboardLayout693_"), /clearDashboardCharts_|newChart\s*\(/,
  "Legacy layout writer must be disabled.");

console.log("PASS: Code.gs syntax and V7 static safety contract");
console.log("PASS: lightweight division sync performs no spreadsheet cell writes");
console.log("PASS: full division rebuild restores formula-driven column F");
console.log("PASS: Dashboard diagnostics/layout setup cannot clear or rebuild charts");
console.log("PASS: managed edit trigger uses onEditRouter_ only");
