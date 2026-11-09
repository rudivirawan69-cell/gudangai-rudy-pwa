const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const ANTHROPIC_MODEL = 'claude-3-5-haiku-latest';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_ITEMS = 8;
const LIVE_DATA_CHAR_BUDGET = 3500;
const MAX_LIVE_ACTIONS = 2;
const READ_ONLY_ACTIONS = new Set([
  'ping', 'status', 'getConfig', 'getDashboard', 'getDashboardData',
  'getAllStock', 'getStockAll', 'getStockByCode', 'searchByName',
  'getLowStock', 'getTransactionHistory', 'getStatusPO', 'getPOStatus',
  'getSystemLog', 'bootstrap',
]);

const LIVE_INTENTS = [
  { action: 'getDashboardData', pattern: /dashboard|ringkasan|rangkuman|kondisi gudang|overview/i },
  { action: 'getLowStock', pattern: /stok (menipis|kritis|rendah|habis)|low ?stock|di bawah minimum|hampir habis|kritis/i },
  { action: 'getStatusPO', pattern: /\bpo\b|purchase order|status po|pembelian/i },
  { action: 'getTransactionHistory', pattern: /riwayat|histori|history|transaksi (terakhir|hari ini|kemarin)|barang (masuk|keluar|rusak)/i },
  { action: 'getSystemLog', pattern: /system log|log sistem|log error|audit log/i },
];

const SKILL_RULES = [
  'ATURAN AGENT (mode read_only):',
  '1. Pisahkan entitas CV dan PT di setiap analisis. Jangan mencampur atau menjumlahkan keduanya kecuali diminta eksplisit, dan sebutkan rinciannya.',
  '2. Data live hanya berasal dari blok DATA LIVE. Jika blok tidak ada atau berstatus GAGAL, katakan datanya belum terkonfirmasi dan jangan mengklaim membaca spreadsheet.',
  '3. Jangan mengarang kode, nama, qty, saldo, status PO, tanggal, periode, atau hasil verifikasi. Bedakan fakta, asumsi, kandidat, dan data belum pasti.',
  '4. Untuk setiap angka dari data live, sebut action sumber dan waktu baca (readAt).',
  '5. Jangan menampilkan atau meminta secret, PIN, kunci API, atau kredensial.',
  '6. Kamu tidak dapat menulis, mengubah, atau menghapus data. Untuk perubahan, susun draft rekomendasi yang diperiksa dan dijalankan operator lewat halaman PWA; jangan mengklaim sudah menjalankannya.',
  '7. Bila ada transaksi yang timeout, jangan sarankan kirim ulang sebelum memeriksa transactionId/batchId dan System Log.',
  '8. Mode offline hanya untuk snapshot dan draft REVIEW; tidak ada sinkronisasi otomatis.',
].join('\n');

function configuredSheets(env) {
  return Boolean(String(env.GUDANGAI_SHEETS_API_URL || '').trim()
    && String(env.GUDANGAI_SHEETS_API_URL).startsWith('https://')
    && String(env.GUDANGAI_SHEETS_API_SECRET || '').trim());
}

async function callSheetsRead(env, action, params = {}) {
  if (!READ_ONLY_ACTIONS.has(action)) {
    return { success: false, code: 'READ_ACTION_NOT_ALLOWED', error: 'Action bukan bagian dari allowlist read-only.' };
  }
  if (!configuredSheets(env)) {
    return { success: false, code: 'DATA_TOOLS_NOT_CONFIGURED', error: 'Gateway spreadsheet read-only belum dikonfigurasi pada Worker.' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(String(env.GUDANGAI_SHEETS_API_URL).trim(), {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action,
        ...params,
        secret: String(env.GUDANGAI_SHEETS_API_SECRET).trim(),
        client: { app: 'gudangai-rudy-agent', mode: 'read_only' },
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch (_) {
      return { success: false, code: 'SHEETS_NON_JSON', error: 'Apps Script mengembalikan respons bukan JSON.' };
    }
    if (!response.ok) return { success: false, code: 'SHEETS_HTTP_ERROR', error: `Apps Script HTTP ${response.status}`, detail: payload };
    return { ...payload, source: 'Apps Script read-only gateway', action, readAt: new Date().toISOString() };
  } catch (error) {
    return { success: false, code: 'SHEETS_READ_FAILED', error: error?.name === 'AbortError' ? 'Pembacaan spreadsheet timeout.' : String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

function allowedOrigins(request, env) {
  const requestOrigin = new URL(request.url).origin;
  const configured = String(env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  return new Set(configured.length ? configured : [requestOrigin]);
}

function json(data, status = 200, origin = '') {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', vary: 'Origin' };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'content-type, authorization';
    headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function detectLiveActions(message) {
  const text = String(message || '');
  const matched = [];
  for (const intent of LIVE_INTENTS) {
    if (intent.pattern.test(text) && READ_ONLY_ACTIONS.has(intent.action)) matched.push(intent.action);
    if (matched.length >= MAX_LIVE_ACTIONS) break;
  }
  return matched;
}

async function gatherLiveData(env, message) {
  const actions = detectLiveActions(message);
  const results = await Promise.all(actions.map(async (action) => {
    const raw = await callSheetsRead(env, action);
    const ok = raw?.success !== false;
    const { source, action: _action, readAt, ...data } = raw || {};
    return {
      action, ok,
      code: ok ? undefined : raw.code,
      error: ok ? undefined : raw.error,
      source: source || 'Apps Script read-only gateway',
      readAt: readAt || new Date().toISOString(),
      data: ok ? data : undefined,
    };
  }));
  return { results };
}

function truncate(text, limit) {
  return text.length > limit ? `${text.slice(0, limit)} …[dipotong]` : text;
}

export function liveDataBlock(live) {
  if (!live?.results?.length) {
    return 'DATA LIVE: tidak ada untuk pertanyaan ini. Jawab hanya dari konteks yang diberikan operator dan jangan mengklaim membaca spreadsheet.';
  }
  const parts = live.results.map((item) => (item.ok
    ? `[${item.action} | dibaca ${item.readAt} | ${item.source}]\n${truncate(JSON.stringify(item.data), LIVE_DATA_CHAR_BUDGET)}`
    : `[${item.action} | GAGAL ${item.code || 'UNKNOWN'}] Data belum terkonfirmasi: ${item.error || 'tidak ada detail'}`));
  return `DATA LIVE (read-only):\n${parts.join('\n\n')}`;
}

function systemPrompt(context = {}, liveBlock = '') {
  return [
    'Kamu adalah Agent Operasional GudangAI RUDY untuk gudang pusat dan cold storage Nasi Goreng 69.',
    'Jawab dalam Bahasa Indonesia, singkat, akurat, dan berorientasi tindakan operator.',
    'Jangan mengubah master data atau melakukan transaksi stok. Kamu hanya memberi analisis dan rekomendasi.',
    'Jika data tidak cukup, jelaskan data yang kurang dan minta operator memeriksa halaman/sumber yang tepat.',
    SKILL_RULES,
    liveBlock,
    `Konteks operasi: ${JSON.stringify(context).slice(0, 3500)}`,
  ].filter(Boolean).join('\n');
}

function normalizeHistory(history, currentMessage) {
  const normalized = (Array.isArray(history) ? history : []).slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').trim().slice(0, MAX_MESSAGE_LENGTH),
    })).filter((item) => item.content);
  const last = normalized.at(-1);
  if (last?.role === 'user' && last.content === currentMessage) normalized.pop();
  return normalized;
}

function extractText(result) {
  if (typeof result === 'string') return result.trim();
  if (typeof result?.response === 'string') return result.response.trim();
  if (Array.isArray(result?.content)) {
    return result.content.filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text).join('\n').trim();
  }
  return '';
}

async function runWorkersAI(env, messages) {
  if (!env.AI || typeof env.AI.run !== 'function') throw new Error('Workers AI binding AI belum tersedia pada Worker.');
  const model = String(env.AI_MODEL || DEFAULT_MODEL);
  const result = await env.AI.run(model, { messages, max_tokens: 700 });
  const reply = extractText(result);
  if (!reply) throw new Error('Workers AI mengembalikan jawaban kosong.');
  return { reply, model, provider: 'cloudflare-workers-ai' };
}

async function runAnthropicFallback(env, messages, system) {
  if (env.ANTHROPIC_FALLBACK_ENABLED !== 'true' || !env.ANTHROPIC_API_KEY) throw new Error('Fallback Anthropic tidak diaktifkan.');
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 700, system, messages }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) throw new Error(data?.error?.message || `Anthropic API HTTP ${upstream.status}`);
  const reply = extractText(data);
  if (!reply) throw new Error('Anthropic mengembalikan jawaban kosong.');
  return { reply, model: data?.model || ANTHROPIC_MODEL, provider: 'anthropic-fallback' };
}

async function runNineRouter(env, messages) {
  const apiKey = String(env.NINE_ROUTER_API_KEY || '').trim();
  const model = String(env.NINE_ROUTER_MODEL || '').trim();
  if (!apiKey || !model) throw new Error('9Router belum dikonfigurasi: Secret NINE_ROUTER_API_KEY dan variable NINE_ROUTER_MODEL wajib tersedia.');
  const upstream = await fetch('https://9router.com/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: 900 }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const message = data?.error?.message || data?.message || `9Router API HTTP ${upstream.status}`;
    throw new Error(String(message).slice(0, 240));
  }
  const reply = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!reply) throw new Error('9Router mengembalikan jawaban kosong.');
  return { reply, model: data?.model || model, provider: '9router' };
}

async function verifySupabaseAccessToken(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401, code: 'AUTH_REQUIRED', error: 'Silakan login untuk menggunakan Agent GudangAI.' };
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = String(env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!supabaseUrl || !anonKey) return { ok: false, status: 503, code: 'AUTH_NOT_CONFIGURED', error: 'Verifikasi sesi Supabase belum dikonfigurasi pada Worker.' };
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET', headers: { apikey: anonKey, Authorization: `Bearer ${match[1]}` },
    });
    if (!response.ok) return { ok: false, status: 401, code: 'INVALID_SESSION', error: 'Sesi login tidak valid atau sudah berakhir. Silakan login kembali.' };
    const user = await response.json().catch(() => null);
    if (!user?.id) return { ok: false, status: 401, code: 'INVALID_SESSION', error: 'Supabase tidak mengembalikan identitas pengguna yang valid.' };
    return { ok: true, userId: user.id };
  } catch (_) {
    return { ok: false, status: 503, code: 'AUTH_PROVIDER_UNAVAILABLE', error: 'Layanan verifikasi Supabase sedang tidak dapat dihubungi.' };
  }
}

async function handleAgent(request, env, origin) {
  const auth = await verifySupabaseAccessToken(request, env);
  if (!auth.ok) return json({ success: false, code: auth.code, error: auth.error }, auth.status, origin);
  const body = await request.json().catch(() => null);
  const message = String(body?.message || '').trim();
  if (!message) return json({ success: false, code: 'MESSAGE_REQUIRED', error: 'Pertanyaan belum diisi.' }, 400, origin);
  if (message.length > MAX_MESSAGE_LENGTH) return json({ success: false, code: 'MESSAGE_TOO_LONG', error: 'Pertanyaan terlalu panjang.' }, 413, origin);
  const context = body?.context && typeof body.context === 'object' ? body.context : {};
  const history = normalizeHistory(body?.history, message);
  const live = await gatherLiveData(env, message);
  const system = systemPrompt(context, liveDataBlock(live));
  const dataSources = live.results.map(({ action, ok, readAt, code }) => ({ action, ok, readAt, ...(code ? { code } : {}) }));
  const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: message }];

  try {
    if (env.NINE_ROUTER_API_KEY && env.NINE_ROUTER_MODEL) {
      try {
        const result = await runNineRouter(env, messages);
        return json({ success: true, ...result, mode: 'hybrid', dataSources }, 200, origin);
      } catch (routerError) {
        try {
          const fallback = await runWorkersAI(env, messages);
          return json({
            success: true, ...fallback, mode: 'hybrid', dataSources,
            fallbackReason: String(routerError?.message || '9Router unavailable').slice(0, 240),
          }, 200, origin);
        } catch (primaryError) {
          return json({
            success: false, code: 'AI_PROVIDERS_UNAVAILABLE', error: '9Router dan Workers AI tidak tersedia.',
            detail: String(primaryError?.message || routerError?.message || 'AI provider gagal').slice(0, 240),
          }, 503, origin);
        }
      }
    }
    const result = await runWorkersAI(env, messages);
    return json({ success: true, ...result, mode: 'hybrid', dataSources }, 200, origin);
  } catch (primaryError) {
    if (env.ANTHROPIC_FALLBACK_ENABLED === 'true' && env.ANTHROPIC_API_KEY) {
      try {
        const fallback = await runAnthropicFallback(env, messages.slice(1), system);
        return json({
          success: true, ...fallback, mode: 'hybrid', dataSources,
          fallbackReason: String(primaryError?.message || 'Workers AI unavailable').slice(0, 240),
        }, 200, origin);
      } catch (fallbackError) {
        return json({
          success: false, code: 'AI_PROVIDERS_UNAVAILABLE',
          error: 'Workers AI gagal dan fallback Anthropic juga tidak tersedia.',
          detail: String(fallbackError?.message || 'Fallback gagal').slice(0, 240),
        }, 503, origin);
      }
    }
    return json({
      success: false, code: 'WORKERS_AI_UNAVAILABLE',
      error: 'Agent utama Workers AI sedang tidak tersedia. Anthropic fallback tidak diaktifkan.',
      detail: String(primaryError?.message || 'Workers AI gagal').slice(0, 240),
    }, 503, origin);
  }
}

async function handleReadOnlyData(request, env, origin) {
  const auth = await verifySupabaseAccessToken(request, env);
  if (!auth.ok) return json({ success: false, code: auth.code, error: auth.error }, auth.status, origin);
  const body = await request.json().catch(() => null);
  const action = String(body?.action || '').trim();
  if (!READ_ONLY_ACTIONS.has(action)) return json({ success: false, code: 'READ_ACTION_NOT_ALLOWED', error: 'Action tidak diizinkan untuk gateway read-only.' }, 400, origin);
  const params = { ...body };
  delete params.action;
  delete params.secret;
  delete params.authorization;
  const result = await callSheetsRead(env, action, params);
  return json({ ...result, actor: auth.userId, permissions: 'read_only' }, result.success === false ? 502 : 200, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const originHeader = request.headers.get('Origin') || '';
    const origins = allowedOrigins(request, env);
    if (originHeader && !origins.has(originHeader)) return json({ success: false, code: 'ORIGIN_NOT_ALLOWED', error: 'Origin tidak diizinkan.' }, 403);
    const corsOrigin = originHeader && origins.has(originHeader) ? originHeader : '';
    if (request.method === 'OPTIONS') {
      if (originHeader && !corsOrigin) return json({ success: false, code: 'ORIGIN_NOT_ALLOWED' }, 403);
      return json({ success: true }, 200, corsOrigin);
    }
    if (url.pathname === '/api/agent/health') {
      if (request.method !== 'GET') return json({ success: false, error: 'Method not allowed' }, 405, corsOrigin);
      return json({
        success: true, mode: 'hybrid',
        primary: env.NINE_ROUTER_API_KEY && env.NINE_ROUTER_MODEL ? '9router' : 'cloudflare-workers-ai',
        primaryConfigured: Boolean((env.NINE_ROUTER_API_KEY && env.NINE_ROUTER_MODEL) || (env.AI && typeof env.AI.run === 'function')),
        nineRouterConfigured: Boolean(env.NINE_ROUTER_API_KEY && env.NINE_ROUTER_MODEL),
        model: String(env.AI_MODEL || DEFAULT_MODEL),
        anthropicFallbackEnabled: env.ANTHROPIC_FALLBACK_ENABLED === 'true' && Boolean(env.ANTHROPIC_API_KEY),
        authRequired: true,
        authConfigured: Boolean(env.SUPABASE_URL && (env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY)),
        dataToolsConfigured: configuredSheets(env),
        dataToolsMode: 'read_only_allowlist',
        agentStage: configuredSheets(env) ? 'read_only_live_data' : 'analysis_only',
        liveIntentActions: LIVE_INTENTS.map((intent) => intent.action),
        readOnlyActions: Array.from(READ_ONLY_ACTIONS),
        deploymentTarget: new URL(request.url).origin,
      }, 200, corsOrigin);
    }
    if (url.pathname === '/api/data') {
      if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405, corsOrigin);
      return handleReadOnlyData(request, env, corsOrigin);
    }
    if (url.pathname === '/api/claude' || url.pathname === '/api/agent') {
      if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405, corsOrigin);
      return handleAgent(request, env, corsOrigin);
    }
    return env.ASSETS.fetch(request);
  },
};
