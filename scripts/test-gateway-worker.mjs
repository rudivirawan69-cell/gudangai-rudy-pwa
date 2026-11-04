import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/gateway-worker.js';

const ORIGIN = 'https://gudangai-rudy-pwa69.rudivirawan69.workers.dev';
const SUPABASE_URL = 'https://project.supabase.co';
const envBase = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: 'test-anon-key',
  ALLOWED_ORIGINS: ORIGIN,
};

function makeRequest(path, { method = 'GET', body, token = 'test-access-token', origin = ORIGIN } = {}) {
  return new Request(ORIGIN + path, {
    method,
    headers: {
      ...(origin ? { Origin: origin } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function withAuth(callback, { valid = true } = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), SUPABASE_URL + '/auth/v1/user');
    assert.equal(options.headers.apikey, 'test-anon-key');
    return new Response(JSON.stringify(valid ? { id: 'operator-1' } : { message: 'invalid' }), {
      status: valid ? 200 : 401,
      headers: { 'content-type': 'application/json' },
    });
  };
  try { return await callback(); } finally { globalThis.fetch = originalFetch; }
}

test('rejects missing and invalid Supabase sessions before invoking either AI provider', async () => {
  let aiCalls = 0;
  let proxyCalls = 0;
  const env = {
    ...envBase,
    AI: { run: async () => { aiCalls++; return { response: 'unexpected' }; } },
    CLAUDE_PROXY: { fetch: async () => { proxyCalls++; return Response.json({ success: true }); } },
  };
  const missing = await worker.fetch(makeRequest('/api/agent', {
    method: 'POST', body: { message: 'Cek stok' }, token: '',
  }), env);
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).code, 'AUTH_REQUIRED');

  await withAuth(async () => {
    const invalid = await worker.fetch(makeRequest('/api/agent', {
      method: 'POST', body: { message: 'Cek stok' },
    }), env);
    assert.equal(invalid.status, 401);
    assert.equal((await invalid.json()).code, 'INVALID_SESSION');
  }, { valid: false });

  assert.equal(aiCalls, 0);
  assert.equal(proxyCalls, 0);
});

test('uses Workers AI as primary and does not invoke Service Binding when it succeeds', async () => {
  await withAuth(async () => {
    let aiCalls = 0;
    let proxyCalls = 0;
    const response = await worker.fetch(makeRequest('/api/agent', {
      method: 'POST', body: { message: 'Ringkas stok', context: { totalItems: 10 }, history: [] },
    }), {
      ...envBase,
      AI: { run: async (model, input) => {
        aiCalls++;
        assert.equal(model, '@cf/meta/llama-3.1-8b-instruct');
        assert.equal(input.messages.at(-1).content, 'Ringkas stok');
        return { response: 'Ringkasan stok siap.' };
      } },
      CLAUDE_PROXY: { fetch: async () => { proxyCalls++; throw new Error('must not run'); } },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.provider, 'cloudflare-workers-ai');
    assert.equal(payload.reply, 'Ringkasan stok siap.');
    assert.equal(aiCalls, 1);
    assert.equal(proxyCalls, 0);
  });
});

test('forwards existing message contract and bearer token to claude-proxy only after primary failure', async () => {
  await withAuth(async () => {
    let capturedRequest;
    const response = await worker.fetch(makeRequest('/api/agent', {
      method: 'POST',
      body: { message: 'Cek prioritas', context: { totalItems: 4 }, history: [{ role: 'user', content: 'Halo' }] },
    }), {
      ...envBase,
      AI: { run: async () => { throw new Error('primary unavailable'); } },
      CLAUDE_PROXY: { fetch: async (request) => {
        capturedRequest = request;
        return Response.json({
          success: true, reply: 'Fallback proxy menjawab.', model: 'test-model',
          provider: 'cloudflare-workers-ai', mode: 'hybrid',
        });
      } },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.reply, 'Fallback proxy menjawab.');
    assert.equal(payload.fallback, true);
    assert.equal(payload.primaryError, 'primary unavailable');
    assert.equal(capturedRequest.method, 'POST');
    assert.equal(new URL(capturedRequest.url).pathname, '/api/agent');
    assert.equal(capturedRequest.headers.get('Authorization'), 'Bearer test-access-token');
    assert.deepEqual(await capturedRequest.json(), {
      message: 'Cek prioritas',
      context: { totalItems: 4 },
      history: [{ role: 'user', content: 'Halo' }],
    });
  });
});

test('returns 503 when primary and Service Binding fallback both fail', async () => {
  await withAuth(async () => {
    const response = await worker.fetch(makeRequest('/api/agent', {
      method: 'POST', body: { message: 'Cek stok' },
    }), {
      ...envBase,
      AI: { run: async () => { throw new Error('primary unavailable'); } },
      CLAUDE_PROXY: { fetch: async () => new Response('upstream unavailable', { status: 503 }) },
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'AI_PROVIDERS_UNAVAILABLE');
  });
});

test('rejects unknown origins and permits Authorization preflight for configured origin', async () => {
  const denied = await worker.fetch(makeRequest('/api/agent/health', { origin: 'https://evil.example' }), envBase);
  assert.equal(denied.status, 403);

  const preflight = await worker.fetch(new Request(ORIGIN + '/api/agent', {
    method: 'OPTIONS',
    headers: { Origin: ORIGIN, 'Access-Control-Request-Headers': 'authorization,content-type' },
  }), envBase);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers') || '', /authorization/i);
});

test('health reports proxy binding without claiming Anthropic is enabled', async () => {
  const response = await worker.fetch(makeRequest('/api/agent/health'), {
    ...envBase,
    AI: { run: async () => ({ response: 'unused' }) },
    CLAUDE_PROXY: { fetch: async () => Response.json({
      success: true, primary: 'cloudflare-workers-ai', anthropicFallbackEnabled: false,
    }) },
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.primary, 'cloudflare-workers-ai');
  assert.equal(payload.proxyBindingConfigured, true);
  assert.equal(payload.anthropicFallbackEnabled, false);
});

test('rejects oversized JSON bodies even when Content-Length is absent', async () => {
  await withAuth(async () => {
    let aiCalls = 0;
    const oversized = JSON.stringify({ message: 'Cek stok', context: { payload: 'x'.repeat(70000) } });
    const request = new Request(ORIGIN + '/api/agent', {
      method: 'POST',
      headers: { Origin: ORIGIN, Authorization: 'Bearer test-access-token', 'Content-Type': 'application/json' },
      body: oversized,
    });
    assert.equal(request.headers.has('Content-Length'), false);
    const response = await worker.fetch(request, {
      ...envBase,
      AI: { run: async () => { aiCalls++; return { response: 'unexpected' }; } },
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).code, 'PAYLOAD_TOO_LARGE');
    assert.equal(aiCalls, 0);
  });
});
