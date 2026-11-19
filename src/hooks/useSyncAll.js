import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSyncAll } from '../data/syncClient';

export function useSyncAll({ accessToken, interval = 60_000 } = {}) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const controllerRef = useRef(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!accessToken) {
      setStatus('unauthorized');
      setError('Sesi Supabase belum tersedia.');
      return null;
    }
    if (controllerRef.current) controllerRef.current.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!quiet) setStatus('loading');
    setError('');

    try {
      const result = await fetchSyncAll({ accessToken, signal: controller.signal });
      if (!mountedRef.current || controller.signal.aborted) return null;
      setData(result);
      setUpdatedAt(result.readAt || new Date().toISOString());
      setStatus(result.success ? 'success' : 'partial');
      if (!result.success) setError((result.errors?.length || 0) + ' sumber data gagal dibaca.');
      return result;
    } catch (err) {
      if (!mountedRef.current || controller.signal.aborted) return null;
      setStatus(err?.status === 401 || err?.status === 403 ? 'unauthorized' : 'error');
      setError(err?.message || 'Sinkronisasi data gagal.');
      return null;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [accessToken]);

  useEffect(() => {
    mountedRef.current = true;
    if (!accessToken) {
      setData(null);
      setStatus('unauthorized');
      setError('Sesi Supabase belum tersedia.');
      return () => { mountedRef.current = false; };
    }

    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) refresh({ quiet: true });
    }, Math.max(15_000, interval));
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) refresh({ quiet: true });
    };
    const onOnline = () => refresh({ quiet: true });
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [accessToken, interval, refresh]);

  return {
    data, status, error, updatedAt, refresh,
    summary: data?.summary || null,
    readAt: data?.readAt || null,
    partialErrors: data?.errors || [],
  };
}
