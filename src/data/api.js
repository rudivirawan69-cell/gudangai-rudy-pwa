/** GudangAI RUDY — API layer V6.7.1 stable-chunk (BATCH=30) + tanggal YYYY-MM-DD */
const RETRY_COUNT = 2;
const RETRY_BASE_MS = 400;
const REQUEST_TIMEOUT_MS = 15000;
/** Chunk agar Apps Script + spreadsheet selesai < timeout (anti-antrian). */
const BULK_CHUNK_SIZE = 30;
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxVpw0_waeCautJTG0R-jZQKBoxjTLXl5PGYCUBULccKhW8IQAoGRQFEqaCy6MkcnZqlQ/exec';
const DEFAULT_API_SECRET = 'adadd47759234a7f94acb230c0cc7ff479c4e4f79a674714';
const LS_API_URL = 'gudangai_api_url';
const LS_API_SECRET = 'gudangai_api_secret';
const LS_QUEUE = 'gudangai_offline_queue';
const LS_HISTORY = 'gudangai_tx_history';
const LS_NOTIF = 'gudangai_notifications';
const LS_APPLIED = 'gudangai_applied_ids';

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
function newIds() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return { requestId: `REQ-${t}-${r}`, clientItemId: `CLI-${t}-${r}` };
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

export function getApiUrl() {
  try {
    const v = localStorage.getItem(LS_API_URL);
    if (v && v.startsWith('http')) return v;
  } catch (_) {}
  return DEFAULT_API_URL;
}
export function setApiUrl(url) {
  try { localStorage.setItem(LS_API_URL, String(url || '').trim()); } catch (_) {}
}
export function getApiSecret() {
  try {
    const v = localStorage.getItem(LS_API_SECRET);
    if (v) return v;
  } catch (_) {}
  return DEFAULT_API_SECRET;
}
export function setApiSecret(secret) {
  try { localStorage.setItem(LS_API_SECRET, String(secret || '').trim()); } catch (_) {}
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
  throw lastError || new Error('Network error');
}

export async function postJson(payload, { retries = RETRY_COUNT, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const url = getApiUrl();
  const body = { ...payload, secret: getApiSecret() };
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  }, retries, timeoutMs);
  const text = await res.text();
  try { return JSON.parse(text); } catch {
    throw new Error('Invalid JSON response');
  }
}

export async function getJson(action, extraParams = {}) {
  const url = new URL(getApiUrl());
  url.searchParams.set('action', action);
  url.searchParams.set('secret', getApiSecret());
  for (const [k, v] of Object.entries(extraParams || {})) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetchWithRetry(url.toString(), { method: 'GET' });
  const text = await res.text();
  try { return JSON.parse(text); } catch {
    throw new Error('Invalid JSON response');
  }
}

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}
function writeLS(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
}

export async function hydrateOfflineQueue() {
  return readLS(LS_QUEUE, []);
}

export async function healthCheck() {
  try {
    const data = await getJson('ping');
    return { ok: data?.success === true || data?.code === 'HEALTHY', data };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export function getWriteCircuitState() {
  return { open: false, failures: 0 };
}

export async function fetchStock(entity) {
  const ent = String(entity || 'CV').toUpperCase();
  try {
    const data = await getJson('getStock', { entity: ent, entitas: ent });
    const items = data?.items || data?.stock || data?.data || [];
    return { success: true, items: Array.isArray(items) ? items : [], raw: data };
  } catch (err) {
    return { success: false, items: [], error: err?.message || String(err) };
  }
}

export async function getStatusPO() {
  try {
    const data = await getJson('getStatusPO');
    return data;
  } catch (err) {
    return { success: false, items: [], error: err?.message || String(err) };
  }
}

export async function confirmPOStatus({ itemNo, nama, status, qtyDatang, keterangan, requestId } = {}) {
  const rid = requestId || newIds().requestId;
  try {
    const data = await postJson({
      action: 'confirmPOStatus',
      requestId: rid,
      itemNo,
      nama,
      status,
      qtyDatang: Number(qtyDatang) || 0,
      keterangan: keterangan || '',
    });
    return data;
  } catch (err) {
    return { success: false, error: err?.message || String(err), requestId: rid };
  }
}

export function getPendingQueue() {
  return readLS(LS_QUEUE, []);
}

export function removePendingByClientIds(ids) {
  const set = new Set((ids || []).map(String));
  const q = readLS(LS_QUEUE, []).filter((e) => !set.has(String(e.clientItemId || e.id)));
  writeLS(LS_QUEUE, q);
  return q;
}

export function clearSyncedQueue() {
  writeLS(LS_QUEUE, []);
}

export function markItemApplied(clientItemId) {
  const list = readLS(LS_APPLIED, []);
  if (clientItemId && !list.includes(clientItemId)) {
    list.push(clientItemId);
    writeLS(LS_APPLIED, list.slice(-500));
  }
}

export function saveToHistory(entry) {
  const hist = readLS(LS_HISTORY, []);
  hist.unshift({ ...entry, at: entry.at || Date.now() });
  writeLS(LS_HISTORY, hist.slice(0, 200));
}

export function getLocalHistory() {
  return readLS(LS_HISTORY, []);
}

export async function getTransactionHistory() {
  return getLocalHistory();
}

export async function fetchRemoteTransactionHistory() {
  try {
    const data = await getJson('getTransactionHistory');
    return data;
  } catch (err) {
    return { success: false, items: [], error: err?.message || String(err) };
  }
}

export function pushNotification(notif) {
  const list = readLS(LS_NOTIF, []);
  list.unshift({ ...notif, id: notif.id || newIds().clientItemId, at: Date.now(), read: false });
  writeLS(LS_NOTIF, list.slice(0, 100));
}

export function getNotifications() {
  return readLS(LS_NOTIF, []);
}

export function markNotificationsRead() {
  const list = readLS(LS_NOTIF, []).map((n) => ({ ...n, read: true }));
  writeLS(LS_NOTIF, list);
}

export function unreadNotificationCount() {
  return readLS(LS_NOTIF, []).filter((n) => !n.read).length;
}

function enqueue(type, entity, items, meta = {}) {
  const queue = readLS(LS_QUEUE, []);
  const fresh = (items || []).map((it) => ({
    ...it,
    clientItemId: it.clientItemId || newIds().clientItemId,
  }));
  queue.push({
    id: 'Q-' + Date.now(),
    type,
    entity,
    items: fresh,
    tanggal: normalizeTanggal(meta.tanggal),
    createdAt: Date.now(),
  });
  writeLS(LS_QUEUE, queue);
  return { success: false, queued: true, queuedCount: fresh.length, items: fresh };
}

async function submitBulk(type, entity, tanggal, items) {
  const sheetMap = { masuk: 'Barang masuk', keluar: 'Barang keluar', rusak: 'Barang rusak' };
  const sheetName = sheetMap[type] || 'Barang keluar';
  const normalized = (items || []).map((it) => ({
    kode: it.kode,
    nama: it.nama,
    qty: Number(it.qty) || 0,
    satuan: it.satuan || '',
    keterangan: it.keterangan || '',
    clientItemId: it.clientItemId || newIds().clientItemId,
  }));
  const tgl = normalizeTanggal(tanggal);
  const results = [];
  let successCount = 0;
  let failed = 0;
  for (let i = 0; i < normalized.length; i += BULK_CHUNK_SIZE) {
    const chunk = normalized.slice(i, i + BULK_CHUNK_SIZE);
    const payload = {
      action: 'bulkTransaction',
      sheet: sheetName,
      entitas: String(entity || '').toUpperCase(),
      tanggal: tgl,
      items: chunk,
      requestId: newIds().requestId,
    };
    try {
      const data = await postJson(payload, { timeoutMs: 60000 });
      const chunkResults = data?.results || [];
      if (chunkResults.length) {
        for (const r of chunkResults) {
          results.push(r);
          if (r?.success || r?.skipped) successCount++;
          else failed++;
        }
      } else if (data?.success !== false) {
        for (const it of chunk) {
          results.push({ clientItemId: it.clientItemId, success: true });
          successCount++;
        }
      } else {
        for (const it of chunk) {
          results.push({ clientItemId: it.clientItemId, success: false, error: data?.error || 'failed' });
          failed++;
        }
      }
    } catch (err) {
      enqueue(type, entity, chunk, { tanggal: tgl });
      for (const it of chunk) {
        results.push({ clientItemId: it.clientItemId, success: false, queued: true, error: err?.message });
      }
      failed += chunk.length;
    }
  }
  return {
    success: failed === 0,
    count: successCount,
    failed,
    results,
    queuedCount: results.filter((r) => r.queued).length,
  };
}

export async function submitBarangMasuk({ entity, tanggal, items } = {}) {
  return submitBulk('masuk', entity, tanggal, items);
}
export async function submitBarangKeluar({ entity, tanggal, items } = {}) {
  return submitBulk('keluar', entity, tanggal, items);
}
export async function submitBarangRusak({ entity, tanggal, items } = {}) {
  return submitBulk('rusak', entity, tanggal, items);
}

export async function syncPendingQueue() {
  const queue = readLS(LS_QUEUE, []);
  if (!queue.length) return { success: true, synced: 0 };
  let synced = 0;
  const remain = [];
  for (const entry of queue) {
    try {
      const res = await submitBulk(entry.type, entry.entity, entry.tanggal, entry.items);
      if (res.failed === 0) synced += entry.items?.length || 0;
      else remain.push(entry);
    } catch {
      remain.push(entry);
    }
  }
  writeLS(LS_QUEUE, remain);
  return { success: remain.length === 0, synced, remaining: remain.length };
}

export async function processQueue() {
  return syncPendingQueue();
}

export async function generatePO(payload = {}) {
  try {
    return await postJson({ action: 'generatePO', ...payload, requestId: newIds().requestId });
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function submitPO(payload = {}) {
  try {
    return await postJson({ action: 'submitPO', ...payload, requestId: newIds().requestId });
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}
