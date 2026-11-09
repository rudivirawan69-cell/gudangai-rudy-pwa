import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { detectLiveActions, liveDataBlock } from '../worker.js';

const ORIGIN = 'https://gudangai-rudy-pwa6.rudivirawan69.workers.dev';
const SUPABASE_URL = 'https://project.supabase.co';
const validEnv = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: 'test-anon-key',
  ALLOWED_ORIGINS: ORIGIN,
};
const makeRequest = (path, { method = 'GET', body, origin = ORIGIN, token = 'test-access-token' } = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(origin ? { Origin: origin } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

async function withSupabaseAuth(callback, { valid = true } = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), `${SUPABASE_URL}/auth/v1/user`);
    assert.equal(options.headers.apikey, 'test-anon-key');
    return new Response(JSON.stringify(valid ? { id: 'user-test-1' } : { message: 'invalid' }), {
      status: valid ? 200 : 401,
      headers: { 'content-type': 'application/json' },
    });
  };
  try { return await callback(); } finally { globalThis.fetch = originalFetch; }
}

test('health reports Workers AI primary, auth status and paid fallback disabled', async () => {
  const response = await worker.fetch(makeRequest('/api/agent/health'), {
    ...validEnv, AI: { run: async () => ({ response: 'ok' }) },
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.primary, 'cloudflare-workers-ai');
  assert.equal(payload.primaryConfigured, true);
  assert.equal(payload.anthropicFallbackEnabled, false);
  assert.equal(payload.authRequired, true);
  assert.equal(payload.authConfigured, true);
  assert.equal(payload.deploymentTarget, ORIGIN);
});

test('read-only data gateway proxies allowlisted action without exposing secret', async () => {
  await withSupabaseAuth(async () => {
    const originalFetch = globalThis.fetch;
    let captured;
    globalThis.fetch = async (url, options) => {
      if (String(url) === `${SUPABASE_URL}/auth/v1/user`) {
        return new Response(JSON.stringify({ id: 'user-data-1' }), { status: 200 });
      }
      assert.equal(String(url), 'https://sheets.example/exec');
      captured = JSON.parse(options.body);
      return new Response(JSON.stringify({ success: true, items: [{ kode: 'CV-1' }] }), { status: 200 });
    };
    try {
      const response = await worker.fetch(makeRequest('/api/data', {
        method: 'POST', body: { action: 'getAllStock', entitas: 'CV', secret: 'client-must-not-win' },
      }), {
        ...validEnv,
        GUDANGAI_SHEETS_API_URL: 'https://sheets.example/exec',
        GUDANGAI_SHEETS_API_SECRET: 'server-secret',
      });
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.equal(payload.success, true);
      assert.equal(payload.actor, 'user-data-1');
      assert.equal(captured.secret, 'server-secret');
      assert.equal(JSON.stringify(payload).includes('server-secret'), false);
    } finally { globalThis.fetch = originalFetch; }
  });
});

test('read-only data gateway rejects write action before Apps Script call', async () => {
  await withSupabaseAuth(async () => {
    const response = await worker.fetch(makeRequest('/api/data', {
      method: 'POST', body: { action: 'bulkTransaction' },
    }), {
      ...validEnv,
      GUDANGAI_SHEETS_API_URL: 'https://sheets.example/exec',
      GUDANGAI_SHEETS_API_SECRET: 'server-secret',
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'READ_ACTION_NOT_ALLOWED');
  });
});

test('agent validates Supabase bearer token then uses Workers AI', async () => {
  await withSupabaseAuth(async () => {
    let captured;
    const response = await worker.fetch(makeRequest('/api/agent', {
      method: 'POST',
      body: { message: 'Cek stok', history: [{ role: 'user', content: 'Cek stok' }] },
    }), {
      ...validEnv,
      AI: { run: async (model, input) => { captured = { model, input }; return { response: 'Periksa data stok terbaru.' }; } },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.provider, 'cloudflare-workers-ai');
    assert.equal(payload.reply, 'Periksa data stok terbaru.');
    assert.equal(captured.model, '@cf/meta/llama-3.1-8b-instruct');
    assert.equal(captured.input.messages.filter((item) => item.role === 'user' && item.content === 'Cek stok').length, 1);
  });
});

test('accepts Supabase publishable key when anon key is not configured', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), `${SUPABASE_URL}/auth/v1/user`);
    assert.equal(options.headers.apikey, 'test-publishable-key');
    return new Response(JSON.stringify({ id: 'user-test-2' }), { status: 200 });
  };
  try {
    const response = await worker.fetch(makeRequest('/api/agent', {
      method: 'POST', body: { message: 'Tes key publishable' },
    }), {
      SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      ALLOWED_ORIGINS: ORIGIN,
      AI: { run: async () => ({ response: 'OK' }) },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).reply, 'OK');
  } finally { globalThis.fetch = originalFetch; }
});

test('uses 9Router when configured and does not expose its API key in response', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    if (String(url) === `${SUPABASE_URL}/auth/v1/user`) {
      return new Response(JSON.stringify({ id: 'user-test-3' }), { status: 200 });
    }
    assert.equal(String(url), 'https://9router.com/v1/chat/completions');
    assert.equal(options.headers.authorization, 'Bearer secret-test-key');
    captured = JSON.parse(options.body);
    return new Response(JSON.stringify({
      model: 'test-model',
      choices: [{ message: { content: 'Jawaban dari 9Router.' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const response = await worker.fetch(makeRequest('/api/agent', {
      method: 'POST', body: { message: 'Tes 9Router' },
    }), {
      ...validEnv, NINE_ROUTER_API_KEY: 'secret-test-key',
      NINE_ROUTER_MODEL: 'test-model',
      AI: { run: async () => { throw new Error('Workers AI should not run'); } },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.provider, '9router');
    assert.equal(payload.reply, 'Jawaban dari 9Router.');
    assert.equal(captured.messages.at(-1).content, 'Tes 9Router');
    assert.equal(JSON.stringify(payload).includes('secret-test-key'), false);
  } finally { globalThis.fetch = originalFetch; }
});

test('rejects Agent requests without a bearer token', async () => {
  const response = await worker.fetch(makeRequest('/api/agent', {
    method: 'POST', body: { message: 'Halo' }, token: '',
  }), validEnv);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTH_REQUIRED');
});

test('rejects invalid Supabase sessions before calling Workers AI', async () => {
  await withSupabaseAuth(async () => {
    let aiCalls = 0;
    const response = await worker.fetch(makeRequest('/api/agent', {
      method: 'POST', body: { message: 'Halo' },
    }), { ...validEnv, AI: { run: async () => { aiCalls += 1; return { response: 'no' }; } } });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'INVALID_SESSION');
    assert.equal(aiCalls, 0);
  }, { valid: false });
});

test('Anthropic fallback is not called unless explicitly enabled', async () => {
  const originalFetch = globalThis.fetch;
  let anthropicCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url) === `${SUPABASE_URL}/auth/v1/user`) {
      return new Response(JSON.stringify({ id: 'user-test-1' }), { status: 200 });
    }
    if (String(url).startsWith('https://api.anthropic.com/')) anthropicCalls += 1;
    throw new Error('unexpected external API call');
  };
  try {
    const response = await worker.fetch(makeRequest('/api/agent', {
      method: 'POST', body: { message: 'Halo' },
    }), { ...validEnv, AI: { run: async () => { throw new Error('AI unavailable'); } }, ANTHROPIC_API_KEY: 'test-key' });
    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.equal(payload.code, 'WORKERS_AI_UNAVAILABLE');
    assert.equal(anthropicCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('rejects unknown origins instead of trusting every request origin', async () => {
  const response = await worker.fetch(makeRequest('/api/agent/health', { origin: 'https://evil.example' }), {
    ...validEnv, ALLOWED_ORIGINS: ORIGIN,
  });
  assert.equal(response.status, 403);
});

test('allows Authorization in CORS preflight for configured origin', async () => {
  const response = await worker.fetch(new Request(`${ORIGIN}/api/agent`, {
    method: 'OPTIONS',
    headers: { Origin: ORIGIN, 'Access-Control-Request-Headers': 'authorization,content-type' },
  }), validEnv);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('access-control-allow-headers'), /authorization/i);
});

test('rejects empty messages after session validation', async () => {
  await withSupabaseAuth(async () => {
    const response = await worker.fetch(makeRequest('/api/agent', {
      method: 'POST', body: { message: ' ' },
    }), { ...validEnv, AI: { run: async () => ({ response: 'unused' }) } });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'MESSAGE_REQUIRED');
  });
});

const SHEETS_URL = 'https://sheets.example/exec';
const liveEnv = { ...validEnv, GUDANGAI_SHEETS_API_URL: SHEETS_URL, GUDANGAI_SHEETS_API_SECRET: 'server-secret' };

async function runLive(message, { env = liveEnv, sheetsResponse } = {}) {
  const originalFetch = globalThis.fetch;
  const sheetCalls = [];
  let systemText = '';
  globalThis.fetch = async (url, options) => {
    if (String(url) === `${SUPABASE_URL}/auth/v1/user`) return new Response(JSON.stringify({ id: 'u1' }), { status: 200 });
    if (String(url) === SHEETS_URL) {
      const body = JSON.parse(options.body); sheetCalls.push(body);
      return sheetsResponse ? sheetsResponse(body) : new Response(JSON.stringify({ success: true, rows: [{ kode: 'X-1', qty: 3 }] }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const response = await worker.fetch(makeRequest('/api/agent', { method: 'POST', body: { message } }), {
      ...env, AI: { run: async (_model, { messages }) => { systemText = messages[0].content; return { response: 'ok' }; } },
    });
    return { response, payload: await response.json(), sheetCalls, systemText };
  } finally { globalThis.fetch = originalFetch; }
}

test('detectLiveActions maps read-only intents without parameters and caps at two', () => {
  assert.deepEqual(detectLiveActions('ringkasan dashboard dan stok menipis'), ['getDashboardData', 'getLowStock']);
  assert.deepEqual(detectLiveActions('status PO dan riwayat barang masuk dan log sistem'), ['getStatusPO', 'getTransactionHistory']);
  assert.deepEqual(detectLiveActions('buatkan SOP cold storage'), []);
});

test('data questions trigger live read-only read and include provenance', async () => {
  const { response, payload, sheetCalls, systemText } = await runLive('Tolong ringkasan dashboard hari ini');
  assert.equal(response.status, 200); assert.equal(sheetCalls.length, 1);
  assert.equal(sheetCalls[0].action, 'getDashboardData'); assert.equal(sheetCalls[0].client.mode, 'read_only');
  assert.equal(payload.dataSources[0].action, 'getDashboardData'); assert.equal(payload.dataSources[0].ok, true);
  assert.ok(payload.dataSources[0].readAt); assert.match(systemText, /DATA LIVE \(read-only\)/);
  assert.match(systemText, /Pisahkan entitas CV dan PT/);
});

test('server secret never appears in prompt or response', async () => {
  const { payload, systemText } = await runLive('stok menipis');
  assert.equal(systemText.includes('server-secret'), false);
  assert.equal(JSON.stringify(payload).includes('server-secret'), false);
});

test('non-data questions do not call spreadsheet', async () => {
  const { sheetCalls, payload, systemText } = await runLive('Buatkan SOP pembersihan cold storage');
  assert.equal(sheetCalls.length, 0); assert.deepEqual(payload.dataSources, []);
  assert.match(systemText, /DATA LIVE: tidak ada/);
});

test('unconfigured gateway marks data unconfirmed while agent still answers', async () => {
  const { response, payload, sheetCalls, systemText } = await runLive('status PO', { env: { ...liveEnv, GUDANGAI_SHEETS_API_URL: '' } });
  assert.equal(response.status, 200); assert.equal(sheetCalls.length, 0);
  assert.equal(payload.dataSources[0].ok, false); assert.equal(payload.dataSources[0].code, 'DATA_TOOLS_NOT_CONFIGURED');
  assert.match(systemText, /GAGAL DATA_TOOLS_NOT_CONFIGURED/);
});

test('non-JSON upstream response is treated as unconfirmed', async () => {
  const { payload, systemText } = await runLive('stok menipis', { sheetsResponse: () => new Response('<html>login</html>', { status: 200 }) });
  assert.equal(payload.dataSources[0].ok, false); assert.equal(payload.dataSources[0].code, 'SHEETS_NON_JSON');
  assert.match(systemText, /belum terkonfirmasi/);
});

test('large live data is truncated within the per-action budget', () => {
  const big = { ok: true, action: 'getLowStock', source: 's', readAt: 't', data: { rows: 'x'.repeat(10000) } };
  const block = liveDataBlock({ results: [big] });
  assert.match(block, /\[dipotong\]/); assert.ok(block.length < 4000);
});

test('health reports the live-data agent stage', async () => {
  const response = await worker.fetch(makeRequest('/api/agent/health'), { ...liveEnv, AI: { run: async () => ({}) } });
  const payload = await response.json();
  assert.equal(payload.agentStage, 'read_only_live_data'); assert.ok(payload.liveIntentActions.includes('getLowStock'));
  const off = await (await worker.fetch(makeRequest('/api/agent/health'), { ...liveEnv, GUDANGAI_SHEETS_API_URL: '', AI: { run: async () => ({}) } })).json();
  assert.equal(off.agentStage, 'analysis_only');
});
