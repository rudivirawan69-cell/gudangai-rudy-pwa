# Produksi = Cloudflare (bukan Vercel)

## Mengapa
- Vercel Hobby: max ~100 deploy / 24 jam; deploy ERROR tetap dihitung.
- Cloudflare Pages/Workers: deploy dari GitHub tanpa kuota harian yang sama.

## URL produksi
Buka di dashboard Cloudflare → Workers & Pages → project `gudangai-rudy-pwa` → **Visit**.
Biasanya berbentuk:
- `https://gudangai-rudy-pwa.pages.dev` (Pages), atau
- custom domain yang sudah di-bind.

Pakai URL Cloudflare di HP / PWA install. Vercel boleh tetap hidup sebagai cadangan, bukan sumber utama.

## Deploy
Setiap push ke `main` yang terhubung ke Cloudflare akan rebuild otomatis.
Trigger manual: ubah `DEPLOY_CLOUDFLARE_TRIGGER.md` lalu push, atau **Retry deployment** di dashboard Cloudflare.

## Build
- Build command: `npm run build`
- Output: `dist`
- Root: `/` (bukan base path GitHub Pages)

## Setelah buka di HP
1. Buka URL Cloudflare (HTTPS).
2. Settings PWA: pastikan URL API Apps Script + secret benar.
3. Install ke Home Screen dari URL Cloudflare (bukan Vercel) agar update tidak kena limit Vercel.
