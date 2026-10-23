import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const pdfPath = new URL('../src/data/pdfValidate.js', import.meta.url);
const gsPath = new URL('../Code.gs', import.meta.url);
const inputPath = new URL('../src/pages/InputPage.jsx', import.meta.url);
const pdf = readFileSync(pdfPath, 'utf8');
const gs = readFileSync(gsPath, 'utf8');
const inputPage = readFileSync(inputPath, 'utf8');

// Evaluate the actual fallback implementation in isolation. It must not upgrade
// ambiguous/unmatched rows merely because a live-stock name has a fuzzy similarity.
const fallbackMatch = pdf.match(/export function applyStockAwareFallback\(rows\)\s*\{([\s\S]*?)\n\}/);
assert.ok(fallbackMatch, 'Missing conservative applyStockAwareFallback(rows)');
const fallback = new Function('rows', fallbackMatch[1]);
const examples = [
  { status: 'matched', kode: 'CV-0001', rawName: 'Ayam Fillet Dada' },
  { status: 'ambiguous', rawName: 'Ayam Negeri', qty: 5 },
  { status: 'unmatched', rawName: 'Nama Tidak Ada Di Master', qty: 3 },
];
assert.deepEqual(fallback(examples), examples, 'Fallback must preserve all validation statuses without changing SKU');
assert.deepEqual(fallback(null), [], 'Fallback must fail closed on non-array input');

// Page-level PDF completeness detection: weak text layers get OCR even when the
// whole document has many other readable rows; healthy pages avoid unnecessary OCR.
const ocrGateMatch = pdf.match(/export function shouldOcrPdfPage\(metrics\)\s*\{([\s\S]*?)\n\}/);
assert.ok(ocrGateMatch, 'Missing page-aware PDF OCR gate');
const shouldOcrPdfPage = new Function('metrics', ocrGateMatch[1]);
assert.equal(shouldOcrPdfPage({
  lineCount: 22, hasNumericText: true, candidateCount: 16, numericLineCount: 19,
}), false, 'Healthy page should not require OCR');
assert.equal(shouldOcrPdfPage({
  lineCount: 25, hasNumericText: true, candidateCount: 4, numericLineCount: 18,
}), true, 'Partially extracted page must be marked for OCR');
assert.equal(shouldOcrPdfPage({
  lineCount: 1, hasNumericText: false, candidateCount: 0, numericLineCount: 0,
}), true, 'Empty/scan-only page must be marked for OCR');
assert.match(pdf, /lineCount:\s*lines\.length/,
  'OCR completeness gate must receive the actual per-page line count');
assert.match(pdf, /filter\(\(page\)\s*=>\s*shouldOcrPdfPage\(page\)\)/,
  'Page-aware fallback must be applied when aggregate PDF extraction appears healthy');
assert.match(pdf, /if\s*\(ocrCount\s*>\s*originalCount\)/,
  'OCR must replace a page only when it recovers more product rows');

assert.match(inputPage, /reviewRows\s*=\s*cleanRows\.filter\(\(m\)\s*=>\s*m\.status\s*!==\s*'matched'\)/,
  'InputPage must preserve non-matched PDF rows for review');

// Code.gs syntax + trigger contract for both stock-source edits and manual journal edits.
assert.doesNotThrow(() => new vm.Script(gs), 'Root Code.gs must remain syntactically valid');
function functionBody(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'Missing function ' + name);
  const end = source.indexOf('\nfunction ', start + 10);
  return source.slice(start, end > start ? end : source.length);
}
const onEdit = functionBody(gs, 'onEdit');
for (const sheet of ['Barang masuk', 'Barang keluar', 'Barang Rusak']) {
  assert.ok(onEdit.includes('"' + sheet + '"'), 'Manual edits on ' + sheet + ' must refresh derived division stock');
}
assert.match(onEdit, /const stockImpacting\s*=\s*stockSheets\.indexOf\(sheetName\)\s*>=\s*0\s*\|\|\s*transactionSheets\.indexOf\(sheetName\)\s*>=\s*0/);
assert.ok(onEdit.indexOf('SpreadsheetApp.flush()') >= 0, 'Flush recalculated sheet formulas before syncing');
assert.ok(onEdit.indexOf('SpreadsheetApp.flush()') < onEdit.indexOf('syncDivisionStockLightweight_()'),
  'Formula flush must run before the division-stock sync');
const sync = functionBody(gs, 'syncDivisionStockLightweight_');
assert.match(sync, /dest\.getRange\(u\.row,\s*6\)\.setValue\(u\.value\)/,
  'Derived division-stock values must be written to column F');
assert.doesNotMatch(sync, /(?:sh|src)\.getRange\([^\n]*\)\.set(?:Value|Values)\(/,
  'Source stock sheets must remain read-only in the lightweight sync');


const resolverPath = new URL('../src/data/pdfDeterministicRules.js', import.meta.url);
const resolverSource = readFileSync(resolverPath, 'utf8');
const normalizeMatch = resolverSource.match(/export function normalizeOcr\(s\)\s*\{([\s\S]*?)\n\}/);
assert.ok(normalizeMatch, 'Missing normalizeOcr');
const normalizeOcr = new Function('s', normalizeMatch[1]);
const resolverMatch = resolverSource.match(/export function resolvePdfNameDeterministic\(entity, rawName, masterList\)\s*\{([\s\S]*?)\n\}/);
assert.ok(resolverMatch, 'Missing deterministic resolver');
const resolvePdfNameDeterministic = new Function('normalizeOcr', resolverMatch[1]);
const master = [
  { kode: 'CV-0001', nama: 'Ayam Fillet Dada', satuan: 'Kg', divisi: 'CS' },
  { kode: 'CV-0002', nama: 'Ayam Fillet Paha', satuan: 'Kg', divisi: 'CS' },
];
for (const [input, expected] of [
  ['Ayam Fillet Dada', 'CV-0001'],
  ['AYAM FILLET PAHA', 'CV-0002'],
  ['Ayam F1llet D4da', 'CV-0001'],
  ['Ayam FiIlet P4ha', 'CV-0002'],
]) {
  const hit = resolvePdfNameDeterministic(normalizeOcr, input, master);
  assert.equal(hit?.item?.kode, expected, 'Must resolve product correctly: ' + input);
}


 // PDF entity/code contract: CV must not validate a PT WK SKU, and no PDF row
 // may ever return BBCV/BBPT raw-material codes (including a raw-name match).
 assert.match(pdf, /upload PDF tidak boleh menghasilkan kode bahan baku/);
 assert.match(pdf, /if \(\/\^\(\?:BBCV\|BBPT\)-\\d\{3,4\}\$\/\.test\(candidateCode\)\)/);
 assert.match(pdf, /return source\.filter\(\(item\) => \{/);
 assert.match(pdf, /return \/\^CV-\//);
 assert.match(pdf, /return \/\^\(\?:PT\|WK\|MM\|BBPT\)-\//);
 assert.match(pdf, /nama bahan baku hanya valid melalui kode BBCV\/BBPT eksplisit/);

console.log('PASS: conservative PDF matching + manual stock sync contracts');
