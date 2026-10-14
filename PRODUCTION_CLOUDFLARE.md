# Produksi = Cloudflare Workers (bukan Vercel)

## URL produksi (pakai ini di HP / PWA install)
**https://gudangai-rudy-pwa69.rudivirawan69.workers.dev/**

Worker name di `wrangler.jsonc`: `gudangai-rudy-pwa69`

## Mengapa Cloudflare
- Vercel Hobby: batas ~100 deploy / 24 jam (deploy gagal tetap dihitung).
- Cloudflare Workers/Pages: deploy dari GitHub tanpa kuota harian yang sama.

## Deploy
Setiap push ke `main` yang terhubung ke Cloudflare (Workers → Settings → Builds) akan rebuild otomatis.
Trigger manual: ubah `DEPLOY_CLOUDFLARE_TRIGGER.md` lalu push, atau **Retry deployment** di dashboard Cloudflare.

## Build
- Build command: `npm run build`
- Output directory: `dist`
- Config: `wrangler.jsonc` (assets SPA, `not_found_handling: single-page-application`)

## Setelah buka di HP
1. Buka URL Cloudflare di atas (HTTPS).
2. Settings PWA: pastikan URL API Apps Script + secret benar.
3. **Install ke Home Screen dari URL Cloudflare** (bukan Vercel) agar update tidak kena limit Vercel.
4. Mode tampilan: tombol palette kiri atas, atau Atur → Mode Tampilan (Soft Light / Deep Ocean / Warm Productive).

Vercel boleh tetap hidup sebagai cadangan, bukan sumber utama operasional.
