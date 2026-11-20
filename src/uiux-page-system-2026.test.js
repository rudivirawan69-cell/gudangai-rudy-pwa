import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cssPath = resolve(process.cwd(), 'src/uiux-page-system-2026.css');
const mainPath = resolve(process.cwd(), 'src/main.jsx');
const appPath = resolve(process.cwd(), 'src/App.jsx');
const themePath = resolve(process.cwd(), 'src/hooks/useTheme.jsx');

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
    const graphite = css.match(/html\[data-theme="graphite_titanium"\]\s*\{([^}]+)\}/)?.[1] || '';
    expect(graphite).toMatch(/--ux-accent:\s*#00e5ff/i);
    expect(graphite).toMatch(/--ux-accent-secondary:\s*#6366f1/i);
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
  it('uses the approved cyan-indigo palette in Graphite runtime tokens and metadata', () => {
    const css = readFileSync(cssPath, 'utf8');
    const theme = readFileSync(themePath, 'utf8');
    const graphite = css.split('html[data-theme="graphite_titanium"]')[1]?.split('}')[0] || '';
    expect(graphite).toContain('--accent: #00e5ff');
    expect(graphite).toContain('--brand-teal: #00e5ff');
    expect(graphite).toContain('--brand-orange: #6366f1');
    expect(theme).toContain("description: 'Graphite · Cyan · Indigo — industrial premium'");
    expect(theme).toContain("graphite_titanium: '#00e5ff'");
  });

  it('provides dark, readable surfaces for Agent chat and Dashboard chart', () => {
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toContain('[data-ui-page="ai"] .max-w-4xl > :is(header,div.relative,form)');
    expect(css).toContain('[data-ui-page="ai"] .max-w-4xl .bg-white');
    expect(css).toContain('html[data-theme] [data-ui-page="ai"] [role="log"] > .m-auto {\n  width: 100%');
    expect(css).toContain('html[data-theme="graphite_titanium"] .home-agent-card');
    expect(css).toContain('background: linear-gradient(145deg,var(--accent),var(--accent-strong)) !important;');
    expect(css).toContain('[data-ui-page="dashboard"] .dashboard-chart-wrap > .relative.h-36');
  });

  it('uses the approved GUDANGAI RUDY PRO sticky header brand', () => {
    const app = readFileSync(appPath, 'utf8');
    expect(app).toContain('GUDANGAI RUDY PRO');
    expect(app).not.toContain('GUDANG-69 RUDI');
  });

});
