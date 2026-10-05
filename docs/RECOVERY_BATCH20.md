# Recovery BATCH=20 bulkTransaction (5 Okt 2026)

## Gejala (screenshot)
- Input Keluar PT: 50 item masuk Antrian Sinkronisasi
- Notifikasi: "Koneksi terputus — masuk antrian" / 0 terkonfirmasi

## Akar penyebab
1. Production masih BATCH_CHUNK_SIZE=80 → timeout Apps Script → antrian
2. Branch main sempat punya api.js terpotong (jangan deploy sebelum restore)

## Restore lokal (WAJIB)
```bash
git fetch origin
git checkout main
git checkout 0e221a8dd1c3414089af9a08d6ba82609d11e189 -- src/data/api.js
# Pastikan:
grep "BATCH_CHUNK_SIZE = 20" src/data/api.js
wc -c src/data/api.js   # harus ~28222
git add src/data/api.js
git commit -m "fix(write): restore complete api.js V6.7.2 BATCH=20"
git push origin main
```

## Setelah Vercel READY
1. Hard refresh PWA
2. Hapus antrian lama di Atur → Sinkronisasi (atau review lalu kirim ulang)
3. Uji batch 20–40 item Keluar/Masuk

## Backend (sudah OK)
- version: 6.6.5+BULK-STABLE
- spreadsheet: COLD STORAGE OKTOBER 26
