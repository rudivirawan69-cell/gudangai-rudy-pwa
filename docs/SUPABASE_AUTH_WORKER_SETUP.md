# Supabase Auth — Setup Production (4 Nov 2026)

## Project aktif
- URL: `https://cbeosysruwkfwgklziog.supabase.co`
- Publishable key: `sb_publishable_nrVxMRbrQihkzwFmWEs7QA_PlVFDWOz`
- Owner email: `rudivirawan69@gmail.com` (password awal: `696969` — ganti setelah login pertama)

## PWA build variables (Cloudflare Builds / GitHub Variables)
```
VITE_SUPABASE_URL=https://cbeosysruwkfwgklziog.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_nrVxMRbrQihkzwFmWEs7QA_PlVFDWOz
VITE_GUDANGAI_AI_API_BASE=https://gudangai-rudy-pwa69.rudivirawan69.workers.dev
```

## Worker variables (Cloudflare Dashboard → Worker → Settings → Variables)
Tambahkan **Plaintext** atau **Secret**:
```
SUPABASE_URL = https://cbeosysruwkfwgklziog.supabase.co
SUPABASE_PUBLISHABLE_KEY = sb_publishable_nrVxMRbrQihkzwFmWEs7QA_PlVFDWOz
```

Jangan commit secret key service_role ke repository.

## Endpoint setelah deploy
| Path | Auth | Keterangan |
|------|------|------------|
| `/api/models` | Bearer Supabase | Katalog model |
| `/api/chat` | Bearer Supabase | Chat streaming / non-stream |
| `/api/agent` | Tidak wajib | Kompatibilitas lama |
| `/api/agent/health` | Tidak | Health check |

## Uji cepat
1. Login PWA dengan email + password di atas.
2. Buka halaman Agent / AI Assistant.
3. Kirim pesan uji. Harus mendapat respons stream.
