import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const gs = readFileSync(new URL('../Code.gs', import.meta.url), 'utf8');
const pdf = readFileSync(new URL('../src/data/pdfValidate.js', import.meta.url), 'utf8');
const input = readFileSync(new URL('../src/pages/InputPage.jsx', import.meta.url), 'utf8');

function functionBody(name) {
  const start = gs.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'Missing function: ' + name);
  const end = gs.indexOf('\nfunction ', start + 1);
  return gs.slice(start, end > start ? end : gs.length);
}

// Contract 1: source-of-truth row positions are distinct and locked.
assert.match(gs, /const PO_HEADER_ROW = 5;/);
assert.match(gs, /const PO_START_ROW = 46;/);
assert.match(gs, /const PO_DASHBOARD_HEADER_ROW = 49;/);

// Contract 2: PO renderer clears only its dedicated area.
const renderer = functionBody('refreshDashboardPOSection_');
assert.match(renderer, /const currentTop = PO_START_ROW;/);
assert.match(renderer, /dashboardClearPOArea_\(sh, currentTop, clearEnd\);/);
assert.doesNotMatch(renderer, /getRange\(\s*2[89]\s*,\s*1[\s\S]{0,80}clearContent\(/);
assert.match(gs, /function dashboardClearPOArea_\(sheet, startRow, endRow\)/);

// Contract 3: unreadable stock must stop bulk outbound before write operations.
const bulk = functionBody('bulkTransaction');
assert.match(bulk, /code: "STOCK_READ_FAILED"/);
assert.match(bulk, /code: "STOCK_CODE_NOT_FOUND"/);
assert.ok(bulk.indexOf('code: "STOCK_READ_FAILED"') < bulk.indexOf('var lock = LockService.getScriptLock()'),
  'Stock read failure must be rejected before the transaction write path');

// Contract 4: single and bulk outbound share the structured HOLD description.
assert.match(functionBody('addTransaction'), /formatStockShortageHold_\(/);
assert.match(bulk, /formatStockShortageHold_\(/);
const holdStart = gs.indexOf('function formatStockShortageHold_(');
const holdEnd = gs.indexOf('\nfunction percent_(', holdStart);
assert.ok(holdStart >= 0 && holdEnd > holdStart);
const holdFn = new Function(gs.slice(holdStart, holdEnd) + '\nreturn formatStockShortageHold_;')();
assert.equal(holdFn(10, 5, 5, 'Pack'), 'pending ❌ PO 10 sisa stock 5 kekurangan 5 pack');

// Contract 5: PO quantity parser handles Indonesian and English number formats.
const qtyStart = gs.indexOf('function parsePOQty_(value)');
const qtyEnd = gs.indexOf('\nfunction normalizePONameKey_(', qtyStart);
assert.ok(qtyStart >= 0 && qtyEnd > qtyStart);
const qtyFn = new Function(gs.slice(qtyStart, qtyEnd) + '\nreturn parsePOQty_;')();
for (const [value, expected] of [[1250,1250], ['1.250',1250], ['1,250',1250], ['1,5',1.5], ['1.250,50',1250.5], ['1,250.50',1250.5], ['',0]]) {
  assert.equal(qtyFn(value), expected, 'PO qty parse failed for ' + String(value));
}

// Contract 6: PT PDF excludes BBPT raw material and upload filtering applies to CV and PT.
assert.ok(pdf.includes('return /^(?:PT|WK|MM)-/.test(kode)'), 'PT PDF filter must exclude BBPT raw materials');
assert.ok(input.includes("validationEntity === 'CV' || validationEntity === 'PT'"),
  'Raw-material PDF filter must run for both CV and PT');

// Contract 7: no duplicate top-level function declarations in the Apps Script file.
const fnNames = [...gs.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]);
const seen = new Set();
const duplicates = [];
for (const name of fnNames) { if (seen.has(name)) duplicates.push(name); seen.add(name); }
assert.deepEqual(duplicates, []);

console.log('Backend contract tests passed: locked PO rows, bulk stock fail-closed, shared HOLD, PO quantity parsing, PDF entity filtering, and duplicate-function scan.');
