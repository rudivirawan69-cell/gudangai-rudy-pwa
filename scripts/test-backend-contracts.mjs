import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const gs = readFileSync(new URL('../Code.gs', import.meta.url), 'utf8');
const pdf = readFileSync(new URL('../src/data/pdfValidate.js', import.meta.url), 'utf8');
const input = readFileSync(new URL('../src/pages/InputPage.jsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/data/api.js', import.meta.url), 'utf8');

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

// Contract 7: PO number metadata may never overwrite the B5:I5 source headers.
const poNoWriter = functionBody('writePONumberRow5_');
assert.match(poNoWriter, /sheet\.getRange\(5,\s*1\)\.setValue\(label\)/);
assert.doesNotMatch(poNoWriter, /sheet\.getRange\(5,\s*2\)\.setValue\(/);

const rollover = functionBody('rolloverPOWeekIfNeeded_');
assert.match(rollover, /const activeKey = status && status\.success \? String\(status\.weekKey \|\| ""\) : ""/);
assert.match(functionBody('writePurchaseOrder_'), /rolloverPOWeekIfNeeded_\(\);[\s\S]*?ensurePOHeader/);
assert.match(functionBody('writePurchaseOrder_'), /const resolvedNoPO = suppliedNoPO/);
assert.match(functionBody('writePurchaseOrder_'), /writePONumberRow5_\(sheet, resolvedNoPO\)/);
assert.match(functionBody('writePORecommendations'), /rolloverPOWeekIfNeeded_\(\);[\s\S]*?clearPOTableData/);
assert.match(functionBody('writePORecommendations'), /writePONumberRow5_\(sheet, "PO-" \+ getWeekKey_\(new Date\(\)\)\)/);

// Both GET and POST Status PO endpoints must return the same week-scoped status
// so the PWA current-week view agrees with the Spreadsheet Dashboard.
assert.equal((gs.match(/case "getStatusPO": return jsonResponse\(getCurrentWeekPOStatus_\(\)\);/g) || []).length, 2);
const currentWeekPO = functionBody('getCurrentWeekPOStatus_');
// GET/POST status reads must be side-effect free; archival belongs to write-capable refresh.
assert.doesNotMatch(currentWeekPO, /rolloverPOWeekIfNeeded_\(\)/);
assert.match(currentWeekPO, /isCurrentWeekEmpty: true/);
assert.match(currentWeekPO, /items: \[\]/);
assert.match(functionBody('refreshDashboardPOSection_'),
  /rolloverPOWeekIfNeeded_\(\);[\s\S]*?const data = getCurrentWeekPOStatus_\(\);/);

// Cap visible division rows so an unexpected large division list can never
// spill into the protected critical-item area beginning at row 28.
assert.match(functionBody('refreshDashboardLive_'),
  /const divRows = \(data\.statusPerDivisi \|\| \[\]\)\.slice\(0, 15\)\.map/);
assert.match(functionBody('dashboardSyncPatchRefresh_'),
  /const divRows = \(data\.statusPerDivisi \|\| \[\]\)\.slice\(0, 15\)\.map/);

// Contract 11: explicitly disable archived V6.6.5 writer/test handlers that can
// clear protected rows 28–45 or write PO tables to the obsolete row-42/48 layout.
const triggerGuard = functionBody('dashboardSyncPatchDisableConflictingTriggers_');
for (const legacyHandler of [
  'refreshDashboardPODataOnly_', 'refreshDashboardOperationalV68_',
  'refreshDashboardDataOnly_', 'refreshDashboardAfterWrite_', 'setupDashboardLayoutClean',
  'testDashboardV7', 'ujiDashboardV7'
]) {
  assert.ok(triggerGuard.includes('"' + legacyHandler + '"'), 'Missing legacy handler guard: ' + legacyHandler);
}
const triggerVerification = functionBody('dashboardSyncPatchVerify');
assert.match(triggerVerification, /refreshDashboardPODataOnly_/);
assert.match(triggerVerification, /setupDashboardLayoutClean/);
assert.match(triggerVerification, /criticalRows28to45Left/);
assert.match(triggerVerification, /criticalRows28to45Right/);
assert.match(triggerVerification, /legacyFunctionsPresent/);
assert.match(triggerVerification, /safeToRelease/);
assert.doesNotMatch(triggerVerification, /\.setValue\(|\.setValues\(|\.clearContent\(|insertRowsAfter\(/,
  'dashboardSyncPatchVerify must remain read-only');

// Contract 8: status reader must parse formatted qty values and keep named PO rows
// visible for diagnosis if TOTAL is blank instead of silently hiding the item.
const statusPO = functionBody('getStatusPO');
assert.match(statusPO, /parsePOQty_\(r\[poCols\.total\]\)/);
assert.match(statusPO, /if \(!nama\) return;/);
assert.match(functionBody('recordPOArrival'), /parsePOQty_\(r\[6\]\)/);

// Contract 9: HOLD must remain a separate status through read-back and idempotent replay.
// A stored Qty=0 with a pending description is not a successful stock-out.
const readBack = functionBody('readBackTransactionByIdentity_');
assert.match(readBack, /shortage: holdQtyMatches/);
assert.match(readBack, /stockPolicy: holdQtyMatches/);
assert.match(functionBody('addTransaction'), /const replayIsHold = priorRead\.shortage === true/);
const bulk = functionBody('bulkTransaction');
assert.match(bulk, /var appliedReadBack = readBackTransactionByIdentity_\(\{ transactionId: item\.transactionId, nonce: item\.nonce \}, sheetName\)/);
assert.match(bulk, /shortage: appliedIsHold/);
assert.match(bulk, /stockPolicy: appliedReadBack\.stockPolicy/);

// Contract 10: InputPage must not count a zero-qty HOLD as a successful stock movement.
assert.match(input, /const isHoldResult =/);
assert.match(input, /qty: 0, requestedQty:/);
assert.match(input, /status: heldItems\.length \? \(confirmedItems\.length \? 'sebagian' : 'hold'\) : 'sukses'/);
assert.match(input, /Stok kurang — HOLD/);

// Contract 11: only InputPage emits the consolidated user notification for an input run.
// An API fallback can still return queued/partial outcomes but must not add a second bell entry.
const submitStart = api.indexOf('async function submitItems(');
const submitEnd = api.indexOf('\nexport function getPendingQueue()', submitStart);
assert.ok(submitStart >= 0 && submitEnd > submitStart);
assert.doesNotMatch(api.slice(submitStart, submitEnd), /pushNotification\(/);
assert.match(api, /export function pushNotification\(n\)[\s\S]*?dedupeKey/);
assert.match(input, /hasPartialOutcome = Number\(res\?\.queuedCount \|\| 0\)/);

// Contract 12: no duplicate top-level function declarations in the Apps Script file.
const fnNames = [...gs.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]);
const seen = new Set();
const duplicates = [];
for (const name of fnNames) { if (seen.has(name)) duplicates.push(name); seen.add(name); }
assert.deepEqual(duplicates, []);

console.log('Backend production contracts passed: locked Dashboard rows, stock fail-closed, shared HOLD, PO quantity/header/rollover safety, PDF entity filtering, single transaction notice, and duplicate-function scan.');
