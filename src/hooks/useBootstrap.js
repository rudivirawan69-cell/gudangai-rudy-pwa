import { useState, useEffect, useCallback } from 'react';
import { getApiUrl, getApiSecret } from '../data/api';

/**
 * useBootstrap — Master data & stock sync from BACKEND
 *
 * Executes on app startup:
 * 1. Fetch bootstrap data (masterVersion + stockVersion + all items)
 * 2. Validate versions match cached versions
 * 3. If mismatch → refresh cache (localStorage)
 * 4. If no backend → use fallback local master
 *
 * PENTING: BACKEND v6.6.5 adalah sumber kebenaran (source of truth).
 * PWA hanya replika untuk offline + performance.
 */

const CACHE_KEY_ITEMS = 'gudangai_bootstrap_items';
const CACHE_KEY_MASTER_VERSION = 'gudangai_master_version';
const CACHE_KEY_STOCK_VERSION = 'gudangai_stock_version';
const CACHE_KEY_BOOTSTRAP_AT = 'gudangai_bootstrap_at';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam

function loadCachedBootstrap() {
  try {
    const items = localStorage.getItem(CACHE_KEY_ITEMS);
    const masterVer = localStorage.getItem(CACHE_KEY_MASTER_VERSION);
    const stockVer = localStorage.getItem(CACHE_KEY_STOCK_VERSION);
    const bootAt = localStorage.getItem(CACHE_KEY_BOOTSTRAP_AT);

    if (items && masterVer && stockVer && bootAt) {
      const age = Date.now() - parseInt(bootAt, 10);
      return {
        items: JSON.parse(items),
        masterVersion: masterVer,
        stockVersion: stockVer,
        cachedAt: parseInt(bootAt, 10),
        isFresh: age < CACHE_TTL_MS,
        age,
      };
    }
  } catch (err) {
    console.warn('Failed to load cached bootstrap:', err);
  }
  return null;
}

function saveBootstrapCache(data) {
  try {
    const now = Date.now();
    localStorage.setItem(CACHE_KEY_ITEMS, JSON.stringify(data.items || []));
    localStorage.setItem(CACHE_KEY_MASTER_VERSION, String(data.masterVersion || ''));
    localStorage.setItem(CACHE_KEY_STOCK_VERSION, String(data.stockVersion || ''));
    localStorage.setItem(CACHE_KEY_BOOTSTRAP_AT, String(now));
  } catch (err) {
    console.error('Failed to save bootstrap cache:', err);
  }
}

async function fetchBootstrapFromBackend() {
  const apiUrl = getApiUrl();
  if (!apiUrl) return null;

  const secret = (typeof getApiSecret === 'function' ? getApiSecret() : '') || '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    // Prefer GET
    const q = new URLSearchParams({ action: 'bootstrap', entitas: 'ALL' });
    if (secret) q.set('secret', secret);
    let res = await fetch(apiUrl + '?' + q.toString(), { method: 'GET', redirect: 'follow', signal: controller.signal });
    let text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (data && data.success && data.items) {
      clearTimeout(timer);
      return data;
    }

    // Fallback POST
    const body = JSON.stringify({
      schemaVersion: '1.0',
      secret: secret || undefined,
      client: { app: 'gudangai-rudy-pwa' },
      action: 'bootstrap',
      entitas: 'ALL',
    });
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
      signal: controller.signal,
    });
    text = await res.text();
    try { data = JSON.parse(text); } catch { data = null; }
    if (data && data.success && data.items) {
      clearTimeout(timer);
      return data;
    }
    clearTimeout(timer);
    return null;
  } catch (err) {
    clearTimeout(timer);
    console.warn('Bootstrap fetch failed:', err.message);
    return null;
  }
}

function mergeOfflineChanges(bootstrapItems) {
  return bootstrapItems;
}

export function useBootstrap() {
  const [state, setState] = useState({
    items: null,
    masterVersion: null,
    stockVersion: null,
    synced: false,
    loading: true,
    error: null,
    cachedAt: null,
    snapshotId: null,
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const backendData = await fetchBootstrapFromBackend();

      if (backendData && backendData.success && backendData.items) {
        const merged = mergeOfflineChanges(backendData.items);
        saveBootstrapCache({
          items: merged,
          masterVersion: backendData.masterVersion,
          stockVersion: backendData.stockVersion,
        });
        try {
          window.dispatchEvent(new CustomEvent('gudangai-bootstrap-updated', {
            detail: {
              masterVersion: backendData.masterVersion,
              stockVersion: backendData.stockVersion,
              count: merged.length,
              snapshotId: backendData.snapshotId || null,
            },
          }));
        } catch (_) {}

        setState({
          items: merged,
          masterVersion: backendData.masterVersion,
          stockVersion: backendData.stockVersion,
          snapshotId: backendData.snapshotId,
          synced: true,
          loading: false,
          error: null,
          cachedAt: Date.now(),
        });

        return { success: true, synced: true };
      }

      const cached = loadCachedBootstrap();
      if (cached && cached.items && cached.items.length > 0) {
        setState({
          items: cached.items,
          masterVersion: cached.masterVersion,
          stockVersion: cached.stockVersion,
          synced: false,
          loading: false,
          error: 'Backend unavailable, using cached data',
          cachedAt: cached.cachedAt,
          snapshotId: null,
        });
        return { success: false, reason: 'backend_unavailable', usingCache: true };
      }

      setState((prev) => ({
        ...prev,
        loading: false,
        error: 'Backend unavailable and no cached data',
      }));
      return { success: false, reason: 'no_data' };
    } catch (err) {
      const cached = loadCachedBootstrap();
      if (cached && cached.items && cached.items.length > 0) {
        setState({
          items: cached.items,
          masterVersion: cached.masterVersion,
          stockVersion: cached.stockVersion,
          synced: false,
          loading: false,
          error: `Fetch error: ${err.message}. Using cache.`,
          cachedAt: cached.cachedAt,
          snapshotId: null,
        });
        return { success: false, reason: 'fetch_error', usingCache: true };
      }

      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'Bootstrap failed',
      }));
      return { success: false, reason: 'fetch_error' };
    }
  }, []);

  useEffect(() => {
    const onOnline = () => {
      if (getApiUrl()) refresh().catch(() => {});
    };
    window.addEventListener('online', onOnline);
    const cached = loadCachedBootstrap();

    if (cached && cached.isFresh && cached.items && cached.items.length > 0) {
      setState({
        items: cached.items,
        masterVersion: cached.masterVersion,
        stockVersion: cached.stockVersion,
        synced: false,
        loading: false,
        error: null,
        cachedAt: cached.cachedAt,
        snapshotId: null,
      });

      if (navigator.onLine && getApiUrl()) {
        refresh().catch(() => {});
      }
      return () => window.removeEventListener('online', onOnline);
    }

    if (navigator.onLine) {
      refresh();
    } else if (cached && cached.items && cached.items.length > 0) {
      setState({
        items: cached.items,
        masterVersion: cached.masterVersion,
        stockVersion: cached.stockVersion,
        synced: false,
        loading: false,
        error: 'Offline mode (using cached data)',
        cachedAt: cached.cachedAt,
        snapshotId: null,
      });
    } else {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: 'Offline and no cached data available',
      }));
    }
    return () => window.removeEventListener('online', onOnline);
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
}

export default useBootstrap;
