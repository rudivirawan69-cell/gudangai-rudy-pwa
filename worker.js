const ALLOWED_ORIGIN = 'https://claude-proxy.rudivirawan69.workers.dev';
const MODEL = 'claude-3-5-haiku-latest';

function json(data, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  });
}

function systemPrompt(context = {}) {
  return [
    'Kamu adalah Claude Ops Assistant untuk GudangAI RUDY, cold storage Nasi Goreng 69.',
    'Jawab dalam Bahasa Indonesia secara singkat, praktis, dan berorientasi tindakan operator.',
    'Jangan mengarang kode barang, jumlah, atau status PO yang tidak ada dalam konteks.',
    'Jangan mengubah master data. Jika data tidak cukup, minta operator membuka halaman yang tepat.',
    `Konteks operasi saat ini: ${JSON.stringify(context).slice(0, 3500)}`,
  ].join('\n');
}

async function handleClaude(request, env) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ success: false, code: 'CLAUDE_NOT_CONFIGURED', error: 'Agent Claude belum dikonfigurasi di Worker. Tambahkan secret ANTHROPIC_API_KEY pada Cloudflare Worker.' }, 503);
  }
  const body = await request.json().catch(() => null);
  const message = String(body?.message || '').trim();
  if (!message) return json({ success: false, code: 'MESSAGE_REQUIRED', error: 'Pertanyaan belum diisi.' }, 400);
  if (message.length > 4000) return json({ success: false, code: 'MESSAGE_TOO_LONG', error: 'Pertanyaan terlalu panjang.' }, 413);

  const history = Array.isArray(body?.history) ? body.history.slice(-8).map((item) => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    content: String(item?.content || '').slice(0, 4000),
  })).filter((item) => item.content) : [];
  const messages = [...history, { role: 'user', content: message }];
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system: systemPrompt(body?.context), messages }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return json({ success: false, code: 'CLAUDE_UPSTREAM_ERROR', error: data?.error?.message || `Claude API HTTP ${upstream.status}` }, upstream.status >= 500 ? 502 : upstream.status);
  const reply = Array.isArray(data?.content) ? data.content.filter((part) => part?.type === 'text').map((part) => part.text).join('\n').trim() : '';
  return json({ success: true, reply, model: data?.model || MODEL });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return json({ success: true });
    if (url.pathname === '/api/claude') {
      if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);
      return handleClaude(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
