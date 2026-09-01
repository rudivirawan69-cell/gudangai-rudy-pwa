import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiUrl, healthCheck, syncPendingQueue } from '../data/api';

/**
 * Central connection state for GudangAI RUDY.
 * - Tracks browser online/offline
 * - Periodically health-checks backend when URL is set
 * - Auto-syncs offline queue when connection recovers
 * - Emits `gudangai-conn` CustomEvent for banner UI
 */
export function useConnection({ pollMs = 45000 } = {}) {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [apiOk, setApiOk] = useState(null); // null = unknown, true/false
  const [lastCheck, setLastCheck] = useState(null);
  const [message, setMessage] = useState('');
  const [syncing, setSyncing] = useState(false);
  const attemptRef = useRef(0);
  const hasUrl = Boolean(getApiUrl());

  const emit = useCallback((detail) => {
    try {
      window.dispatchEvent(new CustomEvent('gudangai-conn', { detail }));
    } catch {
      /* ignore */
    }
  }, []);

  const checkHealth = useCallback(async () => {
    if (!getApiUrl()) {
      setApiOk(null);
      return { ok: false, skipped: true };
    }
    if (!navigator.onLine) {
      setApiOk(false);
      return { ok: false, offline: true };
    }
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    emit({ state: 'retry', attempt, max: 3 });
    try {
      const result = await healthCheck();
      setLastCheck(new Date());
      if (result.ok) {
        setApiOk(true);
        setMessage('');
        emit({ state: 'recovered' });
        attemptRef.current = 0;
        return result;
      }
      setApiOk(false);
      setMessage(result.error || 'Backend tidak merespons');
      emit({ state: 'failed', error: result.error || 'Gagal terhubung' });
      return result;
    } catch (err) {
      setApiOk(false);
      const msg = err?.message || 'Koneksi putus';
      setMessage(msg);
      emit({ state: 'failed', error: msg });
      return { ok: false, error: msg };
    }
  }, [emit]);

  const syncQueue = useCallback(async () => {
    if (!navigator.onLine || !getApiUrl()) return null;
    setSyncing(true);
    try {
      const result = await syncPendingQueue();
      return result;
    } finally {
      setSyncing(false);
    }
  }, []);

  // Browser online / offline
  useEffect(() => {
    const on = () => {
      setOnline(true);
      checkHealth().then((r) => {
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

  // Visibility + interval health check
  useEffect(() => {
    if (!hasUrl) return undefined;
    const onVis = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        checkHealth();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(() => {
      if (navigator.onLine) checkHealth();
    }, pollMs);
    // initial
    if (navigator.onLine) checkHealth();
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(id);
    };
  }, [hasUrl, pollMs, checkHealth]);

  const status =
    !hasUrl ? 'demo' : !online ? 'offline' : apiOk === true ? 'connected' : apiOk === false ? 'error' : 'checking';

  return {
    online,
    apiOk,
    hasUrl,
    status,
    message,
    lastCheck,
    syncing,
    checkHealth,
    syncQueue,
  };
}

export default useConnection;
