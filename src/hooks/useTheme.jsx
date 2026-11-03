import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

const STORAGE_KEY = 'gudangai_theme';

/** Tiga pengalaman antarmuka GudangAI; ID lama dipertahankan agar preferensi perangkat tetap kompatibel. */
export const THEME_IDS = ['soft_light', 'deep_ocean', 'graphite_titanium'];

export const THEME_META = {
  soft_light: {
    id: 'soft_light',
    label: 'Blue Glass',
    short: 'Blue Glass',
    description: 'Full-screen · premium fintech · glass transparan',
  },
  deep_ocean: {
    id: 'deep_ocean',
    label: 'Deep Ocean',
    short: 'Ocean',
    description: 'Minimal · bersih · cepat untuk pekerjaan rutin',
  },
  graphite_titanium: {
    id: 'graphite_titanium',
    label: 'Mobile Operations',
    short: 'Operations',
    description: 'Hybrid · glass 3D halus · tombol kerja lapangan',
  },
};

const ThemeContext = createContext(null);

function normalizeTheme(raw) {
  const v = String(raw || '').toLowerCase().trim();
  if (v === 'dark' || v === 'deep_ocean' || v === 'ocean' || v === 'navy' || v === 'minimal') return 'deep_ocean';
  if (v === 'warm' || v === 'warm_productive' || v === 'productive' || v === 'teal' || v === 'glass' || v === 'graphite' || v === 'graphite_titanium' || v === 'mobile_operations' || v === 'operations') return 'graphite_titanium';
  if (v === 'light' || v === 'soft_light' || v === 'soft' || v === 'blue_glass' || v === 'blue-glass') return 'soft_light';
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
  root.style.colorScheme = t === 'deep_ocean' || t === 'graphite_titanium' ? 'dark' : 'light';
  const themeColors = {
    soft_light: '#1766a8',
    deep_ocean: '#35b9b0',
    graphite_titanium: '#0f8b83',
  };
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) themeColorMeta.setAttribute('content', themeColors[t] || themeColors.soft_light);
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
      isWarm: theme === 'graphite_titanium',
      isGraphite: theme === 'graphite_titanium',
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
      isGraphite: false,
      setTheme: () => {},
      cycleTheme: () => {},
      themes: THEME_IDS.map((id) => THEME_META[id]),
    };
  }
  return ctx;
}

export { STORAGE_KEY as THEME_STORAGE_KEY };
