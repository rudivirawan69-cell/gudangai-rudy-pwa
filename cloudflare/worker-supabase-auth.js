// GudangAI RUDY Cloudflare Worker — Supabase Auth protected variant.
// Required bindings: AI, ASSETS
// Required Worker vars: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
// Intentionally not wired to the root static-assets wrangler.jsonc.

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const requestCounts = new Map();
const ALLOWED_ORIGINS = new Set([
  "https://gudangai-rudy-pwa-69.rudivirawan69.workers.dev",
  "http://localhost:5173",
]);