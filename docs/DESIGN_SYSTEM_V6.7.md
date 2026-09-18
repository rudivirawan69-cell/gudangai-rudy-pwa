# Design System V6.7 + Stabilitas Koneksi

**Tanggal:** 18 September 2026  
**Fokus:** Latar full-screen · Nav tanpa kotak · Anti kotak-dalam-kotak · Konsistensi · Stabilitas koneksi

---

## 1. Visual — apa yang berubah

| Aspek | Sebelum | Sesudah V6.7 |
|-------|---------|--------------|
| Latar belakang | Gradien + foto 50% | Full-screen lebih tegas, foto 42%, overlay lebih dalam |
| Navigasi bawah | Setiap tab = kotak putih ber-border + gradient aktif | **Tanpa kotak** — ikon + label + garis indikator tipis saja |
| Banner koneksi | Kotak tebal rounded-xl | Strip tipis (`conn-strip`) |
| Surface / card | Banyak nested `bg-white` di dalam `bg-white` | Satu lapisan: `.surface` atau `.surface-flat` |
| Tombol | Campuran border/shadow | `.btn-primary` / `.btn-ghost` konsisten |

### Prinsip anti "kotak di dalam kotak"
1. **Maksimal satu surface** per blok konten.
2. Tombol aksi **tidak** dibungkus card lagi.
3. Daftar item (keranjang, stok, riwayat) = baris flat, bukan card di dalam card.
4. Spacing vertikal seragam: `space-y-3` antar blok.

### File fondasi
- `src/index.css` — design tokens + nav transparan + surface
- `src/App.jsx` — nav tanpa box, connection strip tipis

---

## 2. Ide pengembangan lanjutan — Stabilitas Koneksi

### Jangka pendek
- Request coalescing (gabung request identik dalam 2 detik)
- Stale-while-revalidate (tampil cache dulu)
- Timeout adaptif (batch kecil 45s, besar 90–120s)
- Circuit breaker UI (setelah 3 gagal, nonaktifkan Kirim sementara)

### Jangka menengah
- IndexedDB untuk antrian offline
- Background Sync API (Chrome Android)
- Heartbeat hanya saat tab visible
- Chunk size dinamis setelah bulk backend cepat

### Yang tidak boleh diubah
- Write-once · Tidak auto-serial setelah timeout · Antrian hanya setelah review user · Idempotency ledger
