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
export async function postJson(payload, { retries = RETRY_COUNT, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
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
export async function getJson(action, extraParams = {}) {
  const url = getApiUrl();
  if (!url) throw new Error('URL API belum diatur');
  const secret = getApiSecret();
  const q = new URLSearchParams({ action, ...extraParams });
  if (secret) q.set('secret', secret);
  const res = await fetchWithRetry(url + '?' + q.toString(), { method: 'GET', redirect: 'follow' });
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error('Respons bukan JSON'); }
}
