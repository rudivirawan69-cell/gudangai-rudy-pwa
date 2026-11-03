import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { DEFAULT_PROFILE_PHOTO } from '../data/defaultProfile';
import { isSupabaseConfigured } from '../data/supabaseAuth';
import {
  clearStoredSession,
  readStoredSession,
  restoreSupabaseSession,
  signInWithPassword,
  signOutSupabase,
  refreshSupabaseSession,
} from '../data/supabaseAuth';

const AuthContext = createContext(null);
const PROFILE_KEY = 'gudangai_profile';
const DEFAULT_PIN = '6969';

export { DEFAULT_PROFILE_PHOTO };

function readProfile() {
  try {
    const current = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    if (current && typeof current === 'object') return current;
  } catch (_) { /* ignore */ }

  // Migrate display-only values from the former local PIN profile.
  try {
    const legacy = JSON.parse(localStorage.getItem('gudangai_user') || 'null');
    if (legacy && typeof legacy === 'object') {
      return {
        name: legacy.name || '',
        photo: legacy.photo || '',
      };
    }
  } catch (_) { /* ignore */ }
  return {};
}

function buildAppUser(authUser) {
  if (!authUser?.id) return null;
  const profile = readProfile();
  const emailName = String(authUser.email || '').split('@')[0];
  return {
    id: authUser.id,
    email: authUser.email || '',
    name: profile.name || authUser.user_metadata?.full_name || emailName || 'Operator',
    photo: profile.photo || DEFAULT_PROFILE_PHOTO,
    // Display role only. Server authorization must use verified app_metadata.
    role: authUser.app_metadata?.role || 'operator',
    appMetadata: authUser.app_metadata || {},
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState('loading');

  const applySession = useCallback((nextSession, status = 'authenticated') => {
    setSession(nextSession || null);
    setUser(buildAppUser(nextSession?.user));
    setAuthStatus(status);
  }, []);

  useEffect(() => {
    let active = true;
    const cached = readStoredSession();
    if (!isSupabaseConfigured()) {
      let localUser = null;
      try { localUser = JSON.parse(localStorage.getItem('gudangai_user') || 'null'); } catch (_) { /* ignore */ }
      if (active && localUser) {
        setUser({
          id: null,
          email: '',
          name: localUser.name || 'Operator',
          photo: localUser.photo || DEFAULT_PROFILE_PHOTO,
          role: 'local_owner',
          appMetadata: {},
        });
        setAuthStatus('legacy_local');
      } else if (active) {
        setAuthStatus('signed_out');
      }
      if (active) setLoading(false);
      return () => { active = false; };
    }
    restoreSupabaseSession()
      .then((restored) => {
        if (active) applySession(restored, restored ? 'authenticated' : 'signed_out');
      })
      .catch((error) => {
        if (!active) return;
        if ((error.networkError || error.status >= 500 || error.status === 429) && cached?.access_token && Number(cached.expires_at) * 1000 > Date.now()) {
          applySession(cached, 'offline');
        } else {
          clearStoredSession();
          applySession(null, 'signed_out');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [applySession]);

  useEffect(() => {
    if (!session?.refresh_token || !session?.expires_at) return undefined;
    let active = true;
    const refreshIn = Math.max(1000, Number(session.expires_at) * 1000 - Date.now() - 60_000);
    const timer = window.setTimeout(async () => {
      try {
        const refreshed = await refreshSupabaseSession(session.refresh_token);
        if (active) applySession(refreshed, 'authenticated');
      } catch (_) {
        if (active) {
          clearStoredSession();
          applySession(null, 'signed_out');
        }
      }
    }, refreshIn);

    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      if (Number(session.expires_at) * 1000 > Date.now() + 60_000) return;
      try {
        const refreshed = await refreshSupabaseSession(session.refresh_token);
        if (active) applySession(refreshed, 'authenticated');
      } catch (_) {
        if (active) {
          clearStoredSession();
          applySession(null, 'signed_out');
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session, applySession]);


  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== 'gudangai_supabase_session_v1') return;
      const sharedSession = readStoredSession();
      if (!sharedSession) {
        applySession(null, 'signed_out');
        return;
      }
      if (sharedSession.access_token !== session?.access_token) {
        applySession(sharedSession, 'authenticated');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [session?.access_token, applySession]);

  const login = useCallback(async (email, password) => {
    const nextSession = await signInWithPassword(email, password);
    applySession(nextSession, 'authenticated');
    return true;
  }, [applySession]);

  const loginLocal = useCallback((pin) => {
    if (isSupabaseConfigured()) return false;
    const expected = localStorage.getItem('gudangai_pin') || DEFAULT_PIN;
    if (String(pin || '') !== String(expected)) return false;
    const savedPhoto = localStorage.getItem('gudangai_photo');
    const localUser = {
      name: localStorage.getItem('gudangai_username') || 'Rudi Virawan',
      photo: savedPhoto && savedPhoto.length > 100 ? savedPhoto : DEFAULT_PROFILE_PHOTO,
      role: 'local_owner',
      loginAt: new Date().toISOString(),
    };
    localStorage.setItem('gudangai_user', JSON.stringify(localUser));
    setSession(null);
    setUser({ ...localUser, id: null, email: '', appMetadata: {} });
    setAuthStatus('legacy_local');
    return true;
  }, []);

  const logout = useCallback(async () => {
    const token = session?.access_token;
    try {
      await signOutSupabase(token);
    } catch (_) {
      // Local session is still cleared if the network is unavailable.
    } finally {
      setSession(null);
      setUser(null);
      setAuthStatus('signed_out');
    }
  }, [session]);

  const updateProfile = useCallback(({ name, photo }) => {
    if (!user) return;
    const profile = {
      name: name != null ? (name || user.name) : user.name,
      photo: photo !== undefined ? photo : (user.photo || DEFAULT_PROFILE_PHOTO),
    };
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (_) { /* ignore */ }
    setUser((current) => current ? { ...current, ...profile } : current);
    if (name != null && name) localStorage.setItem('gudangai_username', name);
    if (photo !== undefined) {
      if (photo) localStorage.setItem('gudangai_photo', photo);
      else localStorage.removeItem('gudangai_photo');
    }
  }, [user]);

  // Legacy device PIN setting is retained for UI compatibility only.
  // It is not used to authenticate users or authorize API requests.
  const changePin = useCallback((newPin) => {
    if (/^[0-9]{4,6}$/.test(String(newPin || ''))) {
      localStorage.setItem('gudangai_pin', String(newPin));
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      accessToken: session?.access_token || '',
      loading,
      authStatus,
      login,
      loginLocal,
      logout,
      updateProfile,
      changePin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
