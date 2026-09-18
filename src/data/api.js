/** GudangAI RUDY — API layer V6.4.15 + V6.6.3 batch fix */
/** BUILD_BATCH 2026-09-18: batch keluar 40-80 — sheet resmi, transactions[], queueApproved, chunk 8, timeout 120s */
const RETRY_COUNT = 2;
const RETRY_BASE_MS = 400;
const REQUEST_TIMEOUT_MS = 12000;
const WRITE_TIMEOUT_MAX_MS = 120000;
const BATCH_CHUNK_SIZE_BASE = 8;
const BATCH_CHUNK_SIZE_PROMOTED = 15;
const BATCH_MAX = 200;
const BATCH_STABILITY_KEY = 'gudangai_batch_stability_v1';
const CIRCUIT_KEY = 'gudangai_write_circuit_v1';
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 60000;
const STOCK_CACHE_KEY = 'gudangai_stock_cache_v1';
const STOCK_FRESH_MS = 60000;
const STOCK_STALE_MS = 10 * 60 * 1000;
const SCHEMA_VERSION = '1.0';
const APPLIED_KEY = 'gudangai_applied';
const QUEUE_KEY = 'gudangai_queue';
const APPLIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NOTIF_KEY = 'gudangai_notif';
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbwtSr7cdBKhvJOwwkSZ9GUf1ebuHOM8CsKXo1I6r8v0Z_gi4_ElrDK9oez8LX5DAB1INw/exec';
let _syncLock = false;
let _queueRevision = 0;
const _inflightReads = new Map();

import { hydrateQueueBackup, persistQueueBackup } from './offlineStore';
function emitConn(detail) { try { window.dispatchEvent(new CustomEvent('gudangai-conn', { detail })); } catch (_) {} }
export function getApiUrl() {
  const stored = (localStorage.getItem('gudangai_api_url') || '').trim();
  if (stored) return stored;
  localStorage.setItem('gudangai_api_url', DEFAULT_API_URL);
  localStorage.setItem('gudangai_api_url_seeded', '1');
  return DEFAULT_API_URL;
}
export function setApiUrl(url) {
  const c = (url || '').trim();
  if (c) localStorage.setItem('gudangai_api_url', c);
  else localStorage.setItem('gudangai_api_url', DEFAULT_API_URL);
}
export function getApiSecret() { return (localStorage.getItem('gudangai_api_secret') || '').trim(); }
export function setApiSecret(secret) {
  const c = (secret || '').trim();
  if (c) localStorage.setItem('gudangai_api_secret', c);
  else localStorage.removeItem('gudangai_api_secret');
}
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
function deviceId() {
  let id = localStorage.getItem('gudangai_device_id');
  if (!id) { id = 'RUDY-' + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())); localStorage.setItem('gudangai_device_id', id); }
  return id;
}
let _idSeq = 0;
function newIds() {
  _idSeq += 1;
  const uuid = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const stamp = Date.now().toString(36) + '-' + _idSeq.toString(36);
  return { requestId: 'REQ-' + uuid + '-' + stamp, transactionId: 'TX-RUDY-' + uuid + '-' + stamp };
}
async function fetchWithRetry(url, options = {}, retries = RETRY_COUNT, timeoutMs = REQUEST_TIMEOUT_MS, emitFailure = true) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (attempt > 1) emitConn({ state: 'recovered', attempt });
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) await delay(RETRY_BASE_MS * Math.pow(1.7, attempt - 1));
    }
  }
  if (emitFailure) emitConn({ state: 'failed', error: (lastError && lastError.message) || 'Gagal' });
  throw lastError;
}
async function postJson(payload, { retries = RETRY_COUNT, timeoutMs = REQUEST_TIMEOUT_MS, emitFailure = true } = {}) {
  const url = getApiUrl();
  if (!url) throw new Error('URL API belum diatur');
  const body = JSON.stringify({ schemaVersion: SCHEMA_VERSION, secret: getApiSecret() || undefined, client: { app: 'gudangai-rudy-pwa', deviceId: deviceId() }, ...payload });
  const res = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, redirect: 'follow' }, retries, timeoutMs, emitFailure);
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error('Respons bukan JSON: ' + text.slice(0, 120)); }
}
function getWriteItemCount(payload) {
  const list = payload && (payload.transactions || payload.items);
  return Array.isArray(list) ? list.length : 1;
}
function getWriteTimeoutMs(payload) {
  const count = getWriteItemCount(payload);
  if (count <= 2) return 45000;
  if (count <= 8) return 90000;
  return WRITE_TIMEOUT_MAX_MS;
}
function readCircuit() {
  try {
    const raw = JSON.parse(localStorage.getItem(CIRCUIT_KEY) || '{}');
    return { failures: Number(raw.failures) || 0, openedAt: Number(raw.openedAt) || 0, lastError: String(raw.lastError || '') };
  } catch (_) { return { failures: 0, openedAt: 0, lastError: '' }; }
}
export function getWriteCircuitState() {
  const s = readCircuit();
  const elapsed = s.openedAt ? Date.now() - s.openedAt : Infinity;
  const open = s.openedAt > 0 && elapsed < CIRCUIT_COOLDOWN_MS;
  return { ...s, open, retryAfterMs: open ? Math.max(0, CIRCUIT_COOLDOWN_MS - elapsed) : 0 };
}
function emitCircuit() {
  try { window.dispatchEvent(new CustomEvent('gudangai-circuit', { detail: getWriteCircuitState() })); } catch (_) {}
}
function recordWriteSuccess() {
  try { localStorage.removeItem(CIRCUIT_KEY); } catch (_) {}
  emitCircuit();
}
function recordWriteFailure(error) {
  const msg = String(error?.message || error || 'Write gagal').slice(0, 180);
  const s = readCircuit();
  const cooled = s.openedAt > 0 && Date.now() - s.openedAt >= CIRCUIT_COOLDOWN_MS;
  const baseFailures = cooled ? 0 : s.failures;
  const nextFailures = Math.min(CIRCUIT_THRESHOLD, baseFailures + 1);
  const next = nextFailures >= CIRCUIT_THRESHOLD
    ? { failures: nextFailures, openedAt: Date.now(), lastError: msg }
    : { failures: nextFailures, openedAt: 0, lastError: msg };
  try { localStorage.setItem(CIRCUIT_KEY, JSON.stringify(next)); } catch (_) {}
  emitCircuit();
  return nextFailures;
}
function isTransientWriteError(error) {
  const msg = String(error?.message || error || '');
  return !navigator.onLine || /Failed to fetch|NetworkError|Abort|Timeout|HTTP 5|503|502|504/i.test(msg);
}
async function postJsonWrite(payload) {
  return postJson(payload, { retries: 1, timeoutMs: getWriteTimeoutMs(payload), emitFailure: false });
}
function coalescedRead(key, factory) {
  if (_inflightReads.has(key)) return _inflightReads.get(key);
  const p = Promise.resolve().then(factory).finally(() => _inflightReads.delete(key));
  _inflightReads.set(key, p);
  return p;
}
function readStockCache(entity) {
  try {
    const raw = JSON.parse(localStorage.getItem(STOCK_CACHE_KEY) || '{}');
    const entry = raw[String(entity || 'ALL').toUpperCase()];
    return entry && Array.isArray(entry.items) ? entry : null;
  } catch (_) { return null; }
}
function writeStockCache(entity, items) {
  try {
    const raw = JSON.parse(localStorage.getItem(STOCK_CACHE_KEY) || '{}');
    raw[String(entity || 'ALL').toUpperCase()] = { at: Date.now(), items: Array.isArray(items) ? items : [] };
    localStorage.setItem(STOCK_CACHE_KEY, JSON.stringify(raw));
  } catch (_) {}
}
function invalidateStockCache() {
  try { localStorage.removeItem(STOCK_CACHE_KEY); } catch (_) {}
}
try {
  if (typeof window !== 'undefined') window.addEventListener('gudangai-stock-refresh', invalidateStockCache, { passive: true });
} catch (_) {}
function readQueueLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    _queueRevision = Number(localStorage.getItem(QUEUE_KEY + '_rev') || 0) || 0;
    return { revision: _queueRevision, queue: Array.isArray(raw) ? raw : [] };
  } catch (_) { return { revision: 0, queue: [] }; }
}
function commitQueueLocal(queue) {
  const next = Math.max(_queueRevision + 1, Date.now());
  _queueRevision = next;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(Array.isArray(queue) ? queue : []));
    localStorage.setItem(QUEUE_KEY + '_rev', String(next));
  } catch (_) {}
  void persistQueueBackup(queue, next);
  try { window.dispatchEvent(new CustomEvent('gudangai-queue-changed', { detail: { revision: next, count: (queue || []).reduce((n, e) => n + (e.items || []).length, 0) } })); } catch (_) {}
}
export async function hydrateOfflineQueue() {
  return hydrateQueueBackup(readQueueLocal, (queue, revision) => {
    _queueRevision = revision;
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue || []));
      localStorage.setItem(QUEUE_KEY + '_rev', String(revision || 0));
    } catch (_) {}
  });
}
function getBatchStability() {
  try { return Math.max(0, Number(localStorage.getItem(BATCH_STABILITY_KEY) || 0)); } catch (_) { return 0; }
}
function setBatchStability(value) {
  try { localStorage.setItem(BATCH_STABILITY_KEY, String(Math.max(0, Number(value) || 0))); } catch (_) {}
}
function getBatchChunkSize() {
  return getBatchStability() >= 5 ? BATCH_CHUNK_SIZE_PROMOTED : BATCH_CHUNK_SIZE_BASE;
}
function recordBatchStable() { setBatchStability(getBatchStability() + 1); }
function recordBatchUnstable() { setBatchStability(0); }
async function getJson(action, extraParams = {}) {
  const url = getApiUrl();
  if (!url) throw new Error('URL API belum diatur');
  const secret = getApiSecret();
  const q = new URLSearchParams({ action, ...extraParams });
  if (secret) q.set('secret', secret);
  const res = await fetchWithRetry(url + '?' + q.toString(), { method: 'GET', redirect: 'follow' });
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error('Respons bukan JSON: ' + text.slice(0, 120)); }
}
function generateDemoStock() { return []; }
export async function healthCheck() {
  if (!getApiUrl()) return { ok: false, offline: true, error: 'URL API belum diatur' };
  try {
    let data = null; let lastErr = null;
    try { data = await getJson('ping'); } catch (e) { lastErr = e; }
    if (!data || (data.error && !data.success && data.status !== 'OK')) {
      try { data = await getJson('status'); } catch (e) { lastErr = e; }
    }
    if (data && (data.success || data.status === 'OK' || data.ok)) return { ok: true, data };
    return { ok: false, offline: true, error: (data && data.error) || (lastErr && lastErr.message) || 'Tidak terjangkau' };
  } catch (err) {
    return { ok: false, offline: true, error: err.message || 'Offline' };
  }
}
export function getConnectionStatus() { return { online: navigator.onLine, apiUrl: getApiUrl() }; }
function mapStockItem(it, entity) {
  const stockAkhir = Number(it.stockAkhir != null ? it.stockAkhir : it.stok != null ? it.stok : it.qty != null ? it.qty : it.sisa != null ? it.sisa : 0) || 0;
  const stockAman = Number(it.stockAman != null ? it.stockAman : it.stokAman != null ? it.stokAman : it.aman != null ? it.aman : it.min != null ? it.min : 0) || 0;
  return {
    kode: it.kode || it.kodeBarang || '',
    nama: it.nama || '',
    satuan: it.satuan || 'Pack',
    stok: stockAkhir,
    stockAkhir,
    stockAman,
    stokAman: stockAman,
    aman: stockAman,
    size: it.size || it.ukuran || '',
    divisi: it.divisi || '',
    entitas: (it.entitas || entity || '').toUpperCase(),
    entity: (it.entitas || entity || '').toUpperCase(),
    stockValue: Number(it.stockValue || it.nilaiStok || 0) || 0,
  };
}
async function fetchStockNetwork(entity, options = {}) {
  const allowDemo = options.allowDemo === true;
  const url = getApiUrl();
  if (!url) {
    if (allowDemo) return generateDemoStock();
    throw new Error('URL API belum diatur');
  }
  let data;
  try { data = await getJson('getAllStock', { entitas: entity || 'ALL' }); }
  catch {
    try { data = await postJson({ action: 'getAllStock', entitas: entity || 'ALL', requestId: newIds().requestId }); }
    catch { data = null; }
  }
  if (data && data.code === 'UNAUTHORIZED') throw new Error('Unauthorized — cek API Secret di Atur');
  if (data && data.success === false) throw new Error(data.error || 'Gagal mengambil stok');
  const raw = (data && (data.items || data.stock || data.data)) || [];
  const items = (Array.isArray(raw) ? raw : []).map((it) => mapStockItem(it, entity));
  writeStockCache(entity, items);
  return items;
}
export async function revalidateStock(entity, options = {}) {
  return coalescedRead('stock:' + String(entity || 'ALL').toUpperCase(), async () => {
    try { return await fetchStockNetwork(entity, options); }
    catch (err) {
      if (options.allowDemo === true) return generateDemoStock();
      throw err;
    }
  });
}
export async function fetchStock(entity, options = {}) {
  const cached = readStockCache(entity);
  if (cached) {
    const age = Math.max(0, Date.now() - Number(cached.at || 0));
    if (age < STOCK_FRESH_MS) return cached.items;
    if (age < STOCK_STALE_MS) {
      void revalidateStock(entity, options).catch(() => undefined);
      return cached.items;
    }
  }
  return revalidateStock(entity, options);
}
export async function validateImportedItems(items, entity) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return { success: false, status: 'REJECTED', code: 'ITEMS_REQUIRED', error: 'Tidak ada item untuk divalidasi.' };
  try {
    const data = await postJson({ action: 'validateImportedItems', entitas: String(entity || '').toUpperCase(), items: list, requestId: newIds().requestId });
    return data || { success: false, status: 'ERROR', error: 'Respons validasi kosong' };
  } catch (err) {
    return { success: false, status: 'VALIDATION_UNAVAILABLE', error: err?.message || 'Validasi server tidak tersedia' };
  }
}

export async function getTransactionStatus(transactionId, nonce = '', sheet = '') {
  const tx = String(transactionId || '').trim();
  if (!tx) return { success: false, status: 'REJECTED', code: 'IDENTITY_REQUIRED', error: 'transactionId wajib diisi' };
  try {
    return await getJson('getTransactionStatus', { transactionId: tx, nonce: nonce || tx, sheet: sheet || '' });
  } catch (err) {
    return { success: false, status: 'STATUS_UNAVAILABLE', error: err?.message || 'Status transaksi tidak tersedia' };
  }
}

export async function getStatusPO() {
  return coalescedRead('statusPO', async () => {
    try {
      let data = null;
      try { data = await getJson('getStatusPO'); } catch (_) { data = null; }
      if (!data || data.code === 'UNAUTHORIZED' || (data.success === false && !data.summary && !data.items)) {
        try { data = await postJson({ action: 'getStatusPO', requestId: newIds().requestId }); }
        catch (e2) {
          if (data) return data;
          return { success: false, error: e2?.message || 'Gagal mengambil status PO' };
        }
      }
      return data || { success: false, error: 'Respons status PO kosong' };
    } catch (err) {
      return { success: false, error: err?.message || 'Gagal mengambil status PO' };
    }
  });
}
export async function getDashboardData() {
  try {
    const data = await getJson('getDashboard');
    return data || { success: false };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
function getAppliedMap() { try { return JSON.parse(localStorage.getItem(APPLIED_KEY) || '{}'); } catch { return {}; } }
function pruneApplied(map) {
  const now = Date.now();
  const out = {};
  for (const [k, v] of Object.entries(map || {})) { if (now - (typeof v === 'number' ? v : 0) < APPLIED_TTL_MS) out[k] = v; }
  return out;
}
function isApplied(clientItemId) { return !!(clientItemId && getAppliedMap()[clientItemId]); }
function markApplied(clientItemId) {
  if (!clientItemId) return;
  const map = pruneApplied(getAppliedMap());
  map[clientItemId] = Date.now();
  localStorage.setItem(APPLIED_KEY, JSON.stringify(map));
}
export function markItemApplied(clientItemId) { markApplied(clientItemId); }
function ensureClientItemId(it) {
  if (it.clientItemId) return it;
  return { ...it, clientItemId: 'CI-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2, 9)) };
}
function enqueue(type, entity, items, meta = {}) {
  if (!items || !items.length) return;
  const queue = getPendingQueue();
  const entry = { id: 'Q-' + Date.now(), type, entity, items: items.map(ensureClientItemId), tanggal: meta.tanggal || new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString() };
  queue.push(entry);
  commitQueueLocal(queue);
}
function normalizeQueue(rawQueue) {
  if (!Array.isArray(rawQueue)) return [];
  return rawQueue.map((e) => ({ ...e, items: (e.items || []).map(ensureClientItemId) }));
}
async function submitOneItem(sheetOrAction, entity, it, tanggal) {
  const cid = it.clientItemId || ensureClientItemId(it).clientItemId;
  if (isApplied(cid)) return { success: true, skipped: true, clientItemId: cid };
  const SHEET_MAP = { barangMasuk: 'Barang masuk', barangKeluar: 'Barang keluar', barangRusak: 'Barang Rusak' };
  const sheetName = SHEET_MAP[sheetOrAction] || sheetOrAction;
  const entitas = String(entity || '').toUpperCase();
  const payload = {
    action: 'addTransaction',
    sheet: sheetName,
    entitas: entitas,
    tanggal: tanggal || new Date().toISOString().slice(0, 10),
    kodeBarang: String(it.kode || it.kodeBarang || '').trim(),
    qty: Number(it.qty) || 0,
    keterangan: String(it.keterangan || '').trim().slice(0, 200),
    requestId: cid,
    transactionId: 'TX-' + cid,
    nonce: 'NC-' + cid,
    queueApproved: true,
  };
  const data = await postJsonWrite(payload);
  if (data && data.code === 'UNAUTHORIZED') return { success: false, unauthorized: true, kode: payload.kodeBarang, clientItemId: cid, error: 'Unauthorized' };
  if (data && (data.status === 'DUPLICATE' || data.idempotent === true)) { markApplied(cid); return { success: true, skipped: true, kode: payload.kodeBarang, clientItemId: cid }; }
  if (data && data.status === 'UNKNOWN') return { success: false, unknown: true, kode: payload.kodeBarang, clientItemId: cid, error: 'UNKNOWN' };
  if (data && (data.success === true || data.status === 'APPLIED' || data.status === 'OK' || data.status === 'COMMITTED')) {
    markApplied(cid);
    return { success: true, kode: payload.kodeBarang, qty: data.qty != null ? data.qty : payload.qty, row: data.row, clientItemId: cid };
  }
  return { success: false, error: (data && (data.error || data.message)) || 'Gagal tulis', clientItemId: cid, kode: payload.kodeBarang };
}

async function reconcileChunk(items, sheetName) {
  const list = Array.isArray(items) ? items : [];
  const applied = [], unresolved = [];
  for (const it of list) {
    const cid = it?.clientItemId || '';
    if (!cid) { unresolved.push(it); continue; }
    const st = await getTransactionStatus('TX-' + cid, 'NC-' + cid, sheetName);
    if (st && (st.status === 'APPLIED' || st.status === 'COMMITTED' || st.code === 'READBACK_CONFIRMED' || st.code === 'READBACK_FOUND' || st.code === 'IDEMPOTENT_REPLAY')) {
      markApplied(cid); applied.push(it);
    } else if (st && st.status === 'NOT_FOUND') {
      unresolved.push(it);
    } else {
      unresolved.push(it);
    }
  }
  return { applied, unresolved };
}

async function submitTransaction(action, entity, items, options = {}) {
  const fromQueue = !!(options && options.fromQueue);
  const tanggal = (options && options.tanggal) || new Date().toISOString().slice(0, 10);
  const typeMap = { barangMasuk: 'masuk', barangKeluar: 'keluar', barangRusak: 'rusak' };
  const SHEET_MAP = { barangMasuk: 'Barang masuk', barangKeluar: 'Barang keluar', barangRusak: 'Barang Rusak' };
  const SHEET_NAME = SHEET_MAP[action] || action;
  const entitas = String(entity || '').toUpperCase();
  const list = (items || []).map(ensureClientItemId);
  if (!list.length) return { success: false, error: 'Tidak ada item' };
  const alreadyDone = list.filter((it) => isApplied(it.clientItemId)).length;
  const todo = list.filter((it) => !isApplied(it.clientItemId));
  const circuit = getWriteCircuitState();
  if (circuit.open) return { success: false, paused: true, code: 'CIRCUIT_OPEN', retryAfterMs: circuit.retryAfterMs, written: alreadyDone, remaining: todo, error: 'Pengiriman dijeda sementara setelah 3 kegagalan write. Cek Antrian/Spreadsheet.' };
  if (!todo.length) return { success: true, written: alreadyDone, remaining: [], skippedAll: true };

  if (!fromQueue && todo.length >= 1 && todo.length <= BATCH_MAX) {
    try {
      const chunks = [];
      const activeChunkSize = getBatchChunkSize();
      for (let i = 0; i < todo.length; i += activeChunkSize) chunks.push(todo.slice(i, i + activeChunkSize));
      let written = alreadyDone;
      const remaining = [];
      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const batchId = 'BATCH-' + (chunk[0].clientItemId || Date.now()) + '-c' + ci;
        const transactions = chunk.map((it) => {
          const cid = it.clientItemId;
          return {
            sheet: SHEET_NAME,
            entitas: entitas,
            kodeBarang: String(it.kode || it.kodeBarang || '').trim(),
            qty: Number(it.qty) || 0,
            keterangan: String(it.keterangan || '').trim().slice(0, 200),
            tanggal: tanggal || undefined,
            requestId: cid,
            transactionId: 'TX-' + cid,
            nonce: 'NC-' + cid,
            queueApproved: true,
          };
        });
        const batchPayload = {
          action: 'addTransactionBatch',
          sheet: SHEET_NAME,
          entitas: entitas,
          tanggal: tanggal || undefined,
          transactions,
          items: transactions,
          batchId,
          requestId: batchId,
          queueApproved: true,
        };
        let batchRes = null;
        try {
          batchRes = await postJsonWrite(batchPayload);
        } catch (chunkErr) {
          emitConn({ state: 'write_unknown', error: chunkErr?.message || 'Timeout', batchId });
          const reconciled = await reconcileChunk(chunk, SHEET_NAME);
          remaining.push(...reconciled.unresolved);
          for (let j = ci + 1; j < chunks.length; j++) remaining.push(...chunks[j]);
          written += reconciled.applied.length;
          break;
        }
        if (batchRes && batchRes.code === 'UNAUTHORIZED') {
          return { success: false, error: 'Unauthorized — isi API Secret di Atur', remaining: todo, written };
        }
        if (batchRes && (batchRes.success === true || batchRes.status === 'COMMITTED' || batchRes.status === 'APPLIED') && !batchRes.error) {
          recordWriteSuccess();
          recordBatchStable();
          const okCount = Number(batchRes.successCount);
          chunk.forEach((it) => markApplied(it.clientItemId));
          written += (Number.isFinite(okCount) && okCount > 0) ? okCount : chunk.length;
        } else if (batchRes && batchRes.status === 'UNKNOWN') {
          recordBatchUnstable();
          recordWriteFailure(batchRes.error || 'UNKNOWN');
          emitConn({ state: 'write_unknown', error: batchRes.error || 'Status batch tidak pasti', batchId });
          const reconciled = await reconcileChunk(chunk, SHEET_NAME);
          remaining.push(...reconciled.unresolved);
          written += reconciled.applied.length;
        } else {
          remaining.push(...chunk);
        }
      }
      if (remaining.length && !fromQueue) {
        enqueue(typeMap[action], entity, remaining, { tanggal });
        const okN = written - alreadyDone;
        pushNotification({
          type: okN > 0 ? 'ok' : 'warn',
          title: okN > 0 ? ('Berhasil ' + okN + ' · antrian ' + remaining.length) : 'Verifikasi antrian',
          body: okN > 0
            ? (okN + ' item sudah di sheet. ' + remaining.length + ' di Antrian — cek spreadsheet; jika sudah tertulis tekan Sukses.')
            : (remaining.length + ' item masuk Antrian (timeout). Cek sheet — jika sudah ada, tekan Sukses (jangan kirim ulang).'),
        });
        return { success: okN > 0, written, remaining, queued: true, offline: !navigator.onLine };
      }
      if (!remaining.length) {
        try { window.dispatchEvent(new CustomEvent('gudangai-stock-refresh')); } catch (_) {}
        return { success: true, written, remaining: [], message: 'Semua item berhasil ditulis (chunked).' };
      }
      return { success: false, written, remaining, error: 'Batch sebagian gagal' };
    } catch (err) {
      if (!fromQueue) {
        enqueue(typeMap[action], entity, todo, { tanggal });
        return { success: false, written: alreadyDone, remaining: todo, queued: true, offline: true, error: err.message || 'Timeout / jaringan — masuk antrian' };
      }
      return { success: false, written: alreadyDone, remaining: todo, error: err.message };
    }
  }

  const written = [];
  const errors = [];
  const failedItems = [];
  for (let i = 0; i < todo.length; i++) {
    const it = todo[i];
    if (isApplied(it.clientItemId)) continue;
    if (getWriteCircuitState().open) return { success: false, paused: true, code: 'CIRCUIT_OPEN', written: written.length + alreadyDone, remaining: todo.slice(i), error: 'Pengiriman dijeda sementara setelah 3 kegagalan write.' };
    try {
      const res = await submitOneItem(action, entity, it, tanggal);
      if (res.unauthorized) return { success: false, written: written.length + alreadyDone, remaining: todo.slice(i), error: 'Unauthorized — isi API Secret di Atur' };
      if (res.success) { recordWriteSuccess(); written.push(res); }
      else { errors.push((res.kode || '?') + ': ' + (res.error || 'gagal')); failedItems.push(it); }
    } catch (err) {
      const msg = err.message || '';
      const isNetwork = !navigator.onLine || /Failed to fetch|NetworkError|Timeout|HTTP 5/i.test(msg);
      if (isNetwork) {
        recordWriteFailure(err);
        recordBatchUnstable();
        const rest = todo.slice(i).filter((x) => !isApplied(x.clientItemId));
        if (!fromQueue) enqueue(typeMap[action], entity, rest, { tanggal });
        return { success: written.length > 0, queued: true, remaining: rest, written: written.length + alreadyDone, error: 'Jaringan terputus — sisa antrian.' };
      }
      errors.push((it.kode || '?') + ': ' + msg);
      failedItems.push(it);
    }
  }
  const stillPending = failedItems.filter((it) => !isApplied(it.clientItemId));
  if (!failedItems.length) {
    try { window.dispatchEvent(new CustomEvent('gudangai-stock-refresh')); } catch (_) {}
    return { success: true, written: written.length + alreadyDone, remaining: [], details: written };
  }
  if (stillPending.length && !fromQueue) enqueue(typeMap[action], entity, stillPending, { tanggal });
  return { success: false, written: written.length + alreadyDone, remaining: stillPending, error: 'Sebagian gagal. ' + errors.join('; ') };
}

export const submitBarangMasuk = (entity, items, options) => submitTransaction('barangMasuk', entity, items, options || {});
export const submitBarangKeluar = (entity, items, options) => submitTransaction('barangKeluar', entity, items, options || {});
export const submitBarangRusak = (entity, items, options) => submitTransaction('barangRusak', entity, items, options || {});
export function getPendingQueue() {
  try { return normalizeQueue(readQueueLocal().queue); } catch (_) { return []; }
}
export function removePendingByClientIds(ids) {
  if (!ids || !ids.length) return;
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    const set = new Set(ids);
    const next = [];
    for (const e of q) {
      const items = (e.items || []).filter((it) => !set.has(it.clientItemId));
      if (items.length) next.push({ ...e, items });
    }
    commitQueueLocal(next);
  } catch (_) {}
}
export function clearPendingQueue() { commitQueueLocal([]); }
export async function syncPendingQueue() {
  const url = getApiUrl();
  if (!url || !navigator.onLine) return { synced: 0, failed: 0, skipped: true };
  if (_syncLock) return { synced: 0, failed: 0, skipped: true, reason: 'sync-in-progress' };
  _syncLock = true;
  try {
    let queue = normalizeQueue(JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'));
    let synced = 0, failed = 0;
    const actionMap = { masuk: 'barangMasuk', keluar: 'barangKeluar', rusak: 'barangRusak' };
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].synced) continue;
      const pendingItems = (queue[i].items || []).map(ensureClientItemId).filter((it) => !isApplied(it.clientItemId));
      if (!pendingItems.length) { queue[i].synced = true; continue; }
      const act = actionMap[queue[i].type] || 'barangMasuk';
      try {
        const res = await submitTransaction(act, queue[i].entity, pendingItems, { tanggal: queue[i].tanggal, fromQueue: true });
        if (res.success && (!res.remaining || !res.remaining.length)) { queue[i].synced = true; synced += pendingItems.length; }
        else { failed += (res.remaining || pendingItems).length; if (res.offline) break; }
      } catch { failed++; break; }
    }
    commitQueueLocal(queue.filter((e) => !e.synced && (e.items || []).length));
    return { synced, failed, skipped: false };
  } finally { _syncLock = false; }
}
const HISTORY_KEY = 'gudangai_history';
export function getTransactionHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } }
export function saveToHistory(entry) {
  try {
    const h = getTransactionHistory();
    h.unshift({ ...entry, savedAt: new Date().toISOString() });
    if (h.length > 500) h.length = 500;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch (_) {}
}
export function pushNotification(n) {
  try {
    const t = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
    t.unshift({ id: 'N-' + Date.now(), ...n, at: new Date().toISOString(), read: false });
    if (t.length > 50) t.length = 50;
    localStorage.setItem(NOTIF_KEY, JSON.stringify(t));
    window.dispatchEvent(new CustomEvent('gudangai-notif'));
  } catch (_) {}
}
export function getNotifications() { try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch { return []; } }
export function markNotificationsRead() {
  try {
    const t = getNotifications().map((n) => ({ ...n, read: true }));
    localStorage.setItem(NOTIF_KEY, JSON.stringify(t));
  } catch (_) {}
}
export function unreadNotificationCount() { return getNotifications().filter((n) => !n.read).length; }
export async function submitPO(payload) {
  try {
    const rawItems = (payload && (payload.items || payload.poItems)) || [];
    const items = rawItems.map((it) => {
      const entity = String(it.entity || it.entitas || '').toUpperCase();
      let poCV = Number(it.poCV);
      let poPT = Number(it.poPT);
      if (!Number.isFinite(poCV)) poCV = 0;
      if (!Number.isFinite(poPT)) poPT = 0;
      const qty = Number(it.qty) || 0;
      if (poCV <= 0 && poPT <= 0 && qty > 0) {
        if (entity === 'PT') poPT = qty;
        else poCV = qty;
      }
      return {
        ...it,
        kode: it.kode || it.kodeBarang || it.kodeCV || it.kodePT || '',
        nama: it.nama || '',
        satuan: it.satuan || 'Pack',
        size: it.size || '',
        entity: entity || (poCV > 0 && poPT > 0 ? 'BOTH' : poPT > 0 ? 'PT' : 'CV'),
        entitas: entity || (poCV > 0 && poPT > 0 ? 'BOTH' : poPT > 0 ? 'PT' : 'CV'),
        qty: (poCV + poPT) || qty,
        poCV,
        poPT,
        tglKedatangan: it.tglKedatangan || it.tanggalKedatangan || '',
      };
    }).filter((it) => (Number(it.poCV) || 0) + (Number(it.poPT) || 0) > 0 && String(it.nama || '').trim());
    if (!items.length) return { success: false, status: 'REJECTED', code: 'PO_ITEMS_REQUIRED', error: 'Final PO tidak berisi item yang valid.' };
    const body = { action: 'submitPO', ...(payload || {}), items, poItems: items };
    const data = await postJsonWrite(body);
    return data || { success: false, error: 'Respons submit PO kosong' };
  } catch (err) {
    return { success: false, error: err?.message || 'Gagal menyimpan PO' };
  }
}
