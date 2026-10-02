/** GudangAI RUDY — API layer V6.7.1 stable-chunk (BATCH=30) + tanggal YYYY-MM-DD */
const RETRY_COUNT = 2;
const RETRY_BASE_MS = 400;
const REQUEST_TIMEOUT_MS = 15000;
/** Chunk agar Apps Script + spreadsheet selesai < timeout (anti-antrian). */
const BATCH_CHUNK_SIZE = 30;
const BATCH_TIMEOUT_MS = 90000;
const SINGLE_TIMEOUT_MS = 60000;
const SCHEMA_VERSION = '1.0';
const SAFE_WRITE_BACKEND_RE = /STOCK-READONLY|STOCK-SOURCE-LOCKED|6\.6\.5\+?BULK[-_]?STABLE|6\.6\.[5-9]|V?6\.6\.[5-9]/i;

const APPLIED_KEY = 'gudangai_applied';
const QUEUE_KEY = 'gudangai_queue';
const APPLIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NOTIF_KEY = 'gudangai_notif';
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxVpw0_waeCautJTG0R-jZQKBoxjTLXl5PGYCUBULccKhW8IQAoGRQFEqaCy6MkcnZqlQ/exec';
/**
 * Oktober V6.6.5 BULK STABLE.
 * Secret is seeded only for existing PWA installs so an older localStorage
 * value cannot leave the write path permanently queued. It is still overridable
 * from Atur and is never sent unless a request is made.
 */
const DEFAULT_API_SECRET = 'adadd47759234a7f94acb230c0cc7ff479c4e4f79a674714';
const LEGACY_API_URL = 'https://script.google.com/macros/s/AKfycbzTN_W44k-llBaTba7yMlK5RARIqJCMi3Rt8jBtyOmKTnqdrG7IQeDmH0V2gtyVAyk-xQ/exec';
let _syncLock = false;
let _queueRevision = 0;
let _batchSupported = null;

import { hydrateQueueBackup, persistQueueBackup } from './offlineStore';
function emitConn(detail) { try { window.dispatchEvent(new CustomEvent('gudangai-conn', { detail })); } catch (_) {} }
export function getApiUrl() {
  const stored = (localStorage.getItem('gudangai_api_url') || '').trim();
  if (stored === LEGACY_API_URL) {
    localStorage.setItem('gudangai_api_url', DEFAULT_API_URL);
    return DEFAULT_API_URL;
  }
  if (stored) return stored;
  localStorage.setItem('gudangai_api_url', DEFAULT_API_URL);
  return DEFAULT_API_URL;
}
export function setApiUrl(url) {
  const c = (url || '').trim();
  localStorage.setItem('gudangai_api_url', c || DEFAULT_API_URL);
  _batchSupported = null;
}
export function getApiSecret() {
  const stored = (localStorage.getItem('gudangai_api_secret') || '').trim();
  if (stored) return stored;
  try { localStorage.setItem('gudangai_api_secret', DEFAULT_API_SECRET); } catch (_) {}
  return DEFAULT_API_SECRET;
}
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
export async function fetchRemoteTransactionHistory(days = 7) {
  const safeDays = Math.max(1, Math.min(31, Number(days) || 7));
  const params = { days: String(safeDays) };
  let data = null;
  try {
    data = await getJson('getTransactionHistory', params);
  } catch (_) {
    try {
      data = await postJson({ action: 'getTransactionHistory', days: safeDays, requestId: newIds().requestId });
    } catch (err) {
      throw new Error(err?.message || 'Gagal mengambil riwayat transaksi backend');
    }
  }
  if (!data || data.success === false || data.code === 'UNAUTHORIZED') {
    throw new Error(data?.error || 'Gagal mengambil riwayat transaksi backend');
  }
  const raw = data.items || data.history || data.transactions || data.data?.items ||
    data.data?.history || data.data?.transactions || data.rows || data.data || [];
  const list = Array.isArray(raw) ? raw : [];
  return list.map((entry) => {
    const items = Array.isArray(entry?.items) ? entry.items.map((it) => ({
      qty: toNum(it.qty ?? it.quantity ?? it.jumlah ?? 0),
      kode: it.kode || it.kodeBarang || '',
      nama: it.nama || it.name || '',
    })) : [];
    const qty = toNum(entry?.qty ?? entry?.quantity ?? entry?.jumlah ?? 0);
    return {
      ...entry,
      at: entry?.at ?? entry?.timestamp ?? entry?.time ?? entry?.createdAt ?? entry?.created_at ?? 0,
      timestamp: entry?.timestamp ?? entry?.at ?? entry?.time ?? entry?.createdAt ?? entry?.created_at ?? 0,
      type: entry?.type ?? entry?.jenis ?? entry?.action ?? entry?.sheet ?? entry?.sheetName ?? '',
      transactionId: entry?.transactionId ?? entry?.transaction_id ?? entry?.id ?? '',
      requestId: entry?.requestId ?? entry?.request_id ?? '',
      qty,
      items,
    };
  });
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
function extractBackendVersion(data) {
  const candidates = [
    data?.version,
    data?.backendVersion,
    data?.appVersion,
    data?.data?.version,
    data?.data?.backendVersion,
    data?.data?.appVersion,
    data?.data?.status?.version,
  ];
  return candidates.map(v => String(v ?? '').trim()).find(Boolean) || '';
}
async function assertSafeWriteBackend() {
  const health = await healthCheck();
  const version = extractBackendVersion(health?.data);
  if (!health?.ok) throw new Error('WRITE DITAHAN: backend Oktober V6.6.5 belum terverifikasi. Cek Web App/API Secret.');
  if (!SAFE_WRITE_BACKEND_RE.test(version)) {
    throw new Error('WRITE DITAHAN: backend belum LOCK Stock CV/PT. Versi: ' + (version || 'tidak diketahui'));
  }
  if (/6\.6\.5|BULK[-_]?STABLE/i.test(version)) _batchSupported = true;
  return health;
}
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
export async function confirmPOStatus(payload) {
  try { return await postJson({ action: 'confirmPOStatus', ...(payload || {}), requestId: newIds().requestId }); }
  catch (err) { return { success: false, error: err?.message || 'Gagal konfirmasi PO' }; }
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
  const toSend = [];
  const skipped = [];
  for (const it of chunkItems) {
    const cid = it.clientItemId || ensureClientItemId(it).clientItemId;
    if (isApplied(cid)) skipped.push({ success: true, skipped: true, clientItemId: cid });
    else {
      const kodeBarang = String(it.kode || it.kodeBarang || '').trim();
      toSend.push({ kodeBarang, qty: Number(it.qty) || 0, keterangan: String(it.keterangan || '').trim().slice(0, 200), requestId: 'REQ-' + cid, transactionId: 'TX-' + cid, nonce: 'NC-' + cid, _cid: cid });
    }
  }
  if (!toSend.length) return { success: true, successCount: skipped.length, failCount: 0, results: skipped };
  const wireList = toSend.map(({ kodeBarang, qty, keterangan, requestId, transactionId, nonce }) => ({ kodeBarang, qty, keterangan, requestId, transactionId, nonce }));
  const common = {
    sheet: sheetName,
    entitas: String(entity || '').toUpperCase(),
    entity: String(entity || '').toUpperCase(),
    tanggal: normalizeTanggal(tanggal),
    transactions: wireList,
    requestId: newIds().requestId,
    queueApproved: true,
  };
  let data = null;
  try {
    data = await postJson({ action: 'bulkTransaction', ...common }, { retries: 1, timeoutMs: BATCH_TIMEOUT_MS });
  } catch (_) {
    data = null;
  }
  const unknownBulk = !data || data.code === 'UNKNOWN_ACTION' || data.error === 'UNKNOWN_ACTION' ||
    (data.error && /tidak dikenali|unknown action|not found/i.test(String(data.error)));
  if (unknownBulk) {
    data = await postJson({ action: 'addTransactionBatch', ...common, items: wireList, data: wireList }, { retries: 1, timeoutMs: BATCH_TIMEOUT_MS });
  }
  if (data && (data.code === 'UNKNOWN_ACTION' || data.error === 'UNKNOWN_ACTION' || (data.error && /tidak dikenali/i.test(String(data.error))))) {
    _batchSupported = false;
    throw new Error('BATCH_NOT_SUPPORTED');
  }
  if (data && (data.status === 'PRECHECK_REJECTED' || data.code === 'PRECHECK_REJECTED')) {
    throw new Error('BATCH_NOT_SUPPORTED');
  }
  _batchSupported = true;
  const batchResults = [];
  const rawResults = Array.isArray(data?.results)
    ? data.results
    : (Array.isArray(data?.data?.results) ? data.data.results : []);
  const cidByTx = new Map(toSend.map((it) => [it.transactionId, it._cid]));
  const confirmedIds = new Set();

  for (const r of rawResults) {
    const clientItemId = r?.clientItemId || cidByTx.get(r?.transactionId);
    if (!clientItemId) continue;

    const explicitSuccess =
      r.success === true ||
      r.written === true ||
      r.inserted === true ||
      r.status === 'APPLIED' ||
      r.status === 'OK' ||
      r.status === 'SUCCESS' ||
      r.status === 'DUPLICATE';

    const normalized = { ...r, clientItemId, success: !!explicitSuccess };
    if (explicitSuccess) {
      confirmedIds.add(clientItemId);
      markApplied(clientItemId);
    }
    batchResults.push(normalized);
  }

  for (const it of toSend) {
    if (!confirmedIds.has(it._cid)) {
      batchResults.push({ success: false, clientItemId: it._cid, pending: true });
    }
  }
  const successCount = confirmedIds.size + skipped.length;
  const failCount = toSend.length - confirmedIds.size;
  return { success: successCount > 0, successCount, failCount, results: [...skipped, ...batchResults] };
}

async function submitItems(action, entity, items, tanggal, options = {}) {
  const list = (items || []).map(ensureClientItemId);
  if (!list.length) return { success: false, error: 'Tidak ada item' };
  if (!navigator.onLine || !getApiUrl()) {
    if (!options.fromQueue) enqueue(action, entity, list, { tanggal });
    const msg = list.length + ' item masuk Antrian Sinkronisasi (offline)';
    pushNotification({ type: 'warning', title: 'Koneksi terputus', body: msg + '. Tidak ada item yang dibuang.' });
    return { success: true, queued: true, count: 0, queuedCount: list.length, failed: list.length, results: list.map(it => ({ success: false, queued: true, clientItemId: it.clientItemId })) };
  }
  try {
    await assertSafeWriteBackend();
  } catch (err) {
    if (!options.fromQueue) enqueue(action, entity, list, { tanggal });
    const msg = err?.message || 'Backend write belum terverifikasi';
    pushNotification({ type: 'error', title: 'Write ditahan', body: msg });
    return {
      success: true, count: 0, failed: list.length, queuedCount: list.length, total: list.length,
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
      emitProgress(Math.min(i + chunk.length, list.length), list.length, batchRes);
      const failedIds = new Set((batchRes.results || []).filter(r => !r.success && !r.skipped && r.clientItemId).map(r => r.clientItemId));
      const knownIds = new Set((batchRes.results || []).map(r => r.clientItemId).filter(Boolean));
      const queueItems = chunk.filter(it => failedIds.has(it.clientItemId) || (!knownIds.has(it.clientItemId) && !isApplied(it.clientItemId)));
      if (queueItems.length) {
        if (!options.fromQueue) enqueue(action, entity, queueItems, { tanggal });
        totalQueued += queueItems.length;
      }
      continue;
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg === 'BATCH_NOT_SUPPORTED' || /BATCH_NOT_SUPPORTED|BULK_FAILED|PRECHECK/i.test(msg)) {
        for (const it of chunk) {
          try {
            const one = await submitOneItem(action, entity, it, tanggal);
            allResults.push(one);
            if (one.success || one.skipped) totalSuccess += 1;
            else {
              totalFail += 1;
              if (!options.fromQueue) { enqueue(action, entity, [it], { tanggal }); totalQueued += 1; }
            }
          } catch (e2) {
            totalFail += 1;
            if (!options.fromQueue) { enqueue(action, entity, [it], { tanggal }); totalQueued += 1; }
            allResults.push({ success: false, queued: true, clientItemId: it.clientItemId, error: e2?.message || 'Gagal' });
          }
          emitProgress(Math.min(i + chunk.length, list.length), list.length, { successCount: totalSuccess, failCount: totalFail });
        }
        continue;
      }
      const remainingItems = list.slice(i);
      if (!options.fromQueue) enqueue(action, entity, remainingItems, { tanggal });
      totalQueued += remainingItems.length;
      totalFail += remainingItems.length;
      allResults.push(...remainingItems.map(it => ({ success: false, queued: true, uncertain: true, clientItemId: it.clientItemId, error: err?.message || 'Timeout/koneksi terputus' })));
      emitProgress(list.length, list.length, { successCount: totalSuccess, failCount: totalFail });
      pushNotification({ type: 'warning', title: 'Koneksi terputus — masuk antrian', body: remainingItems.length + ' item diamankan di Antrian Sinkronisasi. Retry memakai ID unik agar tidak duplikasi.' });
      break;
    }
  }
  if (totalQueued > 0) {
    pushNotification({ type: 'warning', title: 'Sinkronisasi perlu dilanjutkan', body: totalSuccess + ' sukses · ' + totalQueued + ' masuk antrian · ' + totalFail + ' belum terkonfirmasi. Antrian menyimpan ID unik untuk mencegah duplikasi.' });
  } else {
    pushNotification({ type: 'success', title: 'Transaksi selesai', body: totalSuccess + ' item berhasil ditulis tanpa antrian.' });
  }
  return { success: totalSuccess > 0 || totalQueued > 0, count: totalSuccess, failed: totalFail, queuedCount: totalQueued, total: list.length, results: allResults };
}

function emitProgress(sent, total, result = {}) {
  try {
    window.dispatchEvent(new CustomEvent('gudangai-submit-progress', {
      detail: {
        sent: Number(sent) || 0,
        total: Number(total) || 0,
        success: Number(result.successCount ?? result.count ?? 0) || 0,
        failed: Number(result.failCount ?? result.failed ?? 0) || 0,
      }
    }));
  } catch (_) {}
}

export function getPendingQueue() {
  return readQueueLocal().queue || [];
}

export function removePendingByClientIds(clientItemIds = []) {
  const ids = new Set((clientItemIds || []).filter(Boolean));
  if (!ids.size) return;
  const queue = getPendingQueue();
  const next = [];
  for (const entry of queue) {
    const items = (entry.items || []).filter(it => !ids.has(it?.clientItemId));
    if (items.length) next.push({ ...entry, items });
  }
  commitQueueLocal(next);
  try { window.dispatchEvent(new CustomEvent('gudangai-queue-changed')); } catch (_) {}
}

export function clearSyncedQueue() {
  commitQueueLocal([]);
  try { window.dispatchEvent(new CustomEvent('gudangai-queue-changed')); } catch (_) {}
}

export function saveToHistory(entry = {}) {
  const key = 'gudangai_history';
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    const list = Array.isArray(raw) ? raw : [];
    list.unshift({
      ...entry,
      at: entry.at || Date.now(),
      timestamp: entry.timestamp || Date.now(),
      status: entry.status || 'sukses',
    });
    localStorage.setItem(key, JSON.stringify(list.slice(0, 2000)));
    try { window.dispatchEvent(new CustomEvent('gudangai-history-changed')); } catch (_) {}
  } catch (_) {}
}

export function getLocalHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem('gudangai_history') || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (_) { return []; }
}

export function getTransactionHistory() {
  return getLocalHistory();
}

export function pushNotification(notification = {}) {
  const key = NOTIF_KEY;
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    const list = Array.isArray(raw) ? raw : [];
    list.unshift({ ...notification, at: Date.now(), read: false });
    localStorage.setItem(key, JSON.stringify(list.slice(0, 300)));
    try { window.dispatchEvent(new CustomEvent('gudangai-notification')); } catch (_) {}
  } catch (_) {}
}

export function getNotifications() {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (_) { return []; }
}

export function markNotificationsRead() {
  const list = getNotifications().map(n => ({ ...n, read: true }));
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(list)); } catch (_) {}
  try { window.dispatchEvent(new CustomEvent('gudangai-notification')); } catch (_) {}
}

export function unreadNotificationCount() {
  return getNotifications().filter(n => !n?.read).length;
}

export async function submitBarangMasuk({ entity, tanggal, items } = {}) {
  return submitItems('barangMasuk', entity, items, tanggal);
}

export async function submitBarangKeluar({ entity, tanggal, items } = {}) {
  return submitItems('barangKeluar', entity, items, tanggal);
}

export async function submitBarangRusak({ entity, tanggal, items } = {}) {
  return submitItems('barangRusak', entity, items, tanggal);
}

/**
 * Manual queue sync:
 * - never marks history success merely because a request was sent;
 * - removes an item only when submitItems returns per-item success/skipped;
 * - keeps every unconfirmed item in the queue for the next retry;
 * - preserves clientItemId so backend idempotency prevents duplicates.
 */
export async function syncPendingQueue() {
  if (_syncLock) return { synced: 0, failed: getPendingQueue().reduce((n, e) => n + (e.items?.length || 0), 0), skipped: true };
  if (!navigator.onLine || !getApiUrl()) {
    return { synced: 0, failed: getPendingQueue().reduce((n, e) => n + (e.items?.length || 0), 0), skipped: true };
  }

  _syncLock = true;
  try {
    await assertSafeWriteBackend();
    const queue = getPendingQueue();
    let synced = 0;
    let failed = 0;
    const remaining = [];

    for (const entry of queue) {
      const items = Array.isArray(entry?.items) ? entry.items.map(ensureClientItemId) : [];
      if (!items.length) continue;

      const res = await submitItems(entry.type || 'barangMasuk', entry.entity || '', items, entry.tanggal, { fromQueue: true });
      const results = new Map((res?.results || [])
        .filter(r => r?.clientItemId)
        .map(r => [r.clientItemId, r]));

      const keep = [];
      for (const item of items) {
        const r = results.get(item.clientItemId);
        if (r?.success === true || r?.skipped === true || isApplied(item.clientItemId)) {
          markApplied(item.clientItemId);
          synced += 1;
          saveToHistory({
            type: entry.type,
            entity: entry.entity,
            kode: item.kode,
            nama: item.nama,
            qty: item.qty,
            keterangan: item.keterangan || '',
            tanggal: entry.tanggal,
            source: 'sync-queue',
            clientItemId: item.clientItemId,
            status: 'sukses',
          });
        } else {
          keep.push(item);
          failed += 1;
        }
      }
      if (keep.length) remaining.push({ ...entry, items: keep });
    }

    commitQueueLocal(remaining);
    try { window.dispatchEvent(new CustomEvent('gudangai-queue-changed')); } catch (_) {}
    return { synced, failed, skipped: false, remaining: failed };
  } finally {
    _syncLock = false;
  }
}
