/** GudangAI RUDY — API layer V6.7.2 stable-chunk (BATCH=20) + queue serial fallback + tanggal YYYY-MM-DD */
/** PRODUCTION-WRITE-RECOVERY-2026-10-05: canonical main build marker; preserve CV/PT write path and 20-item batching. */
const RETRY_COUNT = 2;
const RETRY_BASE_MS = 400;
const REQUEST_TIMEOUT_MS = 15000;
/** Chunk aman agar Apps Script + spreadsheet selesai < timeout (anti-antrian). 20 item per POST. */
const BATCH_CHUNK_SIZE = 35;
const BATCH_TIMEOUT_MS = 120000;
const SINGLE_TIMEOUT_MS = 60000;
const SCHEMA_VERSION = '1.0';
// Izinkan backend 6.6.5+ BULK-STABLE dan 7.0.x PERFORMANCE / RECONSTRUCTION (write path terkunci Stock CV/PT).
const SAFE_WRITE_BACKEND_RE = /STOCK-READONLY|STOCK-SOURCE-LOCKED|6\.6\.5\+?(?:BULK[-_]?STABLE|DEPLOY[-_]?READY)|6\.6\.[5-9]|V?6\.6\.[5-9]|7\.0\.\d+|PERFORMANCE[-_]?CANDIDATE|RECONSTRUCTION|BULK[-_]?STABLE|DEPLOY[-_]?READY/i;

const APPLIED_KEY = 'gudangai_applied';
const QUEUE_KEY = 'gudangai_queue';
const APPLIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NOTIF_KEY = 'gudangai_notif';
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxVpw0_waeCautJTG0R-jZQKBoxjTLXl5PGYCUBULccKhW8IQAoGRQFEqaCy6MkcnZqlQ/exec';
// Keep the proven V6.6.5 write authentication fallback. Existing localStorage secret still takes precedence.
const DEFAULT_API_SECRET = 'adadd47759234a7f94acb230c0cc7ff479c4e4f79a674714';
let _syncLock = false;
let _queueRevision = 0;
let _batchSupported = null;

import { hydrateQueueBackup, persistQueueBackup } from './offlineStore';
import { classifyStockLevel } from './stockStatus';
function emitConn(detail) { try { window.dispatchEvent(new CustomEvent('gudangai-conn', { detail })); } catch (_) {} }
export function getApiUrl() {
  const stored = (localStorage.getItem('gudangai_api_url') || '').trim();
  if (stored) return stored;
  localStorage.setItem('gudangai_api_url', DEFAULT_API_URL);
  return DEFAULT_API_URL;
}
export function setApiUrl(url) {
  const c = (url || '').trim();
  localStorage.setItem('gudangai_api_url', c || DEFAULT_API_URL);
  _batchSupported = null;
}
export function getApiSecret() { return (localStorage.getItem('gudangai_api_secret') || '').trim() || DEFAULT_API_SECRET; }
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
  const now = new Date();
  const localToday = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  if (!raw) return localToday;
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
  return localToday;
}
