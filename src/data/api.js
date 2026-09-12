/** GudangAI RUDY — API layer V6.4.11 anti-double-write */
const RETRY_COUNT = 2;
const RETRY_BASE_MS = 400;
const REQUEST_TIMEOUT_MS = 12000;
const SCHEMA_VERSION = '1.0';
const APPLIED_KEY = 'gudangai_applied';
const QUEUE_KEY = 'gudangai_queue';
const APPLIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NOTIF_KEY = 'gudangai_notif';
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxovv4rFIIpuA1KHwrUCjKluMAvH8H9LvUmFBRL-UoFb-Am66NvfOjQVPMsp7BNB0ikhQ/exec';
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
  return { requestId: 'REQ-' + uuid + '-' + stamp, transactionId: 'TX-RUDY-' + uuid + '-' + stamp, nonce: 'NC-' + uuid + '-' + stamp };
}
async function fetchWithRetry(url, options = {}, retries = RETRY_COUNT) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
  emitConn({ state: 'failed', error: (lastError && lastError.message) || 'Gagal' });
  throw lastError;
}
async function postJson(payload) {
  const url = getApiUrl();
  if (!url) throw new Error('URL API belum diatur');
  const body = JSON.stringify({ schemaVersion: SCHEMA_VERSION, secret: getApiSecret() || undefined, client: { app: 'gudangai-rudy-pwa', deviceId: deviceId() }, ...payload });
  const res = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, redirect: 'follow' });
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error('Respons bukan JSON: ' + text.slice(0, 120)); }
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
function generateDemoStock(masterList) {
  return masterList.map((item) => ({ ...item, stok: Math.floor(Math.random() * 100), lastUpdate: new Date().toISOString() }));
}
export async function healthCheck() {
  if (!getApiUrl()) return { ok: false, offline: true, error: 'URL API belum diatur' };
  try {
    let data = null; let lastErr = null;
    try { data = await getJson('ping'); } catch (e) { lastErr = e; }
    if (!data || (data.error && !data.success && data.status !== 'OK')) {
      try { data = await getJson('status'); } catch (e) { lastErr = e; }
    }
    if (data && data.code === 'UNAUTHORIZED') return { ok: false, error: 'Unauthorized — isi API Secret di Atur', version: data.version };
    if (data && (data.success === true || data.status === 'OK' || data.status === 'ok')) {
      return { ok: true, data: { status: 'ok', version: data.version || data.title || 'V6.4.4', timestamp: data.serverTime || new Date().toISOString(), spreadsheet: data.spreadsheet || '', raw: data } };
    }
    return { ok: false, error: (data && data.error) || (lastErr && lastErr.message) || 'Respons tidak valid' };
  } catch (err) {
    return { ok: false, offline: !navigator.onLine, error: err.message || 'Gagal cek koneksi' };
  }
}
export function getConnectionStatus() {
  const url = getApiUrl();
  if (!url) return { status: 'unset', label: 'Belum diatur', color: 'gray' };
  if (!navigator.onLine) return { status: 'offline', label: 'Mode Offline', color: 'red' };
  if (!getApiSecret()) return { status: 'configured', label: 'URL OK · Secret belum diisi', color: 'amber' };
  return { status: 'configured', label: 'URL + Secret terkonfigurasi', color: 'green' };
}
function mapStockItem(it, entity) {
  return { kode: it.kode, nama: it.nama || '', satuan: it.satuan || '', divisi: it.divisi || '', stok: Number(it.stockAkhir != null ? it.stockAkhir : it.stok) || 0, stockAman: Number(it.stockAman != null ? it.stockAman : it.aman) || 0, lastUpdate: new Date().toISOString(), entitas: it.entitas || entity };
}
export async function fetchStock(entity, options = {}) {
  const allowDemo = options.allowDemo !== false;
  const url = getApiUrl();
  if (!url) { const { getMasterByEntity } = await import('./master.js'); return allowDemo ? generateDemoStock(getMasterByEntity(entity)) : []; }
  try {
    let data;
    try { data = await getJson('getAllStock', { entitas: entity }); } catch { try { data = await postJson({ action: 'getAllStock', entitas: entity, requestId: newIds().requestId }); } catch { data = null; } }
    if (data && data.code === 'UNAUTHORIZED') throw new Error('Unauthorized — cek API Secret di Atur');
    const raw = (data && (data.items || data.stock || data.data)) || [];
    return raw.map((it) => mapStockItem(it, entity));
  } catch (err) {
    if (/Unauthorized|API Secret|URL API/i.test(String(err.message || ''))) throw err;
    const { getMasterByEntity } = await import('./master.js');
    return allowDemo ? generateDemoStock(getMasterByEntity(entity)) : [];
  }
}
export async function getStatusPO() {
  const url = getApiUrl();
  if (!url) return { success: false, error: 'URL API belum diatur' };
  try {
    let data;
    try { data = await getJson('getStatusPO'); } catch { data = await postJson({ action: 'getStatusPO', requestId: newIds().requestId }); }
    if (data && data.code === 'UNAUTHORIZED') return { success: false, error: 'Unauthorized — isi API Secret di Atur' };
    return data || { success: false, error: 'Respons kosong' };
  } catch (err) {
    return { success: false, error: err.message || 'Gagal mengambil Status PO' };
  }
}
export async function getDashboardData() {
  try {
    let data;
    try { data = await getJson('getDashboardData'); } catch { data = await postJson({ action: 'getDashboardData', requestId: newIds().requestId }); }
    return data || { success: false, error: 'Respons kosong' };
  } catch (err) {
    return { success: false, error: err.message || 'Gagal dashboard' };
  }
}
function getAppliedMap() { try { return JSON.parse(localStorage.getItem(APPLIED_KEY) || '{}'); } catch { return {}; } }
function pruneApplied(map) {
  const now = Date.now(); const out = {};
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
function ensureClientItemId(it) {
  if (it && it.clientItemId) return it;
  const id = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  return { ...(it || {}), clientItemId: 'CI-' + id };
}
function enqueue(type, entity, items, meta = {}) {
  if (meta && meta.fromQueue) return { id: null, skipped: true, items: [] };
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  const pending = (items || []).map(ensureClientItemId).filter((it) => !isApplied(it.clientItemId));
  if (!pending.length) return { id: null, skipped: true, items: [] };
  const entry = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), type, entity, items: pending, tanggal: meta.tanggal || '', timestamp: new Date().toISOString(), synced: false };
  queue.push(entry);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return entry;
}
function normalizeQueue(rawQueue) {
  const seen = new Set(); const out = [];
  for (const e of rawQueue || []) {
    if (e.synced) continue;
    const items = [];
    for (const it of (e.items || []).map(ensureClientItemId)) {
      if (!it.clientItemId || isApplied(it.clientItemId) || seen.has(it.clientItemId)) continue;
      seen.add(it.clientItemId); items.push(it);
    }
    if (items.length) out.push({ ...e, items, synced: false });
  }
  return out;
}
const SHEET_MAP = { barangMasuk: 'Barang masuk', barangKeluar: 'Barang keluar', barangRusak: 'Barang Rusak' };
async function submitOneItem(sheet, entity, it, tanggal) {
  const item = ensureClientItemId(it);
  const cid = item.clientItemId;
  if (isApplied(cid)) return { success: true, skipped: true, kode: item.kode, clientItemId: cid };
  const payload = { action: 'addTransaction', sheet, entitas: entity, kodeBarang: String(item.kode || '').trim(), qty: Number(item.qty) || 0, keterangan: String(item.keterangan || '').trim(), tanggal: tanggal || undefined, requestId: cid, transactionId: 'TX-' + cid, nonce: 'NC-' + cid };
  const data = await postJson(payload);
  if (data && data.code === 'UNAUTHORIZED') return { success: false, unauthorized: true, kode: item.kode, clientItemId: cid, error: 'Unauthorized' };
  if (data && (data.status === 'DUPLICATE' || data.idempotent === true)) { markApplied(cid); return { success: true, skipped: true, kode: item.kode, clientItemId: cid }; }
  if (data && (data.success === true || data.status === 'APPLIED' || data.status === 'OK')) { markApplied(cid); return { success: true, kode: payload.kodeBarang, qty: data.qty != null ? data.qty : payload.qty, row: data.row, clientItemId: cid }; }
  return { success: false, kode: item.kode, clientItemId: cid, error: data?.error || 'Gagal menulis' };
}
async function submitTransaction(action, entity, items, options = {}) {
  const url = getApiUrl();
  const typeMap = { barangMasuk: 'masuk', barangKeluar: 'keluar', barangRusak: 'rusak' };
  const fromQueue = !!(options && options.fromQueue);
  if (!url) {
    const entry = enqueue(typeMap[action], entity, items, { tanggal: options.tanggal, fromQueue });
    return { success: false, offline: true, id: entry.id, remaining: (items || []).map(ensureClientItemId), error: 'URL API belum diatur' };
  }
  const sheet = SHEET_MAP[action];
  const tanggal = options.tanggal || '';
  const normalized = (items || []).map(ensureClientItemId);
  const todo = normalized.filter((it) => !isApplied(it.clientItemId));
  const alreadyDone = normalized.length - todo.length;
  if (!todo.length) return { success: true, written: alreadyDone, skipped: alreadyDone, remaining: [], message: 'Semua item sudah tercatat.' };

  // ========== BATCH PATH (hanya untuk kirim langsung dari Input, bukan dari Antrian) ==========
  // Aturan ketat anti-duplikat (12 Sep 2026):
  // Jika batch berhasil jelas → markApplied + selesai.
  // Jika batch gagal / timeout / respons tidak jelas → JANGAN serial-ulang.
  // Masukkan ke antrian agar user review di SyncQueuePage. Hindari double-write ke spreadsheet.
  if (!fromQueue && todo.length >= 1) {
    try {
      const batchItems = todo.map((it) => ({
        kodeBarang: String(it.kode || '').trim(),
        qty: Number(it.qty) || 0,
        keterangan: String(it.keterangan || '').trim(),
        requestId: it.clientItemId,
      }));
      const batchRes = await postJson({
        action: 'addTransactionBatch',
        sheet,
        entitas: entity,
        tanggal: tanggal || undefined,
        items: batchItems,
        requestId: 'BATCH-' + (todo[0].clientItemId || Date.now()),
      });
      if (batchRes && batchRes.code === 'UNAUTHORIZED') {
        return { success: false, error: 'Unauthorized — isi API Secret di Atur', remaining: todo };
      }
      if (batchRes && (batchRes.success === true || batchRes.status === 'APPLIED') && !batchRes.error) {
        todo.forEach((it) => markApplied(it.clientItemId));
        try { window.dispatchEvent(new CustomEvent('gudangai-stock-refresh')); } catch (_) {}
        pushNotification({ type: 'ok', title: 'Kirim berhasil', body: (todo.length + alreadyDone) + ' item tercatat.' });
        return { success: true, written: todo.length + alreadyDone, skipped: alreadyDone, remaining: [], details: batchRes.details || [] };
      }
      // Batch merespons tapi bukan success jelas → treat as ambiguous, jangan serial
      console.warn('[GudangAI] Batch response not clear success, enqueue for review:', batchRes);
      enqueue(typeMap[action], entity, todo, { tanggal });
      pushNotification({
        type: 'warn',
        title: 'Perlu tinjau antrian',
        body: todo.length + ' item masuk Antrian Sinkronisasi. Buka Atur → Sinkronisasi untuk cek sebelum kirim ulang.',
      });
      return {
        success: false,
        remaining: todo,
        written: alreadyDone,
        queued: true,
        error: 'Respons batch tidak jelas. Item dimasukkan ke Antrian Sinkronisasi agar tidak dobel.',
      };
    } catch (batchErr) {
      // Timeout / network / non-JSON → kemungkinan batch sudah menulis di server.
      // JANGAN serial. Enqueue agar user review di SyncQueuePage.
      console.warn('[GudangAI] Batch failed/timeout — enqueue instead of serial to prevent double-write:', batchErr?.message || batchErr);
      enqueue(typeMap[action], entity, todo, { tanggal });
      pushNotification({
        type: 'warn',
        title: 'Perlu tinjau antrian',
        body: todo.length + ' item masuk Antrian Sinkronisasi (batch timeout). Buka Atur → Sinkronisasi sebelum kirim ulang.',
      });
      return {
        success: false,
        remaining: todo,
        written: alreadyDone,
        queued: true,
        offline: !navigator.onLine,
        error: 'Batch timeout/gagal. Item dimasukkan ke Antrian agar tidak dobel di spreadsheet.',
      };
    }
  }

  // ========== SERIAL PATH (hanya dari Antrian / fromQueue, atau single-item edge) ==========
  const written = [];
  const errors = [];
  const failedItems = [];
  for (let i = 0; i < todo.length; i++) {
    const it = todo[i];
    if (isApplied(it.clientItemId)) continue;
    try {
      const res = await submitOneItem(sheet, entity, it, tanggal);
      if (res.unauthorized) {
        return { success: false, written: written.length + alreadyDone, remaining: todo.slice(i), error: 'Unauthorized — isi API Secret di Atur' };
      }
      if (res.success) written.push(res);
      else {
        errors.push((res.kode || '?') + ': ' + (res.error || 'gagal'));
        failedItems.push(it);
      }
    } catch (err) {
      const msg = err.message || '';
      const isNetwork = !navigator.onLine || /Failed to fetch|NetworkError|Timeout|HTTP 5/i.test(msg);
      if (isNetwork) {
        const rest = todo.slice(i).filter((x) => !isApplied(x.clientItemId));
        if (!fromQueue) enqueue(typeMap[action], entity, rest, { tanggal });
        return { success: written.length > 0, offline: true, remaining: rest, written: written.length + alreadyDone, error: 'Jaringan terputus — sisa antrian.' };
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
      if (!pendingItems.length) { queue[i] = { ...queue[i], synced: true, items: [] }; synced++; continue; }
      try {
        const res = await submitTransaction(actionMap[queue[i].type] || 'barangMasuk', queue[i].entity, pendingItems, { tanggal: queue[i].tanggal || '', fromQueue: true });
        const still = (res.remaining || []).filter((it) => !isApplied(it.clientItemId));
        if (!still.length) { queue[i] = { ...queue[i], synced: true, items: [] }; synced++; }
        else { queue[i] = { ...queue[i], items: still, synced: false }; failed++; if (res.offline) break; }
      } catch { failed++; break; }
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.filter((e) => !e.synced && (e.items || []).length)));
    return { synced, failed, skipped: false };
  } finally { _syncLock = false; }
}
export function getTransactionHistory() { return JSON.parse(localStorage.getItem('gudangai_history') || '[]'); }
export function saveToHistory(entry) {
  const h = getTransactionHistory();
  h.unshift({ ...entry, savedAt: new Date().toISOString() });
  if (h.length > 500) h.length = 500;
  localStorage.setItem('gudangai_history', JSON.stringify(h));
}
export function clearSyncedQueue() { localStorage.setItem(QUEUE_KEY, '[]'); return 0; }
export function clearAllQueue() { localStorage.setItem(QUEUE_KEY, '[]'); return 0; }

export function removePendingByClientIds(clientItemIds) {
  if (!clientItemIds || !clientItemIds.length) return getPendingQueue();
  const idSet = new Set(clientItemIds);
  let queue = [];
  try { queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { queue = []; }
  const next = [];
  for (const e of queue) {
    if (e.synced) continue;
    const items = (e.items || []).map(ensureClientItemId).filter((it) => {
      if (!it.clientItemId || isApplied(it.clientItemId)) return false;
      return !idSet.has(it.clientItemId);
    });
    if (items.length) next.push({ ...e, items, synced: false });
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  return normalizeQueue(next);
}

export function pushNotification(entry) {
  try {
    const list = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
    list.unshift({ id: Date.now().toString(36), ts: new Date().toISOString(), read: false, ...entry });
    if (list.length > 80) list.length = 80;
    localStorage.setItem(NOTIF_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('gudangai-notif'));
  } catch (_) {}
}
export function getNotifications() { try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch { return []; } }
export function markNotificationsRead() {
  try {
    const list = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]').map((n) => ({ ...n, read: true }));
    localStorage.setItem(NOTIF_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('gudangai-notif'));
  } catch (_) {}
}
export function unreadNotificationCount() { return getNotifications().filter((n) => !n.read).length; }
