import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchStock, getApiUrl } from '../data/api';

const CACHE_KEY = 'gudangai_stock_cache';
const AUTO_REFRESH_MS = 120000; // 2 minutes

function getCachedStock(entity) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const entry = cache[entity];
    if (entry && entry.items && entry.at) {
      if (Date.now() - entry.at < 600000) return entry.items;
    }
  } catch {}
  return null;
}

function setCachedStock(entity, items) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    cache[entity] = { items, at: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export function useStock(entity) {
  const [items, setItems] = useState(() => getCachedStock(entity) || []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const intervalRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStock(entity);
      setItems(data);
      setLastRefresh(new Date());
      const hasUrl = Boolean(getApiUrl());
      setIsLive(hasUrl);
      if (hasUrl && data.length > 0) {
        setCachedStock(entity, data);
      }
    } catch (err) {
      setError(err.message);
      const cached = getCachedStock(entity);
      if (cached) {
        setItems(cached);
        setIsLive(false);
      }
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const hasUrl = Boolean(getApiUrl());
    if (!hasUrl) return;

    const startInterval = () => {
      intervalRef.current = setInterval(refresh, AUTO_REFRESH_MS);
    };
    const stopInterval = () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
        startInterval();
      } else {
        stopInterval();
      }
    };

    startInterval();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh]);

  const getStats = useCallback(() => {
    const total = items.length;
    const safe = items.filter(i => i.stok > 20).length;
    const warning = items.filter(i => i.stok > 5 && i.stok <= 20).length;
    const danger = items.filter(i => i.stok > 0 && i.stok <= 5).length;
    const zero = items.filter(i => i.stok === 0).length;
    const totalStok = items.reduce((s, i) => s + (i.stok || 0), 0);
    return { total, safe, warning, danger, zero, totalStok };
  }, [items]);

  return { items, loading, error, refresh, lastRefresh, getStats, isLive };
}
