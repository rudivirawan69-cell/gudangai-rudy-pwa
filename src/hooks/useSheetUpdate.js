import { useEffect, useState } from 'react';
import { getDashboardData } from '../data/api';

const EVENT_NAME = 'gudangai-sheet-updated';
const BOOTSTRAP_EVENT = 'gudangai-bootstrap-updated';
const STOCK_EVENT = 'gudangai-stock-refresh';
const LS_SYNC_STATE = 'gudangai_sync_state_v1';
const LS_BOOTSTRAP_AT = 'gudangai_bootstrap_at';

/** Format timestamp → label yang bisa dibaca formatSheetLabel di App (ada HH:MM). */
function formatUpdate(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string' && /^\d{1,2}[:.]\d{2}/.test(value.trim())) {
    return value.trim();
  }
  let date;
  if (typeof value === 'number') {
    date = new Date(value < 1e12 ? value * 1000 : value);
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) {
    const s = String(value).trim();
    return s || '';
  }
  // Format padat berisi jam agar formatSheetLabel bisa hitung "X mnt lalu"
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return `${get('day')} ${get('month')} ${get('hour')}:${get('minute')} WIB`;
}

function pickTimestamp(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const candidates = [
    obj.lastUpdate,
    obj.lastUpdatedAt,
    obj.lastUpdated,
    obj.lastUpdateISO,
    obj.updatedAt,
    obj.timestamp,
    obj.readAt,
    obj.label,
  ];
  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== '') return c;
  }
  return null;
}

function fromLocalCaches() {
  try {
    const syncRaw = localStorage.getItem(LS_SYNC_STATE);
    if (syncRaw) {
      const st = JSON.parse(syncRaw);
      const t = st.lastSyncISO || st.lastUpdateISO || st.bootstrappedAt;
      if (t) return t;
    }
  } catch (_) { /* ignore */ }
  try {
    const bootAt = localStorage.getItem(LS_BOOTSTRAP_AT);
    if (bootAt) {
      const n = Number(bootAt);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch (_) { /* ignore */ }
  return null;
}

/**
 * Label header "Update Sheet".
 * Sumber (berurutan):
 * 1. Event gudangai-sheet-updated / bootstrap / stock-refresh
 * 2. getDashboardData().lastUpdate*
 * 3. Cache realTimeSync / bootstrap di localStorage
 */
export function useSheetUpdate() {
  const [label, setLabel] = useState(() => {
    const cached = fromLocalCaches();
    return cached ? formatUpdate(cached) : '';
  });

  useEffect(() => {
    let active = true;
    let inFlight = false;

    const apply = (raw) => {
      if (!active || raw === undefined || raw === null || raw === '') return;
      const formatted = formatUpdate(raw);
      if (formatted) setLabel(formatted);
    };

    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await getDashboardData();
        if (!active) return;
        if (data && data.success !== false) {
          const value = pickTimestamp(data) || pickTimestamp(data.data) || pickTimestamp(data.meta);
          if (value) {
            apply(value);
            return;
          }
        }
        // Fallback cache lokal bila API tidak mengirim lastUpdate
        const local = fromLocalCaches();
        if (local) apply(local);
      } catch (_) {
        const local = fromLocalCaches();
        if (local) apply(local);
      } finally {
        inFlight = false;
      }
    };

    const onSheetUpdated = (event) => {
      const detail = event?.detail;
      if (typeof detail === 'string') {
        apply(detail);
      } else {
        const value = pickTimestamp(detail);
        if (value) apply(value);
      }
      refresh();
    };

    const onBootstrap = (event) => {
      const value = pickTimestamp(event?.detail) || Date.now();
      apply(value);
    };

    const onStock = (event) => {
      const meta = event?.detail?.meta;
      const value = pickTimestamp(meta) || pickTimestamp(event?.detail) || Date.now();
      apply(value);
    };

    // Seed dari cache lalu tarik live
    const local = fromLocalCaches();
    if (local) apply(local);
    refresh();

    const timer = window.setInterval(refresh, 60000);
    window.addEventListener(EVENT_NAME, onSheetUpdated);
    window.addEventListener(BOOTSTRAP_EVENT, onBootstrap);
    window.addEventListener(STOCK_EVENT, onStock);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener(EVENT_NAME, onSheetUpdated);
      window.removeEventListener(BOOTSTRAP_EVENT, onBootstrap);
      window.removeEventListener(STOCK_EVENT, onStock);
    };
  }, []);

  return label;
}

export default useSheetUpdate;
