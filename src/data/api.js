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
let _queueRevision = 0;
let _batchSupported = null;

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
  localStorage.setItem('gudangai_api_url', c || DEFAULT_API_URL);
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
  for (let attempt = 1; attempt <= retries; attempt++) {
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
  if (!text || text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    throw new Error('Respons bukan JSON (HTML dari Apps Script). Periksa deploy Web App: Execute as Me, Anyone.');
  }
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
export async function getDashboardData() {
  try {
    const data = await getJson('getDashboard');
    if (!data || data.success !== true) return {
      success: false, code: data?.code || 'DASHBOARD_LIVE_UNAVAILABLE',
      error: data?.error || 'Dashboard Live tidak mengembalikan ringkasan valid.',
    };
    return data;
  } catch (err) {
    return { success: false, code: 'DASHBOARD_LIVE_READ_FAILED', error: err?.message || 'Gagal membaca ringkasan Dashboard Live.' };
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
function enqueue(type, entity, items, meta = {}) {
  if (!items?.length) return [];
  const queue = getPendingQueue();
  const normalized = items.map(ensureClientItemId);
  queue.push({ id: 'Q-' + Date.now(), type, entity, items: normalized, tanggal: normalizeTanggal(meta.tanggal), createdAt: new Date().toISOString() });
  commitQueueLocal(queue);
  const stored = getPendingQueue();
  const storedIds = new Set(stored.flatMap((entry) => (entry.items || []).map((item) => item.clientItemId).filter(Boolean)));
  return normalized.map((item) => String(item.clientItemId)).filter((id) => storedIds.has(id));
}
async function submitOneItem(sheetOrAction, entity, it, tanggal) {
  const cid = it.clientItemId || ensureClientItemId(it).clientItemId;
  if (isApplied(cid)) return { success: true, skipped: true, clientItemId: cid };
  const SHEET_MAP = { barangMasuk: 'Barang masuk', barangKeluar: 'Barang keluar', barangRusak: 'Barang Rusak' };
  const sheetName = SHEET_MAP[sheetOrAction] || sheetOrAction;
  const payload = { action: 'addTransaction', sheet: sheetName, entitas: String(entity || '').toUpperCase(), tanggal: normalizeTanggal(tanggal), kodeBarang: String(it.kode || it.kodeBarang || '').trim(), qty: Number(it.qty) || 0, keterangan: String(it.keterangan || '').trim().slice(0, 200), requestId: cid, transactionId: 'TX-' + cid, nonce: 'NC-' + cid, queueApproved: true };
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
    kode: it.kode || it.kodeBarang,
    nama: it.nama,
    qty: Number(it.qty) || 0,
    satuan: it.satuan || '',
    keterangan: it.keterangan || '',
    clientItemId: it.clientItemId || ensureClientItemId(it).clientItemId,
  })).filter((it) => it.kode && Number(it.qty) > 0);
  if (!normalized.length) return { success: false, successCount: 0, failCount: 0, results: [] };

  const ent = String(entity || '').toUpperCase();
  const wire = normalized.map((it) => ({
    kodeBarang: String(it.kode || '').trim(),
    qty: Number(it.qty) || 0,
    keterangan: String(it.keterangan || '').trim().slice(0, 200),
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
    const queuedIds = options.fromQueue ? [] : enqueue(action, entity, list, { tanggal });
    const queuedSet = new Set(queuedIds);
    const msg = list.length + ' item masuk Antrian Sinkronisasi (offline)';
    pushNotification({ type: 'warning', title: 'Koneksi terputus', body: msg + '. Tidak ada item yang dibuang.' });
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
    const queuedIds = options.fromQueue ? [] : enqueue(action, entity, list, { tanggal });
    const queuedSet = new Set(queuedIds);
    const msg = err?.message || 'Backend write belum terverifikasi';
    pushNotification({ type: 'error', title: 'Write ditahan', body: msg });
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
        const queuedIds = options.fromQueue ? [] : enqueue(action, entity, queueItems, { tanggal });
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
      const queuedIds = options.fromQueue ? [] : enqueue(action, entity, remainingItems, { tanggal });
      totalQueued += queuedIds.length;
      totalFail += remainingItems.length;
      allResults.push(...remainingItems.map(it => ({
        success: false, queued: queuedIds.includes(it.clientItemId), queueStored: queuedIds.includes(it.clientItemId), uncertain: true, clientItemId: it.clientItemId, error: msg,
      })));
      emitProgress(originalList.length, originalList.length, { successCount: totalSuccess, failCount: totalFail, queuedCount: totalQueued });
      pushNotification({
        type: 'warning',
        title: 'Write belum terkonfirmasi',
        body: remainingItems.length + ' item diamankan di Antrian Sinkronisasi. Detail backend: ' + msg + '. Jangan kirim ulang manual; verifikasi backend/read-back terlebih dahulu.',
      });
      break;
    }
  }
  if (totalQueued > 0) {
    pushNotification({ type: 'warning', title: 'Sinkronisasi perlu dilanjutkan', body: totalSuccess + ' sukses · ' + totalQueued + ' masuk antrian · ' + totalFail + ' belum terkonfirmasi. Antrian menyimpan ID unik untuk mencegah duplikasi.' });
  } else {
    pushNotification({ type: 'success', title: 'Transaksi selesai', body: totalSuccess + ' item berhasil ditulis tanpa antrian.' });
  }
  // Setelah write sukses, minta realTimeSync menarik delta segera (polling cepat 2 menit).
  if (totalSuccess > 0) {
    try {
      if (typeof window !== 'undefined' && typeof window.__gudangai_syncNow === 'function') {
        window.__gudangai_syncNow();
      }
      window.dispatchEvent(new CustomEvent('gudangai-stock-refresh', { detail: { reason: 'write-success', count: totalSuccess } }));
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
function queueItemIdentity(item) {
  const clientItemId = String(item?.clientItemId || '').trim();
  if (!clientItemId) return { transactionId: '', nonce: '' };
  return { transactionId: 'TX-' + clientItemId, nonce: 'NC-' + clientItemId };
}
function queueItemSheet(item) {
  return ({ masuk: 'Barang masuk', keluar: 'Barang keluar', rusak: 'Barang Rusak' })[item?.type] || '';
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
    const data = await getJson('getTransactionStatus', {
      transactionId: identity.transactionId,
      nonce: identity.nonce,
      sheet,
    });
    const applied = data?.success === true &&
      (data?.status === 'APPLIED' || data?.code === 'READBACK_CONFIRMED' || data?.code === 'READBACK_FOUND');
    return applied
      ? { ...data, success: true, status: 'APPLIED', clientItemId: item.clientItemId, sheet }
      : { ...data, success: false, clientItemId: item.clientItemId, sheet, error: data?.error || 'Server belum mengonfirmasi transaksi.' };
  } catch (err) {
    return { success: false, status: 'UNKNOWN', code: 'READBACK_FAILED', clientItemId: item.clientItemId, sheet, error: err?.message || 'Gagal membaca status transaksi.' };
  }
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
  try {
    const queue = getPendingQueue().map((entry) => ({
      ...entry,
      items: (entry.items || []).map(ensureClientItemId),
    }));
    const groups = new Map();
    const conflictingIds = new Set();
    const identitySignatures = new Map();

    // Combine outbox entries that target the same transaction sheet/entity/date.
    // A clientItemId reused with a different operation, entity, date, or payload is held.
    for (const entry of queue) {
      const type = entry.type || 'masuk';
      const entity = String(entry.entity || '').toUpperCase();
      const tanggal = normalizeTanggal(entry.tanggal);
      const key = [type, entity, tanggal].join('|');
      if (!groups.has(key)) groups.set(key, { type, entity, tanggal, itemsById: new Map() });
      const group = groups.get(key);
      for (const item of entry.items) {
        const id = String(item.clientItemId || '');
        if (!id) continue;
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
    let requests = 0;
    for (const group of groups.values()) {
      const items = Array.from(group.itemsById.values()).filter((item) => !conflictingIds.has(String(item.clientItemId)));
      if (!items.length) continue;
      const appliedBeforeGroup = getAppliedMap();
      const needsWrite = items.filter((item) => !appliedBeforeGroup[item.clientItemId]);
      const res = await submitItems(group.type, group.entity, items, group.tanggal, { fromQueue: true });
      requests += Math.ceil(needsWrite.length / BATCH_CHUNK_SIZE);
      for (const result of res.results || []) {
        if (result.clientItemId && (result.success === true || result.skipped === true)) confirmedIds.add(result.clientItemId);
      }
    }

    const remaining = [];
    let synced = 0, failed = 0;
    const appliedAfterSync = getAppliedMap();
    for (const entry of queue) {
      const remainingItems = entry.items.filter((item) => !confirmedIds.has(item.clientItemId) && !appliedAfterSync[item.clientItemId]);
      synced += entry.items.length - remainingItems.length;
      if (remainingItems.length) {
        failed += remainingItems.length;
        remaining.push({ ...entry, items: remainingItems });
      }
    }
    commitQueueLocal(remaining);
    return { synced, failed, groups: groups.size, requests, conflicts: conflictingIds.size };
  } finally {
    _syncLock = false;
  }
}
const HISTORY_KEY = 'gudangai_history';
export function getTransactionHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } }
export function getLocalHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (_) { return []; }
}
export function saveToHistory(entry) {
  const list = getTransactionHistory();
  list.unshift({ ...entry, id: 'H-' + Date.now() });
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 200))); } catch (_) {}
}
export async function fetchRemoteTransactionHistory(days = 7) {
  const safeDays = Math.max(1, Math.min(31, Number(days) || 7));
  let data = null;
  try { data = await getJson('getTransactionHistory', { days: String(safeDays) }); }
  catch (_) { data = await postJson({ action: 'getTransactionHistory', days: safeDays, requestId: newIds().requestId }); }
  if (!data || data.success === false || data.code === 'UNAUTHORIZED') throw new Error(data?.error || 'Gagal mengambil riwayat transaksi backend');
  const raw = data.items || data.history || data.transactions || data.data?.items || data.data?.history || data.data?.transactions || data.rows || data.data || [];
  return (Array.isArray(raw) ? raw : []).map((entry) => ({ ...entry,
    at: entry?.at ?? entry?.timestamp ?? entry?.time ?? entry?.createdAt ?? entry?.created_at ?? 0,
    timestamp: entry?.timestamp ?? entry?.at ?? entry?.time ?? entry?.createdAt ?? entry?.created_at ?? 0,
    type: entry?.type ?? entry?.jenis ?? entry?.action ?? entry?.sheet ?? entry?.sheetName ?? '',
    transactionId: entry?.transactionId ?? entry?.transaction_id ?? entry?.id ?? '', requestId: entry?.requestId ?? entry?.request_id ?? '',
    qty: Number(entry?.qty ?? entry?.quantity ?? entry?.jumlah ?? 0) || 0,
    items: Array.isArray(entry?.items) ? entry.items.map((it) => ({ qty: Number(it?.qty ?? it?.quantity ?? it?.jumlah ?? 0) || 0, kode: it?.kode || it?.kodeBarang || '', nama: it?.nama || it?.name || '' })) : [],
  }));
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
