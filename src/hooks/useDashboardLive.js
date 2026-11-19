import { useCallback, useEffect, useRef, useState } from 'react';
import { getDashboardData } from '../data/api';

const STORAGE_KEY = 'gudangai:stok:snapshot:v1';
const SHEET_EVENT = 'gudangai-sheet-updated';

function extractSheetTimestamp(value) {
  if (!value || typeof value !== 'object') return null;
  return value.sheetUpdatedAt
    || value.lastUpdateISO
    || value.lastUpdate
    || value.updatedAt
    || value.data?.sheetUpdatedAt
    || value.data?.lastUpdateISO
    || value.meta?.sheetUpdatedAt
    || null;
}

function readSnapshot() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || parsed.version !== 1 || !parsed.data || parsed.data.success !== true) return null;
    return {
      data: parsed.data,
      sheetUpdatedAt: parsed.sheetUpdatedAt || extractSheetTimestamp(parsed.data) || null,
      cachedAt: parsed.cachedAt || null,
    };
  } catch (_) {
    return null;
  }
}

function writeSnapshot(data, sheetUpdatedAt) {
  const snapshot = {
    version: 1,
    data,
    sheetUpdatedAt: sheetUpdatedAt || extractSheetTimestamp(data) || null,
    cachedAt: new Date().toISOString(),
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch (_) { /* storage may be full or disabled */ }
  return snapshot;
}

/**
 * One app-shell owner for Dashboard Live data.
 * The last successful snapshot is rendered immediately across page navigation.
 * Network reads happen once on app startup and only after a new Spreadsheet timestamp.
 */
export function useDashboardLive({ enabled = true } = {}) {
  const [initialSnapshot] = useState(() => readSnapshot());
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [error, setError] = useState('');
  const timestampRef = useRef(initialSnapshot?.sheetUpdatedAt || null);
  const inFlightRef = useRef(null);
  const mountedRef = useRef(false);

  const refresh = useCallback(async ({ sheetUpdatedAt = null } = {}) => {
    if (inFlightRef.current) return inFlightRef.current;
    const task = (async () => {
      try {
        const result = await getDashboardData();
        if (!result || result.success !== true) {
          throw new Error(result?.error || 'Dashboard Live tidak mengembalikan ringkasan valid.');
        }
        const resolvedTimestamp = sheetUpdatedAt || extractSheetTimestamp(result) || timestampRef.current;
        const next = writeSnapshot(result, resolvedTimestamp);
        timestampRef.current = next.sheetUpdatedAt;
        if (mountedRef.current) {
          setSnapshot(next);
          setError('');
        }
        return next;
      } catch (err) {
        if (mountedRef.current) setError(err?.message || 'Gagal membaca Dashboard Live.');
        return null;
      }
    })();
    inFlightRef.current = task;
    try { return await task; }
    finally { if (inFlightRef.current === task) inFlightRef.current = null; }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    mountedRef.current = true;
    // Validate once on application startup; cached values stay visible during this request.
    void refresh();
    const onSheetUpdated = (event) => {
      const detail = event?.detail || {};
      const nextTimestamp = extractSheetTimestamp(detail);
      if (!nextTimestamp) return;
      if (String(nextTimestamp) === String(timestampRef.current || '')) return;
      timestampRef.current = String(nextTimestamp);
      void refresh({ sheetUpdatedAt: String(nextTimestamp) });
    };
    window.addEventListener(SHEET_EVENT, onSheetUpdated);
    return () => {
      mountedRef.current = false;
      window.removeEventListener(SHEET_EVENT, onSheetUpdated);
    };
  }, [refresh, enabled]);

  return {
    data: snapshot?.data || null,
    error,
    sheetUpdatedAt: snapshot?.sheetUpdatedAt || timestampRef.current || null,
    cachedAt: snapshot?.cachedAt || null,
    refresh,
  };
}

export default useDashboardLive;
