/** GudangAI RUDY — API layer V6.4.15 + V6.6.3 batch fix */
/** BUILD_BATCH 2026-09-18: batch keluar 40-80 — sheet resmi, transactions[], queueApproved, chunk 8, timeout 120s */
const RETRY_COUNT = 2;
const RETRY_BASE_MS = 400;
const REQUEST_TIMEOUT_MS = 12000;
const WRITE_TIMEOUT_MS = 120000;
const BATCH_CHUNK_SIZE = 8;
const BATCH_MAX = 200;
const SCHEMA_VERSION = '1.0';

/** Tanggal kalender operasional gudang (WIB / Asia/Jakarta) — hindari toISOString UTC yang geser hari */
export function localDateYMD(d = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch (_) {
    return new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
}

const APPLIED_KEY = 'gudangai_applied';
const QUEUE_KEY = 'gudangai_queue';
const APPLIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NOTIF_KEY = 'gudangai_notif';
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbzTN_W44k-llBaTba7yMlK5RARIqJCMi3Rt8jBtyOmKTnqdrG7IQeDmH0V2gtyVAyk-xQ/exec';
let _syncLock = false;
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
async function postJsonWrite(payload) {
  return postJson(payload, { retries: 1, timeoutMs: WRITE_TIMEOUT_MS, emitFailure: false });
}
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
export async function fetchStock(entity, options = {}) {
  const allowDemo = options.allowDemo === true;
  const url = getApiUrl();
  if (!url) {
    if (allowDemo) return generateDemoStock();
    throw new Error('URL API belum diatur');
  }
  try {
    let data;
    try { data = await getJson('getAllStock', { entitas: entity || 'ALL' }); }
    catch {
      try { data = await postJson({ action: 'getAllStock', entitas: entity || 'ALL', requestId: newIds().requestId }); }
      catch { data = null; }
    }
    if (data && data.code === 'UNAUTHORIZED') throw new Error('Unauthorized — cek API Secret di Atur');
    if (data && data.success === false) throw new Error(data.error || 'Gagal mengambil stok');
    const raw = (data && (data.items || data.stock || data.data)) || [];
    return (Array.isArray(raw) ? raw : []).map((it) => mapStockItem(it, entity));
  } catch (err) {
    if (/Unauthorized|API Secret|URL API/i.test(String(err.message || ''))) throw err;
    if (allowDemo) return generateDemoStock();
    throw err;
  }
}
export async function getStatusPO() {
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
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  const entry = { id: 'Q-' + Date.now(), type, entity, items: items.map(ensureClientItemId), tanggal: meta.tanggal || localDateYMD(), createdAt: new Date().toISOString() };
  queue.push(entry);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
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
    tanggal: tanggal || localDateYMD(),
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

async function submitTransaction(action, entity, items, options = {}) {
  const fromQueue = !!(options && options.fromQueue);
  const tanggal = (options && options.tanggal) || localDateYMD();
  const typeMap = { barangMasuk: 'masuk', barangKeluar: 'keluar', barangRusak: 'rusak' };
  const SHEET_MAP = { barangMasuk: 'Barang masuk', barangKeluar: 'Barang keluar', barangRusak: 'Barang Rusak' };
  const SHEET_NAME = SHEET_MAP[action] || action;
  const entitas = String(entity || '').toUpperCase();
  const list = (items || []).map(ensureClientItemId);
  if (!list.length) return { success: false, error: 'Tidak ada item' };
  const alreadyDone = list.filter((it) => isApplied(it.clientItemId)).length;
  const todo = list.filter((it) => !isApplied(it.clientItemId));
  if (!todo.length) return { success: true, written: alreadyDone, remaining: [], skippedAll: true };

  if (!fromQueue && todo.length >= 1 && todo.length <= BATCH_MAX) {
    try {
      const chunks = [];
      for (let i = 0; i < todo.length; i += BATCH_CHUNK_SIZE) chunks.push(todo.slice(i, i + BATCH_CHUNK_SIZE));
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
          remaining.push(...chunk);
          for (let j = ci + 1; j < chunks.length; j++) remaining.push(...chunks[j]);
          break;
        }
        if (batchRes && batchRes.code === 'UNAUTHORIZED') {
          return { success: false, error: 'Unauthorized — isi API Secret di Atur', remaining: todo, written };
        }
        if (batchRes && (batchRes.success === true || batchRes.status === 'COMMITTED' || batchRes.status === 'APPLIED') && !batchRes.error) {
          const okCount = Number(batchRes.successCount);
          chunk.forEach((it) => markApplied(it.clientItemId));
          written += (Number.isFinite(okCount) && okCount > 0) ? okCount : chunk.length;
        } else if (batchRes && batchRes.status === 'UNKNOWN') {
          remaining.push(...chunk);
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
    try {
      const res = await submitOneItem(action, entity, it, tanggal);
      if (res.unauthorized) return { success: false, written: written.length + alreadyDone, remaining: todo.slice(i), error: 'Unauthorized — isi API Secret di Atur' };
      if (res.success) written.push(res);
      else { errors.push((res.kode || '?') + ': ' + (res.error || 'gagal')); failedItems.push(it); }
    } catch (err) {
      const msg = err.message || '';
      const isNetwork = !navigator.onLine || /Failed to fetch|NetworkError|Timeout|HTTP 5/i.test(msg);
      if (isNetwork) {
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
export function getPendingQueue() { try { return normalizeQueue(JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')); } catch { return []; } }
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
    localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  } catch (_) {}
}
export function clearPendingQueue() { localStorage.setItem(QUEUE_KEY, '[]'); }
export async function syncPendingQueue() {
  const url = getApiUrl();
  if (!url || !navigator.onLine) return { synced: 0, failed: 0, skipped: true };
  if (_syncLock) return { synced: 0, failed: 0, skipped: true, reason: 'sync-in-progress' };
  _syncLock = true;
  try {
    let queue = normalizeQueue(JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'));
    let synced = 0, failed = 0;
    const actionMap = { masuk: 'barangMasuk', keluar: 'barangKeluar', rusak: 'barangRusak' };
    const remaining = [];
    for (let i = 0; i < queue.length; i++) {
      const pendingItems = (queue[i].items || []).filter((it) => !isApplied(it.clientItemId));
      if (!pendingItems.length) { synced += (queue[i].items || []).length; continue; }
      const act = actionMap[queue[i].type] || queue[i].type;
      try {
        const res = await submitTransaction(act, queue[i].entity, pendingItems, { tanggal: queue[i].tanggal, fromQueue: true });
        if (res.success) synced += pendingItems.length;
        else { failed += pendingItems.length; remaining.push({ ...queue[i], items: res.remaining || pendingItems }); }
      } catch (_) { failed += pendingItems.length; remaining.push(queue[i]); }
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    return { synced, failed, remaining: remaining.length };
  } finally { _syncLock = false; }
}
function pushNotification(entry) {
  try {
    const h = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
    h.unshift({ ...entry, savedAt: new Date().toISOString() });
    localStorage.setItem(NOTIF_KEY, JSON.stringify(h.slice(0, 50)));
    try { window.dispatchEvent(new CustomEvent('gudangai-notif', { detail: entry })); } catch (_) {}
  } catch (_) {}
}
export function getNotifications() {
  try {
    return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
  } catch { return []; }
}
export function clearNotifications() { localStorage.setItem(NOTIF_KEY, '[]'); }
export async function generatePO() {
  try {
    return await postJson({ action: 'generatePO', requestId: newIds().requestId });
  } catch (err) {
    return { success: false, error: err.message };
  }
}
export async function submitPO(payload) {
  try {
    const items = (payload && payload.items) || [];
    const data = await postJsonWrite({
      action: 'submitPO',
      noPO: payload && (payload.noPO || payload.nomorPO),
      tanggal: payload && payload.tanggal,
      items: items.map((it) => ({
        no: it.no,
        kode: it.kode || it.kodeBarang || '',
        nama: it.nama || '',
        size: it.size || '',
        satuan: it.satuan || '',
        poCV: Number(it.poCV) || 0,
        poPT: Number(it.poPT) || 0,
        total: Number(it.total) || (Number(it.poCV) || 0) + (Number(it.poPT) || 0),
        tglKedatangan: it.tglKedatangan || it.tanggalKedatangan || '',
      })),
      requestId: newIds().requestId,
      queueApproved: true,
    });
    return data;
  } catch (err) {
    return { success: false, error: err.message };
  }
}
