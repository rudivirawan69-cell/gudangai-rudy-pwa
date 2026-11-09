# Produksi = Cloudflare Workers (bukan Vercel)

## URL produksi (pakai ini di HP / PWA install)

**https://gudangai-rudy-pwa6.rudivirawan69.workers.dev/**

| Item | Nilai |
|------|--------|
| Worker name (`wrangler.jsonc`) | `gudangai-rudy-pwa6` |
| Domain produksi | `https://gudangai-rudy-pwa6.rudivirawan69.workers.dev/` |
| Alias legacy (masih di ALLOWED_ORIGINS) | `https://gudangai-rudy.rudivirawan69.workers.dev/` |
| Domain nonaktif | `gudangai-rudy-pwa69.rudivirawan69.workers.dev` → 404 |

Vercel (`gudangai-rudy-pwa.vercel.app` / `gudangai-rudy-pwa-live.vercel.app`) boleh tetap hidup sebagai cadangan, **bukan** sumber utama operasional.

> Nama `gudangai-rudy-pwa6` diselaraskan dengan **Cloudflare Workers Builds** agar tidak ada override nama di CI dan ALLOWED_ORIGINS tidak putus.

## Mengapa Cloudflare

- Vercel Hobby: batas ~100 deploy / 24 jam (deploy gagal tetap dihitung).
- Cloudflare Workers: deploy dari GitHub Actions / Workers Builds tanpa kuota harian yang sama.

## Tiga integrasi produksi (stabil)

1. **Login Supabase** — frontend memakai `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (di-bake saat `npm run build`). Worker memverifikasi JWT via `SUPABASE_URL` + `SUPABASE_ANON_KEY` (secret runtime).
2. **Apps Script / Spreadsheet utama** — `GUDANGAI_SHEETS_API_URL` (var) + `GUDANGAI_SHEETS_API_SECRET` (secret). Agent & gateway `/api/data` read-only.
3. **Agent AI** — Workers AI binding `AI`, endpoint `/api/agent` + `/api/agent/health`, skill live: dashboard, stok menipis, status PO, riwayat, system log.

## Deploy (GitHub Actions)

Workflow: `.github/workflows/deploy-cloudflare-production.yml`

Trigger:
- Push ke `main`
- Manual: **Actions → Deploy GudangAI RUDY PWA to Cloudflare Workers → Run workflow**
- Atau ubah `DEPLOY_CLOUDFLARE_TRIGGER.md` lalu push

Alur deploy:
1. Build PWA (menyuntikkan `VITE_SUPABASE_*` dari Environment secrets)
2. Validasi secret GitHub Environment `production`
3. Dry-run Wrangler
4. Deploy kode + assets Worker `gudangai-rudy-pwa6`
5. Set secret Worker secara non-interaktif (`wrangler secret put`) — **sekali jalan, tahan deploy berikutnya**

### Secret wajib di GitHub Environment `production`

| Nama secret | Keterangan |
|-------------|------------|
| `CLOUDFLARE_API_TOKEN` | Token API Cloudflare (Workers Scripts Edit + Account) |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID Cloudflare |
| `SUPABASE_URL` | URL project Supabase |
| `SUPABASE_ANON_KEY` | Anon / publishable key (frontend bake + Worker JWT verify) |
| `GUDANGAI_SHEETS_API_SECRET` | Secret yang sama dengan Script Properties Apps Script |

### Secret runtime di Worker (diset CI, tidak di repo)

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `GUDANGAI_SHEETS_API_SECRET`

Variabel non-rahasia (`AI_MODEL`, `ALLOWED_ORIGINS`, `GUDANGAI_SHEETS_API_URL`, `SUPABASE_PUBLISHABLE_KEY`) ada di `vars` dalam `wrangler.jsonc`.

## Health check cepat

```bash
curl -s https://gudangai-rudy-pwa6.rudivirawan69.workers.dev/api/agent/health | jq .
```

Harapan produksi sehat:
- `authConfigured: true`
- `dataToolsConfigured: true` ← butuh `GUDANGAI_SHEETS_API_SECRET`
- `agentStage: "read_only_live_data"`

## Setelah buka di HP

1. Buka **https://gudangai-rudy-pwa6.rudivirawan69.workers.dev/**
2. Login Supabase (email/password) seperti di Vercel
3. Settings PWA: URL API Apps Script + secret jika masih dipakai jalur Sheets langsung dari browser
4. Install ke Home Screen dari URL Cloudflare
5. Uji Agent (butuh login) dan input stok

## Pemulihan jika deploy gagal / origin putus

1. Pastikan `wrangler.jsonc` → `name: "gudangai-rudy-pwa6"`
2. Pastikan `ALLOWED_ORIGINS` memuat hostname `gudangai-rudy-pwa6`
3. Pastikan Environment secrets `production` lengkap
4. Jalankan ulang workflow_dispatch
5. Cek `/api/agent/health` → `dataToolsConfigured` harus `true` setelah secret Sheets terpasang
