import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

const STORAGE_KEY = 'gudangai_theme';

/** Tiga mode tampilan — ide visual mock 3D, struktur app tetap GudangAI */
export const THEME_IDS = ['soft_light', 'deep_ocean', 'warm_productive'];

export const THEME_META = {
  soft_light: {
    id: 'soft_light',
    label: 'Soft Light',
    short: 'Light',
    description: '3D soft · latar biru-abu',
  },
  deep_ocean: {
    id: 'deep_ocean',
    label: 'Deep Ocean',
    short: 'Ocean',
    description: '3D gelap · console malam',
  },
  warm_productive: {
    id: 'warm_productive',
    label: 'Warm Productive',
    short: 'Warm',
    description: '3D hangat · krem produktif',
  },
};

const ThemeContext = createContext(null);

function normalizeTheme(raw) {
  const v = String(raw || '').toLowerCase().trim();
  if (v === 'dark' || v === 'deep_ocean' || v === 'ocean') return 'deep_ocean';
  if (v === 'warm' || v === 'warm_productive' || v === 'productive') return 'warm_productive';
  if (v === 'light' || v === 'soft_light' || v === 'soft') return 'soft_light';
  if (THEME_IDS.includes(v)) return v;
  return 'soft_light';
}

function readStoredTheme() {
  try {
    return normalizeTheme(localStorage.getItem(STORAGE_KEY));
  } catch (_) {
    return 'soft_light';
  }
}

function applyDomTheme(theme) {
  const t = normalizeTheme(theme);
  const root = document.documentElement;
  root.setAttribute('data-theme', t);
  root.style.colorScheme = t === 'deep_ocean' ? 'dark' : 'light';
  if (document.body) document.body.setAttribute('data-theme', t);
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === 'undefined') return 'soft_light';
    const t = readStoredTheme();
    applyDomTheme(t);
    return t;
  });

  useEffect(() => {
    applyDomTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (_) {}
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(normalizeTheme(next));
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((prev) => {
      const i = THEME_IDS.indexOf(normalizeTheme(prev));
      return THEME_IDS[(i + 1) % THEME_IDS.length];
    });
  }, []);

  const value = useMemo(
    () => ({
      theme,
      meta: THEME_META[theme] || THEME_META.soft_light,
      isDark: theme === 'deep_ocean',
      isLight: theme === 'soft_light',
      isWarm: theme === 'warm_productive',
      setTheme,
      cycleTheme,
      themes: THEME_IDS.map((id) => THEME_META[id]),
    }),
    [theme, setTheme, cycleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: 'soft_light',
      meta: THEME_META.soft_light,
      isDark: false,
      isLight: true,
      isWarm: false,
      setTheme: () => {},
      cycleTheme: () => {},
      themes: THEME_IDS.map((id) => THEME_META[id]),
    };
  }
  return ctx;
}

export { STORAGE_KEY as THEME_STORAGE_KEY };
