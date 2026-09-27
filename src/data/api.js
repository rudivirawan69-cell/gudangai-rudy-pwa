/** GudangAI RUDY — API layer V6.7.0 + Batch Transaction + Robust Timeout */
const RETRY_COUNT = 2;
const RETRY_BASE_MS = 400;
const REQUEST_TIMEOUT_MS = 15000;
const BATCH_CHUNK_SIZE = 15;
const BATCH_TIMEOUT_MS = 150000;
const SINGLE_TIMEOUT_MS = 45000;
const SCHEMA_VERSION = '1.0';
const SAFE_WRITE_BACKEND_RE = /STOCK-READONLY|STOCK-SOURCE-LOCKED/i;

const APPLIED_KEY = 'gudangai_applied';
const QUEUE_KEY = 'gudangai_queue';
const APPLIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NOTIF_KEY = 'gudangai_notif';
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbwtSr7cdBKhvJOwwkSZ9GUf1ebuHOM8CsKXo1I6r8v0Z_gi4_ElrDK9oez8LX5DAB1INw/exec';
let _syncLock = false;
let _queueRevision = 0;
let _batchSupported = null;

import { hydrateQueueBackup, persistQueueBackup } from './offlineStore';
function emitConn(detail) { try { window.dispatchEvent(new CustomEvent('gudangai-conn', { detail })); } catch (_) {} }
export function getApiUrl() {
  const stored = (localStorage.getItem('gudangai_api_url') || '').trim();
  if (stored) return stored;
  localStorage.setItem('gudangai_api_url', DEFAULT_API_URL);
  return DEFAULT_API_URL;
}
export function setApiUrl(url) {
  const c = (url || '').trim();
  localStorage.setItem('gudangai_api_url', c || DEFAULT_API_URL);
  _batchSupported = null;
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
function newIds() {
  const uuid = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  return { requestId: 'REQ-' + uuid, transactionId: 'TX-RUDY-' + uuid };
}
async function fetchWithRetry(url, options = {}, retries = RETRY_COUNT, timeoutMs = REQUEST_TIMEOUT_MS) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) await delay(RETRY_BASE_MS * attempt);
    }
  }
  throw lastError;
}
async function postJson(payload, { retries = RETRY_COUNT, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const url = getApiUrl();
  if (!url) throw new Error('URL API belum diatur');
  const body = JSON.stringify({ schemaVersion: SCHEMA_VERSION, secret: getApiSecret() || undefined, client: { app: 'gudangai-rudy-pwa', deviceId: deviceId() }, ...payload });
  const res = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, redirect: 'follow' }, retries, timeoutMs);
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error('Respons bukan JSON: ' + text.slice(0, 120)); }
}
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
async function getJson(action, extraParams = {}) {
  const url = getApiUrl();
  if (!url) throw new Error('URL API belum diatur');
  const secret = getApiSecret();
  const q = new URLSearchParams({ action, ...extraParams });
  if (secret) q.set('secret', secret);
  const res = await fetchWithRetry(url + '?' + q.toString(), { method: 'GET', redirect: 'follow' });
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error('Respons bukan JSON'); }
}
export async function healthCheck() {
  if (!getApiUrl()) return { ok: false, offline: true, error: 'URL API belum diatur' };
  try {
    let data = null;
    try { data = await getJson('ping'); } catch (_) {}
    if (!data) try { data = await getJson('status'); } catch (_) {}
    if (data && (data.success || data.status === 'OK' || data.ok)) {
      if (data.batchSupported != null) _batchSupported = !!data.batchSupported;
      else if (data.data?.batchSupported != null) _batchSupported = !!data.data.batchSupported;
      return { ok: true, data };
    }
    return { ok: false, offline: true, error: (data && data.error) || 'Tidak terjangkau' };
  } catch (err) {
    return { ok: false, offline: true, error: err.message || 'Offline' };
  }
}
export function getConnectionStatus() { return { online: navigator.onLine, apiUrl: getApiUrl() }; }
export function getWriteCircuitState() {
  return { failures: 0, openedAt: 0, lastError: '', open: false, retryAfterMs: 0 };
}
async function assertSafeWriteBackend() {
  const health = await healthCheck();
  const version = String(
    health?.data?.version ??
    health?.data?.data?.version ??
    ''
  ).trim();

  if (!health?.ok) {
    throw new Error('WRITE DITAHAN: backend tidak terverifikasi. Tidak ada transaksi yang dikirim.');
  }
  if (!SAFE_WRITE_BACKEND_RE.test(version)) {
    throw new Error('WRITE DITAHAN: backend belum LOCK Stock CV/PT. Versi: ' + (version || 'tidak diketahui'));
  }
  return health;
}
function mapStockItem(it, entity) {
  const stockAkhir = Number(it.stockAkhir ?? it.stok ?? it.qty ?? it.sisa ?? 0) || 0;
  const stockAman = Number(it.stockAman ?? it.stokAman ?? it.aman ?? it.min ?? 0) || 0;
  return {
    kode: it.kode || it.kodeBarang || '',
    nama: it.nama || '',
    satuan: it.satuan || 'Pack',
    stok: stockAkhir,
    stockAkhir,
    stockAman,
    min: stockAman || 5,
    divisi: it.divisi || '',
    entitas: (it.entitas || entity || '').toUpperCase(),
    entity: (it.entitas || entity || '').toUpperCase(),
  };
}
export async function fetchStock(entity, options = {}) {
  const url = getApiUrl();
  if (!url) {
    if (options.allowDemo) return [];
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
  if (data && !Array.isArray(data.items) && (data.cv || data.pt || data.CV || data.PT)) {
    const cv = (data.cv || data.CV || []).map((it) => mapStockItem(it, 'CV'));
    const pt = (data.pt || data.PT || []).map((it) => mapStockItem(it, 'PT'));
    return [...cv, ...pt];
  }
  const raw = (data && (data.items || data.stock || data.data)) || [];
  return (Array.isArray(raw) ? raw : []).map((it) => mapStockItem(it, entity));
}
export async function getStatusPO() {
  try {
    let data = null;
    try { data = await getJson('getStatusPO'); } catch (_) {}
    if (!data || data.code === 'UNAUTHORIZED') {
      try { data = await postJson({ action: 'getStatusPO', requestId: newIds().requestId }); } catch (e2) {
        return data || { success: false, error: e2?.message || 'Gagal status PO' };
      }
    }
    return data || { success: false, error: 'Respons kosong' };
  } catch (err) {
    return { success: false, error: err?.message || 'Gagal status PO' };
  }
}
export async function confirmPOStatus(payload) {
  try {
    return await postJson({ action: 'confirmPOStatus', ...(payload || {}), requestId: newIds().requestId });
  } catch (err) {
    return { success: false, error: err?.message || 'Gagal konfirmasi PO' };
  }
}
function getAppliedMap() {
  try {
    const map = JSON.parse(localStorage.getItem(APPLIED_KEY) || '{}');
    // Prune entries older than TTL
    const now = Date.now();
    let pruned = false;
    for (const [k, v] of Object.entries(map)) {
      if (typeof v === 'number' && now - v > APPLIED_TTL_MS) {
        delete map[k];
        pruned = true;
      }
    }
    if (pruned) { try { localStorage.setItem(APPLIED_KEY, JSON.stringify(map)); } catch (_) {} }
    return map;
  } catch { return {}; }
}
function isApplied(clientItemId) { return !!(clientItemId && getAppliedMap()[clientItemId]); }
function markApplied(clientItemId) {
  if (!clientItemId) return;
  const map = getAppliedMap();
  map[clientItemId] = Date.now();
  try { localStorage.setItem(APPLIED_KEY, JSON.stringify(map)); } catch (_) {}
}
export function markItemApplied(clientItemId) { markApplied(clientItemId); }
function ensureClientItemId(it) {
  if (it.clientItemId) return it;
  return { ...it, clientItemId: 'CI-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2, 9)) };
}
function enqueue(type, entity, items, meta = {}) {
  if (!items?.length) return;
  const queue = getPendingQueue();
  queue.push({
    id: 'Q-' + Date.now(), type, entity,
    items: items.map(ensureClientItemId),
    tanggal: meta.tanggal || new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  });
  commitQueueLocal(queue);
}
async function submitOneItem(sheetOrAction, entity, it, tanggal) {
  const cid = it.clientItemId || ensureClientItemId(it).clientItemId;
  if (isApplied(cid)) return { success: true, skipped: true, clientItemId: cid };
  const SHEET_MAP = { barangMasuk: 'Barang masuk', barangKeluar: 'Barang keluar', barangRusak: 'Barang Rusak' };
  const sheetName = SHEET_MAP[sheetOrAction] || sheetOrAction;
  const payload = {
    action: 'addTransaction',
    sheet: sheetName,
    entitas: String(entity || '').toUpperCase(),
    tanggal: tanggal || new Date().toISOString().slice(0, 10),
    kodeBarang: String(it.kode || it.kodeBarang || '').trim(),
    qty: Number(it.qty) || 0,
    keterangan: String(it.keterangan || '').trim().slice(0, 200),
    requestId: cid,
    transactionId: 'TX-' + cid,
    nonce: 'NC-' + cid,
    queueApproved: true,
  };
  const data = await postJson(payload, { retries: 1, timeoutMs: SINGLE_TIMEOUT_MS });
  if (data && data.code === 'UNAUTHORIZED') return { success: false, unauthorized: true, clientItemId: cid, error: 'Unauthorized' };
  if (data && (data.status === 'DUPLICATE' || data.idempotent === true || data.success === true || data.status === 'APPLIED' || data.status === 'OK')) {
    markApplied(cid);
    return { success: true, clientItemId: cid, stockAkhir: data.stockAkhir };
  }
  return { success: false, error: (data && (data.error || data.message)) || 'Gagal tulis', clientItemId: cid };
}

/** Batch submit: send chunk of items in one request */
async function submitBatchChunk(action, entity, chunkItems, tanggal) {
  const SHEET_MAP = { barangMasuk: 'Barang masuk', barangKeluar: 'Barang keluar', barangRusak: 'Barang Rusak' };
  const sheetName = SHEET_MAP[action] || action;
  const toSend = [];
  const skipped = [];
  for (const it of chunkItems) {
    const cid = it.clientItemId || ensureClientItemId(it).clientItemId;
    if (isApplied(cid)) {
      skipped.push({ success: true, skipped: true, clientItemId: cid });
    } else {
      toSend.push({
        kodeBarang: String(it.kode || it.kodeBarang || '').trim(),
        kode: String(it.kode || it.kodeBarang || '').trim(),
        qty: Number(it.qty) || 0,
        keterangan: String(it.keterangan || '').trim().slice(0, 200),
        clientItemId: cid,
        requestId: cid,
        transactionId: 'TX-' + cid,
      });
    }
  }
  if (!toSend.length) return { success: true, successCount: skipped.length, failCount: 0, results: skipped };
  const payload = {
    action: 'addBatchTransaction',
    sheet: sheetName,
    entitas: String(entity || '').toUpperCase(),
    tanggal: tanggal || new Date().toISOString().slice(0, 10),
    items: toSend,
    requestId: newIds().requestId,
  };
  const data = await postJson(payload, { retries: 1, timeoutMs: BATCH_TIMEOUT_MS });
  if (data && (data.code === 'UNKNOWN_ACTION' || data.error === 'UNKNOWN_ACTION' || (data.error && /tidak dikenali/i.test(data.error)))) {
    _batchSupported = false;
    throw new Error('BATCH_NOT_SUPPORTED');
  }
  _batchSupported = true;
  const batchResults = [];
  if (data && Array.isArray(data.results)) {
    for (const r of data.results) {
      if (r.success && r.clientItemId) markApplied(r.clientItemId);
      batchResults.push(r);
    }
  }
  return {
    success: (data && data.success) || false,
    successCount: (data && data.successCount) || batchResults.filter((r) => r.success).length,
    failCount: (data && data.failCount) || batchResults.filter((r) => !r.success).length,
    results: [...skipped, ...batchResults],
  };
}

/** Emit progress event for UI to show "Mengirim 15/80..." */
function emitProgress(sent, total, chunkResult) {
  try {
    window.dispatchEvent(new CustomEvent('gudangai-submit-progress', {
      detail: { sent, total, success: chunkResult?.successCount || 0, failed: chunkResult?.failCount || 0 }
    }));
  } catch (_) {}
}

/**
 * submitItems — batch-first with one-by-one fallback
 * Emits progress events for UI feedback
 */
async function submitItems(action, entity, items, tanggal) {
  const list = (items || []).map(ensureClientItemId);
  if (!list.length) return { success: false, error: 'Tidak ada item' };

  // HARD SAFETY: sebelum transaksi apa pun dikirim, backend wajib mengiklankan
  // kontrak STOCK-READONLY. Backend lama yang masih boleh menulis Stock CV/PT
  // akan otomatis ditolak oleh PWA.
  if (navigator.onLine && getApiUrl()) {
    await assertSafeWriteBackend();
  }
  if (!navigator.onLine || !getApiUrl()) {
    enqueue(action, entity, list, { tanggal });
    return { success: true, queued: true, count: list.length };
  }

  const allResults = [];
  let totalSuccess = 0;
  let totalFail = 0;
  let useBatch = _batchSupported !== false;

  for (let i = 0; i < list.length; i += BATCH_CHUNK_SIZE) {
    const chunk = list.slice(i, i + BATCH_CHUNK_SIZE);

    if (useBatch) {
      try {
        const batchRes = await submitBatchChunk(action, entity, chunk, tanggal);
        const sc = batchRes.successCount || 0;
        const fc = batchRes.failCount || 0;
        totalSuccess += sc;
        totalFail += fc;
        if (batchRes.results) allResults.push(...batchRes.results);
        else chunk.forEach((it) => allResults.push({ success: true, clientItemId: it.clientItemId }));
        emitProgress(i + chunk.length, list.length, batchRes);
        continue;
      } catch (err) {
        if (err.message === 'BATCH_NOT_SUPPORTED') useBatch = false;
        else useBatch = false;
        // Fall through to one-by-one
      }
    }

    // One-by-one fallback
    for (let j = 0; j < chunk.length; j++) {
      const it = chunk[j];
      try {
        const r = await submitOneItem(action, entity, it, tanggal);
        allResults.push(r);
        if (r.success || r.skipped) totalSuccess++;
        else totalFail++;
      } catch (err) {
        totalFail++;
        allResults.push({ success: false, error: err.message, clientItemId: it.clientItemId });
      }
      emitProgress(i + j + 1, list.length, { successCount: totalSuccess, failCount: totalFail });
    }
  }

  // Queue failed items for retry
  const failed = allResults.filter((r) => !r.success && !r.skipped);
  if (failed.length) {
    const failItems = list.filter((it) => failed.some((f) => f.clientItemId === it.clientItemId));
    if (failItems.length) enqueue(action, entity, failItems, { tanggal });
  }

  return { success: totalSuccess > 0, count: totalSuccess, failed: totalFail, results: allResults };
}
export async function submitBarangMasuk({ entity, tanggal, items }) {
  return submitItems('barangMasuk', entity, items, tanggal);
}
export async function submitBarangKeluar({ entity, tanggal, items }) {
  return submitItems('barangKeluar', entity, items, tanggal);
}
export async function submitBarangRusak({ entity, tanggal, items }) {
  return submitItems('barangRusak', entity, items, tanggal);
}
export function getPendingQueue() {
  return readQueueLocal().queue;
}
export function removePendingByClientIds(ids) {
  const set = new Set(ids || []);
  const q = getPendingQueue().map((e) => ({ ...e, items: (e.items || []).filter((it) => !set.has(it.clientItemId)) })).filter((e) => e.items.length);
  commitQueueLocal(q);
}
export function clearPendingQueue() { commitQueueLocal([]); }
export function clearSyncedQueue() { commitQueueLocal([]); }
export async function syncPendingQueue() {
  const url = getApiUrl();
  if (!url || !navigator.onLine) return { synced: 0, failed: 0, skipped: true };
  if (_syncLock) return { synced: 0, failed: 0, skipped: true, reason: 'sync-in-progress' };
  _syncLock = true;
  let synced = 0, failed = 0;
  try {
    const queue = getPendingQueue();
    const remaining = [];
    for (const entry of queue) {
      const res = await submitItems(entry.type, entry.entity, entry.items, entry.tanggal);
      if (res.success && !res.failed) synced += entry.items.length;
      else {
        failed += res.failed || entry.items.length;
        remaining.push(entry);
      }
    }
    commitQueueLocal(remaining);
    return { synced, failed };
  } finally {
    _syncLock = false;
  }
}
const HISTORY_KEY = 'gudangai_history';
export function getTransactionHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
export function saveToHistory(entry) {
  const list = getTransactionHistory();
  list.unshift({ ...entry, id: 'H-' + Date.now() });
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 200))); } catch (_) {}
}
export function pushNotification(n) {
  const list = getNotifications();
  list.unshift({ ...n, id: 'N-' + Date.now(), read: false, at: Date.now() });
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(list.slice(0, 50))); } catch (_) {}
}
export function getNotifications() {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch { return []; }
}
export function markNotificationsRead() {
  const list = getNotifications().map((n) => ({ ...n, read: true }));
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(list)); } catch (_) {}
}
export function unreadNotificationCount() {
  return getNotifications().filter((n) => !n.read).length;
}
export async function submitPO(payload) {
  try {
    return await postJson({ action: 'submitPO', ...(payload || {}), requestId: newIds().requestId });
  } catch (err) {
    return { success: false, error: err.message };
  }
}
