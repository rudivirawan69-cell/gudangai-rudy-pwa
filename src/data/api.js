// GudangAI API Layer V2.1 — text/plain POST for Apps Script CORS
const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 2000;

export function getApiUrl() { return (localStorage.getItem('gudangai_api_url') || '').trim(); }
export function setApiUrl(url) { const c = (url||'').trim(); if(c) localStorage.setItem('gudangai_api_url',c); else localStorage.removeItem('gudangai_api_url'); }

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, options = {}, retries = RETRY_COUNT) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try { const res = await fetch(url, options); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res; }
    catch (err) { lastError = err; if (attempt < retries) await delay(RETRY_DELAY_MS); }
  }
  throw lastError;
}

function generateDemoStock(masterList) {
  return masterList.map(item => ({ ...item, stok: Math.floor(Math.random() * 100), lastUpdate: new Date().toISOString() }));
}

export async function healthCheck() {
  const url = getApiUrl();
  if (!url) return { ok: false, offline: true, error: 'URL API belum diatur' };
  try {
    const res = await fetchWithRetry(`${url}?action=healthCheck`, { method: 'GET' });
    const data = await res.json();
    return data.status === 'ok' ? { ok: true, data } : { ok: false, error: data.error || 'Respons tidak valid' };
  } catch (err) { return { ok: false, error: err.message || 'Gagal terhubung' }; }
}

export function getConnectionStatus() {
  const url = getApiUrl();
  if (!url) return { status: 'unset', label: 'Belum diatur', color: 'gray' };
  if (!navigator.onLine) return { status: 'offline', label: 'Mode Offline', color: 'red' };
  return { status: 'configured', label: 'URL terkonfigurasi', color: 'green' };
}

export async function fetchStock(entity) {
  const url = getApiUrl();
  if (!url) { const { getMasterByEntity } = await import('./master.js'); return generateDemoStock(getMasterByEntity(entity)); }
  try {
    const res = await fetchWithRetry(`${url}?action=getStock&entity=${encodeURIComponent(entity)}`, { method: 'GET' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.items || [];
  } catch (err) {
    console.warn('fetchStock gagal:', err.message);
    const { getMasterByEntity } = await import('./master.js');
    return generateDemoStock(getMasterByEntity(entity));
  }
}

function enqueue(type, entity, items) {
  const queue = JSON.parse(localStorage.getItem('gudangai_queue') || '[]');
  const entry = { id: crypto.randomUUID(), type, entity, items, timestamp: new Date().toISOString(), synced: false };
  queue.push(entry);
  localStorage.setItem('gudangai_queue', JSON.stringify(queue));
  return entry;
}

async function submitTransaction(action, entity, items) {
  const url = getApiUrl();
  const typeMap = { barangMasuk: 'masuk', barangKeluar: 'keluar', barangRusak: 'rusak' };
  if (!url) { return { success: true, offline: true, id: enqueue(typeMap[action], entity, items).id }; }

  // text/plain menghindari CORS preflight (OPTIONS) yang sering gagal di Apps Script
  const body = JSON.stringify({ action, entity, items });
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
    redirect: 'follow',
  };

  try {
    const res = await fetchWithRetry(url, opts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch {
      throw new Error('Server tidak mengembalikan JSON. Cek deploy Apps Script (Anyone). Respons: ' + text.slice(0, 120));
    }
    if (data.error) throw new Error(data.error);
    if (data.success === false) throw new Error(data.message || data.error || 'Gagal menulis ke spreadsheet');
    return { success: true, offline: false, ...data };
  } catch (err) {
    const msg = err.message || '';
    const isNetwork = !navigator.onLine || /Failed to fetch|NetworkError|Load failed|HTTP 5/i.test(msg);
    if (isNetwork) {
      return { success: true, offline: true, id: enqueue(typeMap[action], entity, items).id, error: msg };
    }
    return { success: false, offline: false, error: msg };
  }
}

export const submitBarangMasuk = (entity, items) => submitTransaction('barangMasuk', entity, items);
export const submitBarangKeluar = (entity, items) => submitTransaction('barangKeluar', entity, items);
export const submitBarangRusak = (entity, items) => submitTransaction('barangRusak', entity, items);

export function getPendingQueue() { return JSON.parse(localStorage.getItem('gudangai_queue') || '[]').filter(e => !e.synced); }

export async function syncPendingQueue() {
  const url = getApiUrl();
  if (!url || !navigator.onLine) return { synced: 0, failed: 0, skipped: true };
  const queue = JSON.parse(localStorage.getItem('gudangai_queue') || '[]');
  let synced = 0, failed = 0;
  const actionMap = { masuk: 'barangMasuk', keluar: 'barangKeluar', rusak: 'barangRusak' };
  for (let i = 0; i < queue.length; i++) {
    if (queue[i].synced) continue;
    try {
      const res = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: actionMap[queue[i].type] || 'barangMasuk', entity: queue[i].entity, items: queue[i].items }) });
      const text = await res.text();
      const data = JSON.parse(text);
      if (data.error) throw new Error(data.error);
      queue[i] = { ...queue[i], synced: true, syncedAt: new Date().toISOString() };
      synced++;
    } catch { failed++; }
  }
  localStorage.setItem('gudangai_queue', JSON.stringify(queue));
  return { synced, failed, skipped: false };
}

export function getTransactionHistory() { return JSON.parse(localStorage.getItem('gudangai_history') || '[]'); }
export function saveToHistory(entry) {
  const h = getTransactionHistory();
  h.unshift({ ...entry, savedAt: new Date().toISOString() });
  if (h.length > 500) h.length = 500;
  localStorage.setItem('gudangai_history', JSON.stringify(h));
}
export function clearSyncedQueue() {
  const q = JSON.parse(localStorage.getItem('gudangai_queue') || '[]').filter(e => !e.synced);
  localStorage.setItem('gudangai_queue', JSON.stringify(q));
  return q.length;
}
