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
function functionBody(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'Missing function ' + name);
  const end = source.indexOf('\nfunction ', start + 10);
  return source.slice(start, end > start ? end : source.length);
}
const onEdit = functionBody(gs, 'onEdit');
for (const sheet of ['Barang masuk', 'Barang keluar', 'Barang Rusak']) {
  assert.ok(onEdit.includes('"' + sheet + '"'));
}
assert.match(onEdit, /const stockImpacting\s*=\s*stockSheets\.indexOf\(sheetName\)\s*>=\s*0\s*\|\|\s*transactionSheets\.indexOf\(sheetName\)\s*>=\s*0/);
assert.ok(onEdit.indexOf('SpreadsheetApp.flush()') >= 0);
assert.ok(onEdit.indexOf('SpreadsheetApp.flush()') < onEdit.indexOf('syncDivisionStockLightweight_()'));
const sync = functionBody(gs, 'syncDivisionStockLightweight_');
assert.match(sync, /dest\.getRange\(u\.row,\s*6\)\.setValue\(u\.value\)/);
assert.doesNotMatch(sync, /(?:sh|src)\.getRange\([^\n]*\)\.set(?:Value|Values)\(/);

const resolverPath = new URL('../src/data/pdfDeterministicRules.js', import.meta.url);
const resolverSource = readFileSync(resolverPath, 'utf8');
const normalizeMatch = resolverSource.match(/export function normalizeOcr\(s\)\s*\{([\s\S]*?)\n\}/);
assert.ok(normalizeMatch, 'Missing normalizeOcr');
const normalizeOcr = new Function('s', normalizeMatch[1]);
const resolverMatch = resolverSource.match(/export function resolvePdfNameDeterministic\(entity, rawName, masterList\)\s*\{([\s\S]*?)\n\}/);
assert.ok(resolverMatch, 'Missing deterministic resolver');
const resolvePdfNameDeterministic = new Function('entity', 'rawName', 'masterList', 'normalizeOcr', resolverMatch[1]);
const cvMaster = [
  { kode: 'CV-0001', nama: 'Ayam Fillet Dada', satuan: 'Kg', divisi: 'CS' },
  { kode: 'CV-0002', nama: 'Ayam Fillet Paha', satuan: 'Kg', divisi: 'CS' },
];
const ptMaster = [{ kode: 'WK-0040', nama: 'Bebek', satuan: 'Ekor', divisi: 'PT' }];
for (const [input, expected] of [
  ['Ayam Fillet Dada', 'CV-0001'],
  ['AYAM FILLET PAHA', 'CV-0002'],
  ['Ayam F1llet D4da', 'CV-0001'],
  ['Ayam FiIlet P4ha', 'CV-0002'],
]) {
  const hit = resolvePdfNameDeterministic('CV', input, cvMaster);
  assert.equal(hit?.item?.kode, expected, 'Must resolve product correctly: ' + input);
}
const bebekPt = resolvePdfNameDeterministic('PT', 'Bebek (WK-0040)', ptMaster);
assert.equal(bebekPt?.item?.kode, 'WK-0040', 'Bebek must resolve to PT SKU WK-0040');
assert.equal(resolvePdfNameDeterministic('CV', 'Bebek (WK-0040)', cvMaster), null,
  'CV master must not resolve a PT WK SKU');
const saosMaster = [{ kode: 'CV-0036', nama: 'Saos Ayam 69', satuan: 'Pack', divisi: 'PACKING' }];
const saosPtMaster = [{ kode: 'WK-0021', nama: 'Saos Ayam 69', satuan: 'Pack', divisi: 'CS' }];
assert.equal(resolvePdfNameDeterministic('CV', 'Saos Ayam 69 (250 gr)', saosMaster)?.item?.kode, 'CV-0036');
assert.equal(resolvePdfNameDeterministic('PT', 'Saos Ayam 69', saosPtMaster)?.item?.kode, 'WK-0021');
const bebekOrderMaster = [{ kode: 'WK-0040', nama: 'Bebek Penyet', satuan: 'Pack', divisi: 'CS' }];
assert.equal(resolvePdfNameDeterministic('PT', 'Bebek (WK-0040)', bebekOrderMaster)?.item?.kode, 'WK-0040');
assert.equal(resolvePdfNameDeterministic('PT', 'Bebek', bebekOrderMaster)?.item?.kode, 'WK-0040');
assert.match(gs, /pending ❌ PO .* sisa stock .* kekurangan/);
assert.doesNotMatch(gs, /const structured = "Input pending " \+ numericQty \+ " > sisa stock "/);


assert.match(pdf, /upload PDF tidak boleh menghasilkan kode bahan baku/);
assert.match(pdf, /if \(\/\^\(\?:BBCV\|BBPT\)-\\d\{3,4\}\$\/\.test\(candidateCode\)\)/);
assert.match(pdf, /return source\.filter\(\(item\) => \{/);
assert.match(pdf, /return \/\^CV-\//);
assert.match(pdf, /return \/\^\(\?:PT\|WK\|MM\|BBPT\)-\//);
assert.match(pdf, /nama bahan baku hanya valid melalui kode BBCV\/BBPT eksplisit/);


const cvFilletMaster = [
  { kode: 'CV-0001', nama: 'Ayam Fillet Dada', satuan: 'Kg', divisi: 'CS' },
  { kode: 'CV-0002', nama: 'Ayam Fillet Paha', satuan: 'Kg', divisi: 'CS' },
];
const ptFilletMaster = [
  { kode: 'PT-0001', nama: 'Ayam Fillet Dada', satuan: 'Kg', divisi: 'CS' },
  { kode: 'PT-0002', nama: 'Ayam Fillet Paha', satuan: 'Kg', divisi: 'CS' },
];
for (const [entity, master] of [['CV', cvFilletMaster], ['PT', ptFilletMaster]]) {
  for (const [name, code] of [
    ['Ayam Fillet Dada', entity === 'CV' ? 'CV-0001' : 'PT-0001'],
    ['Ayam Fillet Paha', entity === 'CV' ? 'CV-0002' : 'PT-0002'],
    ['Ayam F1llet D4da', entity === 'CV' ? 'CV-0001' : 'PT-0001'],
    ['Ayam FiIlet P4ha', entity === 'CV' ? 'CV-0002' : 'PT-0002'],
    ['Ayam FilletDada', entity === 'CV' ? 'CV-0001' : 'PT-0001'],
    ['Ayam FilletPaha', entity === 'CV' ? 'CV-0002' : 'PT-0002'],
  ]) assert.equal(resolvePdfNameDeterministic(entity, name, master)?.item?.kode, code, entity + ' PDF match: ' + name);
}
const saosCv = [{ kode: 'CV-0036', nama: 'Saos Ayam 69', satuan: 'Pack', divisi: 'PACKING' }];
const saosPt = [{ kode: 'WK-0021', nama: 'Saos Ayam 69', satuan: 'Pack', divisi: 'CS' }];
assert.equal(resolvePdfNameDeterministic('CV', 'Saos Ayam 69 (250 gr)', saosCv)?.item?.kode, 'CV-0036');
assert.equal(resolvePdfNameDeterministic('PT', 'Saos Ayam 69', saosPt)?.item?.kode, 'WK-0021');
const bebekPtMaster = [{ kode: 'WK-0040', nama: 'Bebek Penyet', satuan: 'Pack', divisi: 'CS' }];
assert.equal(resolvePdfNameDeterministic('PT', 'Bebek (WK-0040)', bebekPtMaster)?.item?.kode, 'WK-0040');
assert.match(readFileSync(gsPath, 'utf8'), /pending ❌ PO .* sisa stock .* kekurangan/);
console.log('PASS: conservative PDF matching + manual stock sync contracts');
