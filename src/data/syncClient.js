const SYNC_ENDPOINT = '/api/sync-all';
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 350;
const inFlightByToken = new Map();

function createAbortController(parentSignal) {
  const controller = new AbortController();
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort(parentSignal.reason);
    else parentSignal.addEventListener('abort', () => controller.abort(parentSignal.reason), { once: true });
  }
  return controller;
}

async function requestOnce(accessToken, signal) {
  const controller = createAbortController(signal);
  const timeout = setTimeout(() => controller.abort(new Error('Permintaan sinkronisasi melewati batas waktu.')), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(SYNC_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + accessToken },
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; }
    catch { throw new Error('Respons /api/sync-all bukan JSON yang valid.'); }

    if (!response.ok) {
      const error = new Error(payload?.error || ('Sinkronisasi gagal (HTTP ' + response.status + ').'));
      error.status = response.status;
      error.code = payload?.code || 'SYNC_HTTP_ERROR';
      throw error;
    }
    if (!payload || typeof payload !== 'object' || payload.permissions !== 'read_only' || !payload.data) {
      throw new Error('Kontrak respons /api/sync-all tidak valid atau bukan read-only.');
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchSyncAll({ accessToken, signal } = {}) {
  const token = String(accessToken || '').trim();
  if (!token) {
    const error = new Error('Sesi Supabase belum tersedia. Login kembali untuk membaca data.');
    error.status = 401;
    error.code = 'AUTH_REQUIRED';
    throw error;
  }

  const existing = inFlightByToken.get(token);
  if (existing) return existing;

  const task = (async () => {
    try {
      return await requestOnce(token, signal);
    } catch (error) {
      if (signal?.aborted || error?.status === 401 || error?.status === 403 || error?.status === 405) throw error;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, RETRY_DELAY_MS);
        if (signal) {
          const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason || new Error('Permintaan dibatalkan.'));
          };
          if (signal.aborted) onAbort();
          else signal.addEventListener('abort', onAbort, { once: true });
        }
      });
      return requestOnce(token, signal);
    }
  })();

  inFlightByToken.set(token, task);
  try {
    return await task;
  } finally {
    if (inFlightByToken.get(token) === task) inFlightByToken.delete(token);
  }
}
