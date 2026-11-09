# Produksi = Cloudflare Workers (bukan Vercel)

## URL produksi (pakai ini di HP / PWA install)

**https://gudangai-rudy.rudivirawan69.workers.dev/**

| Item | Nilai |
|------|--------|
| Worker name (`wrangler.jsonc`) | `gudangai-rudy` |
| Domain produksi | `https://gudangai-rudy.rudivirawan69.workers.dev/` |
| Domain lama (nonaktif) | `gudangai-rudy-pwa69.rudivirawan69.workers.dev` → 404 |

Vercel (`gudangai-rudy-pwa.vercel.app` / `gudangai-rudy-pwa-live.vercel.app`) boleh tetap hidup sebagai cadangan, **bukan** sumber utama operasional.

## Mengapa Cloudflare

- Vercel Hobby: batas ~100 deploy / 24 jam (deploy gagal tetap dihitung).
- Cloudflare Workers: deploy dari GitHub Actions tanpa kuota harian yang sama.

## Deploy (GitHub Actions)

Workflow: `.github/workflows/deploy-cloudflare-production.yml`

Trigger:
- Push ke `main`
- Manual: **Actions → Deploy GudangAI RUDY PWA to Cloudflare Workers → Run workflow**
- Atau ubah `DEPLOY_CLOUDFLARE_TRIGGER.md` lalu push

Alur deploy (setelah perbaikan 9 Nov 2026):
1. Build PWA (`npm run build`)
2. Validasi secret GitHub Environment `production`
3. Dry-run Wrangler
4. Deploy kode + assets Worker
5. Set secret Worker secara non-interaktif (`wrangler secret put`)

### Secret wajib di GitHub Environment `production`

| Nama secret | Keterangan |
|-------------|------------|
| `CLOUDFLARE_API_TOKEN` | Token API Cloudflare (permission Workers Scripts Edit + Account) |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID Cloudflare |
| `SUPABASE_URL` | URL project Supabase |
| `SUPABASE_ANON_KEY` | Anon / publishable key Supabase (untuk verifikasi JWT Agent) |
| `GUDANGAI_SHEETS_API_SECRET` | Secret yang sama dengan Script Properties Apps Script (read-only bridge) |

Tanpa kelima secret di atas, workflow akan gagal di langkah validasi (dengan pesan jelas).

### Secret yang diset ke Worker saat deploy

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `GUDANGAI_SHEETS_API_SECRET`

Variabel non-rahasia (mis. `AI_MODEL`, `ALLOWED_ORIGINS`, `GUDANGAI_SHEETS_API_URL`) ada di `vars` dalam `wrangler.jsonc`.

## Build lokal / manual

```bash
npm ci
npm run build
npx wrangler deploy --config wrangler.jsonc
# lalu set secret jika perlu:
echo "$GUDANGAI_SHEETS_API_SECRET" | npx wrangler secret put GUDANGAI_SHEETS_API_SECRET --config wrangler.jsonc
```

- Output directory: `dist`
- Config: `wrangler.jsonc` (assets SPA, `not_found_handling: single-page-application`)

## Setelah buka di HP

1. Buka **https://gudangai-rudy.rudivirawan69.workers.dev/** (HTTPS).
2. Settings PWA: pastikan URL API Apps Script + secret benar.
3. **Install ke Home Screen dari URL Cloudflare** (bukan Vercel) agar update tidak kena limit Vercel.
4. Mode tampilan: tombol palette kiri atas, atau Atur → Mode Tampilan (Soft Light / Deep Ocean / Warm Productive).

## Pemulihan jika deploy gagal beruntun

1. Periksa log Actions → langkah yang merah (biasanya secret atau token Cloudflare).
2. Pastikan Environment secrets `production` lengkap.
3. Pastikan token Cloudflare masih valid dan punya akses ke account yang benar.
4. Jalankan ulang workflow secara manual (workflow_dispatch).
5. Domain `https://gudangai-rudy.rudivirawan69.workers.dev/` tetap melayani versi terakhir yang sukses sampai deploy baru berhasil.
