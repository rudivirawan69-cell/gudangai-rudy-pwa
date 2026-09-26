/** GudangAI RUDY — API layer V6.6.3 FULL SYNC — selaras Code.gs OPTIMIZED BULK */
/** BUILD 2026-09-21: HOLD pendek, Dashboard PC, bulkTransaction, chunk 15, timeout 150s, sheet resmi */
const RETRY_COUNT = 2;
const RETRY_BASE_MS = 400;
const REQUEST_TIMEOUT_MS = 12000;
const WRITE_TIMEOUT_MS = 150000;
const QUEUE_KEY = 'gudangai_pending_queue';
const APPLIED_KEY = 'gudangai_applied_map';
const APPLIED_TTL_MS = 7 * 24 * 3600 * 1000;
const HISTORY_KEY = 'gudangai_tx_history';
const NOTIF_KEY = 'gudangai_notifications';

export function localDateYMD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function newIds() {
  const requestId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : ('REQ-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9));
  return { requestId, clientItemId: 'CI-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9) };
}

const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbzTN_W44k-llBaTba7yMlK5RARIqJCMi3Rt8jBtyOmKTnqdrG7IQeDmH0V2gtyVAyk-xQ/exec';

export function getApiUrl() {
  try {
    const u = localStorage.getItem('gudangai_api_url');
    if (u && u.startsWith('http')) return u;
  } catch (_) {}
  try { localStorage.setItem('gudangai_api_url', DEFAULT_API_URL); } catch (_) {}
  return DEFAULT_API_URL;
}

export function setApiUrl(url) {
  if (url && String(url).startsWith('http')) localStorage.setItem('gudangai_api_url', String(url).trim());
  else localStorage.setItem('gudangai_api_url', DEFAULT_API_URL);
}

export function getApiSecret() {
  try { return localStorage.getItem('gudangai_api_secret') || ''; } catch { return ''; }
}
export function setApiSecret(s) {
  try { localStorage.setItem('gudangai_api_secret', String(s || '')); } catch (_) {}
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function postJson(payload, { retries = RETRY_COUNT, timeoutMs = REQUEST_TIMEOUT_MS, emitFailure = true } = {}) {
  const url = getApiUrl();
  const secret = getApiSecret();
  const body = { ...(payload || {}), secret: secret || undefined };
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow',
      }, timeoutMs);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('Respons bukan JSON: ' + text.slice(0, 120)); }
      if (data && data.success === false && /unauthorized|secret/i.test(String(data.error || data.message || ''))) {
        const err = new Error(data.error || data.message || 'Unauthorized');
        err.code = 'UNAUTHORIZED';
        throw err;
      }
      return data;
    } catch (err) {
      lastErr = err;
      if (i < retries) await sleep(RETRY_BASE_MS * (i + 1));
    }
  }
  if (emitFailure) {
    try { window.dispatchEvent(new CustomEvent('gudangai-api-failure', { detail: lastErr })); } catch (_) {}
  }
  throw lastErr || new Error('Gagal menghubungi API');
}

async function postJsonWrite(payload) {
  return postJson(payload, { retries: 1, timeoutMs: WRITE_TIMEOUT_MS, emitFailure: false });
}

async function getJson(action) {
  const url = getApiUrl();
  const secret = getApiSecret();
  const q = new URLSearchParams({ action });
  if (secret) q.set('secret', secret);
  const res = await fetchWithTimeout(url + '?' + q.toString(), { method: 'GET', redirect: 'follow' }, REQUEST_TIMEOUT_MS);
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error('Respons bukan JSON: ' + text.slice(0, 120)); }
}

export async function healthCheck() {
  try {
    const data = await postJson({ action: 'ping', requestId: newIds().requestId }, { retries: 0, timeoutMs: 8000 });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err?.message || 'Health check gagal' };
  }
}

export function getConnectionStatus() { return { online: navigator.onLine, apiUrl: getApiUrl() }; }

function normalizeQueue(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((x) => x && (x.clientItemId || x.kode || x.kodeBarang));
}

function getAppliedMap() {
  try { return JSON.parse(localStorage.getItem(APPLIED_KEY) || '{}'); } catch { return {}; }
}
function pruneApplied(map) {
  const now = Date.now();
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    if (now - (typeof v === 'number' ? v : 0) < APPLIED_TTL_MS) out[k] = v;
  }
  return out;
}
function isApplied(clientItemId) { return !!(clientItemId && getAppliedMap()[clientItemId]); }
function markApplied(clientItemId) {
  if (!clientItemId) return;
  const map = pruneApplied(getAppliedMap());
  map[clientItemId] = Date.now();
  localStorage.setItem(APPLIED_KEY, JSON.stringify(map));
}

export async function fetchStock(entity, options = {}) {
  const allowDemo = options.allowDemo !== false;
  try {
    let data = null;
    try {
      data = await getJson('getAllStock');
    } catch (_) {
      data = null;
    }
    if (!data || data.success === false) {
      try { data = await postJson({ action: 'getAllStock', entitas: entity || 'ALL', requestId: newIds().requestId }); }
      catch (e2) {
        if (!allowDemo) throw e2;
        return { cv: [], pt: [], demo: true };
      }
    }
    return data;
  } catch (err) {
    if (!allowDemo) throw err;
    return { cv: [], pt: [], demo: true, error: err?.message };
  }
}

export async function getStatusPO() {
  try {
    let data = null;
    try { data = await getJson('getStatusPO'); } catch (_) { data = null; }
    if (!data || data.success === false) {
      try { data = await postJson({ action: 'getStatusPO', requestId: newIds().requestId }); }
      catch (e2) {
        return { success: false, error: e2?.message || 'Gagal mengambil status PO' };
      }
    }
    return data || { success: false, error: 'Respons status PO kosong' };
  } catch (err) {
    return { success: false, error: err?.message || 'Gagal mengambil status PO' };
  }
}

/** Konfirmasi status 1 baris PO → sinkron sheet Purchase Order + Dashboard */
export async function confirmPOStatus(payload) {
  try {
    const body = {
      action: 'confirmPOStatus',
      noPO: payload?.noPO || payload?.no || '',
      nama: payload?.nama || payload?.name || '',
      status: String(payload?.status || 'SELESAI').toUpperCase(),
      rowIndex: payload?.rowIndex ?? payload?.row ?? null,
      qty: Number(payload?.qty) || 0,
      datang: Number(payload?.datang) || 0,
      requestId: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('POCF-' + Date.now()),
    };
    const data = await postJsonWrite(body);
    return data || { success: false, error: 'Respons konfirmasi PO kosong' };
  } catch (err) {
    return { success: false, error: err?.message || 'Gagal konfirmasi status PO' };
  }
}

export async function getDashboardData() {
  try {
    return await postJson({ action: 'getDashboardData', requestId: newIds().requestId });
  } catch (err) {
    return { success: false, error: err?.message };
  }
}

export function markItemApplied(clientItemId) { markApplied(clientItemId); }

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function submitTransaction(type, entityOrPayload, itemsMaybe, optionsMaybe) {
  let entity = 'CV';
  let items = [];
  let options = {};
  if (entityOrPayload && typeof entityOrPayload === 'object' && !Array.isArray(entityOrPayload) && entityOrPayload.items) {
    entity = entityOrPayload.entity || entityOrPayload.entitas || 'CV';
    items = entityOrPayload.items || [];
    options = itemsMaybe || {};
  } else {
    entity = entityOrPayload || 'CV';
    items = itemsMaybe || [];
    options = optionsMaybe || {};
  }
  const tanggal = options.tanggal || localDateYMD();
  const list = (items || []).map((it) => ({
    ...it,
    kodeBarang: it.kodeBarang || it.kode,
    qty: Number(it.qty) || 0,
    keterangan: it.keterangan || '',
    clientItemId: it.clientItemId || newIds().clientItemId,
  })).filter((it) => it.kodeBarang && it.qty > 0);

  if (!list.length) return { success: false, error: 'Tidak ada item valid' };

  // Single item fast path
  if (list.length === 1) {
    const it = list[0];
    const cid = it.clientItemId;
    if (isApplied(cid)) return { success: true, skipped: true, kode: it.kodeBarang, clientItemId: cid };
    const payload = {
      action: type,
      entitas: entity,
      entity,
      tanggal,
      kodeBarang: it.kodeBarang,
      qty: it.qty,
      keterangan: it.keterangan || '',
      clientItemId: cid,
      transactionId: 'TX-' + cid,
      requestId: newIds().requestId,
    };
    const data = await postJsonWrite(payload);
    if (data && data.success !== false) { markApplied(cid); return { success: true, ...data, clientItemId: cid }; }
    if (data && (data.status === 'DUPLICATE' || data.idempotent === true)) { markApplied(cid); return { success: true, skipped: true, kode: payload.kodeBarang, clientItemId: cid }; }
    return data || { success: false, error: 'Gagal tulis transaksi' };
  }

  // Batch
  const chunks = chunkArray(list, 15);
  const results = [];
  for (const chunk of chunks) {
    const pending = chunk.filter((it) => !isApplied(it.clientItemId));
    if (!pending.length) {
      results.push({ success: true, skipped: true, count: chunk.length });
      continue;
    }
    const transactions = pending.map((it) => {
      const cid = it.clientItemId;
      return {
        action: type,
        entitas: entity,
        entity,
        tanggal,
        kodeBarang: it.kodeBarang,
        qty: it.qty,
        keterangan: it.keterangan || '',
        clientItemId: cid,
        transactionId: 'TX-' + cid,
      };
    });
    const batchPayload = {
      action: 'bulkTransaction',
      entitas: entity,
      entity,
      tanggal,
      transactions,
      items: transactions,
      requestId: newIds().requestId,
      queueApproved: true,
    };
    let batchRes;
    try {
      batchRes = await postJsonWrite(batchPayload);
    } catch (err) {
      // queue fallback
      try {
        const q = normalizeQueue(JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'));
        for (const it of pending) q.push({ ...it, type, entity, tanggal });
        localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
      } catch (_) {}
      results.push({ success: false, error: err?.message, queued: true });
      continue;
    }
    if (batchRes && batchRes.success !== false) {
      for (const it of pending) markApplied(it.clientItemId);
      results.push(batchRes);
    } else {
      results.push(batchRes || { success: false });
    }
  }
  return { success: true, results, count: list.length };
}

export const submitBarangMasuk = (entity, items, options) => {
  if (entity && typeof entity === 'object' && entity.items) return submitTransaction('barangMasuk', entity);
  return submitTransaction('barangMasuk', entity, items, options || {});
};
export const submitBarangKeluar = (entity, items, options) => {
  if (entity && typeof entity === 'object' && entity.items) return submitTransaction('barangKeluar', entity);
  return submitTransaction('barangKeluar', entity, items, options || {});
};
export const submitBarangRusak = (entity, items, options) => {
  if (entity && typeof entity === 'object' && entity.items) return submitTransaction('barangRusak', entity);
  return submitTransaction('barangRusak', entity, items, options || {});
};

export function getPendingQueue() { try { return normalizeQueue(JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')); } catch { return []; } }
export function removePendingByClientIds(ids) {
  const set = new Set(ids || []);
  try {
    const q = normalizeQueue(JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')).filter((x) => !set.has(x.clientItemId));
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch (_) {}
}
export function clearPendingQueue() { localStorage.setItem(QUEUE_KEY, '[]'); }

export function saveToHistory(entry) {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    h.unshift(entry);
    if (h.length > 100) h.length = 100;
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
