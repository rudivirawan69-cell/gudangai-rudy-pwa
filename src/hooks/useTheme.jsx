import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

const STORAGE_KEY = 'gudangai_theme';

export const THEME_IDS = ['soft_light', 'deep_ocean', 'graphite_titanium'];

export const THEME_META = {
  soft_light: {
    id: 'soft_light',
    label: 'Arctic Professional',
    short: 'Arctic',
    description: 'Putih · Ice Blue · Navy — bersih dan profesional',
  },
  deep_ocean: {
    id: 'deep_ocean',
    label: 'Deep Ocean',
    short: 'Ocean',
    description: 'Midnight Navy · Teal · Cyan — mode gelap',
  },
  graphite_titanium: {
    id: 'graphite_titanium',
    label: 'Graphite Titanium',
    short: 'Graphite',
    description: 'Graphite · Titanium · Amber — industrial premium',
  },
};

const THEME_COLORS = {
  soft_light: '#247ba8',
  deep_ocean: '#35b9b0',
  graphite_titanium: '#d69a48',
};

const ThemeContext = createContext(null);

function normalizeTheme(raw) {
  const value = String(raw || '').toLowerCase().trim();
  if (['dark', 'deep_ocean', 'ocean', 'navy'].includes(value)) return 'deep_ocean';
  if (['warm', 'warm_productive', 'productive', 'teal', 'glass', 'graphite', 'graphite_titanium'].includes(value)) return 'graphite_titanium';
  if (['light', 'soft_light', 'soft'].includes(value)) return 'soft_light';
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
  root.style.colorScheme = activeTheme === 'soft_light' ? 'light' : 'dark';

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
    isDark: theme !== 'soft_light',
    isLight: theme === 'soft_light',
    isWarm: theme === 'graphite_titanium',
    isGraphite: theme === 'graphite_titanium',
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
