import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const HOST = 'http://127.0.0.1:4173';

function hexRgb(value) {
  const match = String(value).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  assert.ok(match, `Expected a 3- or 6-digit hex color token, received: ${value}`);
  const hex = match[1].length === 3
    ? match[1].split('').map((channel) => channel + channel).join('')
    : match[1];
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function relativeLuminance(rgb) {
  const linear = rgb.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const values = [relativeLuminance(hexRgb(foreground)), relativeLuminance(hexRgb(background))].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const items = [
  { kode: 'CV-0001', nama: 'Ayam Fillet Dada', entitas: 'CV', entity: 'CV', stok: 25, stockAkhir: 25, stockAman: 20, satuan: 'Pack', divisi: 'CS' },
  { kode: 'PT-0001', nama: 'Bebek', entitas: 'PT', entity: 'PT', stok: 8, stockAkhir: 8, stockAman: 15, satuan: 'Pack', divisi: 'PRODUKSI' },
];

const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
  stdio: 'ignore',
  env: { ...process.env, CI: '1' },
});

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    try {
      const response = await fetch(HOST);
      if (response.ok) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Vite preview did not become ready within 30 seconds.');
}

const browser = await chromium.launch({ headless: true });
try {
  await waitForServer();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const pageErrors = [];
  let mainFrameNavigations = 0;
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) mainFrameNavigations += 1; });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.addInitScript(({ inputDraft, poDraft }) => {
    localStorage.setItem('gudangai_user', JSON.stringify({ name: 'Operator Uji', role: 'owner', loginAt: new Date().toISOString() }));
    localStorage.setItem('gudangai_supabase_session_v1', JSON.stringify({
      access_token: 'ci-mock-access-token',
      refresh_token: 'ci-mock-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: 'ci-auth-user-001',
        email: 'operator@example.test',
        app_metadata: { role: 'owner' },
        user_metadata: { full_name: 'Operator Uji' },
      },
    }));
    localStorage.setItem('gudangai_api_url', location.origin + '/mock-api');
    localStorage.setItem('gudangai_api_secret', 'ci-mock-secret');
    localStorage.setItem('gudangai_input_draft_v1', JSON.stringify(inputDraft));
    localStorage.setItem('gudangai_po_draft_v1', JSON.stringify(poDraft));
  }, {
    inputDraft: {
      version: 1, entity: 'CV', txType: 'masuk', tanggal: '01/11/2026',
      cart: [{ kode: 'CV-0001', nama: 'Ayam Fillet Dada', satuan: 'Pack', qty: 2, clientItemId: 'CI-E2E-INPUT-001' }],
      pdfReview: [], reviewSourceLabel: 'PDF',
    },
    poDraft: {
      version: 1, tab: 'cs', csGenerated: true, prodGenerated: false, hub: 'generate',
      csItems: [{ kode: 'CV-0001', nama: 'Ayam Fillet Dada', entity: 'CV', satuan: 'Pack', size: '1 kg', sisa: 5, aman: 10, qty: 5, tglKedatangan: '2026-11-03', divisi: 'CS' }],
      prodItems: [],
    },
  });

  // CI-only Supabase Auth fixture: exercise the authenticated app shell without real credentials.
  await page.route('**/auth/v1/user', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'ci-auth-user-001',
        email: 'operator@example.test',
        app_metadata: { role: 'owner' },
        user_metadata: { full_name: 'Operator Uji' },
      }),
    });
  });

  await page.route('https://gudangai-rudy-pwa-69.rudivirawan69.workers.dev/api/agent/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, primaryConfigured: true, model: 'CI Mock Workers AI' }),
    });
  });

  await page.route('**/mock-api**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let action = url.searchParams.get('action') || '';
    if (request.method() === 'POST') {
      try { action = JSON.parse(request.postData() || '{}').action || action; } catch (_) {}
    }
    let data;
    if (action === 'ping' || action === 'status') {
      data = { success: true, status: 'OK', version: '6.6.5+BULK-STABLE', batchSupported: true };
    } else if (action === 'bootstrap') {
      data = { success: true, items, masterVersion: 'E2E-MASTER-1', stockVersion: 'E2E-STOCK-1', snapshotId: 'E2E-1' };
    } else if (action === 'getAllStock') {
      const entity = url.searchParams.get('entitas') || 'ALL';
      data = { success: true, items: entity === 'ALL' ? items : items.filter((it) => it.entitas === entity) };
    } else if (action === 'getDashboard') {
      data = { success: true, statusPerDivisi: [{ divisi: 'CS', total: 1, aman: 1, waspada: 0, kritis: 0 }, { divisi: 'PRODUKSI', total: 1, aman: 0, waspada: 0, kritis: 1 }] };
    } else if (action === 'getStatusPO') {
      data = { success: true, summary: { totalPO: 0, itemMenunggu: 0, complete: 0, partial: 0, pending: 0 }, mingguIni: [], mingguLalu: [], items: [] };
    } else if (action === 'getTransactionHistory') {
      data = { success: true, items: [] };
    } else {
      data = { success: true, items: [] };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(data) });
  });

  await page.goto(HOST, { waitUntil: 'domcontentloaded' });
  await page.locator('nav.nav-bar').waitFor({ state: 'visible', timeout: 15000 });

  const tabs = [
    ['Beranda', 'Status per Divisi'],
    ['Stok', 'Data Stok'],
    ['Input', 'Draft transaksi dipulihkan'],
    ['Agent', 'Agent Rubee Intelligence'],
  ];
  const openMorePage = async (label, marker) => {
    await page.locator('nav.nav-bar button').filter({ hasText: 'Lainnya' }).first().click();
    const sheet = page.locator('.more-sheet');
    await sheet.waitFor({ state: 'visible', timeout: 5000 });
    await sheet.locator('button').filter({ hasText: label }).first().click();
    await page.getByText(marker, { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
  };

  const viewports = [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 768, height: 1024 },
    { width: 1366, height: 768 },
  ];
  const assertNoHorizontalOverflow = async (label, viewport) => {
    const dimensions = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      };
      return {
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        header: rect('.app-header-card'),
        nav: rect('.nav-bar'),
        navInner: rect('.nav-bar > div'),
      };
    });
    assert.ok(
      dimensions.document <= dimensions.viewport + 2 && dimensions.body <= dimensions.viewport + 2,
      `Horizontal overflow on ${label} at ${viewport.width}px: ${JSON.stringify(dimensions)}`
    );
    for (const edge of ['header', 'nav', 'navInner']) {
      assert.ok(
        dimensions[edge] && dimensions[edge].left <= 1 && dimensions[edge].right >= dimensions.viewport - 1,
        `Full-screen ${edge} is not edge-to-edge on ${label} at ${viewport.width}px: ${JSON.stringify(dimensions)}`
      );
    }
  };

  // Every primary page is opened at every target viewport.
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const [label, marker] of tabs) {
      const button = page.locator('nav.nav-bar button').filter({ hasText: label }).first();
      await button.click();
      const visibleMarker = page.getByText(marker, { exact: false }).last();
      try {
        await visibleMarker.waitFor({ state: 'visible', timeout: 10000 });
      } catch (error) {
        const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 1600);
        throw new Error(`Page marker not visible: ${label} at ${viewport.width}px; expected "${marker}". Body: ${bodyText}. Cause: ${error.message}`);
      }
      const boundaryErrors = await page.getByText('Halaman gagal dimuat', { exact: false }).count();
      assert.equal(boundaryErrors, 0, `Error boundary shown on ${label}`);
      await assertNoHorizontalOverflow(label, viewport);
    }

    // Hidden destinations are reached through the actual 5th navigation item.
    await openMorePage('Riwayat', 'Transaksi');
    await assertNoHorizontalOverflow('Riwayat', viewport);
    await openMorePage('Pengaturan', 'Mode Tampilan');
    await assertNoHorizontalOverflow('Pengaturan', viewport);
    await openMorePage('Antrian Sinkronisasi', 'Antrian Sinkronisasi');
    await assertNoHorizontalOverflow('Antrian Sinkronisasi', viewport);
  }


  // Verify the restored Data Stock page keeps CV/PT selection and division expansion.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('nav.nav-bar button').filter({ hasText: 'Stok' }).first().click();
  await page.getByText('Data Stok', { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('button', { name: 'CV', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'PT', exact: true }).click();
  await page.getByRole('button').filter({ hasText: 'PRODUKSI' }).first().click();
  await page.getByText('Bebek', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('button', { name: 'CV', exact: true }).click();
  await page.getByRole('button').filter({ hasText: 'CS' }).first().click();
  await page.getByText('Ayam Fillet Dada', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });

  // Verify all three supported themes on the three requested primary pages.
  for (const theme of ['soft_light', 'deep_ocean', 'graphite_titanium']) {
    await page.evaluate((value) => {
      localStorage.setItem('gudangai_theme', value);
    }, theme);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('nav.nav-bar').waitFor({ state: 'visible', timeout: 15000 });
    for (const [label, marker] of [['Beranda', 'Status per Divisi'], ['Stok', 'Data Stok'], ['Input', 'Draft transaksi dipulihkan'], ['Agent', 'Agent Rubee Intelligence']]) {
      await page.locator('nav.nav-bar button').filter({ hasText: label }).first().click();
      await page.getByText(marker, { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
      const themeState = await page.evaluate(() => ({
        id: document.documentElement.getAttribute('data-theme'),
        surface: getComputedStyle(document.documentElement).getPropertyValue('--bg-elevated').trim(),
        text: getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim(),
      }));
      assert.equal(themeState.id, theme, `Theme mismatch on ${label}: ${JSON.stringify(themeState)}`);
      assert.ok(themeState.surface && themeState.text, `Theme tokens missing on ${label} in ${theme}`);
      if (label === 'Input') {
        assert.equal(await page.locator('[data-testid="input-search-results"]').count(), 0,
          'Input search results must remain hidden when the search field is empty.');
      }
    }
  }

  // Phase 3 visual evidence: capture 3 themes x 4 primary pages x 2 viewport classes.
  const screenshotRoot = 'artifacts/visual-phase3';
  await mkdir(screenshotRoot, { recursive: true });
  const visualPages = [
    ['Beranda', 'Status per Divisi', 'beranda'],
    ['Stok', 'Data Stok', 'stok'],
    ['Input', 'Draft transaksi dipulihkan', 'input'],
    ['Agent', 'Agent Rubee Intelligence', 'agent'],
  ];
  const visualViewports = [
    { width: 390, height: 844, label: 'mobile' },
    { width: 1366, height: 768, label: 'desktop' },
  ];
  await openMorePage('Pengaturan', 'Mode Tampilan');
  const themeButtons = page.locator('.theme-picker-btn');
  assert.equal(await themeButtons.count(), 3, 'Settings must expose exactly three theme controls.');
  const navigationCountBeforeToggle = mainFrameNavigations;
  for (let i = 0; i < 10; i += 1) {
    const index = i % 3;
    await page.locator('.theme-picker-btn').nth(index).click();
    const expected = ['soft_light', 'deep_ocean', 'graphite_titanium'][index];
    await page.waitForFunction((value) => document.documentElement.dataset.theme === value, expected);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), expected,
      `Theme toggle ${i + 1} did not apply ${expected}.`);
  }
  assert.equal(mainFrameNavigations, navigationCountBeforeToggle,
    'Theme switching caused a document navigation/reload.');

  for (const theme of ['soft_light', 'deep_ocean', 'graphite_titanium']) {
    await openMorePage('Pengaturan', 'Mode Tampilan');
    const themeIndex = ['soft_light', 'deep_ocean', 'graphite_titanium'].indexOf(theme);
    await page.locator('.theme-picker-btn').nth(themeIndex).click();
    await page.waitForFunction((value) => document.documentElement.dataset.theme === value, theme);
    for (const viewport of visualViewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const [label, markerText, slug] of visualPages) {
        await page.locator('nav.nav-bar button').filter({ hasText: label }).first().click();
        await page.getByText(markerText, { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
        const safeTheme = await page.evaluate(() => ({
          id: document.documentElement.dataset.theme,
          bg: getComputedStyle(document.documentElement).getPropertyValue('--bg-elevated').trim(),
          fg: getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim(),
        }));
        assert.equal(safeTheme.id, theme, `Wrong theme on ${label}: ${JSON.stringify(safeTheme)}`);
        assert.ok(safeTheme.bg && safeTheme.fg, `Missing color tokens on ${label} in ${theme}`);
        const ratio = contrastRatio(safeTheme.fg, safeTheme.bg);
        assert.ok(ratio >= 4.5, `Text contrast below WCAG AA on ${label} in ${theme}: ${ratio.toFixed(2)}:1`);
        await page.screenshot({
          path: `${screenshotRoot}/${theme}-${slug}-${viewport.label}.png`,
          fullPage: true,
          animations: 'disabled',
        });
      }
    }
  }

  // Drafts must survive page unmount/remount caused by bottom navigation.
  await page.locator('nav.nav-bar button').filter({ hasText: 'Input' }).first().click();
  await page.getByText('Draft transaksi dipulihkan', { exact: false }).waitFor({ state: 'visible' });
  await page.locator('nav.nav-bar button').filter({ hasText: 'Stok' }).first().click();
  await page.locator('nav.nav-bar button').filter({ hasText: 'Input' }).first().click();
  await page.getByText('Draft transaksi dipulihkan', { exact: false }).waitFor({ state: 'visible' });

  assert.deepEqual(pageErrors, [], 'Uncaught browser errors were detected during page smoke tests.');
  console.log('PASS: four primary tabs + MoreSheet destinations + Data Stock CV/PT/division behavior + full-screen edges + Input draft recovery + five viewport widths + three themes.');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
