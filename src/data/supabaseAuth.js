const SESSION_KEY = 'gudangai_supabase_session_v1';
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_PUBLISHABLE_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

function authError(message, status = 0) {
  const error = new Error(message || 'Autentikasi Supabase gagal.');
  error.status = status;
  return error;
}

async function authRequest(path, { method = 'GET', body, accessToken, signal } = {}) {
  if (!isSupabaseConfigured()) {
    throw authError('Konfigurasi Supabase belum tersedia. Atur VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY.');
  }

  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method,
      signal,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    error.networkError = true;
    throw error;
  }

  let payload = {};
  try { payload = await response.json(); } catch (_) { /* response may be empty */ }
  if (!response.ok) {
    const message = payload.msg || payload.message || payload.error_description || payload.error || (
      response.status === 400 || response.status === 401
        ? 'Email atau password tidak valid.'
        : `Layanan autentikasi gagal (HTTP ${response.status}).`
    );
    throw authError(message, response.status);
  }
  return payload;
}

function normalizeSession(payload) {
  const expiresIn = Number(payload.expires_in || 3600);
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    token_type: payload.token_type || 'bearer',
    expires_in: expiresIn,
    expires_at: Number(payload.expires_at || Math.floor(Date.now() / 1000) + expiresIn),
    user: payload.user || null,
  };
}

export function readStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function persistSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (_) {
    throw authError('Sesi tidak dapat disimpan di perangkat. Periksa ruang penyimpanan browser.');
  }
}

export function clearStoredSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ }
}

export async function signInWithPassword(email, password) {
  const payload = await authRequest('token?grant_type=password', {
    method: 'POST',
    body: { email: String(email || '').trim(), password: String(password || '') },
  });
  const session = normalizeSession(payload);
  if (!session.access_token || !session.refresh_token || !session.user?.id) {
    throw authError('Supabase tidak mengembalikan sesi login yang lengkap.');
  }
  persistSession(session);
  return session;
}

export async function refreshSupabaseSession(refreshToken) {
  if (!refreshToken) throw authError('Refresh token tidak tersedia.', 401);
  const payload = await authRequest('token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
  const session = normalizeSession(payload);
  if (!session.access_token || !session.refresh_token || !session.user?.id) {
    throw authError('Supabase tidak mengembalikan sesi yang dapat diperbarui.', 401);
  }
  persistSession(session);
  return session;
}

export async function fetchSupabaseUser(accessToken) {
  if (!accessToken) throw authError('Access token tidak tersedia.', 401);
  return authRequest('user', { accessToken });
}

export async function restoreSupabaseSession() {
  let session = readStoredSession();
  if (!session?.refresh_token || !session?.access_token) {
    clearStoredSession();
    return null;
  }

  const expiresAt = Number(session.expires_at || 0);
  if (!expiresAt || expiresAt * 1000 <= Date.now() + 60_000) {
    session = await refreshSupabaseSession(session.refresh_token);
  }

  try {
    const user = await fetchSupabaseUser(session.access_token);
    session = { ...session, user };
    persistSession(session);
    return session;
  } catch (error) {
    if (error.status === 401 && session.refresh_token) {
      const refreshed = await refreshSupabaseSession(session.refresh_token);
      const user = await fetchSupabaseUser(refreshed.access_token);
      session = { ...refreshed, user };
      persistSession(session);
      return session;
    }
    throw error;
  }
}

export async function signOutSupabase(accessToken) {
  try {
    if (accessToken) {
      await authRequest('logout', { method: 'POST', accessToken });
    }
  } finally {
    clearStoredSession();
  }
}
