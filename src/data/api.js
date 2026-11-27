import { normalisasiRiwayatServer } from "./riwayatAdapter.js";
/** GudangAI RUDY — API layer V6.7.2 stable-chunk (BATCH=20) + queue serial fallback + tanggal YYYY-MM-DD */
/** PRODUCTION-WRITE-RECOVERY-2026-10-05: canonical main build marker; preserve CV/PT write path and 20-item batching. */
const RETRY_COUNT = 2;
const RETRY_BASE_MS = 400;
const REQUEST_TIMEOUT_MS = 15000;
/** Chunk 35 item; jangan dinaikkan tanpa pengukuran latency dan validasi read-back di produksi. */
const BATCH_CHUNK_SIZE = 35;
const BATCH_TIMEOUT_MS = 120000;
const SINGLE_TIMEOUT_MS = 60000;
const SCHEMA_VERSION = '1.0';
const DETERMINISTIC_BATCH_REJECTS = new Set([
  'PRECHECK_REJECTED', 'INVALID_DATE', 'DATE_REQUIRED', 'ENTITY_REQUIRED',
  'ENTITY_MISMATCH', 'CODE_ENTITY_MISMATCH', 'CODE_REQUIRED', 'INVALID_QTY',
  'SHEET_NOT_ALLOWED', 'SHEET_NOT_FOUND', 'PROTECTED_FIELD', 'UNKNOWN_FIELD',
  'DUPLICATE_MASTER_ITEM', 'DUPLICATE_ITEM', 'QUEUE_APPROVAL_REQUIRED',
]);
const SAFE_WRITE_BACKEND_RE = /STOCK-READONLY|STOCK-SOURCE-LOCKED|6\.6\.5\+?(?:BULK[-_]?STABLE|DEPLOY[-_]?READY)|6\.6\.[5-9]|V?6\.6\.[5-9]|7\.0\.\d+|PERFORMANCE[-_]?CANDIDATE|RECONSTRUCTION|BULK[-_]?STABLE|DEPLOY[-_]?READY/i;

const APPLIED_KEY = 'gudangai_applied';
const QUEUE_KEY = 'gudangai_queue';
const APPLIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NOTIF_KEY = 'gudangai_notif';
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxVpw0_waeCautJTG0R-jZQKBoxjTLXl5PGYCUBULccKhW8IQAoGRQFEqaCy6MkcnZqlQ/exec';
// Keep the proven V6.6.5 write authentication fallback. Existing localStorage secret still takes precedence.
const DEFAULT_API_SECRET = 'adadd47759234a7f94acb230c0cc7ff479c4e4f79a674714';
let _syncLock = false;
const _activeSendIds = new Set();
let _queueRevision = 0;
let _batchSupported = null;
let _dashboardLiveSnapshot = null;
let _dashboardLiveSignature = '';
let _dashboardLivePromise = null;

import { hydrateQueueBackup, persistQueueBackup } from './offlineStore';
import { classifyStockLevel } from './stockStatus';
function emitConn(detail) { try { window.dispatchEvent(new CustomEvent('gudangai-conn', { detail })); } catch (_) {} }
export function getApiUrl() {
  const stored = (localStorage.getItem('gudangai_api_url') || '').trim();
  if (stored) return stored;
  localStorage.setItem('gudangai_api_url', DEFAULT_API_URL);
  return DEFAULT_API_URL;
}
export function setApiUrl(url) {
  const c = (url || '').trim();
  const previous = (localStorage.getItem('gudangai_api_url') || '').trim();
  localStorage.setItem('gudangai_api_url', c || DEFAULT_API_URL);
  if (previous !== c) {
    _dashboardLiveSnapshot = null;
    _dashboardLiveSignature = '';
  }
  _batchSupported = null;
}
export function getApiSecret() { return (localStorage.getItem('gudangai_api_secret') || '').trim() || DEFAULT_API_SECRET; }
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
function normalizeTransactionText(value) {
  return String(value == null ? '' : value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}
function normalizeItemCode(value) {
  return String(value == null ? '' : value).replace(/\s+/g, '').trim();
}
function normalizeTanggal(raw) {
  const now = new Date();
  const wibParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const wib = Object.fromEntries(wibParts.map((part) => [part.type, part.value]));
  const localToday = [wib.year, wib.month, wib.day].join('-');
  if (!raw) return localToday;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return m[3] + '-' + mm + '-' + dd;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return y + '-' + mo + '-' + da;
  }
  return localToday;
}
async function fetchWithRetry(url, options = {}, retries = RETRY_COUNT, timeoutMs = REQUEST_TIMEOUT_MS) {
  let lastError;
  // POST is never retried automatically: a timeout/transport error can happen
  // after Apps Script accepted the write. The caller must reconcile by identity.
  const isPost = String(options?.method || 'GET').toUpperCase() === 'POST';
  const maxAttempts = isPost ? 1 : Math.max(1, Number(retries) || 1);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, cache: 'no-store', signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < maxAttempts) await delay(RETRY_BASE_MS * attempt);
    }
  }
  throw lastError;
}
async function postJson(payload, { retries = RETRY_COUNT, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const url = getApiUrl();
  if (!url) throw new Error('URL API belum diatur');
  const body = JSON.stringify({ schemaVersion: SCHEMA_VERSION, secret: getApiSecret() || undefined, client: { app: 'gudangai-rudy-pwa', deviceId: deviceId() }, ...payload });
  const isBatchWrite = payload?.action === 'bulkTransaction';
  const fetchStartedAt = Date.now();
  let res;
  try {
    res = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, redirect: 'follow' }, retries, timeoutMs);
  } catch (err) {
    if (isBatchWrite) console.info('[GudangAI timing]', JSON.stringify({ event: 'client', phase: 'fetch', ms: Date.now() - fetchStartedAt, outcome: 'ambiguous-error', batchId: payload?.batchId || null }));
    throw err;
  }
  const fetchMs = Date.now() - fetchStartedAt;
  const responseStartedAt = Date.now();
  const text = await res.text();
  let parsed;
  if (!text || text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    throw new Error('Respons bukan JSON (HTML dari Apps Script). Periksa deploy Web App: Execute as Me, Anyone.');
  }
  try { parsed = JSON.parse(text); } catch { throw new Error('Respons bukan JSON: ' + text.slice(0, 120)); }
  if (isBatchWrite) {
    console.info('[GudangAI timing]', JSON.stringify({ event: 'client', phase: 'fetch', ms: fetchMs, batchId: parsed?.batchId || payload?.batchId || null }));
    console.info('[GudangAI timing]', JSON.stringify({ event: 'client', phase: 'respons', ms: Date.now() - responseStartedAt, batchId: parsed?.batchId || payload?.batchId || null }));
  }
  return parsed;
}
function readQueueLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    _queueRevision = Number(localStorage.getItem(QUEUE_KEY + '_rev') || 0) || 0;
    return { revision: _queueRevision, queue: Array.isArray(raw) ? raw : [] };
  } catch (_) { return { revision: 0, queue: [] }; }
}
async function commitQueueLocal(queue) {
  const safeQueue = Array.isArray(queue) ? queue : [];
  const next = Math.max(_queueRevision + 1, Date.now());

  // IndexedDB commit + read-back is the durability gate. If it fails, do not
  // acknowledge this queue mutation or allow the caller to clear its cart.
  await persistQueueBackup(safeQueue, next);

  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(safeQueue));
    localStorage.setItem(QUEUE_KEY + '_rev', String(next));
    const verified = readQueueLocal();
    if (verified.revision !== next || JSON.stringify(verified.queue) !== JSON.stringify(safeQueue)) {
      throw new Error('Verifikasi localStorage antrean gagal.');
    }
  } catch (error) {
    // IndexedDB already contains the committed snapshot. Leave it recoverable;
    // caller must keep the original input visible until a later hydration.
    throw new Error('Cadangan IndexedDB tersimpan, tetapi cache antrean perangkat gagal diverifikasi: ' + (error?.message || 'storage error'));
  }

  _queueRevision = next;
  try {
    window.dispatchEvent(new CustomEvent('gudangai-queue-changed', {
      detail: { count: safeQueue.reduce((sum, entry) => sum + (entry.items || []).length, 0), revision: next }
    }));
  } catch (_) {}
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
  const res = await fetchWithRetry(url + '?' + q.toString(), { method: 'GET', redirect: 'follow', cache: 'no-store' });
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
    return { ok: false, offline: true, code: data?.code || '', status: data?.status || '', error: (data && (data.error || data.message)) || 'Tidak terjangkau', data };
  } catch (err) {
    return { ok: false, offline: true, code: err?.code || '', status: err?.status || '', error: err.message || 'Offline' };
  }
}
export function getConnectionStatus() { return { online: navigator.onLine, apiUrl: getApiUrl() }; }
export function getWriteCircuitState() {
  return { failures: 0, openedAt: 0, lastError: '', open: false, retryAfterMs: 0 };
}
let _safeBackendCache = { ok: false, at: 0, health: null };
function assertRequestedPeriod(health, requestedTanggal) {
  const active = health?.data?.activePeriod || health?.data?.activeMonth || health?.data?.data?.activePeriod || health?.data?.data?.activeMonth;
  if (active && (active.bulan || active.month) && (active.tahun || active.year)) {
    const requested = normalizeTanggal(requestedTanggal);
    const requestedKey = requested.slice(0, 7);
    const activeKey = String(active.tahun || active.year).padStart(4, '0') + '-' + String(active.bulan || active.month).padStart(2, '0');
    if (requestedKey !== activeKey) {
      const mismatch = new Error('WRITE DITAHAN: periode backend ' + activeKey + ' tidak cocok dengan tanggal transaksi ' + requestedKey + '. Perbarui koneksi API sebelum mengirim.');
      mismatch.code = 'BACKEND_PERIOD_MISMATCH';
      mismatch.noQueue = true;
      throw mismatch;
    }
  }
}
async function assertSafeWriteBackend(requestedTanggal) {
  const now = Date.now();
  if (_safeBackendCache.ok && (now - _safeBackendCache.at) < 60000) {
    assertRequestedPeriod(_safeBackendCache.health, requestedTanggal);
    return _safeBackendCache.health;
  }
  const health = await healthCheck();
  const version = String(health?.data?.version ?? health?.data?.data?.version ?? health?.data?.title ?? '').trim();
  if (!health?.ok) {
    const detail = [health?.code, health?.status, health?.error].filter(Boolean).join(' · ');
    throw new Error('WRITE DITAHAN: backend tidak terverifikasi' + (detail ? ' — ' + detail : '') + '. Tidak ada transaksi yang dikirim.');
  }
  if (!SAFE_WRITE_BACKEND_RE.test(version)) throw new Error('WRITE DITAHAN: backend belum LOCK Stock CV/PT. Versi: ' + (version || 'tidak diketahui'));
  assertRequestedPeriod(health, requestedTanggal);
  if (/6\.6\.5|BULK[-_]?STABLE|DEPLOY[-_]?READY/i.test(version)) _batchSupported = true;
  _safeBackendCache = { ok: true, at: now, health };
  return health;
}
/** Parse angka sheet aman — abaikan #ERROR! / #N/A. PWA HANYA BACA stok, tidak menulis ke sheet Stock CV/PT. */
function toNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s || s.charAt(0) === '#' || /error|n\/a|null|undefined/i.test(s)) return 0;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function mapStockItem(it, entity) {
  const stockAkhir = toNum(it.stockAkhir ?? it.stok ?? it.qty ?? it.sisa ?? 0);
  const stockAman = toNum(it.stockAman ?? it.stokAman ?? it.aman ?? it.min ?? 0);
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
    size: it.size || it.ukuran || it.Size || '',
  };
}
export async function fetchStock(entity, options = {}) {
  const url = getApiUrl();
  if (!url) {
    if (options.allowDemo) { const demo = []; demo.demo = true; return demo; }
    throw new Error('URL API belum diatur');
  }
  let data;
  try { data = await getJson('getAllStock', { entitas: entity || 'ALL' }); }
  catch { try { data = await postJson({ action: 'getAllStock', entitas: entity || 'ALL', requestId: newIds().requestId }); } catch { data = null; } }
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
export function getDashboardDataSignature(data) {
  if (!data || typeof data !== 'object') return '';
  const { generatedAt: _generatedAt, dashboardReadAt: _dashboardReadAt, ...spreadsheetData } = data;
  return JSON.stringify(spreadsheetData);
}

export function getCachedDashboardData() {
  return _dashboardLiveSnapshot;
}

export async function getDashboardData() {
  if (_dashboardLivePromise) return _dashboardLivePromise;
  _dashboardLivePromise = (async () => {
    try {
      const data = await getJson('getDashboard');
      if (!data || data.success !== true) return {
        success: false, code: data?.code || 'DASHBOARD_LIVE_UNAVAILABLE',
        error: data?.error || 'Dashboard Live tidak mengembalikan ringkasan valid.',
      };
      const signature = getDashboardDataSignature(data);
      if (signature !== _dashboardLiveSignature) {
        _dashboardLiveSignature = signature;
        _dashboardLiveSnapshot = data;
        try {
          window.dispatchEvent(new CustomEvent('gudangai-dashboard-live-updated', { detail: data }));
        } catch {}
      }
      return data;
    } catch (err) {
      return { success: false, code: 'DASHBOARD_LIVE_READ_FAILED', error: err?.message || 'Gagal membaca ringkasan Dashboard Live.' };
    }
  })();
  try {
    return await _dashboardLivePromise;
  } finally {
    _dashboardLivePromise = null;
  }
}
export async function confirmPOStatus(payload) {
  try {
    return await postJson({
      action: 'recordPOArrival',
      ...(payload || {}),
      requestId: payload?.requestId || newIds().requestId,
    }, { retries: 1, timeoutMs: 90000 });
  } catch (err) {
    return { success: false, error: err?.message || 'Gagal konfirmasi kedatangan PO' };
  }
}
function getAppliedMap() {
  try {
    const map = JSON.parse(localStorage.getItem(APPLIED_KEY) || '{}');
    const now = Date.now();
    let pruned = false;
    for (const [k, v] of Object.entries(map)) {
      if (typeof v === 'number' && now - v > APPLIED_TTL_MS) { delete map[k]; pruned = true; }
    }
    if (pruned) { try { localStorage.setItem(APPLIED_KEY, JSON.stringify(map)); } catch (_) {} }
    return map;
  } catch { return {}; }
}
function isApplied(clientItemId) { return !!(clientItemId && getAppliedMap()[clientItemId]); }
function markAppliedMany(clientItemIds) {
  const ids = Array.from(new Set((clientItemIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length) return;
  const map = getAppliedMap();
  const now = Date.now();
  ids.forEach((id) => { map[id] = now; });
  try { localStorage.setItem(APPLIED_KEY, JSON.stringify(map)); } catch (_) {}
}
function markApplied(clientItemId) { markAppliedMany([clientItemId]); }
export function markItemApplied(clientItemId) { markApplied(clientItemId); }
function ensureClientItemId(it) {
  if (it.clientItemId) return it;
  return { ...it, clientItemId: 'CI-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2, 9)) };
}
async function enqueue(type, entity, items, meta = {}) {
  if (!items?.length) return [];
  const queue = getPendingQueue();
  const normalized = items.map((item) => ({
    ...ensureClientItemId(item),
    kode: normalizeItemCode(item.kode || item.kodeBarang),
    nama: normalizeTransactionText(item.nama),
    keterangan: normalizeTransactionText(item.keterangan),
  }));
  const existingIds = new Set(queue.flatMap((entry) => (entry.items || []).map((item) => String(item.clientItemId || ''))));
  const freshItems = normalized.filter((item) => !existingIds.has(String(item.clientItemId)));
  if (!freshItems.length) return normalized.map((item) => String(item.clientItemId));
  const transactionId = String(meta.transactionId || '').trim() || 'TX-RUDY-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now());
  queue.push({
    id: 'Q-' + transactionId,
    transactionId,
    status: meta.status || 'PENDING_VERIFY',
    type, entity,
    items: freshItems,
    tanggal: normalizeTanggal(meta.tanggal),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await commitQueueLocal(queue);
  const stored = getPendingQueue();
  const storedIds = new Set(stored.flatMap((entry) => (entry.items || []).map((item) => String(item.clientItemId || ''))));
  return normalized.map((item) => String(item.clientItemId)).filter((id) => storedIds.has(id));
}
async function submitOneItem(sheetOrAction, entity, it, tanggal) {
  const cid = it.clientItemId || ensureClientItemId(it).clientItemId;
  if (isApplied(cid)) return { success: true, skipped: true, clientItemId: cid };
  const SHEET_MAP = { barangMasuk: 'Barang masuk', barangKeluar: 'Barang keluar', barangRusak: 'Barang Rusak' };
  const sheetName = SHEET_MAP[sheetOrAction] || sheetOrAction;
  const payload = { action: 'addTransaction', sheet: sheetName, entitas: String(entity || '').toUpperCase(), tanggal: normalizeTanggal(tanggal), kodeBarang: normalizeItemCode(it.kode || it.kodeBarang), qty: Number(it.qty) || 0, keterangan: normalizeTransactionText(it.keterangan).slice(0, 200), requestId: cid, transactionId: 'TX-' + cid, nonce: 'NC-' + cid, queueApproved: true };
  const data = await postJson(payload, { retries: 1, timeoutMs: SINGLE_TIMEOUT_MS });
  if (data && data.code === 'UNAUTHORIZED') return { success: false, unauthorized: true, clientItemId: cid, error: 'Unauthorized' };
  if (data && (data.status === 'DUPLICATE' || data.idempotent === true || data.success === true || data.status === 'APPLIED' || data.status === 'OK')) {
    markApplied(cid);
    return { success: true, clientItemId: cid, stockAkhir: data.stockAkhir };
  }
  return { success: false, error: (data && (data.error || data.message)) || 'Gagal tulis', clientItemId: cid };
}
async function submitBatchChunk(action, entity, chunkItems, tanggal) {
  const SHEET_MAP = { barangMasuk: 'Barang masuk', barangKeluar: 'Barang keluar', barangRusak: 'Barang Rusak' };
  const sheetName = SHEET_MAP[action] || action;
  const normalized = (chunkItems || []).map((it) => ({
    kode: normalizeItemCode(it.kode || it.kodeBarang),
    nama: normalizeTransactionText(it.nama),
    qty: Number(it.qty) || 0,
    satuan: normalizeTransactionText(it.satuan),
    keterangan: normalizeTransactionText(it.keterangan),
    clientItemId: it.clientItemId || ensureClientItemId(it).clientItemId,
  })).filter((it) => it.kode && Number(it.qty) > 0);
  if (!normalized.length) return { success: false, successCount: 0, failCount: 0, results: [] };

  const ent = String(entity || '').toUpperCase();
  const wire = normalized.map((it) => ({
    kodeBarang: normalizeItemCode(it.kode),
    qty: Number(it.qty) || 0,
    keterangan: normalizeTransactionText(it.keterangan).slice(0, 200),
    tanggal: normalizeTanggal(tanggal),
    requestId: String(it.clientItemId),
    transactionId: 'TX-' + String(it.clientItemId),
    nonce: 'NC-' + String(it.clientItemId),
  }));
  const batchId = newIds().requestId;
  const payload = {
    action: 'bulkTransaction',
    sheet: sheetName,
    entitas: ent,
    entity: ent,
    tanggal: normalizeTanggal(tanggal),
    transactions: wire,
    items: wire,
    queueApproved: true,
    batchId,
    requestId: batchId,
  };

  // Satu request per batch: timeout bersifat ambigu. Jangan kirim ulang saat Apps Script
  // mungkin masih memproses batch pertama; antrikan identity yang sama untuk rekonsiliasi.
  const data = await postJson(payload, { retries: 1, timeoutMs: BATCH_TIMEOUT_MS });
  const rawResults = data?.results || data?.data?.results || [];
  const backendCode = String(data?.code || data?.data?.code || '').trim().toUpperCase();
  // Map identity → clientItemId from normalized (wire intentionally omits clientItemId).
  // Keys: transactionId (TX-CI-...), requestId (CI-...), and bare clientItemId.
  const cidByIdentity = new Map();
  for (const it of normalized) {
    const cid = String(it.clientItemId);
    cidByIdentity.set(cid, cid);
    cidByIdentity.set('TX-' + cid, cid);
    cidByIdentity.set('NC-' + cid, cid);
  }
  const results = Array.isArray(rawResults) ? rawResults.map((r) => {
    const resultIndex = Number(r?.batchIndex) - 1;
    const indexedItem = Number.isInteger(resultIndex) && resultIndex >= 0 && resultIndex < normalized.length
      ? normalized[resultIndex] : null;
    const clientItemId = r?.clientItemId
      || cidByIdentity.get(String(r?.transactionId || ''))
      || cidByIdentity.get(String(r?.requestId || ''))
      || cidByIdentity.get(String(r?.nonce || ''))
      || indexedItem?.clientItemId;
    const ok = r?.success === true || r?.skipped === true || r?.idempotent === true ||
      r?.status === 'APPLIED' || r?.status === 'OK' || r?.status === 'SUCCESS' || r?.status === 'DUPLICATE';
    return { ...r, clientItemId, success: ok };
  }) : [];

  // Validation/rejection is final for this payload. Do not turn it into an
  // uncertain write and do not place it in the outbox.
  if (!data?.success && DETERMINISTIC_BATCH_REJECTS.has(backendCode)) {
    const validationByIndex = new Map((data?.validationErrors || data?.data?.validationErrors || [])
      .map((item) => [Number(item?.index) - 1, item?.error || data?.error || backendCode]));
    return {
      success: false,
      backendRejected: true,
      deterministic: true,
      code: backendCode,
      successCount: 0,
      failCount: normalized.length,
      results: normalized.map((item, index) => ({
        success: false,
        clientItemId: item.clientItemId,
        error: validationByIndex.get(index) || data?.error || backendCode,
        code: backendCode,
        queued: false,
        queueStored: false,
      })),
    };
  }

  // Backend dapat mengembalikan hanya counter tanpa array results. Bentuk ulang
  // hasil parsial agar item yang sudah benar-benar ditulis tidak masuk antrean.
  if (!results.length) {
    const reportedSuccess = Math.max(0, Math.min(normalized.length, Number(
      data?.successCount ?? data?.writtenCount ?? data?.data?.successCount ?? data?.data?.writtenCount ??
      ((data?.success === true || data?.written === true) ? normalized.length : 0)
    ) || 0));
    if (reportedSuccess > 0) {
      for (let index = 0; index < normalized.length; index += 1) {
        results.push({ clientItemId: normalized[index].clientItemId, success: index < reportedSuccess });
      }
    }
  }
  if (!results.length) {
    const detail = [data?.code, data?.status, data?.error, data?.message].filter(Boolean).join(' · ');
    throw new Error(detail || 'Backend tidak mengonfirmasi seluruh batch');
  }

  // Persist all successful item IDs in one localStorage write, not one write per item.
  markAppliedMany(results.filter((r) => r.success && r.clientItemId).map((r) => r.clientItemId));
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;
  return { success: successCount === normalized.length, successCount, failCount, results, serverExecMs: Number(data?.execMs) || null };
}
function emitProgress(sent, total, chunkResult) {
  try { window.dispatchEvent(new CustomEvent('gudangai-submit-progress', { detail: { sent, total, success: chunkResult?.successCount || 0, queued: chunkResult?.queuedCount || 0, failed: chunkResult?.failCount || 0 } })); } catch (_) {}
}
async function submitItems(action, entity, items, tanggal, options = {}) {
  const clientStartedAt = Date.now();
  const originalList = (items || []).map(ensureClientItemId);
  if (!originalList.length) return { success: false, error: 'Tidak ada item' };

  // Read the local APPLIED map once; avoid parsing the full localStorage value per item.
  const appliedAtStart = getAppliedMap();
  const alreadyApplied = originalList.filter((it) => !!appliedAtStart[it.clientItemId]);
  const list = originalList.filter((it) => !appliedAtStart[it.clientItemId]);
  const confirmedResults = alreadyApplied.map((it) => ({
    success: true, skipped: true, status: 'APPLIED', clientItemId: it.clientItemId,
  }));
  if (!list.length) {
    return {
      success: true, count: originalList.length, failed: 0, queuedCount: 0, total: originalList.length,
      results: confirmedResults, clientElapsedMs: Date.now() - clientStartedAt,
    };
  }

  if (!navigator.onLine || !getApiUrl()) {
    const queuedIds = options.fromQueue ? [] : await enqueue(action, entity, list, { tanggal });
    const queuedSet = new Set(queuedIds);
    return {
      success: false, queued: queuedIds.length > 0, count: alreadyApplied.length, queuedCount: queuedIds.length,
      failed: list.length - queuedIds.length, total: originalList.length, clientElapsedMs: Date.now() - clientStartedAt,
      results: [...confirmedResults, ...list.map(it => ({ success: false, queued: queuedSet.has(it.clientItemId), queueStored: queuedSet.has(it.clientItemId), clientItemId: it.clientItemId }))],
    };
  }

  // Backend health is cached for 60 seconds; do not pay this round-trip for local APPLIED items.
  try {
    await assertSafeWriteBackend(tanggal);
  } catch (err) {
    if (err?.noQueue) {
      const msg = err.message || 'Write ditahan karena konfigurasi backend tidak cocok.';
      return {
        success: false, count: alreadyApplied.length, failed: list.length, queuedCount: 0,
        total: originalList.length, clientElapsedMs: Date.now() - clientStartedAt,
        results: [...confirmedResults, ...list.map((it) => ({ success: false, queued: false, queueStored: false, clientItemId: it.clientItemId, code: err.code, error: msg }))],
      };
    }
    const queuedIds = options.fromQueue ? [] : await enqueue(action, entity, list, { tanggal });
    const queuedSet = new Set(queuedIds);
    const msg = err?.message || 'Backend write belum terverifikasi';
    return {
      success: false, count: alreadyApplied.length, failed: list.length - queuedIds.length, queuedCount: queuedIds.length,
      total: originalList.length, clientElapsedMs: Date.now() - clientStartedAt,
      results: [...confirmedResults, ...list.map(it => ({ success: false, queued: queuedSet.has(it.clientItemId), queueStored: queuedSet.has(it.clientItemId), clientItemId: it.clientItemId, error: msg }))],
    };
  }

  const allResults = [...confirmedResults];
  let totalSuccess = alreadyApplied.length, totalFail = 0, totalQueued = 0;
  let totalServerExecMs = 0, measuredServerChunks = 0;
  for (let i = 0; i < list.length; i += BATCH_CHUNK_SIZE) {
    const chunk = list.slice(i, i + BATCH_CHUNK_SIZE);
    try {
      const batchRes = await submitBatchChunk(action, entity, chunk, tanggal);
      if (Number.isFinite(Number(batchRes.serverExecMs)) && Number(batchRes.serverExecMs) > 0) {
        totalServerExecMs += Number(batchRes.serverExecMs);
        measuredServerChunks++;
      }
      const sc = batchRes.successCount || 0;
      const fc = batchRes.failCount || 0;
      totalSuccess += sc; totalFail += fc;
      if (batchRes.results) allResults.push(...batchRes.results);
      emitProgress(Math.min(i + chunk.length, originalList.length), originalList.length, { successCount: totalSuccess, failCount: totalFail, queuedCount: totalQueued });
      const failedIds = new Set((batchRes.results || []).filter(r => !r.success && !r.skipped && r.clientItemId).map(r => r.clientItemId));
      const knownIds = new Set((batchRes.results || []).map(r => r.clientItemId).filter(Boolean));
      if (batchRes.backendRejected) {
        emitProgress(Math.min(i + chunk.length, originalList.length), originalList.length, { successCount: totalSuccess, failCount: totalFail, queuedCount: totalQueued });
        continue;
      }
      const queueItems = chunk.filter(it => failedIds.has(it.clientItemId) || !knownIds.has(it.clientItemId));
      if (queueItems.length) {
        const queuedIds = options.fromQueue ? [] : await enqueue(action, entity, queueItems, { tanggal });
        const queuedSet = new Set(queuedIds);
        for (const id of queuedIds) {
          const result = allResults.find((r) => r.clientItemId === id);
          if (result) { result.queued = true; result.queueStored = true; }
          else allResults.push({ success: false, queued: true, queueStored: true, clientItemId: id });
        }
        totalQueued += queuedIds.length;
      }
      continue;
    } catch (err) {
      const msg = String(err?.message || 'Gagal menulis batch');
      const remainingItems = list.slice(i);
      // A timeout is ambiguous: never issue a second write automatically.
      // Keep the same item IDs in the outbox for explicit backend/read-back reconciliation.
      // Timeout/transport failure is ambiguous: reconcile each original identity
      // against the ledger + exact spreadsheet row before creating an outbox entry.
      const confirmed = [];
      const unresolved = [];
      for (const it of remainingItems) {
        const itemType = action === 'barangKeluar' ? 'keluar' : action === 'barangRusak' ? 'rusak' : 'masuk';
        const check = await verifyPendingItem({ clientItemId: it.clientItemId, type: itemType });
        if (check?.success === true && check?.readBack?.matched === true) confirmed.push({ item: it, check });
        else unresolved.push(it);
      }
      markAppliedMany(confirmed.map(({ item }) => item.clientItemId));
      totalSuccess += confirmed.length;
      totalFail += unresolved.length;
      allResults.push(...confirmed.map(({ item, check }) => ({
        success: true, status: 'APPLIED', readBackConfirmed: true,
        clientItemId: item.clientItemId, transactionId: check.transactionId || 'TX-' + item.clientItemId,
        readBack: check.readBack,
      })));
      const queuedIds = options.fromQueue ? [] : await enqueue(action, entity, unresolved, { tanggal });
      totalQueued += queuedIds.length;
      allResults.push(...unresolved.map(it => ({
        success: false, queued: queuedIds.includes(it.clientItemId), queueStored: queuedIds.includes(it.clientItemId),
        uncertain: true, clientItemId: it.clientItemId, error: msg,
      })));
      emitProgress(originalList.length, originalList.length, { successCount: totalSuccess, failCount: totalFail, queuedCount: totalQueued });
      break;
    }
  }
  // Trigger the realtime delta sync once; InputPage owns the single stock-refresh event
  // and the single user-facing result notification.
  if (totalSuccess > 0) {
    try {
      if (typeof window !== 'undefined' && typeof window.__gudangai_syncNow === 'function') {
        window.__gudangai_syncNow();
      }
    } catch (_) { /* non-critical */ }
  }
  return {
    success: totalSuccess === originalList.length,
    partial: totalSuccess > 0 && totalSuccess < originalList.length,
    count: totalSuccess, failed: totalFail, queuedCount: totalQueued, total: originalList.length,
    results: allResults,
    serverExecMs: measuredServerChunks ? totalServerExecMs : null,
    clientElapsedMs: Date.now() - clientStartedAt,
  };
}
export async function submitBarangMasuk({ entity, tanggal, items }) { return submitItems('barangMasuk', entity, items, tanggal); }
export async function submitBarangKeluar({ entity, tanggal, items }) { return submitItems('barangKeluar', entity, items, tanggal); }
export async function submitBarangRusak({ entity, tanggal, items }) { return submitItems('barangRusak', entity, items, tanggal); }
export function getPendingQueue() { return readQueueLocal().queue; }

/** Persist a complete send intent before the first backend request. */
export async function stagePendingTransaction({ type, entity, tanggal, items, status = 'PENDING_REVIEW', autoSend = false }) {
  const validItems = (items || []).map((item) => ({
    ...ensureClientItemId(item), kode: normalizeItemCode(item.kode || item.kodeBarang),
    nama: normalizeTransactionText(item.nama), keterangan: normalizeTransactionText(item.keterangan),
  }));
  if (!validItems.length || validItems.some((item) => !item.clientItemId || !item.kode || !(Number(item.qty) > 0))) throw new Error('Transaksi tidak valid; antrean tidak dibuat.');
  const queue = getPendingQueue();
  const existing = new Set(queue.flatMap((entry) => (entry.items || []).map((item) => String(item.clientItemId || ''))));
  if (validItems.some((item) => existing.has(String(item.clientItemId)))) throw new Error('Ada ID item yang sudah berada di antrean. Periksa Sinkronisasi sebelum mengirim ulang.');
  const now = new Date().toISOString();
  const queueStatus = status === 'PROCESSING' ? 'PROCESSING' : 'PENDING_REVIEW';
  const entry = {
    id: 'Q-SEND-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now()),
    transactionId: 'TX-BATCH-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now()),
    status: queueStatus, type, entity: String(entity || '').toUpperCase(), items: validItems, ...(autoSend ? { autoSendRequested: true } : {}),
    tanggal: normalizeTanggal(tanggal), createdAt: now, updatedAt: now,
    ...(queueStatus === 'PROCESSING' ? { processingStartedAt: now } : {}),
  };
  queue.push(entry);
  await commitQueueLocal(queue);
  if (queueStatus === 'PROCESSING') validItems.forEach((item) => _activeSendIds.add(String(item.clientItemId)));
  const stagedIds = new Set(getPendingQueue().flatMap((entry) => (entry.items || []).map((item) => String(item.clientItemId || ''))));
  if (validItems.some((item) => !stagedIds.has(String(item.clientItemId)))) throw new Error('Verifikasi antrean gagal. Permintaan ke server dibatalkan.');
  return validItems.map((item) => item.clientItemId);
}

/** Atomically consumes the one-shot auto-send request before processing it. */
export async function claimPendingAutoSend(clientItemIds = []) {
  const wanted = new Set((clientItemIds || []).map(String).filter(Boolean));
  const queue = getPendingQueue();
  const claimed = [];
  const next = queue.map((entry) => {
    const ids = (entry.items || []).map((item) => String(item.clientItemId || '')).filter((id) => wanted.has(id));
    if (!entry.autoSendRequested || !ids.length) return entry;
    claimed.push(...ids);
    return { ...entry, autoSendRequested: false, autoSendClaimedAt: new Date().toISOString(), status: 'PENDING_REVIEW' };
  });
  if (claimed.length) await commitQueueLocal(next);
  return claimed;
}

export function getPendingHomeSuccessReceipt() {
  try {
    const receipt = JSON.parse(localStorage.getItem(HOME_SUCCESS_RECEIPT_KEY) || 'null');
    if (!receipt || receipt.expiresAt < Date.now()) {
      localStorage.removeItem(HOME_SUCCESS_RECEIPT_KEY);
      return null;
    }
    return receipt;
  } catch (_) { return null; }
}
export function acknowledgeHomeSuccessReceipt(receiptId) {
  const current = getPendingHomeSuccessReceipt();
  if (!current || (receiptId && current.id !== receiptId)) return false;
  try { localStorage.removeItem(HOME_SUCCESS_RECEIPT_KEY); return true; } catch (_) { return false; }
}
function publishHomeSuccessReceipt(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  const receipt = {
    id: 'HOME-SUCCESS-' + Date.now(),
    confirmedAt: new Date().toISOString(),
    count: rows.length,
    items: rows.slice(0, 100).map((row) => ({ kode: row.kode, nama: row.nama, qty: Number(row.qty) || 0, entity: row.entity, type: row.type })),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
  try {
    localStorage.setItem(HOME_SUCCESS_RECEIPT_KEY, JSON.stringify(receipt));
    window.dispatchEvent(new CustomEvent('gudangai-home-success', { detail: receipt }));
  } catch (_) {}
}

export function finishPendingTransaction(ids) {
  (ids || []).forEach((id) => _activeSendIds.delete(String(id)));
}

export async function updatePendingItemStates(ids, status, details = {}) {
  const wanted = new Set((ids || []).map(String));
  if (!wanted.size) return { success: true, updated: 0 };
  const now = new Date().toISOString();
  const queue = getPendingQueue().map((entry) => {
    const hasTarget = (entry.items || []).some((item) => wanted.has(String(item.clientItemId)));
    return {
      ...entry,
      ...(hasTarget ? { status, updatedAt: now } : {}),
      items: (entry.items || []).map((item) => wanted.has(String(item.clientItemId))
        ? { ...item, queueStatus: status, queueUpdatedAt: now, ...details }
        : item),
    };
  });
  await commitQueueLocal(queue);
  return { success: true, updated: wanted.size };
}
function queueItemIdentity(item) {
  const clientItemId = String(item?.clientItemId || '').trim();
  if (!clientItemId) return { transactionId: '', nonce: '' };
  return { transactionId: 'TX-' + clientItemId, nonce: 'NC-' + clientItemId };
}
function queueItemSheet(item) {
  return ({
    masuk: 'Barang masuk', barangMasuk: 'Barang masuk',
    keluar: 'Barang keluar', barangKeluar: 'Barang keluar',
    rusak: 'Barang Rusak', barangRusak: 'Barang Rusak',
  })[item?.type] || '';
}
/** Read-only reconciliation; local removal is allowed only after APPLIED/read-back confirmation. */
export async function verifyPendingItem(item) {
  const identity = queueItemIdentity(item);
  const sheet = queueItemSheet(item);
  if (!identity.transactionId || !sheet) {
    return { success: false, status: 'REJECTED', code: 'QUEUE_IDENTITY_REQUIRED', error: 'Identitas antrean atau sheet tidak valid.' };
  }
  if (!navigator.onLine || !getApiUrl()) {
    return { success: false, status: 'OFFLINE', code: 'READBACK_OFFLINE', error: 'Perangkat sedang offline; item tetap di antrean.' };
  }
  try {
    const params = {
      transactionId: identity.transactionId,
      nonce: identity.nonce,
      sheet,
    };
    let data;
    try {
      data = await getJson('getTransactionStatus', params);
      if (data?.code === 'UNKNOWN_ACTION' || data?.code === 'GET_ACTION_UNAVAILABLE') throw new Error('GET read-back action tidak tersedia');
    } catch (_) {
      // POST is read-only for this allowlisted status action.
      data = await postJson({ action: 'getTransactionStatus', ...params, requestId: 'VERIFY-' + item.clientItemId }, { retries: 1, timeoutMs: SINGLE_TIMEOUT_MS });
    }
    const readBackMatched = data?.readBack?.matched === true;
    const applied = data?.success === true && data?.status === 'APPLIED' && readBackMatched;
    return applied
      ? { ...data, success: true, status: 'APPLIED', clientItemId: item.clientItemId, sheet }
      : {
          ...data, success: false, clientItemId: item.clientItemId, sheet,
          error: data?.error || (data?.status === 'APPLIED' && !readBackMatched
            ? 'Ledger menyatakan APPLIED, tetapi baris spreadsheet belum cocok saat read-back. Item tidak dihapus.'
            : 'Server belum mengonfirmasi transaksi melalui read-back. Item tetap di antrean.'),
        };
  } catch (err) {
    return { success: false, status: 'UNKNOWN', code: 'READBACK_FAILED', clientItemId: item.clientItemId, sheet, error: err?.message || 'Gagal membaca status transaksi.' };
  }
}
export async function resolvePendingItem(item) {
  const verification = await verifyPendingItem(item);
  if (!verification.success) return verification;

  const clientItemId = String(item?.clientItemId || '');
  let historySaved = false;
  try {
    saveToHistory({
      type: item.type, entity: item.entity, kode: item.kode, nama: item.nama,
      qty: item.qty, keterangan: item.keterangan || '', tanggal: item.tanggal,
      source: 'queue-readback-confirmed', clientItemId,
      status: 'success', transactionId: verification.transactionId || `TX-${clientItemId}`,
      readBack: verification.readBack || null,
      items: [{ kode: item.kode, nama: item.nama, qty: item.qty, satuan: item.satuan || '' }],
    });
    historySaved = true;
    await removePendingByClientIds([clientItemId]);
  } catch (error) {
    return {
      ...verification, success: false, historySaved, code: 'QUEUE_FINALIZE_FAILED',
      error: error?.message || (historySaved
        ? 'Riwayat tersimpan, tetapi antrean belum dapat diperbarui. Jangan kirim ulang.'
        : 'Riwayat belum tersimpan; item tetap dipertahankan di antrean.'),
    };
  }

  pushNotification({
    type: 'ok', title: 'Read-back terverifikasi',
    body: `${item.nama || item.kode} dikonfirmasi oleh server dan dicatat di Riwayat.`,
  });
  return { ...verification, removed: true };
}

export async function removePendingByClientIds(ids) {
  const set = new Set((ids || []).map(String));
  const q = getPendingQueue().map((e) => ({ ...e, items: (e.items || []).filter((it) => !set.has(String(it.clientItemId))) })).filter((e) => e.items.length);
  await commitQueueLocal(q);
  return { success: true, remaining: q.reduce((n, entry) => n + entry.items.length, 0) };
}
export async function clearPendingQueue() { await commitQueueLocal([]); return { success: true }; }
export async function clearSyncedQueue() { await commitQueueLocal([]); return { success: true }; }
export async function syncPendingQueue({ clientItemIds = null } = {}) {
  const url = getApiUrl();
  if (!url || !navigator.onLine) return { synced: 0, failed: 0, skipped: true };
  if (_syncLock) return { synced: 0, failed: 0, skipped: true, reason: 'sync-in-progress' };
  _syncLock = true;
  try {
    const rawQueue = getPendingQueue();
    const nowMs = Date.now();
    const queue = rawQueue.map((entry) => {
      if ((entry.items || []).some((item) => _activeSendIds.has(String(item.clientItemId)))) return entry;
      if (entry.status !== 'PROCESSING') return entry;
      const started = Date.parse(entry.processingStartedAt || entry.updatedAt || entry.createdAt || '');
      return Number.isFinite(started) && nowMs - started < 120000
        ? entry
        : { ...entry, status: 'PENDING_VERIFY', recoveredAt: new Date(nowMs).toISOString() };
    });
    if (queue.some((entry, index) => entry !== rawQueue[index])) await commitQueueLocal(queue);
    const processQueue = queue.filter((entry) => entry.status !== 'PROCESSING');
    const targetIds = clientItemIds ? new Set(clientItemIds.map(String)) : null;
    const groups = new Map();
    const conflictingIds = new Set();
    const identitySignatures = new Map();

    // Combine outbox entries that target the same transaction sheet/entity/date.
    // A clientItemId reused with a different operation, entity, date, or payload is held.
    for (const entry of processQueue) {
      const type = entry.type || 'masuk';
      const entity = String(entry.entity || '').toUpperCase();
      const tanggal = normalizeTanggal(entry.tanggal);
      const key = [type, entity, tanggal].join('|');
      if (!groups.has(key)) groups.set(key, { type, entity, tanggal, itemsById: new Map() });
      const group = groups.get(key);
      for (const item of entry.items) {
        const id = String(item.clientItemId || '');
        if (!id || (targetIds && !targetIds.has(id))) continue;
        const signature = JSON.stringify([type, entity, tanggal, item.kode, item.qty, item.keterangan]);
        const globalPrior = identitySignatures.get(id);
        if (globalPrior && globalPrior !== signature) conflictingIds.add(id);
        else identitySignatures.set(id, signature);
        const prior = group.itemsById.get(id);
        if (!prior) group.itemsById.set(id, item);
        else if (JSON.stringify([prior.kode, prior.qty, prior.keterangan]) !== JSON.stringify([item.kode, item.qty, item.keterangan])) {
          conflictingIds.add(id);
        }
      }
    }

    const confirmedIds = new Set();
    const confirmedHistory = new Map();
    const failureDetails = new Map();
    let requests = 0;
    for (const group of groups.values()) {
      const items = Array.from(group.itemsById.values()).filter((item) => !conflictingIds.has(String(item.clientItemId)));
      if (!items.length) continue;
      const appliedBeforeGroup = getAppliedMap();
      const needsWrite = items.filter((item) => !appliedBeforeGroup[item.clientItemId]);
      const res = await submitItems(group.type, group.entity, items, group.tanggal, { fromQueue: true });
      requests += Math.ceil(needsWrite.length / BATCH_CHUNK_SIZE);
      for (const result of res.results || []) {
        if (result.clientItemId && (result.success === true || result.skipped === true)) {
          confirmedIds.add(result.clientItemId);
          const item = items.find((candidate) => String(candidate.clientItemId) === String(result.clientItemId));
          if (item) confirmedHistory.set(String(result.clientItemId), { item, type: group.type, entity: group.entity, tanggal: group.tanggal, readBack: result.readBack || null });
        } else if (result.clientItemId) {
          failureDetails.set(String(result.clientItemId), result.error || result.code || 'Belum terkonfirmasi oleh server.');
        }
      }
    }
    for (const id of conflictingIds) failureDetails.set(String(id), 'ID transaksi digunakan untuk payload yang berbeda. Perlu pemeriksaan manual.');

    const remaining = [];
    let synced = 0, failed = 0;
    const appliedAfterSync = getAppliedMap();
    // History must be durably written before any confirmed outbox item is removed.
    for (const entry of queue) {
      for (const item of entry.items || []) {
        const id = String(item.clientItemId || '');
        if (!id || (targetIds && !targetIds.has(id)) || (!confirmedIds.has(id) && !appliedAfterSync[id])) continue;
        const metadata = confirmedHistory.get(id) || { item, type: entry.type, entity: entry.entity, tanggal: entry.tanggal };
        saveToHistory({
          type: metadata.type, entity: metadata.entity, tanggal: metadata.tanggal,
          kode: metadata.item.kode, nama: metadata.item.nama, qty: metadata.item.qty,
          keterangan: metadata.item.keterangan || '', source: 'queue-sync-confirmed',
          clientItemId: id, transactionId: 'TX-' + id, status: 'success',
          readBack: metadata.readBack || null,
          items: [{ kode: metadata.item.kode, nama: metadata.item.nama, qty: metadata.item.qty, satuan: metadata.item.satuan || '' }],
        });
      }
    }
    for (const entry of queue) {
      const remainingItems = entry.items
        .filter((item) => (targetIds && !targetIds.has(String(item.clientItemId))) || (!confirmedIds.has(item.clientItemId) && !appliedAfterSync[item.clientItemId]))
        .map((item) => {
          const error = failureDetails.get(String(item.clientItemId));
          return error
            ? { ...item, queueStatus: 'PENDING_VERIFY', lastError: String(error) }
            : item;
        });
      synced += entry.items.length - remainingItems.length;
      if (remainingItems.length) {
        const isProcessing = entry.status === 'PROCESSING';
        const hasEntryFailure = remainingItems.some((item) => failureDetails.has(String(item.clientItemId)));
        if (!isProcessing) failed += remainingItems.length;
        remaining.push({
          ...entry,
          status: isProcessing ? 'PROCESSING' : (hasEntryFailure ? 'PENDING_VERIFY' : entry.status),
          updatedAt: isProcessing ? entry.updatedAt : new Date().toISOString(),
          items: remainingItems,
        });
      }
    }
    await commitQueueLocal(remaining);
    const confirmedHomeRows = queue.flatMap((entry) => (entry.items || [])
      .filter((item) => (!targetIds || targetIds.has(String(item.clientItemId))) && (confirmedIds.has(String(item.clientItemId)) || !!appliedAfterSync[String(item.clientItemId)]))
      .map((item) => ({ ...item, entity: entry.entity, type: entry.type })));
    publishHomeSuccessReceipt(confirmedHomeRows);
    if (synced > 0 || failed > 0) {
      pushNotification({
        type: failed > 0 ? 'warning' : 'success',
        title: 'Hasil sinkronisasi',
        body: `${synced} item terkonfirmasi dan dicatat di Riwayat · ${failed} item masih perlu verifikasi.`,
      });
    }
    return { synced, failed, groups: groups.size, requests, conflicts: conflictingIds.size };
  } finally {
    _syncLock = false;
  }
}
const HISTORY_KEY = 'gudangai_history';
const HOME_SUCCESS_RECEIPT_KEY = 'gudangai_home_success_receipt_v1';
export function getTransactionHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } }
export function getLocalHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (_) { return []; }
}
export function saveToHistory(entry) {
  const list = getTransactionHistory();
  const source = entry || {};
  const clientItemId = String(source.clientItemId || '').trim();
  const transactionId = String(source.transactionId || (clientItemId ? 'TX-' + clientItemId : '')).trim();
  const savedAt = source.savedAt || source.at || new Date().toISOString();
  const rawItems = Array.isArray(source.items) && source.items.length
    ? source.items
    : (source.kode || source.kodeBarang || source.nama
      ? [{ kode: source.kode || source.kodeBarang || '', nama: source.nama || '', qty: Number(source.qty) || 0, satuan: source.satuan || '' }]
      : []);
  const normalizedItems = rawItems.map((item) => ({
    ...item,
    kode: String(item?.kode || item?.kodeBarang || '').trim(),
    nama: String(item?.nama || item?.name || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(),
    qty: Number(item?.qty ?? item?.quantity) || 0,
    satuan: String(item?.satuan || item?.unit || '').trim(),
  }));
  const historyEntry = {
    ...source,
    id: clientItemId || transactionId ? 'H-' + (clientItemId || transactionId) : 'H-' + Date.now(),
    transactionId,
    clientItemId,
    savedAt,
    at: savedAt,
    timestamp: savedAt,
    items: normalizedItems,
    status: /^(sukses|success|applied|terkirim|ok)$/i.test(String(source.status || 'success')) ? 'success' : (source.status || 'success'),
    syncStatus: 'success',
  };
  const dedupeKey = clientItemId || transactionId;
  const next = dedupeKey
    ? [historyEntry, ...list.filter((item) => String(item.clientItemId || item.transactionId || '') !== dedupeKey)]
    : [historyEntry, ...list];
  try {
    const serialized = JSON.stringify(next.slice(0, 200));
    localStorage.setItem(HISTORY_KEY, serialized);
    const verified = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const persisted = verified.find((item) => String(item.id || '') === String(historyEntry.id));
    if (!persisted || JSON.stringify(persisted) !== JSON.stringify(historyEntry)) throw new Error('Verifikasi penyimpanan Riwayat gagal.');
  } catch (error) {
    throw new Error('Riwayat belum tersimpan; item tetap harus dipertahankan di antrean. ' + (error?.message || 'Storage error'));
  }
  try { window.dispatchEvent(new CustomEvent('gudangai-history-changed', { detail: { transactionId, clientItemId } })); } catch (_) {}
  return historyEntry;
}
export async function fetchRemoteTransactionHistory(days = 7) {
  const safeDays = Math.max(1, Math.min(31, Number(days) || 7));
  const sheets = ["Barang masuk", "Barang keluar", "Barang Rusak"];
  const histories = await Promise.all(sheets.map(async (sheet) => {
    let data = null;
    const params = { sheet, days: String(safeDays), limit: "1000" };
    try { data = await getJson("getTransactionHistory", params); }
    catch (_) {
      data = await postJson({
        action: "getTransactionHistory",
        ...params,
        days: safeDays,
        limit: 1000,
        requestId: newIds().requestId,
      });
    }
    if (!data || data.success !== true || data.code === "UNAUTHORIZED") {
      throw new Error(data?.error || `Gagal mengambil riwayat sheet ${sheet}`);
    }
    if (data.sheet && data.sheet !== sheet) {
      throw new Error(`Sumber riwayat tidak cocok: diminta ${sheet}, diterima ${data.sheet}`);
    }
    const rows = data.data || data.items || data.history || data.transactions || data.rows || [];
    if (!Array.isArray(rows)) throw new Error(`Format riwayat sheet ${sheet} tidak valid`);
    return normalisasiRiwayatServer(rows, sheet);
  }));
  return histories.flat();
}
export function pushNotification(n) {
  const list = getNotifications();
  const item = { ...n, id: 'N-' + Date.now(), read: false, at: Date.now() };
  list.unshift(item);
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(list.slice(0, 50))); } catch (_) {}
  try { window.dispatchEvent(new CustomEvent('gudangai-notification', { detail: item })); } catch (_) {}
}
export function getNotifications() { try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch { return []; } }
export function markNotificationsRead() {
  const list = getNotifications().map((n) => ({ ...n, read: true }));
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(list)); } catch (_) {}
}
export function unreadNotificationCount() { return getNotifications().filter((n) => !n.read).length; }
export async function submitPO(payload) {
  try { return await postJson({ action: 'submitPO', ...(payload || {}), requestId: newIds().requestId }); }
  catch (err) { return { success: false, error: err.message }; }
}
