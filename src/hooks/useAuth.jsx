import { useState, useEffect, createContext, useContext } from 'react';
import { DEFAULT_PROFILE_PHOTO } from '../data/defaultProfile';

const AuthContext = createContext(null);

const DEFAULT_PIN = '6969'; // Rudi can change later

export { DEFAULT_PROFILE_PHOTO };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('gudangai_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.photo || String(parsed.photo).length < 100) {
          const photo = localStorage.getItem('gudangai_photo');
          parsed.photo = (photo && photo.length > 100) ? photo : DEFAULT_PROFILE_PHOTO;
        }
        setUser(parsed);
      } catch {
        /* ignore */
      }
    }
    setLoading(false);
  }, []);

  const login = (pin) => {
    if (pin === (localStorage.getItem('gudangai_pin') || DEFAULT_PIN)) {
      const savedPhoto = localStorage.getItem('gudangai_photo');
      const u = {
        name: localStorage.getItem('gudangai_username') || 'Rudi Virawan',
        photo: (savedPhoto && savedPhoto.length > 100) ? savedPhoto : DEFAULT_PROFILE_PHOTO,
        role: 'owner',
        loginAt: new Date().toISOString(),
      };
      setUser(u);
      localStorage.setItem('gudangai_user', JSON.stringify(u));
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('gudangai_user');
  };

  const updateProfile = ({ name, photo }) => {
    if (!user) return;
    const updated = {
      ...user,
      name: name != null ? (name || user.name) : user.name,
      photo: photo !== undefined ? photo : (user.photo || DEFAULT_PROFILE_PHOTO),
    };
    setUser(updated);
    localStorage.setItem('gudangai_user', JSON.stringify(updated));
    if (name != null && name) localStorage.setItem('gudangai_username', name);
    if (photo !== undefined) {
      if (photo) localStorage.setItem('gudangai_photo', photo);
      else localStorage.removeItem('gudangai_photo');
    }
  };

  const changePin = (newPin) => {
    if (newPin) localStorage.setItem('gudangai_pin', newPin);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, updateProfile, changePin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
