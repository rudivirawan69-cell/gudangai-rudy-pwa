import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cssPath = fileURLToPath(new URL('./uiux-page-system-2026.css', import.meta.url));
const mainPath = fileURLToPath(new URL('./main.jsx', import.meta.url));
const appPath = fileURLToPath(new URL('./App.jsx', import.meta.url));

describe('GudangAI Metode C UI contract', () => {
  it('includes a dedicated page-scoped visual stylesheet', () => {
    expect(existsSync(cssPath)).toBe(true);
    if (!existsSync(cssPath)) return;
    const css = readFileSync(cssPath, 'utf8');
    for (const page of ['dashboard', 'stok', 'input', 'po', 'riwayat', 'ai', 'settings', 'sync']) {
      expect(css).toContain(`[data-ui-page="${page}"]`);
    }
  });

  it('defines all three official themes', () => {
    if (!existsSync(cssPath)) return;
    const css = readFileSync(cssPath, 'utf8');
    for (const theme of ['soft_light', 'deep_ocean', 'graphite_titanium']) {
      expect(css).toContain(`html[data-theme="${theme}"]`);
    }
  });

  it('keeps Graphite Titanium on the approved cyan and indigo palette, not gold', () => {
    if (!existsSync(cssPath)) return;
    const css = readFileSync(cssPath, 'utf8');
    const graphite = css.match(/html\\[data-theme="graphite_titanium"\\]\\s*\\{([^}]+)\\}/)?.[1] || '';
    expect(graphite).toMatch(/--ux-accent:\\s*#00e5ff/i);
    expect(graphite).toMatch(/--ux-accent-secondary:\\s*#6366f1/i);
    expect(graphite).not.toMatch(/#d6a45b|#c6ae87|214,164,91|198,174,135/i);
  });

  it('loads the visual stylesheet from the application entry point', () => {
    const main = readFileSync(mainPath, 'utf8');
    expect(main).toContain("import './uiux-page-system-2026.css'");
  });

  it('marks the active tab on the main page container without changing routing', () => {
    const app = readFileSync(appPath, 'utf8');
    expect(app).toContain('<main data-ui-page={tab}');
    for (const tab of ["'dashboard'", "'stok'", "'input'", "'po'", "'ai'", "'riwayat'", "'settings'", "'sync'"]) {
      expect(app).toContain(`case ${tab}`);
    }
  });
});
