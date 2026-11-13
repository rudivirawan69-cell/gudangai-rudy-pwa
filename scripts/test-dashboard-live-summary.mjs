import fs from 'node:fs';
import assert from 'node:assert/strict';

const code = fs.readFileSync('Code.gs', 'utf8');
const api = fs.readFileSync('src/data/api.js', 'utf8');
const wranglerText = fs.readFileSync('wrangler.jsonc', 'utf8');
const wrangler = JSON.parse(wranglerText.replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1'));

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'function ' + name + ' exists');
  const brace = source.indexOf('{', start);
  let depth = 0, quote = null, escaped = false, lineComment = false, blockComment = false;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i], next = source[i + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) { if (escaped) { escaped = false; continue; } if (ch === '\\') { escaped = true; continue; } if (ch === quote) quote = null; continue; }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === "'" || ch === '"' || ch === String.fromCharCode(96)) { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('Unclosed function ' + name);
}

new Function(code);
const toNumberSource = extractFunction(code, 'toNumber_');
const readerSource = extractFunction(code, 'readDashboardLiveSummary_');
const toNumber = new Function(toNumberSource + '; return toNumber_;')();
const makeReader = (rows) => new Function('getSS', 'toNumber_', 'nowWIB_', readerSource + '; return readDashboardLiveSummary_;')(
  () => ({ getSheetByName: () => ({
    getLastRow: () => rows.length,
    getLastColumn: () => Math.max(...rows.map(r => r.length)),
    getRange: () => ({ getDisplayValues: () => rows }),
  }) }),
  toNumber,
  () => '2026-11-13T12:00:00+07:00'
);

const rows193 = [
  ['TOTAL ITEM','','','','','',''],
  ['193','100','17','76','125000','4',''],
  ['','','','','','',''],
  ['DIVISI','TOTAL ITEM','AMAN','WASPADA','KRITIS','',''],
  ['DAPUR 1','28','14','3','11'],
  ['DAPUR 2','17','9','2','6'],
  ['MIE','10','5','1','4'],
  ['PACKING','57','30','5','22'],
  ['CS','45','25','4','16'],
  ['BAHAN BAKU','28','10','2','16'],
  ['REKANAN','8','7','0','1'],
  ['TOTAL','193','100','17','76'],
];
const result193 = makeReader(rows193)();
assert.equal(result193.summary.totalItem, 193);
assert.equal(result193.summary.aman, 100);
assert.equal(result193.summary.waspada, 17);
assert.equal(result193.summary.kritis, 76);
assert.equal(result193.statusPerDivisi.find(x => x.divisi === 'BAHAN BAKU').total, 28);

const rows194 = rows193.map(r => [...r]);
rows194[1][0] = '194'; rows194[1][1] = '101';
rows194[4][1] = '29'; rows194[4][2] = '15';
const result194 = makeReader(rows194)();
assert.equal(result194.summary.totalItem, 194, 'new item is reflected without a hardcoded 193');
assert.equal(result194.statusPerDivisi.reduce((n, x) => n + x.total, 0), 194);

const invalid = rows193.map(r => [...r]); invalid[1][3] = '75';
assert.equal(makeReader(invalid)(), null, 'inconsistent Dashboard Live must fail closed');

assert.match(code.slice(code.indexOf('function getAllStock'), code.indexOf('function getLowStock')), /getBahanBakuStockMap_/);
assert.match(code, /DASHBOARD_STOCK_COUNT_MISMATCH/);
assert.doesNotMatch(code, /Total master data transaksi: 191/);
assert.match(api, /DASHBOARD_LIVE_READ_FAILED/);
assert.doesNotMatch(api, /buildDashboardFallbackFromStock/);
const dashApi = api.slice(api.indexOf('export async function getDashboardData()'), api.indexOf('export async function confirmPOStatus'));
assert.doesNotMatch(dashApi, /fetchStock\(/);
assert.equal(wrangler.name, 'gudangai-rudy-pwa-69');

console.log('PASS Dashboard Live dynamic summary: 193 baseline, 194 after added item, mismatch fail-closed');
console.log('PASS Bahan Baku included in getAllStock and PWA dashboard fallback removed');
console.log('PASS canonical Cloudflare Worker target: ' + wrangler.name);
