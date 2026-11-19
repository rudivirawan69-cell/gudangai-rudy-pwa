import { parseTanggal, resolvePeriode } from './tanggal.js';
import { AGENT_SKILL_RULES, EXTRA_LIVE_INTENTS, EXTRA_READ_ACTIONS, buildSystemPrompt } from './cloudflare/agentSkills.js';
import { CODE_KNOWLEDGE } from './cloudflare/generated/code-knowledge.js';

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_ITEMS = 8;
const LIVE_DATA_CHAR_BUDGET = 9000;
const CODE_DATA_CHAR_BUDGET = 6500;
const MAX_LIVE_ACTIONS = 2;
const READ_ONLY_ACTIONS = new Set([
  'ping','status','getConfig','getDashboard','getDashboardData',
  'getAllStock','getStockAll','getStockByCode','searchByName',
  'getLowStock','getTransactionHistory','getStatusPO','bootstrap',
  'getStockDelta','getSyncMetrics','getLastUpdate','getPOAnalysis','getAgentKnowledge',
  ...EXTRA_READ_ACTIONS,
]);
const LIVE_INTENTS = [
  { action: 'getAgentKnowledge', pattern: /(?:daftar|nama|struktur|isi|seluruh|semua|baca|cari|jelaskan|periksa).{0,45}(?:sheet|spreadsheet|tab|kolom|baris|formula|rumus)|(?:sheet|spreadsheet|tab|kolom|baris|formula|rumus).{0,45}(?:apa|mana|semua|seluruh|struktur|isi|data|header|judul)|rumus.{0,30}(?:stok|sisa|stock|perhitungan)/i },
  ...EXTRA_LIVE_INTENTS.filter((intent) => intent.action === 'getStockoutRisk'),
  { action: 'getDashboardData', pattern: /dashboard|ringkasan|rangkuman|kondisi gudang|overview/i },
  { action: 'getLowStock', pattern: /stok (menipis|kritis|rendah|habis)|low ?stock|di bawah minimum|hampir habis|kritis/i },
  { action: 'searchByName', pattern: /\b(stok|stock|sisa)\b|stock akhir|stok akhir|berapa.*(stok|stock|sisa)|sisa (stok|barang)|cari (barang|item|kode)|nama barang|fillet|kode (cv|pt|wk)-?/i },
  { action: 'getAllStock', pattern: /semua stok|stok (cv|pt|semua|master|lengkap)|daftar (stok|barang)|inventory/i },
  { action: 'getStatusPO', pattern: /\bpo\b|purchase order|status po|pembelian/i },
  { action: 'getTransactionHistory', pattern: /riwayat|histori|history|transaksi (terakhir|hari ini|kemarin)|barang (masuk|keluar|rusak)/i },
  { action: 'getStockDelta', pattern: /perubahan (stok|terakhir)|yang (baru|berubah) (saja|hari ini)|delta|sinkronisasi|apa yang berubah/i },
  { action: 'getSyncMetrics', pattern: /metrik (sync|sinkronisasi)|performa (sync|koneksi)|seberapa sering (error|gagal)|kesehatan (sync|sistem)/i },
  { action: 'getPOAnalysis', pattern: /analisis po|rekomendasi (po|pembelian)|apa yang (harus|perlu) (di)?(pesan|beli)/i },
  { action: 'getConfig', pattern: /periode aktif|bulan (aktif|berjalan)|konfigurasi|timezone|versi backend/i },
  ...EXTRA_LIVE_INTENTS.filter((intent) => intent.action !== 'getStockoutRisk'),
];
function emptyPOSummary() {
  return {
    totalAktif: 0, totalKonfirmasi: 0, itemMenunggu: 0, itemSebagian: 0,
    itemSelesai: 0, totalItem: 0, totalPOQty: 0, totalKonfirmasiQty: 0,
    totalSisaQty: 0,
  };
}
function summarizePOItems(items) {
  const summary = emptyPOSummary();
  for (const item of items) {
    const total = Math.max(0, Number(item.totalPO ?? item.qtyPO ?? 0) || 0);
    const arrived = Math.min(total, Math.max(0, Number(item.qtyDatang ?? 0) || 0));
    summary.totalItem += 1;
    summary.totalPOQty += total;
    summary.totalKonfirmasiQty += arrived;
    if (item.status === 'SELESAI') {
      summary.itemSelesai += 1;
      summary.totalKonfirmasi += 1;
    } else if (item.status === 'SEBAGIAN') {
      summary.itemSebagian += 1;
      summary.totalAktif += 1;
    } else {
      summary.itemMenunggu += 1;
      summary.totalAktif += 1;
    }
  }
  summary.totalSisaQty = Math.max(0, summary.totalPOQty - summary.totalKonfirmasiQty);
  return summary;
}
function normalizePOItem(item, todayWIB) {
  const status = String(item?.status || 'MENUNGGU').trim().toUpperCase();
  const tglKedatangan = parseTanggal(
    item?.tglKedatangan ?? item?.tanggalKedatangan ?? item?.tgl_kedatangan ?? null
  );
  return {
    ...item,
    status,
    tglKedatangan,
    terlambat: status !== 'SELESAI' && Boolean(tglKedatangan && tglKedatangan < todayWIB),
  };
}
function buildPOPeriodResponse(source, period, now = new Date()) {
  if (!source || source.success === false) return source || {
    success: false, code: 'PO_SOURCE_EMPTY', error: 'Sumber Status PO tidak mengembalikan data.',
  };
  const todayWIB = parseTanggal(now);
  const tanggalPO = parseTanggal(source.tanggalPO ?? source.tanggalPo ?? null);
  const sourceItems = Array.isArray(source.items) ? source.items : [];
  const normalizedItems = sourceItems.map((item) => normalizePOItem(item, todayWIB));
  const isInPeriod = Boolean(tanggalPO && tanggalPO >= period.from && tanggalPO <= period.to);
  const isOlderThanPeriod = Boolean(tanggalPO && tanggalPO < period.from);
  const items = isInPeriod ? normalizedItems : [];
  const tertundaItems = isOlderThanPeriod
    ? normalizedItems.filter((item) => item.status === 'MENUNGGU' || item.status === 'SEBAGIAN')
    : [];
  const ringkasan = summarizePOItems(items);
  return {
    ...source,
    tanggalPO,
    periode: { from: period.from, to: period.to, label: period.label, minggu: period.minggu ?? null },
    sumber: source.sumber || 'purchase order aktif + Barang masuk; tampilan mengikuti Dashboard Live baris 55–64',
    ringkasan,
    summary: ringkasan,
    items,
    tertunda: {
      totalItem: tertundaItems.length,
      items: tertundaItems,
    },
  };
}
function resolvePORequestPeriod(url, now = new Date()) {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (Boolean(from) !== Boolean(to)) {
    return { error: 'Parameter from dan to harus dikirim berpasangan.' };
  }
  return resolvePeriode({ from, to, periode: url.searchParams.get('periode') || 'minggu-ini' }, now);
}
async function handleStatusPO(request, env, origin, url) {
  const auth = await verifySupabaseAccessToken(request, env);
  if (!auth.ok) return json({ success:false, code:auth.code, error:auth.error }, auth.status, origin);
  const period = resolvePORequestPeriod(url);
  if (period.error) return json({ success:false, code:'INVALID_PO_PERIOD', error:period.error }, 400, origin);
  const raw = await callSheetsRead(env, 'getStatusPO');
  if (raw?.success === false) {
    return json({ ...raw, actor:auth.userId, permissions:'read_only' }, 502, origin);
  }
  const data = buildPOPeriodResponse(raw, period);
  if (data?.success === false) return json(data, 502, origin);
  if (url.pathname === '/api/getPOTerlambat') {
    const active = [...(data.items || []), ...(data.tertunda?.items || [])];
    const terlambat = active.filter((item) => item.terlambat);
    return json({
      success:true, status:'OK', tanggalHariIniWIB:parseTanggal(new Date()),
      periode:data.periode, totalItem:terlambat.length, items:terlambat,
      source:data.sumber, actor:auth.userId, permissions:'read_only',
    }, 200, origin);
  }
  return json({ ...data, actor:auth.userId, permissions:'read_only' }, 200, origin);
}
function configuredSheets(env) {
  return Boolean(String(env.GUDANGAI_SHEETS_API_URL||'').trim().startsWith('https://') && String(env.GUDANGAI_SHEETS_API_SECRET||'').trim());
}
async function callSheetsRead(env, action, params = {}) {
  if (!READ_ONLY_ACTIONS.has(action)) return { success:false, code:'READ_ACTION_NOT_ALLOWED', error:'Action bukan allowlist read-only.' };
  if (!configuredSheets(env)) return { success:false, code:'DATA_TOOLS_NOT_CONFIGURED', error:'Gateway spreadsheet belum dikonfigurasi.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(String(env.GUDANGAI_SHEETS_API_URL).trim(), {
      method:'POST', headers:{'content-type':'text/plain;charset=utf-8'},
      body: JSON.stringify({ action, ...params, secret:String(env.GUDANGAI_SHEETS_API_SECRET).trim(), client:{app:'gudangai-rudy-agent', mode:'read_only'} }),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload; try { payload = JSON.parse(text); } catch { return { success:false, code:'SHEETS_NON_JSON', error:'Respons bukan JSON.' }; }
    if (!response.ok) return { success:false, code:'SHEETS_HTTP_ERROR', error:`Apps Script HTTP ${response.status}`, detail:payload };
    return { ...payload, source:'Apps Script read-only gateway', action, readAt:new Date().toISOString() };
  } catch (error) {
    return { success:false, code:'SHEETS_READ_FAILED', error: error?.name==='AbortError' ? 'Timeout spreadsheet.' : String(error?.message||error) };
  } finally { clearTimeout(timer); }
}
function allowedOrigins(request, env) {
  const requestOrigin = new URL(request.url).origin;
  const configured = String(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);
  return new Set(configured.length ? configured : [requestOrigin]);
}
function json(data, status=200, origin='') {
  const headers = { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', vary:'Origin' };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'content-type, authorization';
    headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
  }
  return new Response(JSON.stringify(data), { status, headers });
}
export function detectLiveActions(message) {
  const text = String(message||'');
  const matched = [];
  for (const intent of LIVE_INTENTS) {
    if (intent.pattern.test(text) && READ_ONLY_ACTIONS.has(intent.action)) matched.push(intent.action);
    if (matched.length >= MAX_LIVE_ACTIONS) break;
  }
  return matched;
}
function extractStockQuery(message) {
  const stop = /\b(berapa|tolong|cek|lihat|tampilkan|stock|stok|akhir|sisa|saat ini|sekarang|untuk|yang|ada|mohon|info|informasi|entitas|cv|pt|wk|divisi)\b/gi;
  return String(message||'').replace(stop,' ').replace(/[^\w\s\-./]/gu,' ').replace(/\s+/g,' ').trim().slice(0,80);
}
async function gatherLiveData(env, message) {
  const actions = detectLiveActions(message).slice();
  if (!actions.length && /\b(stok|stock|sisa|fillet|barang)\b/i.test(String(message||''))) actions.push('getAllStock');
  const query = extractStockQuery(message);
  const results = await Promise.all(actions.map(async (action) => {
    const params = {};
    if (action === 'searchByName' && query) { params.q=query; params.query=query; params.nama=query; params.name=query; }
    if (action === 'getAllStock') params.entitas = 'ALL';
    if (action === 'getAgentKnowledge') {
      const text = String(message || '');
      const sheetNames = ['Stock CV','Stock PT','Stock Bahan Baku','Barang masuk','Barang keluar','Barang Rusak','purchase order','Dashboard Live','Data Stok Per Divisi','System Log','Config','Stock Awal'];
      const requestedSheet = sheetNames.find((name) => text.toLowerCase().includes(name.toLowerCase()));
      const pageMatch = text.match(/(?:baris|row)\s*(\d+)/i);
      const wantsPage = Boolean(requestedSheet && pageMatch);
      const wantsManifest = /(?:daftar|nama|semua|seluruh|struktur).{0,30}(?:sheet|spreadsheet|tab)|(?:sheet|tab).{0,20}(?:apa saja|daftar|semua)/i.test(text);
      params.mode = wantsPage ? 'page' : wantsManifest ? 'manifest' : 'search';
      params.query = text.slice(0,240);
      if (wantsPage) { params.sheetName = requestedSheet; params.startRow = Number(pageMatch[1]); params.pageSize = 30; }
      params.includeFormulas = /formula|rumus|vlookup|arrayformula/i.test(text);
      params.limit = 24;
    }
    if (action === 'getStockoutRisk') { params.windowDays = 30; params.thresholdDays = 3; }
    if (action === 'getStockDelta') params.sinceTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    if (action === 'getTransactionHistory') { params.sheet = 'Barang keluar'; params.limit = 100; }
    const raw = await callSheetsRead(env, action, params);
    const ok = raw?.success !== false;
    const { source, action: _a, readAt, ...data } = raw || {};
    return { action, ok, code: ok?undefined:raw?.code, error: ok?undefined:raw?.error, source: source||'Apps Script read-only gateway', readAt: readAt||new Date().toISOString(), data: ok?data:undefined, query: query||undefined };
  }));
  return { results };
}
function truncate(text, limit) { return text.length > limit ? `${text.slice(0,limit)} …[dipotong]` : text; }
export function liveDataBlock(live) {
  if (!live?.results?.length) return 'DATA LIVE: tidak ada untuk pertanyaan ini. Jawab hanya dari konteks operator dan jangan mengklaim membaca spreadsheet.';
  let remaining = LIVE_DATA_CHAR_BUDGET;
  const parts = live.results.map((item) => {
    if (!item.ok) return '[' + item.action + ' | GAGAL ' + (item.code || 'UNKNOWN') + '] Data belum terkonfirmasi: ' + (item.error || '-');
    if (remaining <= 0) return '[' + item.action + '] Hasil tidak dimasukkan karena batas konteks tercapai.';
    const raw = JSON.stringify(item.data);
    const clipped = truncate(raw, remaining);
    remaining = Math.max(0, remaining - clipped.length);
    return '[' + item.action + ' | dibaca ' + item.readAt + ' | ' + item.source + ']\n' + clipped;
  });
  return 'DATA LIVE (read-only; setiap hasil memiliki sumber dan waktu baca):\n' + parts.join('\n\n');
}
const CODE_STOP_WORDS = new Set(['dan','atau','yang','untuk','dari','dengan','pada','apa','bagaimana','berapa','tolong','jelaskan','periksa','cek','saya','kamu','agent','gudangai','rudy','rubee','tentang','sistem','aplikasi']);
export function retrieveCodeKnowledge(message, maxChunks = 3) {
  const terms = [...new Set(String(message || '').toLowerCase().match(/[a-z0-9_]{3,}/g) || [])].filter((term) => !CODE_STOP_WORDS.has(term));
  if (!terms.length) return { block: '', sources: [] };
  const ranked = CODE_KNOWLEDGE.chunks.map((chunk) => {
    const text = String(chunk.text || '').toLowerCase();
    let score = 0;
    for (const term of terms) {
      let count = 0;
      let at = text.indexOf(term);
      while (at >= 0 && count < 8) {
        count += 1;
        at = text.indexOf(term, at + term.length);
      }
      score += count * (term.length >= 7 ? 2 : 1);
    }
    return { chunk, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.chunk.id - b.chunk.id).slice(0, maxChunks);
  const sources = ranked.map(({ chunk }) => ({
    source: 'Code.gs', section: chunk.section, chunk: chunk.id,
    sha256: CODE_KNOWLEDGE.sha256, version: CODE_KNOWLEDGE.version, ref: CODE_KNOWLEDGE.ref,
  }));
  let remaining = CODE_DATA_CHAR_BUDGET;
  const block = ranked.map(({ chunk }) => {
    if (remaining <= 0) return '';
    const value = '[Code.gs · ' + chunk.section + ' · potongan ' + chunk.id + ']\n' + truncate(chunk.text, remaining);
    remaining = Math.max(0, remaining - value.length);
    return value;
  }).filter(Boolean).join('\n\n');
  return { block, sources };
}
function systemPrompt(context = {}, liveBlock = '', codeBlock = '') {
  return buildSystemPrompt(context, liveBlock, codeBlock);
}
function normalizeHistory(history, currentMessage) {
  const normalized = (Array.isArray(history)?history:[]).slice(-MAX_HISTORY_ITEMS)
    .map((item)=>({ role: item?.role==='assistant'?'assistant':'user', content:String(item?.content||'').trim().slice(0,MAX_MESSAGE_LENGTH) }))
    .filter((item)=>item.content);
  const last = normalized.at(-1);
  if (last?.role==='user' && last.content===currentMessage) normalized.pop();
  return normalized;
}
function extractText(result) {
  if (typeof result==='string') return result.trim();
  if (typeof result?.response==='string') return result.response.trim();
  if (Array.isArray(result?.content)) return result.content.filter(p=>p?.type==='text'&&typeof p.text==='string').map(p=>p.text).join('\n').trim();
  return '';
}
async function runNineRouter(env, messages) {
  const apiKey = String(env.NINE_ROUTER_API_KEY || '').trim();
  const model = String(env.NINE_ROUTER_MODEL || '').trim();
  if (!apiKey || !model) throw new Error('9Router belum dikonfigurasi.');
  const upstream = await fetch('https://9router.com/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: 900 }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) throw new Error(String(data?.error?.message || data?.message || `9Router HTTP ${upstream.status}`).slice(0, 240));
  const reply = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!reply) throw new Error('9Router mengembalikan jawaban kosong.');
  return { reply, model: data?.model || model, provider: '9router' };
}
async function runWorkersAI(env, messages) {
  if (!env.AI || typeof env.AI.run!=='function') throw new Error('Workers AI binding AI belum tersedia.');
  const model = String(env.AI_MODEL||DEFAULT_MODEL);
  const result = await env.AI.run(model, { messages, max_tokens:700 });
  const reply = extractText(result);
  if (!reply) throw new Error('Workers AI mengembalikan jawaban kosong.');
  return { reply, model, provider:'cloudflare-workers-ai' };
}
async function verifySupabaseAccessToken(request, env) {
  const authorization = request.headers.get('Authorization')||'';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok:false, status:401, code:'AUTH_REQUIRED', error:'Silakan login untuk menggunakan Agent GudangAI.' };
  const supabaseUrl = String(env.SUPABASE_URL||'').replace(/\/+$/,'');
  const anonKey = String(env.SUPABASE_ANON_KEY||env.SUPABASE_PUBLISHABLE_KEY||'').trim();
  if (!supabaseUrl||!anonKey) return { ok:false, status:503, code:'AUTH_NOT_CONFIGURED', error:'Verifikasi sesi Supabase belum dikonfigurasi pada Worker.' };
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, { method:'GET', headers:{ apikey:anonKey, Authorization:`Bearer ${match[1]}` } });
    if (!response.ok) return { ok:false, status:401, code:'INVALID_SESSION', error:'Sesi login tidak valid atau sudah berakhir. Silakan login kembali.' };
    const user = await response.json().catch(()=>null);
    if (!user?.id) return { ok:false, status:401, code:'INVALID_SESSION', error:'Supabase tidak mengembalikan identitas pengguna yang valid.' };
    return { ok:true, userId:user.id };
  } catch {
    return { ok:false, status:503, code:'AUTH_PROVIDER_UNAVAILABLE', error:'Layanan verifikasi Supabase sedang tidak dapat dihubungi.' };
  }
}
async function handleAgent(request, env, origin) {
  const auth = await verifySupabaseAccessToken(request, env);
  if (!auth.ok) return json({ success:false, code:auth.code, error:auth.error }, auth.status, origin);
  const body = await request.json().catch(()=>null);
  const message = String(body?.message||'').trim();
  if (!message) return json({ success:false, code:'MESSAGE_REQUIRED', error:'Pertanyaan belum diisi.' }, 400, origin);
  if (message.length > MAX_MESSAGE_LENGTH) return json({ success:false, code:'MESSAGE_TOO_LONG', error:'Pertanyaan terlalu panjang.' }, 413, origin);
  const context = body?.context && typeof body.context==='object' ? body.context : {};
  const history = normalizeHistory(body?.history, message);
  const live = await gatherLiveData(env, message);
  const codeKnowledge = retrieveCodeKnowledge(message);
  const system = systemPrompt(context, liveDataBlock(live), codeKnowledge.block);
  const dataSources = live.results.map(({action,ok,readAt,code})=>({action,ok,readAt,...(code?{code}:{})}));
  const messages = [{ role:'system', content:system }, ...history, { role:'user', content:message }];
  try {
    if (env.NINE_ROUTER_API_KEY && env.NINE_ROUTER_MODEL) {
      try {
        const result = await runNineRouter(env, messages);
        return json({ success:true, ...result, mode:'hybrid', dataSources, knowledgeSources:codeKnowledge.sources }, 200, origin);
      } catch (routerError) {
        try {
          const fallback = await runWorkersAI(env, messages);
          return json({ success:true, ...fallback, mode:'hybrid', dataSources, knowledgeSources:codeKnowledge.sources, fallbackReason:String(routerError?.message||'9Router unavailable').slice(0,240) }, 200, origin);
        } catch (primaryError) {
          return json({ success:false, code:'AI_PROVIDERS_UNAVAILABLE', error:'9Router dan Workers AI tidak tersedia.', detail:String(primaryError?.message||routerError?.message||'AI gagal').slice(0,240) }, 503, origin);
        }
      }
    }
    const result = await runWorkersAI(env, messages);
    return json({ success:true, ...result, mode:'hybrid', dataSources, knowledgeSources:codeKnowledge.sources }, 200, origin);
  } catch (primaryError) {
    return json({ success:false, code:'WORKERS_AI_UNAVAILABLE', error:'Agent Workers AI sedang tidak tersedia.', detail:String(primaryError?.message||'Workers AI gagal').slice(0,240) }, 503, origin);
  }
}
async function handleReadOnlyData(request, env, origin) {
  const auth = await verifySupabaseAccessToken(request, env);
  if (!auth.ok) return json({ success:false, code:auth.code, error:auth.error }, auth.status, origin);
  const body = await request.json().catch(()=>null);
  const action = String(body?.action||'').trim();
  if (!READ_ONLY_ACTIONS.has(action)) return json({ success:false, code:'READ_ACTION_NOT_ALLOWED', error:'Action tidak diizinkan.' }, 400, origin);
  const params = { ...body }; delete params.action; delete params.secret; delete params.authorization;
  const result = await callSheetsRead(env, action, params);
  return json({ ...result, actor:auth.userId, permissions:'read_only' }, result.success===false ? 502 : 200, origin);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const originHeader = request.headers.get('Origin')||'';
    const origins = allowedOrigins(request, env);
    if (originHeader && !origins.has(originHeader)) return json({ success:false, code:'ORIGIN_NOT_ALLOWED', error:'Origin tidak diizinkan.' }, 403);
    const corsOrigin = originHeader && origins.has(originHeader) ? originHeader : '';
    if (request.method === 'OPTIONS') {
      if (originHeader && !corsOrigin) return json({ success:false, code:'ORIGIN_NOT_ALLOWED' }, 403);
      return json({ success:true }, 200, corsOrigin);
    }
    if (url.pathname === '/api/agent/health' || url.pathname === '/api/health') {
      if (request.method !== 'GET') return json({ success:false, error:'Method not allowed' }, 405, corsOrigin);
      return json({
        success:true, mode:'hybrid', primary:'cloudflare-workers-ai',
        primaryConfigured:Boolean(env.AI), nineRouterConfigured:Boolean(env.NINE_ROUTER_API_KEY && env.NINE_ROUTER_MODEL),
        model:String(env.AI_MODEL||DEFAULT_MODEL), anthropicFallbackEnabled:false,
        authRequired:true, authConfigured:Boolean(env.SUPABASE_URL && (env.SUPABASE_ANON_KEY||env.SUPABASE_PUBLISHABLE_KEY)),
        dataToolsConfigured:configuredSheets(env), dataToolsMode:'read_only_allowlist',
        agentStage: configuredSheets(env) ? 'read_only_live_data' : 'analysis_only',
        liveIntentActions:LIVE_INTENTS.map(i=>i.action),
        readOnlyActions:Array.from(READ_ONLY_ACTIONS),
        codeKnowledgeIndexed:true, codeKnowledgeVersion:CODE_KNOWLEDGE.version,
        codeKnowledgeSha256:CODE_KNOWLEDGE.sha256, codeKnowledgeChunks:CODE_KNOWLEDGE.chunkCount,
        spreadsheetKnowledgeAction:'getAgentKnowledge', maxLiveActions:MAX_LIVE_ACTIONS,
        deploymentTarget:new URL(request.url).origin,
      }, 200, corsOrigin);
    }
    if (url.pathname === '/api/getStatusPO' || url.pathname === '/api/getPOTerlambat') {
      if (request.method !== 'GET') return json({ success:false, error:'Method not allowed' }, 405, corsOrigin);
      return handleStatusPO(request, env, corsOrigin, url);
    }
    if (url.pathname === '/api/data') {
      if (request.method !== 'POST') return json({ success:false, error:'Method not allowed' }, 405, corsOrigin);
      return handleReadOnlyData(request, env, corsOrigin);
    }
    if (url.pathname === '/api/agent' || url.pathname === '/api/claude') {
      if (request.method !== 'POST') return json({ success:false, error:'Method not allowed' }, 405, corsOrigin);
      return handleAgent(request, env, corsOrigin);
    }
    return env.ASSETS.fetch(request);
  },
};
