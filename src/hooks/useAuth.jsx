import { useState, useEffect, createContext, useContext } from 'react';

const AuthContext = createContext(null);

const DEFAULT_PIN = '6969'; // Rudi can change later

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('gudangai_user');
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
    setLoading(false);
  }, []);

  const login = (pin) => {
    if (pin === (localStorage.getItem('gudangai_pin') || DEFAULT_PIN)) {
      const u = {
        name: localStorage.getItem('gudangai_username') || 'Rudi Virawan',
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

  const updateProfile = ({ name }) => {
    if (!user) return;
    const updated = { ...user, name: name || user.name };
    setUser(updated);
    localStorage.setItem('gudangai_user', JSON.stringify(updated));
    if (name) localStorage.setItem('gudangai_username', name);
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
