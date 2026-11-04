const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_ITEMS = 8;
const PROXY_ORIGIN = 'https://claude-proxy.internal';

function configuredOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function corsHeaders(origin, env) {
  const allowed = configuredOrigins(env);
  const headers = {
    'cache-control': 'no-store',
    'vary': 'Origin',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
  if (origin && (allowed.length === 0 || allowed.includes(origin))) {
    headers['access-control-allow-origin'] = origin;
  }
  return headers;
}

function json(data, status, origin, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(origin, env),
    },
  });
}

function originAllowed(origin, request, env) {
  if (!origin) return true;
  const allowed = configuredOrigins(env);
  return allowed.length ? allowed.includes(origin) : origin === new URL(request.url).origin;
}

async function verifySupabaseAccessToken(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match) return { ok: false, status: 401, code: 'AUTH_REQUIRED', error: 'Silakan login untuk menggunakan Agent GudangAI.' };

  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = String(env.SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !anonKey) {
    return { ok: false, status: 503, code: 'AUTH_NOT_CONFIGURED', error: 'Verifikasi sesi Supabase belum dikonfigurasi pada Worker.' };
  }

  try {
    const response = await fetch(supabaseUrl + '/auth/v1/user', {
      method: 'GET',
      headers: { apikey: anonKey, Authorization: 'Bearer ' + match[1] },
    });
    if (!response.ok) return { ok: false, status: 401, code: 'INVALID_SESSION', error: 'Sesi login tidak valid atau sudah berakhir.' };
    const user = await response.json().catch(() => null);
    if (!user?.id || user?.is_anonymous === true) {
      return { ok: false, status: 401, code: 'INVALID_SESSION', error: 'Identitas pengguna Supabase tidak valid.' };
    }
    return { ok: true, userId: user.id, authorization: 'Bearer ' + match[1] };
  } catch (_) {
    return { ok: false, status: 503, code: 'AUTH_PROVIDER_UNAVAILABLE', error: 'Layanan verifikasi Supabase sedang tidak tersedia.' };
  }
}

function normalizeHistory(history, currentMessage) {
  const items = (Array.isArray(history) ? history : [])
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').trim().slice(0, MAX_MESSAGE_LENGTH),
    }))
    .filter((item) => item.content);
  const last = items.at(-1);
  if (last?.role === 'user' && last.content === currentMessage) items.pop();
  return items;
}

function systemPrompt(context) {
  return [
    'Kamu adalah Agent Operasional GudangAI RUDY untuk gudang pusat dan cold storage Nasi Goreng 69.',
    'Jawab dalam Bahasa Indonesia, singkat, akurat, dan berorientasi tindakan operator.',
    'Jangan mengarang kode barang, jumlah, saldo, status PO, jadwal, atau kejadian yang tidak ada dalam konteks.',
    'Jangan mengubah master data atau melakukan transaksi stok. Kamu hanya memberi analisis dan rekomendasi.',
    'Jika data tidak cukup, jelaskan data yang kurang. Bedakan fakta dari perkiraan.',
    'Jangan mengklaim telah mengirim pesan atau mengubah data.',
    'Konteks operasi: ' + JSON.stringify(context).slice(0, 3500),
  ].join('\n');
}

function extractText(result) {
  if (typeof result === 'string') return result.trim();
  if (typeof result?.response === 'string') return result.response.trim();
  if (Array.isArray(result?.content)) {
    return result.content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
      .trim();
  }
  return '';
}

async function callWorkersAI(env, messages) {
  if (!env.AI || typeof env.AI.run !== 'function') throw new Error('Workers AI binding belum tersedia.');
  const model = String(env.AI_MODEL || DEFAULT_MODEL);
  const result = await env.AI.run(model, { messages, max_tokens: 700 });
  const reply = extractText(result);
  if (!reply) throw new Error('Workers AI mengembalikan jawaban kosong.');
  return { success: true, reply, model, provider: 'cloudflare-workers-ai', mode: 'hybrid' };
}

async function callProxyFallback(request, env, auth, body) {
  if (!env.CLAUDE_PROXY || typeof env.CLAUDE_PROXY.fetch !== 'function') {
    throw new Error('Service Binding CLAUDE_PROXY belum tersedia.');
  }
  const headers = new Headers({
    'content-type': 'application/json',
    Authorization: auth.authorization,
  });
  const origin = request.headers.get('Origin');
  if (origin) headers.set('Origin', origin);

  const proxyRequest = new Request(PROXY_ORIGIN + '/api/agent', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const response = await env.CLAUDE_PROXY.fetch(proxyRequest);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success !== true || !payload?.reply) {
    throw new Error('claude-proxy tidak dapat menyelesaikan permintaan.');
  }
  return {
    ...payload,
    fallback: true,
    primaryError: 'Workers AI primary tidak tersedia.',
  };
}

async function proxyHealth(env) {
  if (!env.CLAUDE_PROXY || typeof env.CLAUDE_PROXY.fetch !== 'function') {
    return { configured: false, reachable: false, anthropicFallbackEnabled: false };
  }
  try {
    const response = await env.CLAUDE_PROXY.fetch(new Request(PROXY_ORIGIN + '/api/agent/health'));
    const payload = await response.json().catch(() => ({}));
    return {
      configured: true,
      reachable: response.ok && payload?.success === true,
      anthropicFallbackEnabled: payload?.anthropicFallbackEnabled === true,
      proxyPrimary: payload?.primary || null,
    };
  } catch (_) {
    return { configured: true, reachable: false, anthropicFallbackEnabled: false };
  }
}

async function handleAgent(request, env, origin) {
  const auth = await verifySupabaseAccessToken(request, env);
  if (!auth.ok) return json({ success: false, code: auth.code, error: auth.error }, auth.status, origin, env);

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 65536) return json({ success: false, code: 'PAYLOAD_TOO_LARGE', error: 'Ukuran permintaan melebihi 64 KB.' }, 413, origin, env);
  const body = await request.json().catch(() => null);
  const message = String(body?.message || '').trim();
  if (!message) return json({ success: false, code: 'MESSAGE_REQUIRED', error: 'Pertanyaan belum diisi.' }, 400, origin, env);
  if (message.length > MAX_MESSAGE_LENGTH) {
    return json({ success: false, code: 'MESSAGE_TOO_LONG', error: 'Pertanyaan terlalu panjang.' }, 413, origin, env);
  }

  const context = body?.context && typeof body.context === 'object' && !Array.isArray(body.context) ? body.context : {};
  const history = normalizeHistory(body?.history, message);
  const normalizedBody = { message, context, history };
  const messages = [
    { role: 'system', content: systemPrompt(context) },
    ...history,
    { role: 'user', content: message },
  ];

  try {
    const result = await callWorkersAI(env, messages);
    return json(result, 200, origin, env);
  } catch (_) {
    try {
      const fallback = await callProxyFallback(request, env, auth, normalizedBody);
      return json(fallback, 200, origin, env);
    } catch (_) {
      return json({
        success: false,
        code: 'AI_PROVIDERS_UNAVAILABLE',
        error: 'Workers AI utama dan layanan fallback claude-proxy tidak tersedia.',
      }, 503, origin, env);
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    if (!originAllowed(origin, request, env)) {
      return json({ success: false, code: 'ORIGIN_NOT_ALLOWED', error: 'Origin tidak diizinkan.' }, 403, '', env);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, env),
      });
    }

    if (url.pathname === '/api/agent/health') {
      if (request.method !== 'GET') return json({ success: false, error: 'Method not allowed' }, 405, origin, env);
      const proxy = await proxyHealth(env);
      return json({
        success: true,
        mode: 'hybrid',
        primary: 'cloudflare-workers-ai',
        primaryConfigured: Boolean(env.AI && typeof env.AI.run === 'function'),
        model: String(env.AI_MODEL || DEFAULT_MODEL),
        proxyBindingConfigured: proxy.configured,
        proxyReachable: proxy.reachable,
        proxyPrimary: proxy.proxyPrimary,
        anthropicFallbackEnabled: proxy.anthropicFallbackEnabled,
        authRequired: true,
        authConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
      }, 200, origin, env);
    }

    if (url.pathname === '/api/agent') {
      if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405, origin, env);
      return handleAgent(request, env, origin);
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ success: false, code: 'NOT_FOUND', error: 'Endpoint API tidak ditemukan.' }, 404, origin, env);
    }
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
