import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const ORIGIN = 'https://gudangai-rudy-pwa69.rudivirawan69.workers.dev';
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