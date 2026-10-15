import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/data/pdfValidate.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'Missing parser helper: ' + name);
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('Unclosed parser helper: ' + name);
}

const parserFunctions = [
  'stripLeadingNo',
  'sanitizePdfProductName',
  'isPdfNonItemLine',
  'parsePdfLinesToItems',
].map(extractFunction).join('\n');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(parserFunctions + '\nglobalThis.parsePdfLinesToItems = parsePdfLinesToItems;', sandbox);
const parse = sandbox.parsePdfLinesToItems;

const rows = parse([
  'No Nama Barang Qty Satuan',
  '1 Ayam Fillet Paha (1 kg) 18 pcs',
  '2 Daging Slice Lowfat 2 3 12',
  '3 Ayam Fillet 5 + Daging Slice 7',
  'Total 32',
  'Halaman 1 dari 1',
  'Tanggal 14/10/2026',
].join('\n'));

assert.equal(rows.length, 4, 'Headers, totals, dates and page footers must not become items');
assert.equal(rows[0].rawName, 'Ayam Fillet Paha', 'Leading row number and unit metadata must not pollute item name');
assert.equal(rows[0].qty, 18, 'Use the rightmost total quantity');
assert.equal(rows[1].rawName, 'Daging Slice Lowfat', 'Preserve product identity and remove intermediate numeric columns');
assert.equal(rows[1].qty, 12, 'Take the rightmost numeric quantity as total');
assert.ok(rows.some((x) => x.rawName === 'Ayam Fillet' && x.qty === 5), 'Split concatenated product rows and keep the first total quantity');
assert.ok(rows.some((x) => x.rawName === 'Daging Slice' && x.qty === 7), 'Split concatenated product rows and keep the second total quantity');
assert.doesNotMatch(source, /rawName:\s*['"](?:Unknown|undefined)['"]/i, 'Never synthesize Unknown/undefined product names');

const filterStart = source.indexOf('function filterPdfMasterForEntity(');
const validateStart = source.indexOf('export function validatePdfItems(');
assert.ok(filterStart >= 0 && validateStart > filterStart, 'Entity-specific PDF validation must exist');
const filterSource = source.slice(filterStart, validateStart);
assert.match(filterSource, /ent === 'CV'/);
assert.match(filterSource, /\^CV-/);
assert.match(filterSource, /\^\(\?:PT\|WK\|MM\)-/);
assert.match(filterSource, /BAHAN BAKU/);
assert.match(source, /nama bahan baku hanya valid melalui kode BBCV\/BBPT eksplisit/);

console.log('PASS: PDF parser extracts clean names/rightmost qty, skips metadata, and protects CV/PT raw-material boundaries');
