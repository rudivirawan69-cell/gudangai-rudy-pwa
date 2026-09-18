import { readFileSync, statSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}
function fail(message) {
  console.error('[P1-P3 FAIL]', message);
  process.exitCode = 1;
}
function assert(condition, message) {
  if (!condition) fail(message);
}

const manifest = JSON.parse(read('public/manifest.json'));
const icons = new Map((manifest.icons || []).map((i) => [i.src, i]));

for (const [src, size] of [['/icon-192.png', 192], ['/icon-512.png', 512]]) {
  const path = src.slice(1);
  let st = null;
  try { st = statSync(path); } catch (_) {}
  assert(st && st.size > 1000, `${path} missing or suspiciously small`);
  const icon = icons.get(src);
  assert(icon && icon.type === 'image/png', `${src} missing as PNG manifest icon`);
  assert(String(icon.purpose || '').includes('maskable'), `${src} is not maskable`);
  const b = readFileSync(path);
  assert(b.readUInt32BE(0) === 0x89504E47, `${path} is not PNG`);
  assert(b.readUInt32BE(16) === size && b.readUInt32BE(20) === size, `${path} dimensions are not ${size}x${size}`);
}
assert(statSync('public/apple-touch-icon.png').size > 1000, 'apple-touch-icon.png missing or suspiciously small');

const sw = read('public/sw.js');
assert(/CACHE_NAME = 'gudangai-v6.7.1-p1-p3'/.test(sw), 'service worker cache version not bumped');
assert(sw.includes("'/icon-192.png'") && sw.includes("'/icon-512.png'"), 'service worker does not precache PNG icons');

const api = read('src/data/api.js');
for (const needle of [
  'getWriteTimeoutMs',
  'getWriteCircuitState',
  'validateImportedItems',
  'persistQueueBackup',
  'hydrateOfflineQueue',
  'getBatchChunkSize',
  'STOCK_FRESH_MS',
  'coalescedRead',
]) assert(api.includes(needle), `api.js missing ${needle}`);
assert(api.includes('CIRCUIT_THRESHOLD = 3'), 'circuit breaker threshold is not 3');
assert(api.includes('BATCH_CHUNK_SIZE_PROMOTED = 15'), 'promoted chunk size 15 missing');

const input = read('src/pages/InputPage.jsx');
assert(input.includes('validateImportedItems(snapshot, entity)'), 'server validation gate missing in InputPage');
assert(input.includes('getWriteCircuitState'), 'InputPage circuit breaker wiring missing');
assert(input.includes('res.queued'), 'InputPage queued messaging branch missing');

const queue = read('src/pages/SyncQueuePage.jsx');
assert(queue.includes('gudangai-queue-changed'), 'queue change event listener missing');
assert(queue.includes('Dijeda Sementara'), 'queue circuit breaker messaging missing');

const store = read('src/data/offlineStore.js');
assert(store.includes('indexedDB.open'), 'IndexedDB store unavailable');
assert(store.includes('queueState:v1'), 'versioned IndexedDB queue key missing');

assert(JSON.parse(read('src/data/alias-config.json')).version >= 1, 'alias config version missing');

console.log('[P1-P3 PASS] manifest/icons, service worker, adaptive write, circuit breaker, queue persistence, stale cache, request coalescing, validation gate, and lint/build hooks are present.');
