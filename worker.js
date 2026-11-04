/**
 * GudangAI RUDY — Cloudflare Worker (production)
 * - Static assets (PWA) via ASSETS binding
 * - /api/models + /api/chat : Supabase Auth required (Bearer access_token)
 * - /api/agent + /api/agent/health : compatibility endpoints (Workers AI)
 *
 * Required Worker vars:
 *   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
 * Optional:
 *   AI_MODEL, ANTHROPIC_FALLBACK_ENABLED, ANTHROPIC_API_KEY, ALLOWED_ORIGINS
 */

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const requestCounts = new Map();

const DEFAULT_ALLOWED_ORIGINS = [
  "https://gudangai-rudy-pwa69.rudivirawan69.workers.dev",
  "https://claude-proxy.rudivirawan69.workers.dev",
  "https://rudivirawan69-cell.github.io",
  "https://gudangai-rudy-pwa-live.vercel.app",
  "https://gudangai-rudy-pwa.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const MODELS = [
  { id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", description: "Cepat dan cerdas (default)" },
  { id: "anthropic/claude-haiku-5.5", name: "Claude Haiku 5.5", description: "Tercepat dan termurah" },
  { id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", description: "Paling cerdas" },
];
const ALLOWED_MODELS = new Set(MODELS.map((m) => m.id));

const SYSTEM_PROMPT = [
  "Kamu adalah GudangAI RUDY, asisten operasional gudang CV Selera Bogatama / Cold Storage Nasi Goreng 69, dan selalu menjawab dalam bahasa Indonesia.",
  "Jangan mengarang data stok, transaksi, PO, harga, jadwal, suhu, atau kondisi gudang.",
  "Gunakan hanya data aktual yang secara eksplisit diberikan melalui pesan atau tool backend terverifikasi.",
  "Jika data aktual belum tersedia, jelaskan keterbatasan itu dan jangan menebak.",
  "Jangan mengklaim telah mengubah spreadsheet, membuat PO, atau mengirim transaksi tanpa hasil tool backend yang terverifikasi.",
  "Jangan meminta password, PIN, access token, API key, atau secret dari pengguna.",
].join(" ");

const DEFAULT_AGENT_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_ITEMS = 8;

function buildAllowedOrigins(env, request) {
  const set = new Set(DEFAULT_ALLOWED_ORIGINS);
  try {
    set.add(new URL(request.url).origin);
  } catch (_) {}
  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  for (const o of configured) set.add(o);
  return set;
}

function isRateLimited(key) {
  const now = Date.now();
  if (requestCounts.size > 5000) {
    for (const [k, v] of requestCounts) {
      if (now - v.start >= RATE_LIMIT_WINDOW_MS) requestCounts.delete(k);
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

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function corsHeaders(origin, allowed) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
    "Access-Control-Expose-Headers": "Retry-After",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowed.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

async function authenticate(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("AUTH_CONFIGURATION_MISSING");
  }
  const base = String(env.SUPABASE_URL).replace(/\/+$/, "");
  const response = await fetch(`${base}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: authorization,
    },
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
  if (normalized[normalized.length - 1].role !== "user") {
    return { error: "Pesan terakhir harus berasal dari pengguna." };
  }
  return { messages: normalized };
}

function extractText(result) {
  if (typeof result === "string") return result.trim();
  if (typeof result?.response === "string") return result.response.trim();
  if (typeof result?.text === "string") return result.text.trim();
  if (Array.isArray(result?.content)) {
    return result.content
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();
  }
  return "";
}

function normalizeHistory(history, currentMessage) {
  const normalized = (Array.isArray(history) ? history : [])
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: String(item?.content || "").trim().slice(0, MAX_MESSAGE_LENGTH),
    }))
    .filter((item) => item.content);
  const last = normalized.at(-1);
  if (last?.role === "user" && last.content === currentMessage) normalized.pop();
  return normalized;
}

async function runWorkersAI(env, messages) {
  if (!env.AI || typeof env.AI.run !== "function") {
    throw new Error("Workers AI binding AI belum tersedia pada Worker.");
  }
  const model = String(env.AI_MODEL || DEFAULT_AGENT_MODEL);
  const result = await env.AI.run(model, { messages, max_tokens: 700 });
  const reply = extractText(result);
  if (!reply) throw new Error("Workers AI mengembalikan jawaban kosong.");
  return { reply, model, provider: "cloudflare-workers-ai" };
}

async function handleLegacyAgent(request, env, cors) {
  let body = {};
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ success: false, error: "JSON tidak valid." }, 400, cors);
  }
  const message = String(body.message || body.prompt || "").trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!message) {
    return jsonResponse({ success: false, error: "Pesan kosong." }, 400, cors);
  }
  const history = normalizeHistory(body.history, message);
  const context = body.context && typeof body.context === "object" ? body.context : {};
  const messages = [
    { role: "system", content: SYSTEM_PROMPT + `\nKonteks operasi: ${JSON.stringify(context).slice(0, 2000)}` },
    ...history,
    { role: "user", content: message },
  ];
  try {
    const result = await runWorkersAI(env, messages);
    return jsonResponse({ success: true, ...result }, 200, cors);
  } catch (primaryError) {
    return jsonResponse({
      success: false,
      code: "WORKERS_AI_UNAVAILABLE",
      error: "Agent Workers AI sedang tidak tersedia.",
      detail: String(primaryError?.message || "gagal").slice(0, 240),
    }, 503, cors);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = buildAllowedOrigins(env, request);
    const cors = corsHeaders(origin, allowed);

    if (origin && !allowed.has(origin)) {
      return jsonResponse({ error: "Origin tidak diizinkan." }, 403, {});
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // --- Health (open) ---
    if (url.pathname === "/api/agent/health" && request.method === "GET") {
      return jsonResponse({
        success: true,
        mode: "hybrid",
        primary: "cloudflare-workers-ai",
        primaryConfigured: Boolean(env.AI && typeof env.AI.run === "function"),
        model: String(env.AI_MODEL || DEFAULT_AGENT_MODEL),
        supabaseConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY),
        anthropicFallbackEnabled: env.ANTHROPIC_FALLBACK_ENABLED === "true" && Boolean(env.ANTHROPIC_API_KEY),
      }, 200, cors);
    }

    // --- Legacy agent endpoints (kept for compatibility) ---
    if ((url.pathname === "/api/agent" || url.pathname === "/api/claude") && request.method === "POST") {
      return handleLegacyAgent(request, env, cors);
    }

    // --- Authenticated models catalog ---
    if (url.pathname === "/api/models" && request.method === "GET") {
      try {
        const user = await authenticate(request, env);
        if (!user) return jsonResponse({ error: "Unauthorized. Login Supabase diperlukan." }, 401, cors);
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        if (isRateLimited(`models:${user.id}:${ip}`)) {
          return jsonResponse({ error: "Terlalu banyak permintaan." }, 429, { ...cors, "Retry-After": "60" });
        }
        return jsonResponse({ models: MODELS }, 200, cors);
      } catch (err) {
        if (String(err?.message) === "AUTH_CONFIGURATION_MISSING") {
          return jsonResponse({ error: "Konfigurasi Supabase Worker belum diisi." }, 503, cors);
        }
        console.error("models error:", err?.message);
        return jsonResponse({ error: "Gagal memuat katalog model." }, 502, cors);
      }
    }

    // --- Authenticated chat (streaming + non-streaming) ---
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const user = await authenticate(request, env);
        if (!user) return jsonResponse({ error: "Unauthorized. Login Supabase diperlukan." }, 401, cors);
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        if (isRateLimited(`chat:${user.id}:${ip}`)) {
          return jsonResponse({ error: "Batas penggunaan AI tercapai." }, 429, { ...cors, "Retry-After": "60" });
        }

        let body = {};
        try {
          body = await request.json();
        } catch (_) {
          return jsonResponse({ error: "JSON tidak valid." }, 400, cors);
        }

        const validated = validateMessages(body);
        if (validated.error) return jsonResponse({ error: validated.error }, 400, cors);

        const model = ALLOWED_MODELS.has(body.model) ? body.model : MODELS[0].id;
        const requestedTokens = Number(body.max_tokens || 1024);
        const max_tokens = Number.isFinite(requestedTokens)
          ? Math.max(256, Math.min(4096, Math.floor(requestedTokens)))
          : 1024;
        const stream = body.stream === true;

        if (!env.AI || typeof env.AI.run !== "function") {
          return jsonResponse({ error: "Binding AI belum tersedia." }, 503, cors);
        }

        // Logical model names for UI; actual Workers AI model from env.AI_MODEL.
        const workersModel = String(env.AI_MODEL || DEFAULT_AGENT_MODEL);
        const aiInput = {
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...validated.messages,
          ],
          max_tokens,
        };

        if (stream) {
          const aiResponse = await env.AI.run(workersModel, { ...aiInput, stream: true });
          const encoder = new TextEncoder();
          const readable = new ReadableStream({
            async start(controller) {
              try {
                for await (const chunk of aiResponse) {
                  const text = chunk?.delta || chunk?.response || chunk?.text || "";
                  if (text) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                  }
                }
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
              } catch (error) {
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Generasi jawaban terhenti." })}\n\n`));
                  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                  controller.close();
                } catch (_) {}
                console.error("stream error:", error?.message || "unknown");
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

        const result = await env.AI.run(workersModel, aiInput);
        const reply = extractText(result);
        return jsonResponse({
          response: reply,
          model: workersModel,
          requestedModel: model,
          provider: "cloudflare-workers-ai",
        }, 200, cors);
      } catch (err) {
        if (String(err?.message) === "AUTH_CONFIGURATION_MISSING") {
          return jsonResponse({ error: "Konfigurasi Supabase Worker belum diisi." }, 503, cors);
        }
        console.error("chat error:", err?.message || "unknown");
        return jsonResponse({ error: "Permintaan AI gagal diproses." }, 502, cors);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Endpoint API tidak ditemukan." }, 404, cors);
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404, headers: cors });
  },
};
