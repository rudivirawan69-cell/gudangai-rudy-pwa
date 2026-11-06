/**
 * Lightweight contract for PR #122 scope:
 * - entity-scoped resolveKodeFromNama
 * - ledger dataRow reservation + read-back (no Keterangan marker scan)
 * - basic syntax / no duplicate globals
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, "..", "Code.gs"), "utf8");

// Syntax parse
new vm.Script(source, { filename: "Code.gs" });

function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, "Missing start marker: " + startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, "Missing end marker: " + endMarker);
  return source.slice(start, end);
}

// --- Entity-scoped name resolver ---
const resolveNama = section("function resolveKodeFromNama(", "function getAllStock(");
assert.ok(
  resolveNama.includes('entity !== "CV" && entity !== "PT"'),
  "resolveKodeFromNama must require an explicit CV/PT entity."
);
assert.ok(
  resolveNama.includes("getAllStock( entity )") || resolveNama.includes("getAllStock(entity)"),
  "Name resolution must search only the selected entity stock master."
);
assert.ok(
  resolveNama.includes('String(specialStock.entitas || "").toUpperCase() === entity'),
  "Special-map hits must still be constrained to the requested entity."
);

// --- Ledger row reservation + exact read-back ---
const readBack = section("function readBackTransactionByIdentity_(", "function identityPayloadMatches_(");
assert.ok(readBack.includes("findIdempotencyRecord_"), "Read-back must locate the ledger record first.");
assert.ok(
  readBack.includes("LEDGER_ROW_NOT_RESERVED"),
  "Read-back must fail closed when the ledger row was never reserved."
);
assert.ok(
  readBack.includes("dateMatches") && readBack.includes("codeMatches") && readBack.includes("qtyMatches"),
  "Read-back must verify date, kode, and qty against the ledger snapshot."
);
assert.ok(
  !readBack.includes("GUDANGAI_TX="),
  "Read-back must not scan user Keterangan for identity markers."
);

assert.ok(
  source.includes("IDEMPOTENCY_ROW_RESERVATION_FAILED"),
  "Bulk path must fail closed if ledger row reservation is not persisted."
);
assert.ok(
  source.includes("Reserve exact destination rows") || source.includes("dataRow: startRow"),
  "Bulk must reserve destination rows in the ledger before writing transaction cells."
);

// No duplicate global functions
const functionNames = [...source.matchAll(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]);
const duplicates = functionNames.filter((name, i) => functionNames.indexOf(name) !== i);
assert.deepEqual([...new Set(duplicates)], [], "Duplicate global function declarations found.");

console.log("PASS: Code.gs syntax OK");
console.log("PASS: entity-scoped resolveKodeFromNama (CV/PT required, entity-scoped master)");
console.log("PASS: ledger dataRow reservation + fail-closed read-back");
console.log("PASS: no identity-marker scan in Keterangan");
console.log("PASS: no duplicate global functions");
