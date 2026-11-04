import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const makeRequest = (path, { method = 'GET', body, origin = 'https://claude-proxy.rudivirawan69.workers.dev' } = {}) =>
  new Request(`https://claude-proxy.rudivirawan69.workers.dev${path}`, {
    method,
    headers: { ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

test('health reports Workers AI primary and Anthropic fallback disabled by default', async () => {
  const response = await worker.fetch(makeRequest('/api/agent/health'), {
    AI: { run: async () => ({ response: 'ok' }) },
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.primary, 'cloudflare-workers-ai');
  assert.equal(payload.primaryConfigured, true);
  assert.equal(payload.anthropicFallbackEnabled, false);
});

test('agent uses Workers AI and returns provider metadata', async () => {
  let captured;
  const response = await worker.fetch(makeRequest('/api/agent', {
    method: 'POST',
    body: { message: 'Cek stok', history: [{ role: 'user', content: 'Cek stok' }] },
  }), {
    AI: { run: async (model, input) => { captured = { model, input }; return { response: 'Periksa data stok terbaru.' }; } },
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.provider, 'cloudflare-workers-ai');
  assert.equal(payload.reply, 'Periksa data stok terbaru.');
  assert.equal(captured.model, '@cf/meta/llama-3.1-8b-instruct');
  assert.equal(captured.input.messages.filter((item) => item.role === 'user' && item.content === 'Cek stok').length, 1);
});

test('Anthropic fallback is not called unless explicitly enabled', async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => { externalCalls += 1; throw new Error('must not call external API'); };
  try {
    const response = await worker.fetch(makeRequest('/api/agent', {
      method: 'POST', body: { message: 'Halo' },
    }), { AI: { run: async () => { throw new Error('AI unavailable'); } }, ANTHROPIC_API_KEY: 'test-key' });
    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.equal(payload.code, 'WORKERS_AI_UNAVAILABLE');
    assert.equal(externalCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects unknown origins', async () => {
  const response = await worker.fetch(makeRequest('/api/agent/health', { origin: 'https://evil.example' }), {
    ALLOWED_ORIGINS: 'https://gudangai-rudy-pwa69.rudivirawan69.workers.dev',
  });
  assert.equal(response.status, 403);
});

test('rejects empty messages', async () => {
  const response = await worker.fetch(makeRequest('/api/agent', { method: 'POST', body: { message: ' ' } }), {
    AI: { run: async () => ({ response: 'unused' }) },
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'MESSAGE_REQUIRED');
});
