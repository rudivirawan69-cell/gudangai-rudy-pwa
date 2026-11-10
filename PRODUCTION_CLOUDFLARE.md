# GudangAI RUDY — alamat produksi tunggal

## Alamat resmi

**https://gudangai-rudy-pwa-69.rudivirawan69.workers.dev/**

- Worker name: `gudangai-rudy-pwa-69`
- Entrypoint: `worker.js`
- Static assets: `./dist`
- Wrangler config: `wrangler.jsonc`
- Supabase project: `https://cbeosysruwkfwgklziog.supabase.co`

Alamat di atas adalah satu-satunya alamat produksi PWA dan API. Jangan gunakan hostname lama `gudangai-rudy-pwa6`, `gudangai-rudy`, `gudangai-rudy-pwa69`, domain Pages `*.pages.dev`, atau domain Vercel sebagai alamat produksi.

## Satu jalur deploy

Satu-satunya workflow deploy produksi adalah:

`.github/workflows/webpack.yml`

- Pull request: pemeriksaan kode, tes Worker, dan build; tidak deploy.
- Push ke `main`: verifikasi → build → dry-run Wrangler → deploy Worker dan aset → pasang runtime secrets → health check dan CORS.
- Manual: GitHub Actions → **GudangAI RUDY CI and Cloudflare Production Deploy** → Run workflow pada branch `main`.

Workflow Pages lama telah dinonaktifkan/dihapus agar tidak ada jalur deploy alternatif yang menghasilkan alamat berbeda.

## Konfigurasi yang harus konsisten

| Lokasi | Nilai yang diwajibkan |
|---|---|
| `wrangler.jsonc` → `name` | `gudangai-rudy-pwa-69` |
| `wrangler.jsonc` → `main` | `worker.js` |
| `wrangler.jsonc` → `assets.directory` | `./dist` |
| `wrangler.jsonc` → `vars.ALLOWED_ORIGINS` | `https://gudangai-rudy-pwa-69.rudivirawan69.workers.dev` |
| Build `VITE_GUDANGAI_AI_API_BASE` | `https://gudangai-rudy-pwa-69.rudivirawan69.workers.dev` |
| Frontend fallback Agent | hostname Worker yang sama |
| Health-check URL | hostname Worker yang sama |

Perubahan pada `.env.example` hanya contoh konfigurasi lokal. Itu **tidak** mengubah environment secrets/variables GitHub, konfigurasi Worker yang sudah terpasang, atau aset yang sudah live.

## GitHub Environment `production`

Secrets wajib:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (atau legacy `SUPABASE_ANON_KEY`)
- `GUDANGAI_SHEETS_API_SECRET`

Token Cloudflare harus valid untuk akun yang sesuai dan memiliki izin edit/deploy Workers. Jangan menaruh nilai token atau secret di repository, frontend, atau chat.

## Runtime Worker

- `SUPABASE_URL` — encrypted secret.
- `SUPABASE_ANON_KEY` — encrypted secret, diisi dari publishable key project.
- `GUDANGAI_SHEETS_API_SECRET` — encrypted secret.
- `AI_MODEL`, `ALLOWED_ORIGINS`, `GUDANGAI_SHEETS_API_URL` — vars di `wrangler.jsonc`.
- Binding `AI` — Workers AI.

Frontend memakai `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` saat build. Jangan pernah memasukkan service-role/secret key Supabase ke variabel `VITE_*`.

## Pemeriksaan produksi

Health check:
```bash
curl -fsS https://gudangai-rudy-pwa-69.rudivirawan69.workers.dev/api/agent/health
```

Deploy baru dianggap berhasil hanya jika:
1. Build dan tes lulus.
2. Wrangler deploy selesai dengan sukses.
3. Runtime secrets berhasil dipasang.
4. Health endpoint mengembalikan `success: true`, `authConfigured: true`, dan `deploymentTarget` yang sama persis dengan alamat resmi.
5. CORS preflight menerima origin resmi.
6. Browser membuka PWA dari alamat resmi dan request Agent menuju hostname yang sama.

Jika deploy gagal pada autentikasi Cloudflare, tidak ada perubahan live yang boleh diklaim. Perbarui token di GitHub Environment `production`, lalu jalankan ulang workflow.
