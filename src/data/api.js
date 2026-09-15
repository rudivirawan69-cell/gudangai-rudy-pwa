/** GudangAI RUDY — API layer V6.4.15 write-once + write timeout 90s (batch 70–80 item) + soft queue notif (anti-duplikat) */
const RETRY_COUNT = 2;
const RETRY_BASE_MS = 400;
const REQUEST_TIMEOUT_MS = 12000;
/** Write path: timeout 90 detik agar batch besar (70–80 item) sempat selesai di server sebelum client abort. UI tombol tetap lepas ~4 detik. */
const WRITE_TIMEOUT_MS = 90000;
/** Chunk size for batch write: keep each POST small so 90s timeout is enough. Sequential write-once, no double. */
const BATCH_CHUNK_SIZE = 12;
const SCHEMA_VERSION = '1.0';
const APPLIED_KEY = 'gudangai_applied';
const QUEUE_KEY = 'gudangai_queue';
const APPLIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NOTIF_KEY = 'gudangai_notif';
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbwtSr7cdBKhvJOwwkSZ9GUf1ebuHOM8CsKXo1I6r8v0Z_gi4_ElrDK9oez8LX5DAB1INw/exec';
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
// NOTE: Full implementation continues — this is a bootstrap. See local artifacts for complete source with chunked write, postJsonWrite, fetchStock, submitPO, syncPendingQueue, markItemApplied, etc.
export function markItemApplied(clientItemId) {
  if (!clientItemId) return;
  try {
    const map = JSON.parse(localStorage.getItem(APPLIED_KEY) || '{}');
    map[clientItemId] = Date.now();
    localStorage.setItem(APPLIED_KEY, JSON.stringify(map));
  } catch {}
}
export function getPendingQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
export function removePendingByClientIds(ids) {
  if (!ids || !ids.length) return;
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    const set = new Set(ids);
    const next = q.map(e => ({ ...e, items: (e.items || []).filter(it => !set.has(it.clientItemId)) })).filter(e => (e.items || []).length);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  } catch {}
}
export async function syncPendingQueue() { return { synced: 0, failed: 0 }; }
export function saveToHistory() {}
export function pushNotification() {}
export async function submitPO(payload) { return { success: false, error: 'api.js partial — full restore pending' }; }
export async function fetchStock() { return []; }
export async function addTransactionBatch() { return { success: false }; }
export async function healthCheck() { return { ok: false }; }
export function getConnectionStatus() { return { status: 'configured', label: 'Partial restore', color: 'amber' }; }
