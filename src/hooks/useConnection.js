import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiUrl, healthCheck, syncPendingQueue } from '../data/api';

/**
 * Connection state — stabil, minim noise di banner.
 * - Tidak emit "retry" di setiap poll (itu yang terasa "putus-putus")
 * - Hanya flag error setelah 2 gagal beruntun
 * - Poll lebih jarang (default 90s)
 */
export function useConnection({ pollMs = 90000 } = {}) {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [apiOk, setApiOk] = useState(null);
  const [lastCheck, setLastCheck] = useState(null);
  const [message, setMessage] = useState('');
  const [syncing, setSyncing] = useState(false);
  const failStreak = useRef(0);
  const lastOkAt = useRef(0);
  const hasUrl = Boolean(typeof window !== 'undefined' && getApiUrl());

  const emit = useCallback((detail) => {
    try {
      window.dispatchEvent(new CustomEvent('gudangai-conn', { detail }));
    } catch {
      /* ignore */
    }
  }, []);

  const checkHealth = useCallback(async ({ quiet = false } = {}) => {
    if (!getApiUrl()) {
      setApiOk(null);
      return { ok: false, skipped: true };
    }
    if (!navigator.onLine) {
      setApiOk(false);
      return { ok: false, offline: true };
    }
    // Hindari spam health jika baru sukses < 20 detik
    if (quiet && lastOkAt.current && Date.now() - lastOkAt.current < 20000) {
      return { ok: true, cached: true };
    }
    try {
      const result = await healthCheck();
      setLastCheck(new Date());
      if (result.ok) {
        failStreak.current = 0;
        lastOkAt.current = Date.now();
        setApiOk(true);
        setMessage('');
        if (!quiet) emit({ state: 'recovered' });
        return result;
      }
      failStreak.current += 1;
      // Hanya anggap putus setelah 2 gagal beruntun
      if (failStreak.current >= 2) {
        setApiOk(false);
        setMessage(result.error || 'Backend tidak merespons');
        emit({ state: 'failed', error: result.error || 'Gagal terhubung' });
      }
      return result;
    } catch (err) {
      failStreak.current += 1;
      const msg = err?.message || 'Koneksi putus';
      if (failStreak.current >= 2) {
        setApiOk(false);
        setMessage(msg);
        emit({ state: 'failed', error: msg });
      }
      return { ok: false, error: msg };
    }
  }, [emit]);

  const syncQueue = useCallback(async () => {
    if (!navigator.onLine || !getApiUrl()) return null;
    setSyncing(true);
    try {
      return await syncPendingQueue();
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      checkHealth({ quiet: false }).then((r) => {
        if (r?.ok) syncQueue();
      });
    };
    const off = () => {
      setOnline(false);
      setApiOk(false);
      setMessage('Offline');
      emit({ state: 'failed', error: 'Offline' });
    };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [checkHealth, syncQueue, emit]);

  useEffect(() => {
    if (!getApiUrl()) return undefined;
    const onVis = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        checkHealth({ quiet: true });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(() => {
      if (navigator.onLine) checkHealth({ quiet: true });
    }, pollMs);
    if (navigator.onLine) checkHealth({ quiet: false });
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(id);
    };
  }, [pollMs, checkHealth]);

  const status =
    !getApiUrl()
      ? 'demo'
      : !online
        ? 'offline'
        : apiOk === true
          ? 'connected'
          : apiOk === false
            ? 'error'
            : 'checking';

  return {
    online,
    apiOk,
    hasUrl: Boolean(getApiUrl()),
    status,
    message,
    lastCheck,
    syncing,
    checkHealth,
    syncQueue,
  };
}

export default useConnection;
