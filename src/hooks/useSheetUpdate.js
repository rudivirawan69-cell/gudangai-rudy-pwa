import { useEffect, useState } from 'react';
import { getDashboardData } from '../data/api';
import { formatTanggal } from '../utils/formatTanggal';

const EVENT_NAME = 'gudangai-sheet-updated';
const BOOTSTRAP_EVENT = 'gudangai-bootstrap-updated';
const STOCK_EVENT = 'gudangai-stock-refresh';
const LS_SHEET_TIMESTAMP = 'gudangai_sheet_timestamp_v1';

function formatUpdate(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string' && /\d{1,2}[:.]\d{2}/.test(value)) return value.trim();
  return formatTanggal(value, 'sync') || String(value);
}

function fromLocalCaches() {
  try {
    return localStorage.getItem(LS_SHEET_TIMESTAMP) || null;
  } catch (_) {
    return null;
  }
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
        if (formatted) {
          setLabel(formatted);
          try { localStorage.setItem(LS_SHEET_TIMESTAMP, String(raw)); } catch (_) { /* ignore */ }
        }
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
          apply(value, 'ok');
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

    const onSheetUpdated = () => refresh();
    const onBootstrap = () => refresh();
    const onStock = () => refresh();

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
