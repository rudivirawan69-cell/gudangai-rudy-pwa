import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchStock } from '../data/api';
import { classifyStockLevel } from '../data/stockStatus';

/**
 * Stok live — stabil: jangan kosongkan list saat error singkat.
 * Refresh jarang (90s) agar tidak terasa putus-putus.
 */
export function useStock(entity) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const lastOk = useRef([]);
  const fetching = useRef(false);
  const requestSequence = useRef(0);

  const refresh = useCallback(async ({ force = false } = {}) => {
    if (fetching.current && !force) return;
    const requestId = ++requestSequence.current;
    fetching.current = true;
    // Hanya tampilkan loading penuh jika belum ada data
    if (lastOk.current.length === 0) setLoading(true);
    setError(null);
    try {
      const data = await fetchStock(entity, { force });
      if (requestId !== requestSequence.current) return;
      if (Array.isArray(data) && data.length > 0) {
        lastOk.current = data;
        setItems(data);
        setLastRefresh(new Date());
        setError(null);
      } else if (lastOk.current.length > 0) {
        // Pertahankan data terakhir jika response kosong/gagal map
        setItems(lastOk.current);
      } else {
        setItems(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      if (requestId !== requestSequence.current) return;
      setError(err.message);
      if (lastOk.current.length > 0) setItems(lastOk.current);
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
        fetching.current = false;
      }
    }
  }, [entity]);

  useEffect(() => {
    lastOk.current = [];
    setItems([]);
    setLoading(true);
    refresh({ force: true });
  }, [entity, refresh]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        refresh({ force: false });
      }
    };
    const onOnline = () => refresh({ force: true });
    const onStockRefresh = () => refresh({ force: true });
    const id = setInterval(() => {
      if (navigator.onLine) refresh({ force: false });
    }, 90000);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    window.addEventListener('gudangai-stock-refresh', onStockRefresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('gudangai-stock-refresh', onStockRefresh);
    };
  }, [refresh]);

  const getStats = useCallback(() => {
    const total = items.length;
    const safe = items.filter((i) => classifyStockLevel(i.stok) === 'aman').length;
    const warning = items.filter((i) => classifyStockLevel(i.stok) === 'waspada').length;
    const danger = items.filter((i) => classifyStockLevel(i.stok) === 'kritis' && Number(i.stok) > 0).length;
    const zero = items.filter((i) => Number(i.stok) === 0).length;
    const totalStok = items.reduce((s, i) => s + (i.stok || 0), 0);
    return { total, safe, warning, danger, zero, totalStok };
  }, [items]);

  return { items, loading, error, refresh, lastRefresh, getStats };
}
