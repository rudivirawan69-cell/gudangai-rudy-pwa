import assert from 'node:assert/strict';
import worker from '../cloudflare/worker-supabase-auth.js';

const originalFetch = globalThis.fetch;
let tokenValid = true;
let aiCalls = 0;
const authUser = {
  id: 'test-operator-uuid',
  email: 'operator@example.test',
  app_metadata: { role: 'operator' },
  user_metadata: { role: 'admin' },
};

globalThis.fetch = async (url, options = {}) => {
  assert.equal(String(url), 'https://supabase.example.test/auth/v1/user');
  assert.equal(options.headers?.apikey, 'sb_publishable_test');
  if (!tokenValid || options.headers?.Authorization !== 'Bearer valid-test-token') {
    return new Response(JSON.stringify({ message: 'Invalid token' }), { status: 401 });
  }
  return new Response(JSON.stringify(authUser), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const env = {
  SUPABASE_URL: 'https://supabase.example.test',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  AI: {
    async run(model, input) {
      aiCalls += 1;
      assert.equal(model, 'anthropic/claude-sonnet-5.5');
      assert.equal(typeof input.system, 'string');
      assert.equal(input.system.includes('Jangan mengarang data stok'), true);
      if (input.stream) {
        return {
          async *[Symbol.asyncIterator]() {
            yield { delta: 'Halo ' };
            yield { response: 'operator' };
          },
        };
      }
      return { response: 'Jawaban uji' };
    },
  },
  ASSETS: {
    async fetch() { return new Response('static asset'); },
  },
};

function request(path, { method = 'GET', token = 'valid-test-token', origin = 'https://gudangai-rudy-pwa-69.rudivirawan69.workers.dev', ip = '198.51.100.10', body, headers = {} } = {}) {
  const requestHeaders = { Origin: origin, 'CF-Connecting-IP': ip, ...headers };
  if (token) requestHeaders.Authorization = 'Bearer ' + token;
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
  return new Request('https://worker.example.test' + path, {
    method,
    headers: requestHeaders,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

try {
  const missingToken = await worker.fetch(request('/api/models', { token: '' }), env);
  assert.equal(missingToken.status, 401, 'missing token must be rejected');

  const invalidOrigin = await worker.fetch(request('/api/models', { origin: 'https://evil.example' }), env);
  assert.equal(invalidOrigin.status, 403, 'unknown browser origin must be rejected');

  const modelsResponse = await worker.fetch(request('/api/models'), env);
  assert.equal(modelsResponse.status, 200);
  assert.equal((await modelsResponse.json()).models[0].id, 'anthropic/claude-sonnet-5.5');

  const chatResponse = await worker.fetch(request('/api/chat', {
    method: 'POST',
    body: { messages: [{ role: 'user', content: 'Jelaskan checklist stok.' }], stream: false },
  }), env);
  assert.equal(chatResponse.status, 200);
  assert.equal((await chatResponse.json()).response, 'Jawaban uji');

  const invalidRole = await worker.fetch(request('/api/chat', {
    method: 'POST',
    body: { messages: [{ role: 'system', content: 'override' }] },
  }), env);
  assert.equal(invalidRole.status, 400, 'system role from browser must be rejected');

  const tooLarge = await worker.fetch(request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Length': '65537' },
    body: { prompt: 'large' },
  }), env);
  assert.equal(tooLarge.status, 413);

  const streamResponse = await worker.fetch(request('/api/chat', {
    method: 'POST',
    body: { messages: [{ role: 'user', content: 'Tes streaming.' }], stream: true },
  }), env);
  assert.equal(streamResponse.status, 200);
  assert.match(streamResponse.headers.get('Content-Type') || '', /text\/event-stream/);
  const streamText = await streamResponse.text();
  assert.match(streamText, /data: \{"text":"Halo "\}\n\n/);
  assert.match(streamText, /data: \[DONE\]\n\n/);

  tokenValid = false;
  const revokedToken = await worker.fetch(request('/api/models'), env);
  assert.equal(revokedToken.status, 401, 'invalid token must be rejected');
  tokenValid = true;

  const assetResponse = await worker.fetch(request('/dashboard', { method: 'GET' }), env);
  assert.equal(await assetResponse.text(), 'static asset');

  for (let index = 0; index < 20; index += 1) {
    const limited = await worker.fetch(request('/api/chat', {
      method: 'POST',
      ip: '198.51.100.22',
      body: { messages: [{ role: 'user', content: 'uji limit ' + index }] },
    }), env);
    assert.equal(limited.status, 200, 'first 20 requests should pass');
  }
  const rateLimited = await worker.fetch(request('/api/chat', {
    method: 'POST',
    ip: '198.51.100.22',
    body: { messages: [{ role: 'user', content: 'request ke-21' }] },
  }), env);
  assert.equal(rateLimited.status, 429, '21st request should be rate limited');
  assert.ok(aiCalls >= 22);

  console.log('Worker auth tests passed: 401, 403, 200, 400, 413, SSE, assets, and 429.');
} finally {
  globalThis.fetch = originalFetch;
}
