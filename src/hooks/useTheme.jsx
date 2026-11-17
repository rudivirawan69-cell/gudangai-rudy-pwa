import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

const STORAGE_KEY = 'gudangai_theme';

export const THEME_IDS = ['soft_light', 'deep_ocean', 'blue_glass'];

export const THEME_META = {
  soft_light: {
    id: 'soft_light',
    label: 'Soft Light',
    short: 'Soft',
    description: 'Warm cream · Amber · profesional dan lembut',
  },
  deep_ocean: {
    id: 'deep_ocean',
    label: 'Deep Ocean',
    short: 'Ocean',
    description: 'Midnight Navy · Cyan · mode gelap',
  },
  blue_glass: {
    id: 'blue_glass',
    label: 'Blue Glass',
    short: 'Blue',
    description: 'Biru kaca · #3b82f6 · modern dan jernih',
  },
};

const THEME_COLORS = {
  soft_light: '#d97706',
  deep_ocean: '#0ea5e9',
  blue_glass: '#2563eb',
};

const ThemeContext = createContext(null);

function normalizeTheme(raw) {
  const value = String(raw || '').toLowerCase().trim();
  if (['dark', 'deep_ocean', 'ocean', 'navy'].includes(value)) return 'deep_ocean';
  if (['blue', 'blue_glass', 'glass', 'blueglass'].includes(value)) return 'blue_glass';
  /* legacy aliases map to blue_glass agar tema ketiga tetap stabil */
  if (['warm', 'warm_productive', 'productive', 'teal', 'graphite', 'graphite_titanium'].includes(value)) return 'blue_glass';
  if (['light', 'soft_light', 'soft', 'arctic'].includes(value)) return 'soft_light';
  return THEME_IDS.includes(value) ? value : 'soft_light';
}

function readStoredTheme() {
  try {
    return normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
  } catch (_) {
    return 'soft_light';
  }
}

function applyDomTheme(theme) {
  const activeTheme = normalizeTheme(theme);
  const root = document.documentElement;
  root.dataset.theme = activeTheme;
  root.style.colorScheme = activeTheme === 'deep_ocean' ? 'dark' : 'light';

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', THEME_COLORS[activeTheme]);
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === 'undefined') return 'soft_light';
    const storedTheme = readStoredTheme();
    applyDomTheme(storedTheme);
    return storedTheme;
  });

  useEffect(() => {
    applyDomTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (_) {}
  }, [theme]);

  const setTheme = useCallback((nextTheme) => {
    setThemeState(normalizeTheme(nextTheme));
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((previousTheme) => {
      const index = THEME_IDS.indexOf(normalizeTheme(previousTheme));
      return THEME_IDS[(index + 1) % THEME_IDS.length];
    });
  }, []);

  const value = useMemo(() => ({
    theme,
    meta: THEME_META[theme] || THEME_META.soft_light,
    isDark: theme === 'deep_ocean',
    isLight: theme === 'soft_light',
    isBlueGlass: theme === 'blue_glass',
    isWarm: theme === 'blue_glass',
    isGraphite: theme === 'blue_glass',
    setTheme,
    cycleTheme,
    themes: THEME_IDS.map((id) => THEME_META[id]),
  }), [theme, setTheme, cycleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'soft_light',
      meta: THEME_META.soft_light,
      isDark: false,
      isLight: true,
      isBlueGlass: false,
      isWarm: false,
      isGraphite: false,
      setTheme: () => {},
      cycleTheme: () => {},
      themes: THEME_IDS.map((id) => THEME_META[id]),
    };
  }
  return context;
}

export { STORAGE_KEY as THEME_STORAGE_KEY };
