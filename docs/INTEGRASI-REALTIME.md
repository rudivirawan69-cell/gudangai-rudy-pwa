# Integrasi Real-Time Sync + Agent Skills (V6.6.5)

Tanggal: 10 November 2026

## File yang ditambahkan / diubah

| File | Aksi |
|------|------|
| `src/data/realTimeSync.js` | **BARU** — koordinator ping 60 dtk + delta + circuit breaker |
| `cloudflare/agentSkills.js` | **BARU** — STRUCTURE_KNOWLEDGE + EXTRA_READ_ACTIONS + EXTRA_LIVE_INTENTS |
| `worker.js` | Diperluas READ_ONLY_ACTIONS, LIVE_INTENTS, STRUCTURE_KNOWLEDGE, SKILL_RULES (9–15) |
| `src/App.jsx` | Mulai `startRealtimeSync` + expose `window.__gudangai_syncNow` |
| `src/data/api.js` | Setelah write sukses → panggil `syncNow()` + event `gudangai-stock-refresh` |

## Alur setelah terpasang

```
PWA ──ping 60s──> Code.gs ──versi berubah?──> getStockDelta ──> update item berubah saja
   └─ setelah write: syncNow() ──> polling cepat 5 dtk selama 2 menit

Operator tanya agent ──> Worker deteksi intent (termasuk "apa yang berubah")
   └──> system prompt berisi STRUKTUR SISTEM + skill rules ──> jawaban akurat
```

## Verifikasi cepat

1. **PWA**  
   - Buka DevTools → Console. Pastikan tidak ada error dari `realTimeSync`.  
   - Setelah submit transaksi, harus muncul event `gudangai-stock-refresh` dan polling cepat.

2. **Worker / Agent**  
   - Tanya agent: *"apa yang berubah hari ini?"* → harus memicu `getStockDelta`.  
   - Tanya: *"periode aktif berapa?"* → `getConfig`.  
   - Tanya: *"rekomendasi PO"* → `getPOAnalysis` / `getLowStock`.

3. **Deploy**  
   - Push ke `main` → workflow `deploy-cloudflare-production.yml` otomatis build + deploy Worker + assets.  
   - Pastikan secret `GUDANGAI_SHEETS_API_SECRET`, `SUPABASE_*`, `CLOUDFLARE_*` sudah ada di Environment production.

## Catatan

- `realTimeSync` memakai localStorage key `gudangai_api_url` dan `gudangai_api_secret` (sama dengan Settings).  
- Circuit breaker klien: 5 kegagalan dalam 2 menit → jeda 2 menit.  
- Jangan hardcode secret di repo.
