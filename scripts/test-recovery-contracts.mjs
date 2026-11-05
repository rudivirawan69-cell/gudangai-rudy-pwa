import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const pdfPath = new URL('../src/data/pdfValidate.js', import.meta.url);
const gsPath = new URL('../Code.gs', import.meta.url);
const inputPath = new URL('../src/pages/InputPage.jsx', import.meta.url);
const pdf = readFileSync(pdfPath, 'utf8');
const gs = readFileSync(gsPath, 'utf8');
const inputPage = readFileSync(inputPath, 'utf8');

const fallbackMatch = pdf.match(/export function applyStockAwareFallback\(rows\)\s*\{([\s\S]*?)\n\}/);
assert.ok(fallbackMatch, 'Missing conservative applyStockAwareFallback(rows)');
const fallback = new Function('rows', fallbackMatch[1]);
const examples = [
  { status: 'matched', kode: 'CV-0001', rawName: 'Ayam Fillet Dada' },
  { status: 'ambiguous', rawName: 'Ayam Negeri', qty: 5 },
  { status: 'unmatched', rawName: 'Nama Tidak Ada Di Master', qty: 3 },
];
assert.deepEqual(fallback(examples), examples);
assert.deepEqual(fallback(null), []);

const ocrGateMatch = pdf.match(/export function shouldOcrPdfPage\(metrics\)\s*\{([\s\S]*?)\n\}/);
assert.ok(ocrGateMatch, 'Missing page-aware PDF OCR gate');
const shouldOcrPdfPage = new Function('metrics', ocrGateMatch[1]);
assert.equal(shouldOcrPdfPage({ lineCount: 22, hasNumericText: true, candidateCount: 16, numericLineCount: 19 }), false);
assert.equal(shouldOcrPdfPage({ lineCount: 25, hasNumericText: true, candidateCount: 4, numericLineCount: 18 }), true);
assert.equal(shouldOcrPdfPage({ lineCount: 1, hasNumericText: false, candidateCount: 0, numericLineCount: 0 }), true);
assert.match(pdf, /lineCount:\s*lines\.length/);
assert.match(pdf, /filter\(\(page\)\s*=>\s*shouldOcrPdfPage\(page\)\)/);
assert.match(pdf, /if\s*\(ocrCount\s*>\s*originalCount\)/);
assert.match(inputPage, /reviewRows\s*=\s*cleanRows\.filter\(\(m\)\s*=>\s*m\.status\s*!==\s*'matched'\)/);

assert.doesNotThrow(() => new vm.Script(gs), 'Root Code.gs must remain syntactically valid');
assert.match(gs, /function formatStockShortageNote_\(orderQty, availableQty, shortageQty, unit\)/);
assert.match(gs, /keterangan = formatStockShortageNote_\(numericQty, sisa, kekurangan,/);
const holdFnBody = gs.match(/function formatStockShortageNote_\(orderQty, availableQty, shortageQty, unit\)\s*\{([\s\S]*?)\n\}/);
assert.ok(holdFnBody, 'Missing concise HOLD formatter');
const formatHold = new Function('MAX_KETERANGAN_LENGTH',
  'return function(orderQty, availableQty, shortageQty, unit) {' + holdFnBody[1] + '}'
)(200);
assert.equal(formatHold(10, 3, 7, 'pack'), 'Input pending 10 pack, sisa stock 3 pack, kekurangan 7 pack');
const logFnBody = gs.match(/function writeAuditLogSecure\([\s\S]*?\n\}/);
assert.ok(logFnBody && /setWrap\(false\)/.test(logFnBody[0]), 'System Log cells must use compact clipped rows');
assert.ok(/substring\(0, 180\)/.test(logFnBody[0]));
assert.ok(/substring\(0, 120\)/.test(logFnBody[0]));
assert.doesNotMatch(logFnBody[0], /setColumnWidth\(/, 'Column widths must not be reset for every log write');
const logFormatBody = functionBody(gs, 'formatSystemLogSheet_');
assert.match(logFormatBody, /setWrap\(false\)/);
function functionBody(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'Missing function ' + name);
  const end = source.indexOf('\nfunction ', start + 10);
  return source.slice(start, end > start ? end : source.length);
}
const onEdit = functionBody(gs, 'onEditRouter_');
for (const sheet of ['Barang masuk', 'Barang keluar', 'Barang Rusak']) {
  assert.ok(onEdit.includes('"' + sheet + '"'));
}
assert.match(onEdit, /const stockImpacting\s*=\s*stockSheets\.indexOf\(sheetName\)\s*>=\s*0\s*\|\|\s*transactionSheets\.indexOf\(sheetName\)\s*>=\s*0/);
assert.ok(onEdit.indexOf('SpreadsheetApp.flush()') >= 0);
assert.ok(!onEdit.includes('syncDivisionStockLightweight_()'),
  'Manual edit must not run a full formula audit on every spreadsheet change.');
assert.equal(gs.includes('function onEdit(e)'), false,
  'V7 must expose only the installable onEditRouter_ handler, not a second simple trigger.');
const sync = functionBody(gs, 'syncDivisionStockLightweight_');
assert.match(sync, /auditDivisionStockFormulaCells_\(\)/);
assert.doesNotMatch(sync, /\.(?:setValue|setValues|setFormula|setFormulas|clearContent|clear)\s*\(/,
  'Lightweight stock sync must not write spreadsheet cells.');
const rebuild = functionBody(gs, 'syncDivisionStock');
assert.match(rebuild, /\.setFormulas\(/,
  'The controlled division rebuild must restore formula-driven Sisa Stok cells.');
assert.match(rebuild, /normalizeDivision_\(row\[idxDivisi\]\)/);
assert.ok(rebuild.indexOf('dest.getRange(1, 6, oldRows, 1).clearContent()') >= 0);
assert.match(gs, /function installManagedTriggers_\(spreadsheet\)/);

const resolverPath = new URL('../src/data/pdfDeterministicRules.js', import.meta.url);
const resolverSource = readFileSync(resolverPath, 'utf8');
const normalizeMatch = resolverSource.match(/export function normalizeOcr\(s\)\s*\{([\s\S]*?)\n\}/);
assert.ok(normalizeMatch, 'Missing normalizeOcr');
const normalizeOcr = new Function('s', normalizeMatch[1]);
const resolverMatch = resolverSource.match(/export function resolvePdfNameDeterministic\(entity, rawName, masterList\)\s*\{([\s\S]*?)\n\}/);
assert.ok(resolverMatch, 'Missing deterministic resolver');
const resolvePdfNameDeterministic = new Function('entity', 'rawName', 'masterList', 'normalizeOcr', resolverMatch[1]);
const parseBody = pdf.match(/export function parsePdfLinesToItems\(text\)\s*\{([\s\S]*?)\n\}/);
const sanitizeBody = pdf.match(/function sanitizePdfProductName\(name\)\s*\{([\s\S]*?)\n\}/);
const stripBody = pdf.match(/function stripLeadingNo\(name\)\s*\{([\s\S]*?)\n\}/);
const nonItemBody = pdf.match(/function isPdfNonItemLine\(line\)\s*\{([\s\S]*?)\n\}/);
assert.ok(parseBody && sanitizeBody && stripBody && nonItemBody, 'Missing PDF line parser helpers');
const stripLeadingNo = new Function(stripBody[1]);
const sanitizePdfProductName = new Function('stripLeadingNo', sanitizeBody[1])(stripLeadingNo);
const isPdfNonItemLine = new Function(nonItemBody[1]);
const parsePdfLinesToItems = new Function('stripLeadingNo', 'sanitizePdfProductName', 'isPdfNonItemLine', parseBody[1])(
  stripLeadingNo, sanitizePdfProductName, isPdfNonItemLine
);
for (const [line, expectedName] of [
  ['Ayam Fillet Dada 2', 'Ayam Fillet Dada'],
  ['Ayam Fillet Paha 3', 'Ayam Fillet Paha'],
  ['Saos Ayam 69 4', 'Saos Ayam 69'],
  ['Saos Ayam FROZEN 1.00 2', 'Saos Ayam FROZEN 1.00'],
  ['Iga Sapi 5', 'Iga Sapi'],
]) {
  const parsed = parsePdfLinesToItems(line);
  assert.equal(parsed[0]?.rawName, expectedName, 'PDF line parser must preserve product name: ' + line);
}

const cvMaster = [
  { kode: 'CV-0001', nama: 'Ayam Fillet Dada', satuan: 'Kg', divisi: 'CS' },
  { kode: 'CV-0002', nama: 'Ayam Fillet Paha', satuan: 'Kg', divisi: 'CS' },
];
const ptMaster = [
  { kode: 'WK-0004', nama: 'Iga Sapi', satuan: 'Kg', divisi: 'CS' },
  { kode: 'WK-0021', nama: 'Saos Ayam 69', satuan: 'Pack', divisi: 'CS' },
  { kode: 'WK-0040', nama: 'Bebek', satuan: 'Pack', divisi: 'CS' },
  { kode: 'PT-0001', nama: 'Ayam Fillet Dada', satuan: 'Kg', divisi: 'CS' },
  { kode: 'PT-0002', nama: 'Ayam Fillet Paha', satuan: 'Kg', divisi: 'CS' },
  { kode: 'BBPT-0008', nama: 'Iga Sapi', satuan: 'Kg', divisi: 'BAHAN BAKU' },
];
for (const [input, expected] of [
  ['Ayam Fillet Dada', 'CV-0001'],
  ['AYAM FILLET PAHA', 'CV-0002'],
  ['Ayam F1llet D4da', 'CV-0001'],
  ['Ayam FiIlet P4ha', 'CV-0002'],
]) {
  const hit = resolvePdfNameDeterministic('CV', input, cvMaster, normalizeOcr);
  assert.equal(hit?.item?.kode, expected, 'Must resolve product correctly: ' + input);
}
for (const [input, expected] of [
  ['Ayam Fillet Dada', 'PT-0001'],
  ['Ayam Fillet Paha', 'PT-0002'],
  ['Saos Ayam 69', 'WK-0021'],
  ['Saos Ayam FROZEN 1.00', 'WK-0021'],
]) {
  const hit = resolvePdfNameDeterministic('PT', input, ptMaster, normalizeOcr);
  assert.equal(hit?.item?.kode, expected, 'PT PDF must resolve to the correct finished-goods SKU: ' + input);
}
assert.equal(resolvePdfNameDeterministic('PT', 'Iga Sapi', ptMaster, normalizeOcr)?.item?.kode, 'WK-0004',
  'PT PDF Iga Sapi must resolve to finished-goods SKU WK-0004, not raw-material BBPT-0008');
assert.equal(resolvePdfNameDeterministic('PT', 'Saos Ayam 69', ptMaster, normalizeOcr)?.item?.kode, 'WK-0021',
  'PT PDF Saos Ayam 69 must resolve to WK-0021');
assert.match(pdf, /prioritizeIgaSapiFinishedSku/,
  'The PDF raw-material name guard must allow the explicit PT Iga Sapi → WK-0004 mapping');
assert.equal(resolvePdfNameDeterministic('CV', 'Bebek (WK-0040)', cvMaster, normalizeOcr), null,
  'CV master must not resolve a PT WK SKU');

assert.match(pdf, /upload PDF tidak boleh menghasilkan kode bahan baku/);
assert.match(pdf, /if \(\/\^\(\?:BBCV\|BBPT\)-\\d\{3,4\}\$\/\.test\(candidateCode\)\)/);
assert.match(pdf, /return source\.filter\(\(item\) => \{/);
assert.match(pdf, /return \/\^CV-\//);
assert.match(pdf, /return \/\^\(\?:PT\|WK\|MM\|BBPT\)-\//);
assert.match(pdf, /nama bahan baku hanya valid melalui kode BBCV\/BBPT eksplisit/);


const apiPath = new URL('../src/data/api.js', import.meta.url);
const appPath = new URL('../src/App.jsx', import.meta.url);
const stokPath = new URL('../src/pages/StokPage.jsx', import.meta.url);
const dashboardPath = new URL('../src/pages/DashboardPage.jsx', import.meta.url);
const poPath = new URL('../src/pages/POPage.jsx', import.meta.url);
const queuePath = new URL('../src/pages/SyncQueuePage.jsx', import.meta.url);
const stockStatusPath = new URL('../src/data/stockStatus.js', import.meta.url);
const apiSource = readFileSync(apiPath, 'utf8');
const appSource = readFileSync(appPath, 'utf8');
const stokSource = readFileSync(stokPath, 'utf8');
const dashboardSource = readFileSync(dashboardPath, 'utf8');
const poSource = readFileSync(poPath, 'utf8');
const queueSource = readFileSync(queuePath, 'utf8');
const stockStatusSource = readFileSync(stockStatusPath, 'utf8');

assert.match(apiSource, /postJson\(payload,\s*\{\s*retries:\s*1,\s*timeoutMs:\s*BATCH_TIMEOUT_MS\s*\}\)/,
  'Ambiguous batch writes must not be retried automatically while the first Apps Script request may still be running.');
assert.match(gs, /case "getTransactionStatuses": return jsonResponse\(getTransactionStatuses\(body\)\)/,
  'Bulk read-back endpoint must be available to the PWA');
assert.match(gs, /function getTransactionStatuses\(body\)/);
assert.match(gs, /const index = buildIdempotencyIndex_\(\)/,
  'Bulk read-back must load the idempotency ledger index once per chunk');
assert.match(gs, /writeIdempotencyRecordsByRow_\(pendingLedgerUpdates, index\)/,
  'Bulk read-back must persist APPLIED confirmations in grouped row writes');
assert.match(apiSource, /async function reconcileAmbiguousChunk\(action, chunk\)/,
  'Ambiguous chunk responses must be reconciled by stable transaction ID before queueing.');
assert.match(apiSource, /const reconciled = await reconcileAmbiguousChunk\(action, chunk\)/);
assert.match(apiSource, /action:\s*'getTransactionStatuses'/,
  'Ambiguous chunk must reconcile in one batch status request, not one request per item');
assert.match(apiSource, /Do not break: the next chunk has independent IDs and must still be submitted/);
assert.doesNotMatch(apiSource, /const remainingItems = list\.slice\(i\)/,
  'A timed-out chunk must not queue the entire unsent tail without read-back.');
assert.match(apiSource, /const BATCH_CHUNK_SIZE = 35/);
assert.match(apiSource, /result\.uncertain === true \|\| result\.retryable === true/);
assert.match(apiSource, /\['UNKNOWN', 'IN_PROGRESS', 'PENDING', 'WRITE_PENDING'\]/,
  'Only ambiguous/retryable batch results should enter the offline queue');
assert.match(apiSource, /STOCK_CACHE_TTL_MS = 10000/);
assert.match(apiSource, /getAllStock', \{ entitas: 'ALL' \}/);
assert.match(apiSource, /_stockCache\.promise/);
assert.match(apiSource, /import \{ classifyStockLevel \} from '\.\/stockStatus'/);
assert.match(stockStatusSource, /stock < 10/);
assert.match(stockStatusSource, /stock < 20/);
assert.match(stokSource, /classifyStockLevel/);
assert.match(dashboardSource, /classifyStockLevel/);
assert.match(apiSource, /const cls = classifyStockLevel\(stok\)/);
assert.match(inputPage, /gudangai_input_draft_v1/);
assert.match(inputPage, /Draft transaksi dipulihkan/);
assert.match(poSource, /gudangai_po_draft_v1/);
assert.match(poSource, /const poDate = localISODate\(\)/);
assert.match(appSource, /function AppHeader\(\{ user, tab, onOpenSettings, online, status \}\)/);
assert.match(appSource, /const \[liveTime, setLiveTime\] = useState\('—'\)/);
assert.doesNotMatch(queueSource, /Math\.random\(\)/, 'Queue item fallback keys must be deterministic.');


const useStockPath = new URL('../src/hooks/useStock.js', import.meta.url);
const useStockSource = readFileSync(useStockPath, 'utf8');
assert.match(useStockSource, /gudangai-stock-refresh/);
assert.match(useStockSource, /fetchStock\(entity, \{ force \}\)/);
assert.match(useStockSource, /refresh\(\{ force: false \}\)/, 'Initial stock view should reuse a recent shared cache snapshot');
assert.match(inputPage, /gudangai-stock-refresh/);
assert.match(queueSource, /gudangai-stock-refresh/);
assert.match(apiSource, /serverExecMs: measuredServerChunks \? totalServerExecMs : null/);
assert.match(apiSource, /clientElapsedMs: Date\.now\(\) - clientStartedAt/);
assert.match(apiSource, /const groups = new Map\(\)/, 'Queue reconciliation must combine compatible outbox entries into batches.');
assert.match(apiSource, /const conflictingIds = new Set\(\)/, 'Reused clientItemId with conflicting payloads must remain pending.');
assert.match(apiSource, /const alreadyApplied = originalList\.filter/, 'Locally confirmed APPLIED items must not be submitted again.');
assert.ok(apiSource.includes(String.raw`7\.0\.\d+|PERFORMANCE[-_]?CANDIDATE|RECONSTRUCTION`),
  'Trusted 7.0 performance/reconstruction backend versions must remain write-compatible.');
const bulkSource = gs.slice(gs.indexOf('function bulkTransaction(body) {'), gs.indexOf('\nfunction ', gs.indexOf('function bulkTransaction(body) {') + 10));
assert.match(gs, /function appendIdempotencyRecordsIndexed_\(/);
assert.match(gs, /function writeIdempotencyRecordsByRow_\(/);
assert.match(bulkSource, /appendIdempotencyRecordsIndexed_\(pendingNewClaims/);
assert.match(bulkSource, /writeIdempotencyRecordsByRow_\(plannedLedgerUpdates/);
const planWriteIndex = bulkSource.indexOf('writeIdempotencyRecordsByRow_(plannedLedgerUpdates');
const planFlushIndex = bulkSource.indexOf('SpreadsheetApp.flush();', planWriteIndex);
const transactionWriteIndex = bulkSource.indexOf('sheet.getRange(startRow, 2', planFlushIndex);
assert.ok(planWriteIndex >= 0 && planFlushIndex > planWriteIndex && transactionWriteIndex > planFlushIndex,
  'Write-ahead ledger plan must be flushed before transaction sheet writes.');
assert.match(bulkSource, /writeIdempotencyRecordsByRow_\(finalLedgerUpdates/);
const stockStatusMatch = stockStatusSource.match(/export function classifyStockLevel\(value\)\s*\{([\s\S]*?)\n\}/);
assert.ok(stockStatusMatch, 'Missing shared stock status function');
const classifyStockLevel = new Function('value', stockStatusMatch[1]);
assert.equal(classifyStockLevel(0), 'kritis');
assert.equal(classifyStockLevel(9), 'kritis');
assert.equal(classifyStockLevel(10), 'waspada');
assert.equal(classifyStockLevel(19), 'waspada');
assert.equal(classifyStockLevel(20), 'aman');

console.log('PASS: conservative PDF matching + manual stock sync contracts');
