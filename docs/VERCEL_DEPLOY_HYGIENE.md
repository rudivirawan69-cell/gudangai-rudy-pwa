# Vercel Hobby — hindari limit 100 deploy/hari

## Fakta
- Plan **Hobby**: max **100 deployments / 24 jam** (API + Git webhook + Redeploy).
- Deploy **ERROR** tetap dihitung ke kuota.
- Production live saat ini bisa tetap **READY** di commit lama sementara deploy baru gagal.

## Kenapa mudah habis di project ini
1. Banyak commit kecil ke `main` (fix bertahap / multi-agent) → tiap push = 1 deploy.
2. Build gagal berulang (api.js rusak, resource provisioning) → retry = kuota terbakar.
3. Redeploy manual / API berulang saat debugging.
4. Project duplikat (mis. `gudangai-rudy-pwa-odxq`) juga memakai kuota akun yang sama.
5. Preview branch + production bersamaan.

## Perbaikan yang sudah dipasang
- `vercel.json` → `ignoreCommand`: **skip build** jika perubahan hanya di luar `src/`, `public/`, `package.json`, `vite.config.js`, `vercel.json` (docs/workflow saja tidak memicu deploy).
- CI GitHub: satu job Node 22 (bukan matrix 20+22).

## Aturan kerja ke depan
1. **Jangan** push ke `main` untuk docs-only / catatan — atau biarkan ignoreCommand yang skip.
2. Gabungkan perbaikan jadi **1–2 commit** sebelum push, bukan 10 commit kecil.
3. **Satu** project Vercel untuk repo ini; hapus/arsip project duplikat jika tidak dipakai.
4. Jika build ERROR: **baca log dulu**, perbaiki di GitHub CI, baru Redeploy **sekali**.
5. Jangan spam Redeploy dari dashboard/API saat limit hampir habis.

## Setelah limit reset
1. Dashboard Vercel → project `gudangai-rudy-pwa`
2. Deploy `main` commit terbaru (UI + api.js lengkap)
3. Pastikan status **READY** dan alias `gudangai-rudy-pwa.vercel.app` mengarah ke commit itu
