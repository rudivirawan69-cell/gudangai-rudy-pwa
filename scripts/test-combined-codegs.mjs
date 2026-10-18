import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const path = new URL('../audit-apps-script/Code_GudangAI_V6.6.5_COMBINED_PRODUCTION_FIXES.gs', import.meta.url);
const gs = readFileSync(path, 'utf8');
const productionPath = new URL('../Code.gs', import.meta.url);
const productionGs = readFileSync(productionPath, 'utf8');

// Parse the entire Apps Script file without executing its top-level code.
assert.doesNotThrow(() => new vm.Script(gs), 'Combined Code.gs must parse as JavaScript');

function body(name) {
  const start = gs.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'Missing function: ' + name);
  const next = gs.indexOf('\nfunction ', start + 10);
  return gs.slice(start, next > start ? next : gs.length);
}

// Locked Dashboard layout: critical rows 28–45 remain outside PO writers.
assert.match(gs, /const PO_START_ROW = 46;/);
assert.match(gs, /const PO_DASHBOARD_HEADER_ROW = 49;/);
assert.match(body('dashboardClearPOArea_'), /Number\(startRow\) < 46/);
assert.match(body('renderPOStatusBlock_'), /Number\(topRow\) < 46/);
assert.match(body('refreshDashboardPOSection_'), /const currentTop = PO_START_ROW;/);
assert.match(body('refreshDashboardPOSection_'), /dashboardClearPOArea_\(sh, currentTop, clearEnd\);/);
assert.doesNotMatch(body('refreshDashboardPOSection_'), /getRange\(\s*(?:2[89]|3\d|4[0-5])\s*,[\s\S]{0,100}(?:clearContent|setValues|setValue)\(/);

// Production Code.gs visible dashboard ranges must stop at row 27; rows 28–45 are protected.
const productionWriterStart = productionGs.indexOf('function writeDashboardData693_');
assert.notEqual(productionWriterStart, -1, 'Missing production dashboard writer');
const productionWriterEnd = productionGs.indexOf('\nfunction ', productionWriterStart + 10);
const productionWriter = productionGs.slice(productionWriterStart, productionWriterEnd > productionWriterStart ? productionWriterEnd : productionGs.length);
assert.match(productionWriter, /getRange\('A26:F27'\)\.setValues/);
assert.doesNotMatch(productionWriter, /getRange\('A(?:2[89]|3\d|4[0-5]):/,
  'Visible dashboard writes must not extend into critical rows 28–45');

// Stock-shortage message must be human-readable and shared by single/bulk paths.
const holdStart = gs.indexOf('function formatStockShortageHold_(');
const holdEnd = gs.indexOf('\nfunction ', holdStart + 10);
assert.ok(holdStart >= 0 && holdEnd > holdStart, 'Missing stock shortage formatter');
const holdFn = new Function(gs.slice(holdStart, holdEnd) + '\nreturn formatStockShortageHold_;')();
assert.equal(holdFn(10, 5, 5, 'Pack'), 'pending ❌ PO 10 sisa stock 5 kekurangan 5 pack');
assert.doesNotMatch(gs.slice(holdStart, holdEnd), /orderQty:|availableQty:|shortageQty:|followUp:/);
assert.match(body('addTransaction'), /formatStockShortageHold_\(/);
assert.match(body('bulkTransaction'), /formatStockShortageHold_\(/);

// Preserve pre-write validation for unsafe stock reads.
assert.match(body('bulkTransaction'), /STOCK_READ_FAILED/);
assert.match(body('bulkTransaction'), /STOCK_CODE_NOT_FOUND/);
assert.ok(body('bulkTransaction').indexOf('STOCK_READ_FAILED') < body('bulkTransaction').indexOf('LockService.getScriptLock'),
  'Bulk transaction must reject failed stock reads before entering write lock');

// Legacy trigger guard must exist, and the verification function must be read-only.
const triggerGuard = body('dashboardSyncPatchDisableConflictingTriggers_');
for (const name of ['refreshDashboardPODataOnly_', 'refreshDashboardOperationalV68_', 'refreshDashboardDataOnly_', 'refreshDashboardAfterWrite_', 'setupDashboardLayoutClean', 'testDashboardV7', 'ujiDashboardV7']) {
  assert.ok(triggerGuard.includes('"' + name + '"'), 'Missing legacy trigger guard: ' + name);
}
assert.doesNotMatch(body('dashboardSyncPatchVerify'), /\.setValue\(|\.setValues\(|\.clearContent\(|insertRowsAfter\(/,
  'Verification function must remain read-only');

console.log('PASS: combined Code.gs syntax and production safety contracts');
