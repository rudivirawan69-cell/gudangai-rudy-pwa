/**
 * ============================================================
 * realTimeSync.js — Klien Sinkronisasi Real-Time PWA <-> Code.gs
 * GudangAI RUDY V6.6.5 (kompatibel kontrak bootstrap/delta/versi)
 * ============================================================
 */

const HEARTBEAT_SEC = 60;
const FAST_POLL_SEC = 5;
const FAST_POLL_WINDOW_MS = 2 * 60 * 1000;
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_WINDOW_MS = 2 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20000;

const LS_ENDPOINT = 'gudangai_api_url';
const LS_SECRET = 'gudangai_api_secret';
const LS_SYNC_STATE = 'gudangai_sync_state_v1';

export function getEndpoint() {
  return (localStorage.getItem(LS_ENDPOINT) || window.__GUDANGAI_API_URL__ || '').trim();
}
export function getSecret() {
  return (localStorage.getItem(LS_SECRET) || window.__GUDANGAI_API_SECRET__ || '').trim();
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_SYNC_STATE) || '{}'); } catch { return {}; }
}
function saveState(patch) {
  const next = { ...loadState(), ...patch };
  localStorage.setItem(LS_SYNC_STATE, JSON.stringify(next));
  return next;
}

function emitSheetUpdated(iso) {
  try {
    const lastUpdate = iso || new Date().toISOString();
    window.dispatchEvent(new CustomEvent('gudangai-sheet-updated', {
      detail: { lastUpdate, lastUpdateISO: lastUpdate, updatedAt: lastUpdate },
    }));
  } catch (_) { /* ignore */ }
}

let _failures = [];
let _circuitOpenUntil = 0;
let _timer = null;
let _fastUntil = 0;
let _inFlight = null;
let _listeners = { onStockUpdate: null, onStatus: null };

function noteFailure() {
  const now = Date.now();
  _failures = _failures.filter((t) => now - t < CIRCUIT_WINDOW_MS);
  _failures.push(now);
  if (_failures.length >= CIRCUIT_THRESHOLD) _circuitOpenUntil = now + CIRCUIT_WINDOW_MS;
  return _failures.length;
}
function noteSuccess() { _failures = []; _circuitOpenUntil = 0; }

async function apiPost(action, params = {}) {
  const endpoint = getEndpoint();
  const secret = getSecret();
  if (!endpoint || !secret) {
    const err = new Error('Endpoint/API secret belum diatur (halaman Atur).');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action, secret,
        requestId: 'PWA-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        schemaVersion: '1.0',
        client: { app: 'gudangai-rudy-pwa', mode: 'realtime_sync' },
        ...params,
      }),
      signal: controller.signal,
    });
    const payload = JSON.parse(await res.text());
    if (payload && payload.success === false) {
      const err = new Error(payload.error || 'Backend menolak permintaan.');
      err.code = payload.code || 'BACKEND_ERROR';
      err.payload = payload;
      throw err;
    }
    noteSuccess();
    return payload;
  } catch (e) {
    if (e.code) throw e;
    noteFailure();
    const err = new Error(e.name === 'AbortError' ? 'Timeout koneksi ke Apps Script.' : String(e.message || e));
    err.code = 'NETWORK_ERROR';
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fullBootstrap() {
  const data = await apiPost('bootstrap', { entitas: 'ALL' });
  const lastUpdateISO = data.lastUpdateISO || data.lastUpdate || new Date().toISOString();
  const st = saveState({
    masterVersion: data.masterVersion || null,
    stockVersion: data.stockVersion || null,
    lastUpdateISO,
    lastSyncISO: new Date().toISOString(),
    bootstrappedAt: new Date().toISOString(),
  });
  emitSheetUpdated(lastUpdateISO);
  return { data, state: st };
}

async function pullDelta() {
  const st = loadState();
  const since = st.lastSyncISO || st.lastUpdateISO;
  if (!since) return fullBootstrap();
  const delta = await apiPost('getStockDelta', { sinceTimestamp: since, entitas: 'ALL' });
  const lastSyncISO = new Date().toISOString();
  saveState({
    lastSyncISO,
    lastUpdateISO: delta.lastUpdateISO || delta.lastUpdate || lastSyncISO,
    masterVersion: delta.masterVersion || st.masterVersion,
    stockVersion: delta.stockVersion || st.stockVersion,
  });
  emitSheetUpdated(delta.lastUpdateISO || delta.lastUpdate || lastSyncISO);
  return delta;
}

async function tick() {
  if (_inFlight) return _inFlight;
  _inFlight = (async () => {
    const now = Date.now();
    if (now < _circuitOpenUntil) {
      _listeners.onStatus?.({ state: 'circuit_open', retryAfterSec: Math.ceil((_circuitOpenUntil - now) / 1000) });
      return;
    }
    const st = loadState();
    try {
      const ping = await apiPost('ping');
      const changed = ping.stockVersion !== st.stockVersion || ping.masterVersion !== st.masterVersion;
      const stale = !st.bootstrappedAt;
      if (stale) {
        const { data } = await fullBootstrap();
        _listeners.onStockUpdate?.(data.items || data.stock || [], { mode: 'BOOTSTRAP', meta: data });
        _listeners.onStatus?.({ state: 'online', mode: 'bootstrap', failures: _failures.length });
      } else if (changed) {
        const delta = await pullDelta();
        if (delta.mode === 'DELTA' && (delta.items || []).length) {
          _listeners.onStockUpdate?.(delta.items, { mode: 'DELTA', meta: delta });
        }
        _listeners.onStatus?.({ state: 'online', mode: 'delta', count: delta.count ?? 0, failures: _failures.length });
      } else {
        const lastSyncISO = new Date().toISOString();
        saveState({ lastSyncISO });
        emitSheetUpdated(ping.lastUpdateISO || ping.lastUpdate || lastSyncISO);
        _listeners.onStatus?.({ state: 'online', mode: 'idle', failures: 0 });
      }
    } catch (e) {
      _listeners.onStatus?.({ state: 'error', code: e.code, error: e.message, failures: _failures.length });
    }
  })();
  try { await _inFlight; } finally { _inFlight = null; }
}

function scheduleNext() {
  clearTimeout(_timer);
  const fast = Date.now() < _fastUntil;
  _timer = setTimeout(async () => { await tick(); scheduleNext(); }, (fast ? FAST_POLL_SEC : HEARTBEAT_SEC) * 1000);
}

export function startRealtimeSync({ onStockUpdate, onStatus } = {}) {
  _listeners = { onStockUpdate, onStatus };
  const onVis = () => { if (!document.hidden) { syncNow(); } };
  const onOnline = () => { _listeners.onStatus?.({ state: 'online', mode: 'reconnect' }); syncNow(); };
  const onOffline = () => _listeners.onStatus?.({ state: 'offline' });
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  syncNow();
  scheduleNext();
  return () => {
    clearTimeout(_timer);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}

export async function syncNow() {
  _fastUntil = Date.now() + FAST_POLL_WINDOW_MS;
  await tick();
  scheduleNext();
}

export function applyDeltaToCache(cache, items) {
  const next = { ...(cache || {}) };
  (items || []).forEach((it) => {
    const key = (String(it.entitas || 'ALL').toUpperCase()) + '|' + String(it.kode || '').trim();
    next[key] = it;
  });
  return next;
}

export function getSyncState() { return loadState(); }
