import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cssPath = resolve(process.cwd(), 'src/uiux-page-system-2026.css');
const mainPath = resolve(process.cwd(), 'src/main.jsx');
const appPath = resolve(process.cwd(), 'src/App.jsx');
const themePath = resolve(process.cwd(), 'src/hooks/useTheme.jsx');
const stockPagePath = resolve(process.cwd(), 'src/pages/StokPage.jsx');
const stockCssPath = resolve(process.cwd(), 'src/pages/stok.css');

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
    expect(graphite).toMatch(/--ux-accent:\s*#6366f1/i);
    expect(graphite).toMatch(/--ux-accent-secondary:\s*#06b6d4/i);
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
    expect(graphite).toContain('--accent: #6366f1');
    expect(graphite).toContain('--brand-teal: #6366f1');
    expect(graphite).toContain('--brand-orange: #06b6d4');
    expect(theme).toContain("description: 'Graphite · Cyan · Indigo — industrial premium'");
    expect(theme).toContain("graphite_titanium: '#6366f1'");
  });

  it('provides dark, readable surfaces for Agent chat and Dashboard chart', () => {
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toContain('[data-ui-page="ai"] .max-w-4xl > :is(header,div.relative,form)');
    expect(css).toContain('[data-ui-page="ai"] .max-w-4xl .bg-white');
    expect(css).toContain('html[data-theme] [data-ui-page="ai"] .max-w-4xl > .relative {\n  width: 100%; max-width: 100%; min-width: 0;');
    expect(css).toContain('html[data-theme] [data-ui-page="ai"] [role="log"] > .m-auto {\n  width: 100%');
    expect(css).toContain('html[data-theme="graphite_titanium"] .home-agent-card');
    const navCss = readFileSync(resolve(process.cwd(), 'src/ui-nav-layout.css'), 'utf8');
    expect(navCss).toContain('background: transparent;');
    expect(navCss).toContain('box-shadow: none;');
    expect(navCss).toContain('filter: none;');
    expect(css).toContain('[data-ui-page="dashboard"] .dashboard-chart-wrap > .relative.h-36');
  });

  it('enforces the GUDANG69_PRODIS sticky header brand contract', () => {
    const app = readFileSync(appPath, 'utf8');
    expect(app).toContain('GUDANG69_PRODIS');
    expect(app).not.toContain('GUDANG-69 RUDI');
  });

  it('renders entity-filtered inventory as compact status-coded item cards', () => {
    const page = readFileSync(stockPagePath, 'utf8');
    const css = readFileSync(stockCssPath, 'utf8');
    expect(page).toContain('className="sk-item-list"');
    expect(page).toContain('className="sk-item-metrics"');
    expect(page).toContain('Sisa stok');
    expect(page).toContain('Stok aman');
    expect(page).toContain('{ENTITAS.map((e) => (');
    expect(page).toContain('terfilter.slice(0, limit).map((it) => (');
    expect(page).not.toContain('className="sk-desktop-table-wrap"');
    expect(css).toContain('grid-template-columns:repeat(3,minmax(0,1fr))');
    expect(css).toContain('content-visibility:auto; contain-intrinsic-size:0 96px;');
    expect(css).toContain('border-left:4px solid var(--sk-mut)');
    expect(css).toContain('var(--stok-kritis)');
    expect(css).toContain('var(--stok-waspada)');
    expect(css).toContain('var(--stok-aman)');
  });

  it('keeps bottom navigation flush, safe-area aware, and reserves content space', () => {
    const navCss = readFileSync(resolve(process.cwd(), 'src/ui-nav-layout.css'), 'utf8');
    const app = readFileSync(appPath, 'utf8');
    const main = readFileSync(mainPath, 'utf8');
    expect(navCss).toContain('min-height: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px));');
    expect(navCss).toContain('padding-bottom: env(safe-area-inset-bottom, 0px);');
    expect(navCss).toContain('body:has(.nav-bar) { padding-bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px)); }');
    expect(navCss).toContain('width: 28px;');
    expect(navCss).toContain('white-space: nowrap;');
    expect(main).toContain("import './ui-nav-layout.css'");
    expect(app).toContain('className="nav-bar fixed bottom-0 left-0 right-0 safe-bottom z-40"');
  });

  it('removes duplicate dashboard and page helper headings while keeping the primary titles', () => {
    const dashboard = readFileSync(resolve(process.cwd(), 'src/pages/DashboardPage.jsx'), 'utf8');
    const stock = readFileSync(stockPagePath, 'utf8');
    const po = readFileSync(resolve(process.cwd(), 'src/pages/POPage.jsx'), 'utf8');
    expect(dashboard).not.toContain('Status Stok · per Divisi');
    expect(dashboard).not.toContain('Status PO · Purchase Order');
    expect(dashboard).toContain('Status per Divisi');
    expect(dashboard).toContain('Status PO</span>');
    expect(stock).toContain('<h1>Stok Barang</h1>');
    expect(stock).not.toContain('sk-head-subtitle');
    expect(po).toContain('Purchase order</h2>');
    expect(po).not.toContain("'Generate, pantau, dan konfirmasi PO'");
  });

  it('uses a single shared surface for settings menu rows instead of nested cards', () => {
    const settings = readFileSync(resolve(process.cwd(), 'src/pages/SettingsPage.jsx'), 'utf8');
    const css = readFileSync(cssPath, 'utf8');
    expect(settings).toContain('className="settings-menu-list"');
    expect(settings).toContain('settings-menu-logout');
    expect(settings).not.toContain('<div className="card overflow-hidden">');
    expect(css).toContain('.settings-menu-list .settings-menu-row + .settings-menu-row');
    expect(css).toContain('min-height:46px; padding-block:6px !important;');
  });

  it('keeps PO recommendation cards flat, caption-light, and theme-aware', () => {
    const po = readFileSync(resolve(process.cwd(), 'src/pages/POPage.jsx'), 'utf8');
    const css = readFileSync(resolve(process.cwd(), 'src/ui-human-operator-refinement.css'), 'utf8');
    const status = readFileSync(resolve(process.cwd(), 'src/components/StatusPOHub.jsx'), 'utf8');
    expect(po).toContain('po-recommendation-panel');
    expect(po).toContain('po-generator-tab-cs');
    expect(po).toContain('po-generator-tab-produksi');
    expect(po).not.toContain('hub-sub');
    expect(po).not.toContain('po-overview-summary');
    expect(po).not.toContain('2 jalur:');
    expect(po).not.toContain('Cold Storage</p>');
    expect(po).not.toContain('Prioritas dapur');
    expect(po).not.toContain('>Kedatangan:');
    expect(po).not.toContain('item.kode} · {item.size');
    expect(po).not.toContain('>Tgl</span>');
    expect(po).toContain('aria-label="Tanggal kedatangan PO"');
    expect(po).toContain('Item kritis');
    expect(po).toContain('Total kurang');
    expect(po).toContain('po-recommendation-metrics"');
    expect(status).toContain('Belum selesai:');
    expect(status).toContain('Sisa {sisa} · PO {it.qtyPO}');
    expect(status).toContain('Qty PO: {it.qtyPO}');
    expect(status).toContain('Sudah datang: {it.qtyDatang}');
    expect(status).toContain('selectedItem.qtyPO');
    expect(status).toContain('selectedItem.qtyDatang');
    expect(css).toContain('.po-operational-context');
    expect(css).toContain('.po-metric-label');
    expect(status).not.toContain('className="card section-card rounded-2xl p-4 space-y-3"');
    expect(status).toContain('po-status-inline');
    expect(status).not.toContain('Ketuk untuk edit qty');
    expect(status).not.toContain('Hanya untuk melihat status.');
    expect(status).not.toContain('Pilih periode yang akan dikonfirmasi');
    expect(status).not.toContain('Periode berjalan · Belum selesai:');
    expect(status).toContain('Qty PO: {it.qtyPO}');
    expect(status).toContain('Sudah datang: {it.qtyDatang}');
    expect(css).toContain('.po-status-panel');
    expect(css).toContain('.po-status-inline span');
    expect(css).toContain('.po-selected-item');
    expect(css).toContain('.po-entity-choice');
    expect(css).toContain('.po-recommendation-icon');
    expect(css).toContain('.po-recommendation-metrics > div');
    expect(css).toContain('.po-recommendation-panel :is(.card,.surface,.section-card,.stock-card)');
    expect(css).toContain('background: transparent !important;');
    expect(css).toContain('box-shadow: none !important;');
    for (const theme of ['soft_light', 'deep_ocean', 'graphite_titanium']) {
      expect(css).toContain(`html[data-theme="${theme}"]`);
    }
    expect(css).toContain('--po-cs-bg:');
    expect(css).toContain('--po-prod-bg:');
  });

  it('keeps page labels concise and removes redundant copy', () => {
    const app = readFileSync(appPath, 'utf8');
    const dashboard = readFileSync(resolve(process.cwd(), 'src/pages/DashboardPage.jsx'), 'utf8');
    const stock = readFileSync(stockPagePath, 'utf8');
    const input = readFileSync(resolve(process.cwd(), 'src/pages/InputPage.jsx'), 'utf8');
    const history = readFileSync(resolve(process.cwd(), 'src/pages/RiwayatPage.jsx'), 'utf8');
    const settings = readFileSync(resolve(process.cwd(), 'src/pages/SettingsPage.jsx'), 'utf8');

    expect(app).not.toContain('TAB_SUBTITLE');
    expect(app).not.toContain('Ringkasan operasional gudang');
    expect(app).toContain("label: 'Riwayat'");
    expect(app).toContain("label: 'Sinkronisasi'");
    expect(app).toContain("label: 'Pengaturan'");
    expect(dashboard).not.toContain('po-shortcut-subtitle');
    expect(dashboard).not.toContain('Angka = persentase dari total');
    expect(dashboard).not.toContain('Outlet terlayani');
    expect(dashboard).not.toContain('MASTER</span>');
    expect(dashboard).not.toContain('JARINGAN</span>');
    expect(dashboard).not.toContain('SKU aktif · Dashboard Live');
    expect(dashboard).not.toContain('po-shortcut-count">Buka');
    expect(stock).toContain('<h1>Stok Barang</h1>');
    expect(stock).not.toContain('sk-section-label">Divisi');
    expect(stock).not.toContain('sk-section-label">Kondisi stok');
    expect(input).not.toContain('input-methods-note');
    expect(input).not.toContain('Metode input otomatis terkunci');
    expect(history).not.toContain('<small>Aktivitas persediaan</small>');
    expect(settings).not.toContain('t.description');
  });

});
