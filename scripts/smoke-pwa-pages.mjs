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

function computedRgbToHex(value) {
  const channels = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  assert.ok(channels, `Expected computed RGB color, received: ${value}`);
  return `#${channels.slice(1, 4).map((channel) => Number(channel).toString(16).padStart(2, '0')).join('')}`;
}

const items = [
  { kode: 'CV-0001', nama: 'Ayam Fillet Dada', entitas: 'CV', entity: 'CV', stok: 25, stockAkhir: 25, stockAman: 20, satuan: 'Pack', divisi: 'CS' },
  { kode: 'PT-0001', nama: 'Bebek', entitas: 'PT', entity: 'PT', stok: 8, stockAkhir: 8, stockAman: 15, satuan: 'Pack', divisi: 'PRODUKSI' },
  { kode: 'BB-0001', nama: 'Tepung Bumbu', entitas: 'Bahan Baku', entity: 'Bahan Baku', stok: 18, stockAkhir: 18, stockAman: 24, satuan: 'Pail', divisi: 'BAHAN BAKU' },
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
let transactionWriteCalls = 0;
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
    localStorage.setItem('gudangai_history', JSON.stringify([{
      id: 'CI-HISTORY-001', transactionId: 'CI-HISTORY-001', type: 'masuk', entity: 'CV',
      savedAt: '2026-11-26T02:00:00.000Z', status: 'success', syncStatus: 'success',
      items: [{ kode: 'CV-0001', nama: 'Ayam Fillet Dada', qty: 2, satuan: 'Pack' }],
      keterangan: 'CI note must not appear on the collapsed day card',
    }]));
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
      if (action === 'bulkTransaction' || action === 'addTransaction') transactionWriteCalls += 1;
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
  assert.equal((await page.locator('.app-header-card h1').innerText()).trim(), 'GUDANG69_PRODIS', 'Sticky header brand must match the approved product name.');
  await page.getByRole('button', { name: 'Pusat notifikasi' }).click();
  await page.getByText('Pusat Notifikasi', { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('nav.nav-bar button').filter({ hasText: 'Beranda' }).first().click();
  await page.getByText('Status per Divisi', { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });

  const tabs = [
    ['Beranda', 'Status per Divisi'],
    ['Stok', 'Stok barang'],
    ['Input', 'Draft transaksi dipulihkan'],
    ['Agent', 'Agent Rubee Intelligence'],
    ['Notifikasi', 'Pusat Notifikasi'],
  ];
  // PO recommendation visual contract: run before unrelated Input-page assertions.
  const poScreenshotRoot = 'artifacts/visual-phase3';
  await mkdir(poScreenshotRoot, { recursive: true });
  const originalTheme = await page.evaluate(() => localStorage.getItem('gudangai_theme'));
  for (const theme of ['soft_light', 'deep_ocean', 'graphite_titanium']) {
    await page.evaluate((value) => localStorage.setItem('gudangai_theme', value), theme);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('nav.nav-bar').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('nav.nav-bar button').filter({ hasText: 'PO' }).first().click();
    await page.getByText('Purchase order', { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
    for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport);
      for (const [tabLabel, panelClass, slugSuffix] of [
        ['PO CS', 'po-recommendation-cs', 'cs'],
        ['PO Produksi', 'po-recommendation-produksi', 'produksi'],
      ]) {
        await page.locator('main[data-ui-page="po"] .po-generator-tab').filter({ hasText: tabLabel }).click();
        const panel = page.locator(`main[data-ui-page="po"] .${panelClass}`);
        await panel.waitFor({ state: 'visible', timeout: 5000 });
        const visual = await panel.evaluate((el) => {
          const icon = el.querySelector('.po-recommendation-icon');
          const style = getComputedStyle(el);
          const iconStyle = getComputedStyle(icon);
          return {
            background: style.backgroundColor,
            foreground: style.color,
            iconBackground: iconStyle.backgroundColor,
            iconShadow: iconStyle.boxShadow,
            iconFilter: iconStyle.filter,
            nestedSurfaces: el.querySelectorAll('.card,.surface,.section-card,.stock-card').length,
          };
        });
        const ratio = contrastRatio(computedRgbToHex(visual.foreground), computedRgbToHex(visual.background));
        assert.ok(ratio >= 4.5, `PO ${tabLabel} contrast below WCAG AA in ${theme}: ${ratio.toFixed(2)}:1; ${JSON.stringify(visual)}`);
        assert.equal(visual.iconBackground, 'rgba(0, 0, 0, 0)', `PO ${tabLabel} icon tile background must be transparent in ${theme}.`);
        assert.equal(visual.iconShadow, 'none', `PO ${tabLabel} icon must not have a shadow in ${theme}.`);
        assert.equal(visual.iconFilter, 'none', `PO ${tabLabel} icon must not have a filter in ${theme}.`);
        assert.equal(visual.nestedSurfaces, 0, `PO ${tabLabel} recommendation must not contain nested card surfaces in ${theme}.`);
        await page.screenshot({
          path: `${poScreenshotRoot}/${theme}-po-${slugSuffix}-${viewport.width}.png`,
          fullPage: true,
          animations: 'disabled',
        });
        console.log(`[PO VISUAL PASS] ${theme} / ${tabLabel} / ${viewport.width}px / contrast ${ratio.toFixed(2)}:1`);
      }
    }
  }
  await page.evaluate((value) => {
    if (value) localStorage.setItem('gudangai_theme', value);
    else localStorage.removeItem('gudangai_theme');
  }, originalTheme);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav.nav-bar').waitFor({ state: 'visible', timeout: 15000 });

  const openMorePage = async (label, marker) => {
    const sheet = page.locator('.more-sheet');
    // The previous visual scenario may intentionally leave the More menu open.
    // Do not click the underlying nav button while the backdrop intercepts it.
    if (!(await sheet.isVisible().catch(() => false))) {
      const moreButton = page.locator('nav.nav-bar button').filter({ hasText: 'Lainnya' }).first();
      await moreButton.waitFor({ state: 'visible', timeout: 5000 });
      await moreButton.click({ force: true });
    }
    try {
      await sheet.waitFor({ state: 'visible', timeout: 10000 });
    } catch (error) {
      throw new Error(`More menu failed to open before navigating to "${label}". Cause: ${error.message}`);
    }
    await sheet.locator('button').filter({ hasText: label }).first().click({ force: true });
    await page.getByText(marker, { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
  };

  const viewports = [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 430, height: 932 },
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
    // Header and navigation shell must be truly edge-to-edge. The inner
    // navigation row may retain the intentional 4px horizontal safety inset
    // used by the app shell; verify that inset is small and symmetrical rather
    // than incorrectly requiring the inner row itself to touch the viewport.
    for (const edge of ['header', 'nav']) {
      assert.ok(
        dimensions[edge] && dimensions[edge].left <= 1 && dimensions[edge].right >= dimensions.viewport - 1,
        `Full-screen ${edge} is not edge-to-edge on ${label} at ${viewport.width}px: ${JSON.stringify(dimensions)}`
      );
    }
    assert.ok(dimensions.navInner && dimensions.navInner.left >= dimensions.nav.left - 1 &&
      dimensions.navInner.right <= dimensions.nav.right + 1,
    `Navigation inner row must remain inside the full-width navigation shell on ${label} at ${viewport.width}px: ${JSON.stringify(dimensions)}`);
    const navInsetLeft = dimensions.navInner.left - dimensions.nav.left;
    const navInsetRight = dimensions.nav.right - dimensions.navInner.right;
    const centered = Math.abs(navInsetLeft - navInsetRight) <= 1.5;
    const withinDesktopMaxWidth = dimensions.navInner.width <= 760.5;
    const mobileSafetyInset = viewport.width > 768 ||
      (navInsetLeft >= -1 && navInsetRight >= -1 &&
       navInsetLeft <= 5.5 && navInsetRight <= 5.5);
    assert.ok(centered && withinDesktopMaxWidth && mobileSafetyInset,
    `Navigation inner row must be centered, respect its 760px max-width, and use a small mobile safety inset on ${label} at ${viewport.width}px: ${JSON.stringify({ ...dimensions, navInsetLeft, navInsetRight, centered, withinDesktopMaxWidth, mobileSafetyInset })}`);
  };

  // Every primary page is opened at every target viewport.
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const navAudit = await page.locator('nav.nav-bar').evaluate((nav) => ({
      height: nav.getBoundingClientRect().height,
      labels: [...nav.querySelectorAll('.nav-label')].map((node) => ({
        text: node.textContent.trim(),
        visible: node.getBoundingClientRect().height > 0 && getComputedStyle(node).visibility !== 'hidden',
        fits: node.scrollWidth <= node.clientWidth + 1,
      })),
    }));
    assert.ok(navAudit.height >= 64, `Bottom navigation is shorter than 64px: ${JSON.stringify(navAudit)}`);
    assert.deepEqual(navAudit.labels.map((node) => node.text), ['Beranda', 'Stok', 'Input', 'PO', 'Lainnya']);
    assert.ok(navAudit.labels.every((node) => node.visible && node.fits), `Navigation labels are clipped: ${JSON.stringify(navAudit)}`);
    for (const [label, marker] of tabs) {
      if (label === 'Agent') await openMorePage('Agent Rubee AI', marker);
      else if (label === 'Notifikasi') await openMorePage('Notifikasi', marker);
      else await page.locator('nav.nav-bar button').filter({ hasText: label }).first().click();
      const visibleMarker = page.getByText(marker, { exact: false }).last();
      try {
        await visibleMarker.waitFor({ state: 'visible', timeout: 10000 });
      } catch (error) {
        const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 1600);
        throw new Error(`Page marker not visible: ${label} at ${viewport.width}px; expected "${marker}". Body: ${bodyText}. Cause: ${error.message}`);
      }
      const boundaryErrors = await page.getByText('Halaman gagal dimuat', { exact: false }).count();
      assert.equal(boundaryErrors, 0, `Error boundary shown on ${label}`);
      if (label === 'Stok') {
        await page.locator('.sk-item-card').first().waitFor({ state: 'visible', timeout: 10000 });
        const stockCards = await page.evaluate(() => {
          const list = document.querySelector('.sk-item-list');
          const card = document.querySelector('.sk-item-card');
          if (!list || !card) return null;
          const outer = getComputedStyle(list);
          const tile = getComputedStyle(card);
          return {
            outerBackground: outer.backgroundColor, outerBorder: outer.borderTopWidth,
            outerShadow: outer.boxShadow, outerPadding: outer.padding,
            gap: parseFloat(outer.rowGap || outer.gap),
            cardBorder: tile.borderTopWidth, cardRadius: tile.borderTopLeftRadius,
            cardWidth: card.getBoundingClientRect().width, listWidth: list.getBoundingClientRect().width,
          };
        });
        assert.ok(stockCards, 'Stock cards must render independently.');
        assert.equal(stockCards.outerBackground, 'rgba(0, 0, 0, 0)', `Stock list must not be a long enclosing surface: ${JSON.stringify(stockCards)}`);
        assert.equal(stockCards.outerBorder, '0px', `Stock list wrapper must have no border: ${JSON.stringify(stockCards)}`);
        assert.equal(stockCards.outerShadow, 'none', `Stock list wrapper must have no shadow: ${JSON.stringify(stockCards)}`);
        assert.equal(stockCards.outerPadding, '0px', `Stock list wrapper must not inset item cards: ${JSON.stringify(stockCards)}`);
        assert.ok(stockCards.gap >= 8, `Stock cards need visible separation: ${JSON.stringify(stockCards)}`);
        assert.ok(parseFloat(stockCards.cardBorder) > 0 && parseFloat(stockCards.cardRadius) >= 12, `Each SKU must be a rounded independent card: ${JSON.stringify(stockCards)}`);
        assert.ok(Math.abs(stockCards.cardWidth - stockCards.listWidth) <= 1, `Stock cards should align with the list width: ${JSON.stringify(stockCards)}`);
      }
      if (label === 'Input') {
        const inputAudit = await page.evaluate(() => {
          const controls = [...document.querySelectorAll('.input-date-field,.input-entity-btn,.input-notification-btn')];
          const cards = [...document.querySelectorAll('.input-tx-btn')];
          return {
            controlHeights: controls.map((node) => node.getBoundingClientRect().height),
            controlContainerBorder: getComputedStyle(document.querySelector('.input-control-card')).borderTopWidth,
            controlBounds: controls.map((node) => {
              const rect = node.getBoundingClientRect();
              return { left: rect.left, right: rect.right, width: rect.width };
            }),
            cardBounds: cards.map((node) => {
              const rect = node.getBoundingClientRect();
              return { width: rect.width, height: rect.height };
            }),
          };
        });
        assert.equal(inputAudit.controlHeights.length, 3, 'Input must only show date and entity controls; notification entry is centralized in the header.');
        assert.ok(inputAudit.controlHeights.every((height) => height >= 44), `Input control touch target below 44px: ${JSON.stringify(inputAudit)}`);
        assert.equal(inputAudit.controlContainerBorder, '0px', `Input controls still share an outer card: ${JSON.stringify(inputAudit)}`);
        assert.ok(inputAudit.controlBounds.slice(1).every((box, index) => box.left - inputAudit.controlBounds[index].right >= 6), `Input date, CV, PT and notification controls are not separated: ${JSON.stringify(inputAudit)}`);
        assert.equal(inputAudit.cardBounds.length, 3, 'Input must show Masuk, Keluar, and Rusak cards.');
        assert.ok(inputAudit.cardBounds.every((box) => box.height >= 96), `Input transaction cards are too short: ${JSON.stringify(inputAudit)}`);
        assert.ok(inputAudit.cardBounds.every((box) => Math.abs(box.width - inputAudit.cardBounds[0].width) < 1 && Math.abs(box.height - inputAudit.cardBounds[0].height) < 1), `Input transaction cards are not equal-sized: ${JSON.stringify(inputAudit)}`);
      }
      await assertNoHorizontalOverflow(label, viewport);
    }

    // Hidden destinations are reached through the actual 5th navigation item.
    await page.setViewportSize({ width: 412, height: 915 });
    await openMorePage('Riwayat', 'Transaksi');
    await assertNoHorizontalOverflow('Riwayat', { width: 412, height: 915 });
    const historySummary = page.locator('.rw-day-summary').first();
    await historySummary.scrollIntoViewIfNeeded();
    await historySummary.waitFor({ state: 'visible', timeout: 10000 });
    const collapsedNoteCount = await page.getByText('Keterangan: CI note must not appear on the collapsed day card', { exact: true }).count();
    assert.equal(collapsedNoteCount, 0, 'Transaction details must stay collapsed until the operator opens a date.');
    const historyCard = await historySummary.evaluate((node) => ({
      border: getComputedStyle(node).borderTopWidth,
      radius: getComputedStyle(node).borderTopLeftRadius,
      background: getComputedStyle(node).backgroundColor,
      width: node.getBoundingClientRect().width,
      parentWidth: node.parentElement.getBoundingClientRect().width,
    }));
    assert.ok(parseFloat(historyCard.border) > 0 && parseFloat(historyCard.radius) >= 12, `Each date summary must be its own card: ${JSON.stringify(historyCard)}`);
    assert.ok(Math.abs(historyCard.width - historyCard.parentWidth) <= 1, `Date summary cards should align with the history page: ${JSON.stringify(historyCard)}`);
    await historySummary.click();
    await page.locator('.rw-day-details').first().waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await page.getByText('Keterangan: CI note must not appear on the collapsed day card', { exact: true }).count(), 1, 'Transaction notes should appear once in the expanded detail, not on the collapsed card.');
    await openMorePage('Pengaturan', 'Mode Tampilan');
    await assertNoHorizontalOverflow('Pengaturan', viewport);
    const settingsCards = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.settings-page .settings-menu-list .settings-menu-row')];
      const boxes = rows.map((node) => node.getBoundingClientRect());
      return {
        count: rows.length,
        borders: rows.map((node) => getComputedStyle(node).borderTopWidth),
        radii: rows.map((node) => getComputedStyle(node).borderTopLeftRadius),
        gaps: boxes.slice(1).map((box, index) => box.top - boxes[index].bottom),
      };
    });
    assert.ok(settingsCards.count >= 4, `Settings menu should show at least four independent option cards: ${JSON.stringify(settingsCards)}`);
    assert.ok(settingsCards.borders.every((value) => value !== '0px'), `Settings options are still grouped in one card: ${JSON.stringify(settingsCards)}`);
    assert.ok(settingsCards.gaps.every((value) => value >= 7), `Settings card spacing is inconsistent: ${JSON.stringify(settingsCards)}`);
    await openMorePage('Sinkronisasi', 'Sinkronisasi');
    await assertNoHorizontalOverflow('Sinkronisasi', viewport);
  }


  // Verify the restored Data Stock page keeps CV/PT selection and division expansion.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('nav.nav-bar button').filter({ hasText: 'Stok' }).first().click();
  await page.getByText('Stok barang', { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('tab', { name: 'CV', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('tab', { name: 'PT', exact: true }).click();
  await page.getByRole('button').filter({ hasText: 'PRODUKSI' }).first().click();
  await page.getByText('Bebek', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('tab', { name: 'CV', exact: true }).click();
  await page.getByRole('button').filter({ hasText: 'CS' }).first().click();
  await page.getByText('Ayam Fillet Dada', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });

  // Verify all three supported themes on mobile; catches clipped Agent empty states.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['soft_light', 'deep_ocean', 'graphite_titanium']) {
    await page.evaluate((value) => {
      localStorage.setItem('gudangai_theme', value);
    }, theme);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('nav.nav-bar').waitFor({ state: 'visible', timeout: 15000 });
    for (const [label, marker] of [['Beranda', 'Status per Divisi'], ['Stok', 'Stok barang'], ['Input', 'Draft transaksi dipulihkan'], ['Agent', 'Agent Rubee Intelligence']]) {
      if (label === 'Agent') await openMorePage('Agent Rubee AI', marker);
      else await page.locator('nav.nav-bar button').filter({ hasText: label }).first().click();
      await page.getByText(marker, { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
      const themeState = await page.evaluate(() => ({
        id: document.documentElement.getAttribute('data-theme'),
        surface: getComputedStyle(document.documentElement).getPropertyValue('--bg-elevated').trim(),
        text: getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim(),
        accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase(),
      }));
      assert.equal(themeState.id, theme, `Theme mismatch on ${label}: ${JSON.stringify(themeState)}`);
      assert.ok(themeState.surface && themeState.text, `Theme tokens missing on ${label} in ${theme}`);
      if (theme === 'graphite_titanium') {
        assert.equal(themeState.accent, '#91b9ad', `Graphite theme accent must match the active operator refinement token on ${label}.`);
        if (label === 'Beranda') {
          const fabBackground = await page.locator('.nav-fab-btn').evaluate((el) => getComputedStyle(el).backgroundImage);
          const agentBorder = await page.locator('[data-ui-page="dashboard"] .home-agent-card').evaluate((el) => getComputedStyle(el).borderTopColor);
          assert.ok(!fabBackground.includes('16, 185, 129'), 'Graphite Input FAB must not retain the green legacy gradient.');
          assert.notEqual(agentBorder, 'rgb(214, 154, 72)', 'Graphite Agent shortcut border must not remain amber.');
        }
      }
      if (label === 'Agent' && theme !== 'soft_light') {
        const agentSurface = await page.locator('[data-ui-page="ai"] .max-w-4xl > div.relative').evaluate((el) => getComputedStyle(el).backgroundColor);
        assert.notEqual(agentSurface, 'rgba(248, 250, 252, 0.9)', `Agent chat surface must follow ${theme}, not remain light.`);
        assert.notEqual(agentSurface, 'rgb(255, 255, 255)', `Agent chat surface must not be white in ${theme}.`);
        const emptyState = await page.locator('[data-ui-page="ai"] [role="log"] > .m-auto').evaluate((el) => ({
          width: el.clientWidth,
          scrollWidth: el.scrollWidth,
        }));
        const viewportWidth = await page.evaluate(() => window.innerWidth);
        assert.ok(emptyState.width <= viewportWidth, `Agent empty state exceeds mobile width in ${theme}: ${JSON.stringify({ emptyState, viewportWidth })}`);
        assert.ok(emptyState.scrollWidth <= emptyState.width + 1, `Agent empty state overflows horizontally in ${theme}: ${JSON.stringify(emptyState)}`);
        const headingBox = await page.getByText('Apa yang perlu dibantu?', { exact: true }).boundingBox();
        assert.ok(headingBox && headingBox.x >= 0 && headingBox.x + headingBox.width <= viewportWidth,
          `Agent empty-state heading is clipped on mobile in ${theme}: ${JSON.stringify({ headingBox, viewportWidth, emptyState })}`);
      }
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
    ['Stok', 'Stok barang', 'stok'],
    ['Input', 'Draft transaksi dipulihkan', 'input'],
    ['PO', 'Purchase order', 'po'],
    ['Riwayat', 'Riwayat Transaksi', 'riwayat'],
    ['Lainnya', 'Agent Rubee AI', 'more'],
    ['Agent', 'Agent Rubee Intelligence', 'agent'],
    ['Notifikasi', 'Pusat Notifikasi', 'notifications'],
    ['Pengaturan', 'Mode Tampilan', 'settings'],
    ['Sinkronisasi', 'Sinkronisasi', 'sync'],
  ];
  const visualViewports = [
    { width: 360, height: 800, label: '360' },
    { width: 390, height: 844, label: '390' },
    { width: 430, height: 932, label: '430' },
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
        if (label === 'PO') {
          await page.locator('nav.nav-bar button').filter({ hasText: 'Beranda' }).first().click();
          await page.locator('nav.nav-bar button').filter({ hasText: 'PO' }).first().click();
        } else if (label === 'Lainnya') {
          await page.locator('nav.nav-bar button').filter({ hasText: 'Lainnya' }).first().click();
          await page.locator('.more-sheet').waitFor({ state: 'visible', timeout: 10000 });
        } else if (['Riwayat', 'Pengaturan', 'Sinkronisasi', 'Agent', 'Notifikasi'].includes(label)) {
          await openMorePage(label === 'Agent' ? 'Agent Rubee AI' : label === 'Sinkronisasi' ? 'Sinkronisasi' : label, markerText);
        } else {
          await page.locator('nav.nav-bar button').filter({ hasText: label }).first().click();
        }
        if (label !== 'Lainnya') {
          await page.getByText(markerText, { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
        }
        if (label === 'Stok') {
          await page.locator('main[data-ui-page="stok"] .sk-item-card').first().waitFor({ state: 'visible', timeout: 10000 });
          const stockFilters = await page.evaluate(() => {
            const cards = [...document.querySelectorAll('.sk-filter-block:not(.sk-entity-block)')];
            const entity = document.querySelector('.sk-entity-block');
            return {
              filterCards: cards.map((el) => ({
                border: getComputedStyle(el).borderTopWidth,
                background: getComputedStyle(el).backgroundColor,
              })),
              entityBorder: getComputedStyle(entity).borderTopWidth,
              entityBackground: getComputedStyle(entity).backgroundColor,
              entityButtons: [...document.querySelectorAll('.sk-entity-block .sk-seg button')].map((el) => getComputedStyle(el).borderTopWidth),
            };
          });
          assert.equal(stockFilters.filterCards.length, 2, `Stok must expose two standalone filter cards: ${JSON.stringify(stockFilters)}`);
          assert.ok(stockFilters.filterCards.every((card) => card.border !== '0px' && card.background !== 'rgba(0, 0, 0, 0)'), `Stok filters are not independent cards: ${JSON.stringify(stockFilters)}`);
          assert.equal(stockFilters.entityBorder, '0px', `Entity tabs must not have an outer wrapper: ${JSON.stringify(stockFilters)}`);
          assert.equal(stockFilters.entityBackground, 'rgba(0, 0, 0, 0)', `Entity tabs must not sit on a wrapper background: ${JSON.stringify(stockFilters)}`);
          assert.ok(stockFilters.entityButtons.every((value) => value !== '0px'), `Entity tabs must each be standalone: ${JSON.stringify(stockFilters)}`);
        }
        if (label === 'Riwayat') {
          const history = page.locator('main[data-ui-page="riwayat"]');
          const groups = history.locator('.rw-filter-group');
          await groups.nth(2).waitFor({ state: 'visible', timeout: 10000 });
          await groups.nth(2).locator('.rw-filter-head').click();
          await groups.nth(2).locator('.rw-chips').waitFor({ state: 'visible', timeout: 5000 });
          const historyFilters = await history.evaluate((root) => {
            const groups = [...root.querySelectorAll('.rw-filter-group')];
            const chips = root.querySelector('.rw-filter-group.is-open .rw-chips');
            const text = root.innerText;
            const rects = groups.map((el) => {
              const r = el.getBoundingClientRect();
              return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
            });
            const overlaps = rects.some((a, i) => rects.some((b, j) =>
              i < j && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
            ));
            return {
              count: groups.length,
              cards: groups.map((el) => ({
                border: getComputedStyle(el).borderTopWidth,
                background: getComputedStyle(el).backgroundColor,
              })),
              chipsFound: chips instanceof Element,
              chipsBackground: chips ? getComputedStyle(chips).backgroundColor : null,
              openFilterCount: root.querySelectorAll('.rw-filter-group.is-open').length,
              overlaps,
              hasLegacyWrapper: Boolean(root.querySelector('.rw-filters')),
              hasZeroCount: /\\b0 transaksi\\b/i.test(text),
              hasLegacyEmptyCopy: text.includes('Transaksi berhasil akan muncul di sini.'),
              csvClass: root.querySelector('.rw-btn-export')?.className || '',
            };
          });
          assert.equal(historyFilters.count, 3, `Riwayat must show exactly three filter cards: ${JSON.stringify(historyFilters)}`);
          assert.ok(historyFilters.cards.every((card) => card.border !== '0px' && card.background !== 'rgba(0, 0, 0, 0)'), `Riwayat filters are not independent cards: ${JSON.stringify(historyFilters)}`);
          assert.equal(historyFilters.chipsFound, true, `Expanded Riwayat filter must render its chips: ${JSON.stringify(historyFilters)}`);
          assert.equal(historyFilters.openFilterCount, 1, `Only one Riwayat filter may be expanded: ${JSON.stringify(historyFilters)}`);
          assert.equal(historyFilters.chipsBackground, 'rgba(0, 0, 0, 0)', `Riwayat tabs must not have a background wrapper: ${JSON.stringify(historyFilters)}`);
          assert.equal(historyFilters.overlaps, false, `Riwayat filter cards must not overlap: ${JSON.stringify(historyFilters)}`);
          assert.equal(historyFilters.hasLegacyWrapper, false);
          assert.equal(historyFilters.hasZeroCount, false);
          assert.equal(historyFilters.hasLegacyEmptyCopy, false);
          assert.ok(historyFilters.csvClass.includes('rw-btn-ghost'), `CSV must share the ghost button shape: ${JSON.stringify(historyFilters)}`);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        if (label === 'PO') {
          for (const [tabLabel, panelClass, slugSuffix] of [
            ['PO CS', 'po-recommendation-cs', 'cs'],
            ['PO Produksi', 'po-recommendation-produksi', 'produksi'],
          ]) {
            await page.locator('main[data-ui-page="po"] .po-generator-tab').filter({ hasText: tabLabel }).click();
            const panel = page.locator(`main[data-ui-page="po"] .${panelClass}`);
            await panel.waitFor({ state: 'visible', timeout: 5000 });
            const visual = await panel.evaluate((el) => {
              const icon = el.querySelector('.po-recommendation-icon');
              const style = getComputedStyle(el);
              const iconStyle = getComputedStyle(icon);
              return {
                background: style.backgroundColor,
                foreground: style.color,
                iconBackground: iconStyle.backgroundColor,
                iconShadow: iconStyle.boxShadow,
                iconFilter: iconStyle.filter,
                nestedSurfaces: el.querySelectorAll('.card,.surface,.section-card,.stock-card').length,
              };
            });
            const ratio = contrastRatio(computedRgbToHex(visual.foreground), computedRgbToHex(visual.background));
            assert.ok(ratio >= 4.5, `PO ${tabLabel} contrast below WCAG AA in ${theme}: ${ratio.toFixed(2)}:1; ${JSON.stringify(visual)}`);
            assert.equal(visual.iconBackground, 'rgba(0, 0, 0, 0)', `PO ${tabLabel} icon tile background must be transparent in ${theme}.`);
            assert.equal(visual.iconShadow, 'none', `PO ${tabLabel} icon must not have a shadow in ${theme}.`);
            assert.equal(visual.iconFilter, 'none', `PO ${tabLabel} icon must not have a filter in ${theme}.`);
            assert.equal(visual.nestedSurfaces, 0, `PO ${tabLabel} recommendation must not contain nested card surfaces in ${theme}.`);
            await page.screenshot({
              path: `${screenshotRoot}/${theme}-po-${slugSuffix}-${viewport.label}.png`,
              fullPage: true,
              animations: 'disabled',
            });
          }
        }
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

  // Stock cards: all three entities at 360/412px across all three themes.
  const stockEvidenceRoot = 'artifacts/visual-phase3/stock-cards';
  await mkdir(stockEvidenceRoot, { recursive: true });
  for (const theme of ['soft_light', 'deep_ocean', 'graphite_titanium']) {
    await page.evaluate((value) => localStorage.setItem('gudangai_theme', value), theme);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('nav.nav-bar').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('nav.nav-bar button').filter({ hasText: 'Stok' }).first().click();
    await page.getByText('Stok barang', { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
    for (const viewport of [{ width: 360, height: 800 }, { width: 412, height: 915 }]) {
      await page.setViewportSize(viewport);
      for (const entity of ['CV', 'PT', 'Bahan Baku']) {
        await page.getByRole('tab', { name: entity, exact: true }).click();
        const selectorAudit = await page.evaluate(() => {
          const wrapper = document.querySelector('.sk-entity-block');
          const buttons = [...document.querySelectorAll('.sk-entity-block .sk-seg button')];
          const boxes = buttons.map((node) => node.getBoundingClientRect());
          return {
            wrapperBorder: getComputedStyle(wrapper).borderTopWidth,
            wrapperBackground: getComputedStyle(wrapper).backgroundColor,
            buttonCount: buttons.length,
            buttonBorders: buttons.map((node) => getComputedStyle(node).borderTopWidth),
            gaps: boxes.slice(1).map((box, index) => box.left - boxes[index].right),
          };
        });
        assert.equal(selectorAudit.wrapperBorder, '0px', `Stock entity selector still has a shared outer border: ${JSON.stringify(selectorAudit)}`);
        assert.equal(selectorAudit.buttonCount, 3, 'Stock must expose three separate entity cards.');
        assert.ok(selectorAudit.buttonBorders.every((value) => value !== '0px'), `Stock entity buttons are not standalone cards: ${JSON.stringify(selectorAudit)}`);
        assert.ok(selectorAudit.gaps.every((value) => value >= 7), `Stock entity cards do not have stable spacing: ${JSON.stringify(selectorAudit)}`);
        const itemCount = await page.locator('.sk-item-card').count();
        assert.ok(itemCount > 0, `No stock item cards rendered for ${entity} in ${theme} at ${viewport.width}px.`);
        const bounds = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
        }));
        assert.ok(bounds.document <= bounds.viewport + 2 && bounds.body <= bounds.viewport + 2,
          `Stock horizontal overflow for ${entity} in ${theme} at ${viewport.width}px: ${JSON.stringify(bounds)}`);
        assert.equal(await page.locator('.sk-item-card').filter({ hasText: 'Divisi' }).count(), 0,
          'Item cards must not display a Divisi column or label.');
        assert.equal(await page.locator('.sk-item-card').filter({ hasText: 'Entitas' }).count(), 0,
          'Item cards must not display an Entitas column or label.');
        await page.screenshot({
          path: `${stockEvidenceRoot}/stok-${theme}-${entity.toLowerCase().replaceAll(' ', '-')}-${viewport.width}.png`,
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
  await page.getByRole('button', { name: 'Antrekan 1 item' }).click();
  await page.getByText('1 item dalam antrean', { exact: false }).waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(transactionWriteCalls, 0, 'Input must only stage the transaction; no backend write is allowed before explicit queue confirmation.');
  await page.getByRole('button', { name: /Tinjau Keranjang & Sinkronisasi/ }).click();
  await page.getByText('Belum ada data yang dikirim.', { exact: false }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Konfirmasi & Kirim ke Spreadsheet' }).click();
  await page.getByText(/1 item terkonfirmasi/).waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(transactionWriteCalls, 1, 'SyncQueue must own the single confirmed backend write.');
  await page.getByRole('button', { name: 'Buka Riwayat' }).click();
  await page.locator('.rw-day-summary').first().waitFor({ state: 'visible', timeout: 10000 });
  const historyEntries = await page.evaluate(() => JSON.parse(localStorage.getItem('gudangai_history') || '[]'));
  assert.equal(historyEntries.filter((entry) => entry.clientItemId === 'CI-E2E-INPUT-001').length, 1,
    'A confirmed queue item must appear exactly once in final history.');

  assert.deepEqual(pageErrors, [], 'Uncaught browser errors were detected during page smoke tests.');
  console.log('PASS: independent Stok/Riwayat cards, three-theme responsive pages, Input → SyncQueue → Riwayat single-writer flow, and draft recovery.');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
