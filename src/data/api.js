/** GudangAI RUDY — API layer: sequential write-once + progress + tanggal YYYY-MM-DD
 *  Bulk multi-item pernah stuck; sequential 1 item/request (sama seperti single yang sudah terbukti)
 *  tetap memakai transactionId/clientItemId agar tidak duplikat, progress Mengirim X/Y, gagal → antrian.
 */
const RETRY_COUNT = 2;
const RETRY_BASE_MS = 400;
const REQUEST_TIMEOUT_MS = 15000;
/** 1 item per request — stabil (single sudah terbukti menulis sheet). Progress tetap ditampilkan. */
const BULK_CHUNK_SIZE = 8;
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
    if (v != null) url.searchParams.set(k, String(v));
  }
  const res = await fetchWithRetry(url.toString(), { method: 'GET' }, RETRY_COUNT, REQUEST_TIMEOUT_MS);
  const text = await res.text();
  try { return JSON.parse(text); } catch {
    throw new Error('Invalid JSON response');
  }
}

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (_) { return fallback; }
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
    return { success: true, ...data };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function fetchStock(entity, options = {}) {
  try {
    const data = await getJson('getAllStock', { entity: String(entity || '').toUpperCase() });
    return data;
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function getStatusPO() {
  try {
    return await getJson('getStatusPO');
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function getDashboardData() {
  try {
    return await getJson('getDashboard');
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function confirmPOStatus({ itemNo, nama, status, qtyDatang, keterangan, requestId } = {}) {
  try {
    return await postJson({
      action: 'confirmPOStatus',
      itemNo, nama, status, qtyDatang, keterangan,
      requestId: requestId || newIds().requestId,
    }, { retries: 1, timeoutMs: 20000 });
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function saveToHistory(entry) {
  const list = readLS(LS_HISTORY, []);
  list.unshift({ ...entry, id: entry.id || newIds().clientItemId, at: entry.at || Date.now() });
  writeLS(LS_HISTORY, list.slice(0, 200));
}

export function getLocalHistory() {
  return readLS(LS_HISTORY, []);
}

export async function getTransactionHistory() {
  return getLocalHistory();
}

export async function fetchRemoteTransactionHistory() {
  try {
    return await getJson('getTransactionHistory');
  } catch (err) {
    return { success: false, error: err?.message || String(err), items: [] };
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
    kode: it.kode || it.kodeBarang,
    nama: it.nama,
    qty: Number(it.qty) || 0,
    satuan: it.satuan || '',
    keterangan: it.keterangan || '',
    clientItemId: it.clientItemId || newIds().clientItemId,
  })).filter((it) => it.kode && Number(it.qty) > 0);
  const tgl = normalizeTanggal(tanggal);
  const results = [];
  let successCount = 0;
  let failed = 0;
  const ent = String(entity || '').toUpperCase();
  const total = normalized.length;

  // Progress awal
  try {
    window.dispatchEvent(new CustomEvent('gudangai-submit-progress', { detail: { sent: 0, total, success: 0, failed: 0 } }));
  } catch (_) {}

  for (let i = 0; i < total; i += BULK_CHUNK_SIZE) {
    const chunk = normalized.slice(i, i + BULK_CHUNK_SIZE);
    const wire = chunk.map((it) => ({
      kodeBarang: String(it.kode || '').trim(),
      qty: Number(it.qty) || 0,
      keterangan: String(it.keterangan || '').trim().slice(0, 200),
      requestId: 'REQ-' + String(it.clientItemId),
      transactionId: 'TX-' + String(it.clientItemId),
      nonce: 'NC-' + String(it.clientItemId),
    }));
    const payload = {
      action: 'bulkTransaction',
      sheet: sheetName,
      entitas: ent,
      entity: ent,
      tanggal: tgl,
      transactions: wire,
      items: wire,
      queueApproved: true,
      batchId: 'BATCH-' + String(chunk[0]?.clientItemId || newIds().requestId),
      requestId: 'REQ-' + String(chunk[0]?.clientItemId || newIds().requestId),
    };
    try {
      const data = await postJson(payload, { retries: 1, timeoutMs: 12000 });
      const rawResults = data?.results || data?.data?.results || [];
      const isOkStatus = (r) =>
        r?.success === true || r?.skipped === true ||
        r?.status === 'APPLIED' || r?.status === 'OK' || r?.status === 'SUCCESS' || r?.status === 'DUPLICATE';

      if (Array.isArray(rawResults) && rawResults.length) {
        for (let j = 0; j < chunk.length; j++) {
          const it = chunk[j];
          const r = rawResults[j] || rawResults.find((x) =>
            String(x?.transactionId || '') === 'TX-' + it.clientItemId ||
            String(x?.clientItemId || '') === String(it.clientItemId)
          ) || {};
          if (isOkStatus(r) || (data?.success === true && rawResults.length === 1)) {
            results.push({ clientItemId: it.clientItemId, success: true, ...r });
            successCount++;
          } else if (data?.success === true && (data?.successCount == null || Number(data.successCount) >= chunk.length)) {
            results.push({ clientItemId: it.clientItemId, success: true });
            successCount++;
          } else {
            results.push({ clientItemId: it.clientItemId, success: false, error: r?.error || data?.error || 'failed' });
            failed++;
            enqueue(type, entity, [it], { tanggal: tgl });
          }
        }
      } else if (data?.success === true || data?.written === true || (data?.success !== false && data?.status === 'OK')) {
        for (const it of chunk) {
          results.push({ clientItemId: it.clientItemId, success: true });
          successCount++;
        }
      } else {
        for (const it of chunk) {
          results.push({ clientItemId: it.clientItemId, success: false, error: data?.error || 'failed' });
          failed++;
        }
        enqueue(type, entity, chunk, { tanggal: tgl });
      }
    } catch (err) {
      enqueue(type, entity, chunk, { tanggal: tgl });
      for (const it of chunk) {
        results.push({ clientItemId: it.clientItemId, success: false, queued: true, error: err?.message || 'timeout/network' });
      }
      failed += chunk.length;
    }
    try {
      window.dispatchEvent(new CustomEvent('gudangai-submit-progress', {
        detail: { sent: Math.min(i + chunk.length, total), total, success: successCount, failed }
      }));
    } catch (_) {}
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
  if (!queue.length) return { success: true, processed: 0 };
  let processed = 0;
  const remaining = [];
  for (const entry of queue) {
    try {
      const res = await submitBulk(entry.type, entry.entity, entry.tanggal, entry.items);
      if (res.success || (res.count > 0 && res.failed === 0)) {
        processed += entry.items?.length || 0;
      } else {
        remaining.push(entry);
      }
    } catch (_) {
      remaining.push(entry);
    }
  }
  writeLS(LS_QUEUE, remaining);
  return { success: true, processed, remaining: remaining.length };
}

export async function processQueue() {
  return syncPendingQueue();
}

export async function generatePO(payload = {}) {
  try {
    return await postJson({ action: 'generatePO', ...payload }, { retries: 1, timeoutMs: 30000 });
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function submitPO(payload = {}) {
  try {
    return await postJson({ action: 'submitPO', ...payload, requestId: payload.requestId || newIds().requestId }, { retries: 1, timeoutMs: 45000 });
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}
