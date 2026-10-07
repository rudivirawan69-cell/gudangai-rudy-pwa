/** GudangAI RUDY — API layer V6.7.2 stable-chunk (BATCH=20) + queue serial fallback + tanggal YYYY-MM-DD */
/** PRODUCTION-WRITE-RECOVERY-2026-10-05: canonical main build marker; preserve CV/PT write path and 20-item batching. */
const RETRY_COUNT = 2;
const RETRY_BASE_MS = 400;
const REQUEST_TIMEOUT_MS = 15000;
/** Chunk aman agar Apps Script + spreadsheet selesai < timeout (anti-antrian). 20 item per POST. */
const BATCH_CHUNK_SIZE = 20;
const BATCH_TIMEOUT_MS = 90000;
const SINGLE_TIMEOUT_MS = 60000;
const SCHEMA_VERSION = '1.0';
const SAFE_WRITE_BACKEND_RE = /STOCK-READONLY|STOCK-SOURCE-LOCKED|6\.6\.5\+?(?:BULK[-_]?STABLE|DEPLOY[-_]?READY)|6\.6\.[5-9]|V?6\.6\.[5-9]|BULK[-_]?STABLE|DEPLOY[-_]?READY/i;

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
  if (!raw) return new Date().toISOString().slice(0, 10);
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
  return new Date().toISOString().slice(0, 10);
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
async function assertSafeWriteBackend() {
  const now = Date.now();
  if (_safeBackendCache.ok && (now - _safeBackendCache.at) < 60000) return _safeBackendCache.health;
  const health = await healthCheck();
  const version = String(health?.data?.version ?? health?.data?.data?.version ?? health?.data?.title ?? '').trim();
  if (!health?.ok) {
    const detail = [health?.code, health?.status, health?.error].filter(Boolean).join(' · ');
    throw new Error('WRITE DITAHAN: backend tidak terverifikasi' + (detail ? ' — ' + detail : '') + '. Tidak ada transaksi yang dikirim.');
  }
  if (!SAFE_WRITE_BACKEND_RE.test(version)) throw new Error('WRITE DITAHAN: backend belum LOCK Stock CV/PT. Versi: ' + (version || 'tidak diketahui'));
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
  };
}
export async function fetchStock(entity, options = {}) {
  const url = getApiUrl();
  if (!url) { if (options.allowDemo) return []; throw new Error('URL API belum diatur'); }
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
function buildDashboardFallbackFromStock(items) {
  const map = {};
  for (const it of (Array.isArray(items) ? items : [])) {
    const divisi = String(it.divisi || 'LAINNYA').trim() || 'LAINNYA';
    if (!map[divisi]) map[divisi] = { divisi, total: 0, aman: 0, waspada: 0, kritis: 0 };
    map[divisi].total += 1;
    const stok = Number(it.stok ?? it.stockAkhir ?? 0) || 0;
    const min = Number(it.stockAman ?? it.aman ?? it.min ?? 0) || 0;
    const cls = min > 0 ? ((stok <= 0 || stok <= Math.max(5, Math.floor(min * 0.25))) ? 'kritis' : (stok < min ? 'waspada' : 'aman')) : (stok <= 5 ? 'kritis' : (stok <= 20 ? 'waspada' : 'aman'));
    map[divisi][cls] += 1;
  }
  return Object.values(map).filter((r) => r.total > 0);
}
export async function getDashboardData() {
  try {
    const data = await getJson('getDashboard');
    if (data && data.success !== false) return data;
    throw new Error(data?.error || 'Dashboard aggregate kosong');
  } catch (err) {
    try {
      const [cv, pt] = await Promise.all([fetchStock('CV'), fetchStock('PT')]);
      const items = [...(cv || []), ...(pt || [])];
      return { success: true, version: 'PWA-LIVE-STOCK-FALLBACK', statusPerDivisi: buildDashboardFallbackFromStock(items), source: 'live-stock-cv-pt' };
    } catch (fallbackErr) {
      return { success: false, error: fallbackErr?.message || err?.message || 'Gagal mengambil dashboard' };
    }
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
  queue.push({ id: 'Q-' + Date.now(), type, entity, items: items.map(ensureClientItemId), tanggal: normalizeTanggal(meta.tanggal), createdAt: new Date().toISOString() });
  commitQueueLocal(queue);
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
    kode: String(it.kode || '').trim(),
    qty: Number(it.qty) || 0,
    keterangan: String(it.keterangan || '').trim().slice(0, 200),
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

  const data = await postJson(payload, { retries: 2, timeoutMs: 90000 });
  const rawResults = data?.results || data?.data?.results || [];
  const cidByTx = new Map(wire.map((it) => [String(it.transactionId), String(it.clientItemId)]));
  const results = Array.isArray(rawResults) ? rawResults.map((r) => {
    const clientItemId = r?.clientItemId || cidByTx.get(String(r?.transactionId || ''));
    const ok = r?.success === true || r?.skipped === true || r?.idempotent === true ||
      r?.status === 'APPLIED' || r?.status === 'OK' || r?.status === 'SUCCESS' || r?.status === 'DUPLICATE';
    return { ...r, clientItemId, success: ok };
  }) : [];

  // Backend V6.6.5 dapat mengembalikan success/written tanpa array results.
  // Dalam kondisi ini, hanya anggap sukses jika backend menyatakan seluruh batch tertulis.
  if (!results.length && data?.success === true &&
      (data?.successCount == null || Number(data.successCount) >= normalized.length)) {
    for (const it of normalized) results.push({ clientItemId: it.clientItemId, success: true });
  } else if (!results.length && data?.written === true &&
      (data?.writtenCount == null || Number(data.writtenCount) >= normalized.length)) {
    for (const it of normalized) results.push({ clientItemId: it.clientItemId, success: true });
  }
  if (!results.length) {
    const detail = [data?.code, data?.status, data?.error, data?.message].filter(Boolean).join(' · ');
    throw new Error(detail || 'Backend tidak mengonfirmasi seluruh batch');
  }

  for (const r of results) {
    if (r.success && r.clientItemId) markApplied(r.clientItemId);
  }
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;
  return { success: successCount === normalized.length, successCount, failCount, results };
}
function emitProgress(sent, total, chunkResult) {
  try { window.dispatchEvent(new CustomEvent('gudangai-submit-progress', { detail: { sent, total, success: chunkResult?.successCount || 0, failed: chunkResult?.failCount || 0 } })); } catch (_) {}
}
async function submitItems(action, entity, items, tanggal, options = {}) {
  const list = (items || []).map(ensureClientItemId);
  if (!list.length) return { success: false, error: 'Tidak ada item' };
  if (!navigator.onLine || !getApiUrl()) {
    if (!options.fromQueue) enqueue(action, entity, list, { tanggal });
    const msg = list.length + ' item masuk Antrian Sinkronisasi (offline)';
    pushNotification({ type: 'warning', title: 'Koneksi terputus', body: msg + '. Tidak ada item yang dibuang.' });
    return { success: false, queued: true, count: 0, queuedCount: list.length, failed: list.length, results: list.map(it => ({ success: false, queued: true, clientItemId: it.clientItemId })) };
  }
  // Never silently queue a write while the API is reachable.
  // Verify the exact write-capable backend before attempting any transaction.
  try {
    await assertSafeWriteBackend();
  } catch (err) {
    if (!options.fromQueue) enqueue(action, entity, list, { tanggal });
    const msg = err?.message || 'Backend write belum terverifikasi';
    pushNotification({ type: 'error', title: 'Write ditahan', body: msg });
    return {
      success: false, count: 0, failed: list.length, queuedCount: list.length, total: list.length,
      results: list.map(it => ({ success: false, queued: true, clientItemId: it.clientItemId, error: msg }))
    };
  }
  const allResults = [];
  let totalSuccess = 0, totalFail = 0, totalQueued = 0;
  for (let i = 0; i < list.length; i += BATCH_CHUNK_SIZE) {
    const chunk = list.slice(i, i + BATCH_CHUNK_SIZE);
    try {
      const batchRes = await submitBatchChunk(action, entity, chunk, tanggal);
      const sc = batchRes.successCount || 0;
      const fc = batchRes.failCount || 0;
      totalSuccess += sc; totalFail += fc;
      if (batchRes.results) allResults.push(...batchRes.results);
      emitProgress(Math.min(i + chunk.length, list.length), list.length, { successCount: totalSuccess, failCount: totalFail });
      const failedIds = new Set((batchRes.results || []).filter(r => !r.success && !r.skipped && r.clientItemId).map(r => r.clientItemId));
      const knownIds = new Set((batchRes.results || []).map(r => r.clientItemId).filter(Boolean));
      const queueItems = chunk.filter(it => failedIds.has(it.clientItemId) || (!knownIds.has(it.clientItemId) && !isApplied(it.clientItemId)));
      if (queueItems.length) {
        if (!options.fromQueue) enqueue(action, entity, queueItems, { tanggal });
        totalQueued += queueItems.length;
      }
      continue;
    } catch (err) {
      const msg = String(err?.message || 'Gagal menulis batch');
      const remainingItems = list.slice(i);
      // HARD RULE: timeout/unknown tidak boleh diubah menjadi serial retry.
      // Retry hanya boleh memakai identity/batch yang sama setelah read-back/status
      // backend terverifikasi; jangan mengubah timeout menjadi write serial.
      if (!options.fromQueue) enqueue(action, entity, remainingItems, { tanggal });
      totalQueued += remainingItems.length;
      totalFail += remainingItems.length;
      allResults.push(...remainingItems.map(it => ({
        success: false,
        queued: true,
        uncertain: true,
        clientItemId: it.clientItemId,
        error: msg,
      })));
      emitProgress(list.length, list.length, { successCount: totalSuccess, failCount: totalFail });
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
  return {
    success: totalSuccess === list.length,
    partial: totalSuccess > 0 && totalSuccess < list.length,
    count: totalSuccess,
    failed: totalFail,
    queuedCount: totalQueued,
    total: list.length,
    results: allResults,
  };
}
export async function submitBarangMasuk({ entity, tanggal, items }) { return submitItems('barangMasuk', entity, items, tanggal); }
export async function submitBarangKeluar({ entity, tanggal, items }) { return submitItems('barangKeluar', entity, items, tanggal); }
export async function submitBarangRusak({ entity, tanggal, items }) { return submitItems('barangRusak', entity, items, tanggal); }
export function getPendingQueue() { return readQueueLocal().queue; }
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
      const res = await submitItems(entry.type, entry.entity, entry.items, entry.tanggal, { fromQueue: true });
      const resultMap = new Map((res.results || []).filter(r => r.clientItemId).map(r => [r.clientItemId, r]));
      const remainingItems = (entry.items || []).filter(it => {
        const r = resultMap.get(it.clientItemId);
        return !r || (!r.success && !r.skipped);
      });
      const doneCount = (entry.items || []).length - remainingItems.length;
      synced += doneCount;
      if (remainingItems.length) { failed += remainingItems.length; remaining.push({ ...entry, items: remainingItems }); }
    }
    commitQueueLocal(remaining);
    return { synced, failed };
  } finally { _syncLock = false; }
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
