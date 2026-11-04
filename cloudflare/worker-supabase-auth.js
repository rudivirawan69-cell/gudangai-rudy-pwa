// GudangAI RUDY Cloudflare Worker — Supabase Auth protected variant.
// Required bindings: AI, ASSETS
// Required Worker vars: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
// Intentionally not wired to the root static-assets wrangler.jsonc.

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const requestCounts = new Map();
const ALLOWED_ORIGINS = new Set([
  "https://rudivirawan69-cell.github.io",
  "https://gudangai-rudy-pwa-live.vercel.app",
  "https://gudangai-rudy-pwa69.rudivirawan69.workers.dev",
  "http://localhost:5173",
]);
const MODELS = [
  { id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", description: "Cepat dan cerdas (default)" },
  { id: "anthropic/claude-haiku-5.5", name: "Claude Haiku 5.5", description: "Tercepat dan termurah" },
  { id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", description: "Paling cerdas" },
];
const ALLOWED_MODELS = new Set(MODELS.map((item) => item.id));
const SYSTEM_PROMPT = [
  "Kamu adalah GudangAI RUDY, asisten operasional gudang CV Selera Bogatama, dan selalu menjawab dalam bahasa Indonesia.",
  "Jangan mengarang data stok, transaksi, PO, harga, jadwal, suhu, atau kondisi gudang.",
  "Gunakan hanya data aktual yang secara eksplisit diberikan melalui pesan atau tool backend terverifikasi.",
  "Jika data aktual belum tersedia, jelaskan keterbatasan itu dan jangan menebak.",
  "Jangan mengklaim telah mengubah spreadsheet, membuat PO, atau mengirim transaksi tanpa hasil tool backend yang terverifikasi.",
  "Jangan meminta password, PIN, access token, API key, atau secret dari pengguna.",
].join(" ");

function isRateLimited(key) {
  const now = Date.now();
  if (requestCounts.size > 5000) {
    for (const [storedKey, storedValue] of requestCounts) {
      if (now - storedValue.start >= RATE_LIMIT_WINDOW_MS) requestCounts.delete(storedKey);
    }
  }
  const entry = requestCounts.get(key);
  if (!entry || now - entry.start >= RATE_LIMIT_WINDOW_MS) {
    requestCounts.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
    "Access-Control-Expose-Headers": "Retry-After",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

async function authenticate(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new Error("AUTH_CONFIGURATION_MISSING");

  const base = String(env.SUPABASE_URL).replace(/\/+$/, "");
  const response = await fetch(`${base}/auth/v1/user`, {
    method: "GET",
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authorization },
  });
  if (!response.ok) return null;
  const user = await response.json();
  if (!user?.id || user?.is_anonymous === true) return null;
  if (user.app_metadata?.gudangai_access === false) return null;
  return user;
}

function validateMessages(body) {
  let messages = body.messages;
  if (!Array.isArray(messages) && typeof body.prompt === "string") {
    messages = [{ role: "user", content: body.prompt }];
  }
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 30) {
    return { error: "Jumlah pesan tidak valid (1–30)." };
  }
  let totalChars = 0;
  const normalized = [];
  for (const item of messages) {
    if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") {
      return { error: "Format pesan tidak valid." };
    }
    const content = item.content.trim();
    if (!content || content.length > 6000) return { error: "Setiap pesan harus berisi 1–6000 karakter." };
    totalChars += content.length;
    normalized.push({ role: item.role, content });
  }
  if (totalChars > 30_000) return { error: "Total isi percakapan terlalu panjang." };
  if (normalized[normalized.length - 1].role !== "user") return { error: "Pesan terakhir harus berasal dari pengguna." };
  return { messages: normalized };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (origin && !ALLOWED_ORIGINS.has(origin)) return jsonResponse({ error: "Origin tidak diizinkan." }, 403, {});
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (url.pathname === "/api/models" && request.method === "GET") {
      try {
        const user = await authenticate(request, env);
        if (!user) return jsonResponse({ error: "Sesi Supabase tidak valid. Silakan login kembali." }, 401, cors);
        return jsonResponse({ models: MODELS }, 200, cors);
      } catch (error) {
        console.error("GudangAI auth configuration/error:", error?.message || "unknown");
        return jsonResponse({ error: "Layanan autentikasi belum siap." }, 503, cors);
      }
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const contentLength = Number(request.headers.get("Content-Length") || 0);
        if (contentLength > 65_536) return jsonResponse({ error: "Ukuran permintaan melebihi batas 64 KB." }, 413, cors);

        const user = await authenticate(request, env);
        if (!user) return jsonResponse({ error: "Sesi Supabase tidak valid. Silakan login kembali." }, 401, cors);
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        if (isRateLimited(`${user.id}:${ip}`)) {
          return jsonResponse({ error: "Batas penggunaan tercapai. Maksimal 20 permintaan per menit." }, 429, { ...cors, "Retry-After": "60" });
        }

        const rawBody = await request.text();
        if (rawBody.length > 65_536) return jsonResponse({ error: "Ukuran permintaan melebihi batas 64 KB." }, 413, cors);
        let body;
        try { body = JSON.parse(rawBody); } catch (_) {
          return jsonResponse({ error: "JSON permintaan tidak valid." }, 400, cors);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
        const validated = validateMessages(body);
        if (validated.error) return jsonResponse({ error: validated.error }, 400, cors);

        const model = ALLOWED_MODELS.has(body.model) ? body.model : MODELS[0].id;
        const requestedTokens = Number(body.max_tokens || 1024);
        const max_tokens = Number.isFinite(requestedTokens) ? Math.max(256, Math.min(4096, Math.floor(requestedTokens))) : 1024;
        const stream = body.stream === true;
        if (!env.AI || typeof env.AI.run !== "function") return jsonResponse({ error: "Binding AI belum tersedia." }, 503, cors);

        const aiInput = { messages: validated.messages, max_tokens, system: SYSTEM_PROMPT };
        if (stream) {
          const aiResponse = await env.AI.run(model, { ...aiInput, stream: true });
          const encoder = new TextEncoder();
          const readable = new ReadableStream({
            async start(controller) {
              try {
                for await (const chunk of aiResponse) {
                  const text = chunk?.delta || chunk?.response || chunk?.text || "";
                  if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                }
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
              } catch (error) {
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Generasi jawaban terhenti." })}\n\n`));
                  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                  controller.close();
                } catch (_) { /* client disconnected */ }
                console.error("GudangAI stream error:", error?.message || "unknown");
              }
            },
          });
          return new Response(readable, {
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              "X-Accel-Buffering": "no",
              ...cors,
            },
          });
        }
        const result = await env.AI.run(model, aiInput);
        return jsonResponse(result, 200, cors);
      } catch (error) {
        console.error("GudangAI chat error:", error?.message || "unknown");
        return jsonResponse({ error: "Permintaan AI gagal diproses." }, 502, cors);
      }
    }

    if (url.pathname.startsWith("/api/")) return jsonResponse({ error: "Endpoint API tidak ditemukan." }, 404, cors);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404, headers: cors });
  },
};
