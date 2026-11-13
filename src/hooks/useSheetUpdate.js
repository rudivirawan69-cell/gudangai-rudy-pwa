import { useEffect, useState } from 'react';
import { getDashboardData } from '../data/api';
import { formatTanggal } from '../utils/formatTanggal';

const EVENT_NAME = 'gudangai-sheet-updated';
const BOOTSTRAP_EVENT = 'gudangai-bootstrap-updated';
const STOCK_EVENT = 'gudangai-stock-refresh';
const LS_SYNC_STATE = 'gudangai_sync_state_v1';
const LS_BOOTSTRAP_AT = 'gudangai_bootstrap_at';

function formatUpdate(value) {
  if (value === undefined || value === null || value === '') return '';
  // Pertahankan string yang sudah berisi jam HH:MM untuk formatSheetLabel relatif
  if (typeof value === 'string' && /\d{1,2}[:.]\d{2}/.test(value)) return value.trim();
  return formatTanggal(value, 'sync') || String(value);
}

function pickTimestamp(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const candidates = [
    obj.sheetUpdatedAt, obj.spreadsheetUpdatedAt, obj.divisionSheetUpdatedAt,
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
 * Tidak menampilkan "Belum ada data" jika API pernah sukses — pakai waktu ambil data.
 */
export function useSheetUpdate() {
  const [label, setLabel] = useState(() => {
    const cached = fromLocalCaches();
    return cached ? formatUpdate(cached) : '';
  });
  const [syncState, setSyncState] = useState('idle'); // idle | loading | ok | error

  useEffect(() => {
    let active = true;
    let inFlight = false;

    const apply = (raw, state = 'ok') => {
      if (!active) return;
      if (raw !== undefined && raw !== null && raw !== '') {
        const formatted = formatUpdate(raw);
        if (formatted) setLabel(formatted);
      }
      setSyncState(state);
    };

    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      if (!label) setSyncState('loading');
      try {
        const data = await getDashboardData();
        if (!active) return;
        if (data && data.success !== false) {
          const value = pickTimestamp(data) || pickTimestamp(data.data) || pickTimestamp(data.meta);
          // Hanya timestamp yang dibaca dari A2 sheet Data Stok Per Divisi yang sah.
          // Jangan mengganti waktu update spreadsheet dengan waktu polling/API.
          if (value) apply(value, 'ok');
          else setSyncState('error');
          return;
        }
        const local = fromLocalCaches();
        if (local) apply(local, 'error');
        else setSyncState('error');
      } catch (_) {
        const local = fromLocalCaches();
        if (local) apply(local, 'error');
        else if (active) setSyncState('error');
      } finally {
        inFlight = false;
      }
    };

    const onSheetUpdated = (event) => {
      const detail = event?.detail;
      if (typeof detail === 'string') apply(detail, 'ok');
      else {
        const value = pickTimestamp(detail);
        if (value) apply(value, 'ok');
      }
      refresh();
    };

    const onBootstrap = (event) => {
      const value = pickTimestamp(event?.detail);
      if (value) apply(value, 'ok');
      refresh();
    };

    const onStock = (event) => {
      const meta = event?.detail?.meta;
      const value = pickTimestamp(meta) || pickTimestamp(event?.detail);
      if (value) apply(value, 'ok');
      refresh();
    };

    const local = fromLocalCaches();
    if (local) apply(local, 'ok');
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

  // Prefiks status untuk AppHeader jika ingin dipakai nanti
  if (syncState === 'loading' && !label) return 'Memuat data…';
  return label;
}

export default useSheetUpdate;
