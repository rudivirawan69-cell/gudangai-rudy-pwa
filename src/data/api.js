/**
 * GudangAI RUDY — API layer
 * Anti double-write: clientItemId ledger + server requestId idempotency
 */

const RETRY_COUNT = 3;
const RETRY_BASE_MS = 800;
const REQUEST_TIMEOUT_MS = 22000;
const SCHEMA_VERSION = '1.0';
const APPLIED_KEY = 'gudangai_applied';
const QUEUE_KEY = 'gudangai_queue';
const APPLIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function emitConn(detail) {
  try { window.dispatchEvent(new CustomEvent('gudangai-conn', { detail })); } catch (_) {}
}

export function getApiUrl() {
  return (localStorage.getItem('gudangai_api_url') || '').trim();
}
export function setApiUrl(url) {
  const c = (url || '').trim();
  if (c) localStorage.setItem('gudangai_api_url', c);
  else localStorage.removeItem('gudangai_api_url');
}
export function getApiSecret() {
  return (localStorage.getItem('gudangai_api_secret') || '').trim();
}
export function setApiSecret(secret) {
  const c = (secret || '').trim();
  if (c) localStorage.setItem('gudangai_api_secret', c);
  else localStorage.removeItem('gudangai_api_secret');
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function deviceId() {
  let id = localStorage.getItem('gudangai_device_id');
  if (!id) {
    id = 'RUDY-' + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    localStorage.setItem('gudangai_device_id', id);
  }
  return id;
}

let _idSeq = 0;
function newIds() {
  _idSeq += 1;
  const uuid = crypto.randomUUID
    ? crypto.randomUUID()
    : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const stamp = Date.now().toString(36) + '-' + _idSeq.toString(36);
  return {
    requestId: 'REQ-' + uuid + '-' + stamp,
    transactionId: 'TX-RUDY-' + uuid + '-' + stamp,
    nonce: 'NC-' + uuid + '-' + stamp,
  };
}

async function fetchWithRetry(url, options = {}, retries = RETRY_COUNT) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (attempt > 1) emitConn({ state: 'recovered', attempt });
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) {
        const wait = RETRY_BASE_MS * Math.pow(1.7, attempt - 1) + Math.random() * 200;
        await delay(wait);
      }
    }
  }
  emitConn({ state: 'failed', error: (lastError && lastError.message) || 'Gagal' });
  throw lastError;
}

async function postJson(payload) {
  const url = getApiUrl();
  if (!url) throw new Error('URL API belum diatur');
  const body = JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    secret: getApiSecret() || undefined,
    client: { app: 'gudangai-rudy-pwa', deviceId: deviceId() },
    ...payload,
  });
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
    redirect: 'follow',
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error('Respons bukan JSON: ' + text.slice(0, 120)); }
}

async function getJson(action, extraParams = {}) {
  const url = getApiUrl();
  if (!url) throw new Error('URL API belum diatur');
  const secret = getApiSecret();
  const q = new URLSearchParams({ action, ...extraParams });
  if (secret) q.set('secret', secret);
  const res = await fetchWithRetry(`${url}?${q.toString()}`, { method: 'GET', redirect: 'follow' });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error('Respons bukan JSON: ' + text.slice(0, 120)); }
}

function generateDemoStock(masterList) {
  return masterList.map((item) => ({
    ...item,
    stok: Math.floor(Math.random() * 100),
    lastUpdate: new Date().toISOString(),
  }));
}

export async function healthCheck() {
  if (!getApiUrl()) return { ok: false, offline: true, error: 'URL API belum diatur' };
  try {
    let data = null;
    let lastErr = null;
    try { data = await getJson('status'); } catch (e) { lastErr = e; }
    if (!data || (data.error && !data.success && data.status !== 'OK' && data.code !== 'UNAUTHORIZED')) {
      try { data = await postJson({ action: 'status', requestId: newIds().requestId }); }
      catch (e) { lastErr = e; }
    }
    if (data && data.code === 'UNAUTHORIZED') {
      return { ok: false, error: 'Unauthorized — isi API Secret di Atur', version: data.version };
    }
    if (data && (data.success === true || data.status === 'OK' || data.status === 'ok')) {
      return {
        ok: true,
        data: {
          status: 'ok',
          version: data.version || data.title || 'V6',
          timestamp: data.serverTime || data.time || data.timestamp || new Date().toISOString(),
          activeMonth: data.activeMonth,
          spreadsheet: data.spreadsheet || data.sheetName || data.title || '',
          raw: data,
        },
      };
    }
    return { ok: false, error: (data && (data.error || data.code)) || (lastErr && lastErr.message) || 'Respons tidak valid' };
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
  return {
    kode: it.kode,
    nama: it.nama || '',
    satuan: it.satuan || '',
    divisi: it.divisi || '',
    stok: Number(it.stockAkhir != null ? it.stockAkhir : it.stok) || 0,
    stockAman: Number(it.stockAman != null ? it.stockAman : it.aman) || 0,
    lastUpdate: new Date().toISOString(),
    entitas: it.entitas || entity,
  };
}

export async function fetchStock(entity) {
  const url = getApiUrl();
  if (!url) {
    const { getMasterByEntity } = await import('./master.js');
    return generateDemoStock(getMasterByEntity(entity));
  }
  try {
    let data;
    try { data = await getJson('getAllStock', { entitas: entity }); }
    catch {
      try { data = await postJson({ action: 'getAllStock', entitas: entity, requestId: newIds().requestId }); }
      catch { data = null; }
    }
    if (!data || (data.error && !data.items) || data.available) {
      try { data = await getJson('getStockAll', { entitas: entity }); } catch (_) {}
    }
    if (data && data.code === 'UNAUTHORIZED') throw new Error('Unauthorized — cek API Secret di Atur');
    if (data && data.error && !data.items && !Array.isArray(data.stock) && !Array.isArray(data.data)) {
      throw new Error(data.error);
    }
    const raw = (data && (data.items || data.stock || data.data)) || [];
    return raw.map((it) => mapStockItem(it, entity));
  } catch (err) {
    console.warn('fetchStock gagal:', err.message);
    if (/Unauthorized|API Secret|URL API/i.test(String(err.message || ''))) throw err;
    const { getMasterByEntity } = await import('./master.js');
    return generateDemoStock(getMasterByEntity(entity));
  }
}

function getAppliedMap() {
  try { return JSON.parse(localStorage.getItem(APPLIED_KEY) || '{}'); }
  catch { return {}; }
}

function pruneApplied(map) {
  const now = Date.now();
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    const ts = typeof v === 'number' ? v : 0;
    if (now - ts < APPLIED_TTL_MS) out[k] = ts;
  }
  return out;
}

function isApplied(clientItemId) {
  if (!clientItemId) return false;
  return !!getAppliedMap()[clientItemId];
}

function markApplied(clientItemId) {
  if (!clientItemId) return;
  const map = pruneApplied(getAppliedMap());
  map[clientItemId] = Date.now();
  localStorage.setItem(APPLIED_KEY, JSON.stringify(map));
}

function ensureClientItemId(it) {
  if (it && it.clientItemId) return it;
  const id = crypto.randomUUID
    ? crypto.randomUUID()
    : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  return { ...it, clientItemId: 'CI-' + id };
}

function enqueue(type, entity, items, meta = {}) {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  const pending = (items || []).map(ensureClientItemId).filter((it) => !isApplied(it.clientItemId));
  if (!pending.length) return { id: null, skipped: true, items: [] };
  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    type,
    entity,
    items: pending,
    tanggal: meta.tanggal || '',
    timestamp: new Date().toISOString(),
    synced: false,
  };
  queue.push(entry);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return entry;
}

const SHEET_MAP = {
  barangMasuk: 'Barang masuk',
  barangKeluar: 'Barang keluar',
  barangRusak: 'Barang Rusak',
};

async function submitOneItem(sheet, entity, it, tanggal) {
  const item = ensureClientItemId(it);
  const cid = item.clientItemId;
  if (isApplied(cid)) {
    return { success: true, skipped: true, kode: item.kode, clientItemId: cid };
  }
  const payload = {
    action: 'addTransaction',
    sheet,
    entitas: entity,
    kodeBarang: String(item.kode || '').trim(),
    qty: (function () {
      const n = Number(item.qty);
      return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
    })(),
    keterangan: String(item.keterangan || '').trim(),
    tanggal: tanggal || undefined,
    requestId: cid,
    transactionId: 'TX-' + cid,
    nonce: 'NC-' + cid,
  };
  const data = await postJson(payload);
  if (data && data.code === 'UNAUTHORIZED') {
    return { success: false, unauthorized: true, kode: item.kode, clientItemId: cid, error: 'Unauthorized' };
  }
  if (data && (data.status === 'DUPLICATE' || data.idempotent === true)) {
    markApplied(cid);
    return { success: true, skipped: true, kode: item.kode, clientItemId: cid, row: data.row };
  }
  if (data && (data.success === true || data.status === 'APPLIED' || data.status === 'OK')) {
    markApplied(cid);
    return {
      success: true,
      kode: payload.kodeBarang,
      qty: data.qty != null ? data.qty : payload.qty,
      row: data.row,
      status: data.status,
      clientItemId: cid,
    };
  }
  return {
    success: false,
    kode: item.kode,
    clientItemId: cid,
    error: data?.error || data?.code || 'Gagal menulis transaksi',
  };
}

async function submitTransaction(action, entity, items, options = {}) {
  const url = getApiUrl();
  const typeMap = { barangMasuk: 'masuk', barangKeluar: 'keluar', barangRusak: 'rusak' };
  if (!url) {
    const entry = enqueue(typeMap[action], entity, items, { tanggal: options.tanggal });
    return {
      success: false,
      offline: true,
      id: entry.id,
      error: 'URL API belum diatur di Atur. Transaksi disimpan antrian offline.',
    };
  }
  const sheet = SHEET_MAP[action];
  if (!sheet) return { success: false, offline: false, error: 'Aksi tidak dikenal' };
  const tanggal = options.tanggal || '';

  const normalized = (items || []).map(ensureClientItemId);
  const todo = normalized.filter((it) => !isApplied(it.clientItemId));
  const alreadyDone = normalized.length - todo.length;

  if (!todo.length) {
    return {
      success: true,
      offline: false,
      written: alreadyDone,
      skipped: alreadyDone,
      details: [],
      message: 'Semua item sudah tercatat sebelumnya (tidak dikirim ulang).',
    };
  }

  const written = [];
  const errors = [];
  const failedItems = [];

  // Sequential default — aman anti double-write (sync queue selalu sequential)
  for (let i = 0; i < todo.length; i++) {
    const it = todo[i];
    try {
      const res = await submitOneItem(sheet, entity, it, tanggal);
      if (res.unauthorized) {
        return {
          success: false,
          offline: false,
          written: written.length + alreadyDone,
          error: 'Unauthorized — isi API Secret di Atur',
          details: written,
        };
      }
      if (res.success) written.push(res);
      else {
        errors.push((res.kode || '?') + ': ' + (res.error || 'gagal'));
        failedItems.push(it);
      }
    } catch (err) {
      const msg = err.message || '';
      const isNetwork =
        !navigator.onLine || /Failed to fetch|NetworkError|Load failed|Timeout|HTTP 5/i.test(msg);
      if (isNetwork) {
        const rest = todo.slice(i).filter((x) => !isApplied(x.clientItemId));
        const entry = enqueue(typeMap[action], entity, rest, { tanggal });
        return {
          success: written.length > 0 || alreadyDone > 0,
          offline: true,
          id: entry.id,
          written: written.length + alreadyDone,
          error: 'Jaringan terputus — ' + rest.length + ' item di antrian (tanpa dobel).',
          details: written,
        };
      }
      errors.push((it.kode || '?') + ': ' + msg);
      failedItems.push(it);
    }
  }

  const totalDone = written.length + alreadyDone;
  const totalTarget = normalized.length;

  if (failedItems.length === 0) {
    return { success: true, offline: false, written: totalDone, skipped: alreadyDone, details: written };
  }

  const stillPending = failedItems.filter((it) => !isApplied(it.clientItemId));
  if (stillPending.length) enqueue(typeMap[action], entity, stillPending, { tanggal });

  return {
    success: false,
    offline: false,
    written: totalDone,
    error:
      'Sebagian gagal (' + totalDone + '/' + totalTarget + '). ' +
      errors.join('; ') +
      (stillPending.length ? ' · ' + stillPending.length + ' item diantre ulang.' : ''),
    details: written,
  };
}

export const submitBarangMasuk = (entity, items, options) =>
  submitTransaction('barangMasuk', entity, items, options || {});
export const submitBarangKeluar = (entity, items, options) =>
  submitTransaction('barangKeluar', entity, items, options || {});
export const submitBarangRusak = (entity, items, options) =>
  submitTransaction('barangRusak', entity, items, options || {});

export function getPendingQueue() {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]').filter((e) => !e.synced);
}

export async function syncPendingQueue() {
  const url = getApiUrl();
  if (!url || !navigator.onLine) return { synced: 0, failed: 0, skipped: true };
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  let synced = 0;
  let failed = 0;
  const actionMap = { masuk: 'barangMasuk', keluar: 'barangKeluar', rusak: 'barangRusak' };

  for (let i = 0; i < queue.length; i++) {
    if (queue[i].synced) continue;

    const pendingItems = (queue[i].items || [])
      .map(ensureClientItemId)
      .filter((it) => !isApplied(it.clientItemId));

    if (!pendingItems.length) {
      queue[i] = { ...queue[i], synced: true, syncedAt: new Date().toISOString(), items: [] };
      synced++;
      continue;
    }

    queue[i] = { ...queue[i], items: pendingItems };
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));

    const act = actionMap[queue[i].type] || 'barangMasuk';
    try {
      const res = await submitTransaction(act, queue[i].entity, pendingItems, {
        tanggal: queue[i].tanggal || '',
        fromQueue: true,
      });
      const still = pendingItems.filter((it) => !isApplied(it.clientItemId));
      if (still.length === 0) {
        queue[i] = { ...queue[i], synced: true, syncedAt: new Date().toISOString(), items: [] };
        synced++;
      } else {
        queue[i] = { ...queue[i], items: still, synced: false };
        failed++;
      }
      void res;
    } catch {
      failed++;
    }
  }

  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return { synced, failed, skipped: false };
}

export function getTransactionHistory() {
  return JSON.parse(localStorage.getItem('gudangai_history') || '[]');
}
export function saveToHistory(entry) {
  const h = getTransactionHistory();
  h.unshift({ ...entry, savedAt: new Date().toISOString() });
  if (h.length > 500) h.length = 500;
  localStorage.setItem('gudangai_history', JSON.stringify(h));
}
export function clearSyncedQueue() {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]').filter((e) => !e.synced);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  return q.length;
}
