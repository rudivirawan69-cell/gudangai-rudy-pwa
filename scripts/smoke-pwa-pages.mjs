import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const HOST = 'http://127.0.0.1:4173';
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
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.addInitScript(({ inputDraft, poDraft }) => {
    localStorage.setItem('gudangai_user', JSON.stringify({ name: 'Operator Uji', role: 'owner', loginAt: new Date().toISOString() }));
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
      version: 1, tab: 'cs', csGenerated: true, prodGenerated: false, hub: null,
      csItems: [{ kode: 'CV-0001', nama: 'Ayam Fillet Dada', entity: 'CV', satuan: 'Pack', size: '1 kg', sisa: 5, aman: 10, qty: 5, tglKedatangan: '2026-11-03', divisi: 'CS' }],
      prodItems: [],
    },
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
    ['Beranda', 'Status Stok per Divisi'],
    ['Stok', 'TOTAL ITEM'],
    ['Input', 'Draft transaksi dipulihkan'],
    ['PO', 'Draft PO dipulihkan'],
    ['Riwayat', 'Transaksi'],
    ['Atur', 'Mode Tampilan'],
  ];

  for (const [label, marker] of tabs) {
    const button = page.locator('nav.nav-bar button').filter({ hasText: label }).first();
    await button.click();
    await page.waitForFunction((tabLabel) => {
      return [...document.querySelectorAll('nav.nav-bar button')]
        .some((el) => el.textContent.includes(tabLabel) && el.classList.contains('is-active'));
    }, label, { timeout: 8000 });
    await page.getByText(marker, { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
    const boundaryErrors = await page.getByText('Halaman gagal dimuat', { exact: false }).count();
    assert.equal(boundaryErrors, 0, `Error boundary shown on ${label}`);
  }

  // Drafts must survive page unmount/remount caused by bottom navigation.
  await page.locator('nav.nav-bar button').filter({ hasText: 'Input' }).first().click();
  await page.getByText('Draft transaksi dipulihkan', { exact: false }).waitFor({ state: 'visible' });
  await page.locator('nav.nav-bar button').filter({ hasText: 'Stok' }).first().click();
  await page.locator('nav.nav-bar button').filter({ hasText: 'Input' }).first().click();
  await page.getByText('Draft transaksi dipulihkan', { exact: false }).waitFor({ state: 'visible' });

  // The non-tab synchronization page must also render without a crash.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('gudangai-navigate', { detail: { tab: 'sync' } })));
  await page.getByText('Antrian Sinkronisasi', { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 768, height: 1024 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    assert.ok(
      dimensions.document <= dimensions.viewport + 2 && dimensions.body <= dimensions.viewport + 2,
      `Horizontal overflow at ${viewport.width}px: ${JSON.stringify(dimensions)}`
    );
  }

  assert.deepEqual(pageErrors, [], 'Uncaught browser errors were detected during page smoke tests.');
  console.log('PASS: all six navigation pages + sync queue + Input draft recovery + five viewport widths.');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
