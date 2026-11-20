# Plan UI/UX Metode C — Canva handoff ke PWA
Tanggal: 2026-11-20

## Tujuan
Menerapkan visual system Hybrid Glass 3D Metode C dari dokumen Canva GudangAI RUDY Handoff ke PWA, tanpa mengubah perilaku operasional aplikasi.

## Baseline
- Repository: `rudivirawan69-cell/gudangai-rudy-pwa`
- Base branch: `main`
- Baseline commit saat branch dibuat: `6f248afa091f1e757e10b008a23b243b4a58dc9f`
- UI/UX PR #184 berisi CSS dan page marker, tetapi commit-nya divergen dari main terbaru; hanya perubahan visual yang relevan yang diadaptasi.
- PR #189 Dashboard Live dan endpoint sync-all sudah menjadi bagian dari main terbaru dan harus dipertahankan.

## Ruang lingkup
1. Tambahkan regression test kontrak visual untuk tiga tema, delapan page scope, import stylesheet, dan penanda halaman.
2. Tambahkan stylesheet `src/uiux-page-system-2026.css` yang diadaptasi dari UI/UX handoff.
3. Selaraskan Graphite Titanium dengan token Canva: graphite + cyan + indigo; hapus aksen gold.
4. Tambahkan `data-ui-page={tab}` pada elemen main aplikasi dan import stylesheet dari `src/main.jsx`.
5. Jalankan seluruh test, lint, dan build; periksa diff agar hanya menyentuh presentasi dan test.
6. Setelah semua tes lulus, siapkan preview Vercel dan Cloudflare pada branch ini. Jangan deploy domain produksi Cloudflare sampai preview dan pemeriksaan owner disetujui.

## Non-goals / batas keselamatan
- Tidak mengubah Worker/API, Apps Script, Spreadsheet, Supabase, auth, transaksi, stok, PO, PDF, atau offline queue.
- Tidak mengubah urutan navigasi maupun perilaku refresh Dashboard Live.
- Tidak menimpa dokumen Canva sumber; salinan kerja Canva tetap terpisah.
- Tidak melakukan production deploy atau promosi domain utama pada tahap preview.

## Approaches considered
- Menggabungkan branch PR #184 langsung: ditolak karena divergen 29 commit ahead / 3 behind terhadap main dan berisiko membawa perubahan yang tidak relevan.
- Membuat ulang UI dari nol: ditolak karena Canva handoff dan stylesheet yang sudah ada memberi basis yang lebih hemat risiko.
- Mengadaptasi hanya layer visual dari PR #184 di atas main terbaru: dipilih karena mempertahankan perubahan Dashboard Live/sync-all terbaru dan membatasi perubahan pada UI.

## Verification
- Regression test harus dibuat lebih dulu dan dibuktikan gagal pada baseline.
- Setelah implementasi: `npm test`, `npm run lint`, `npm run build`.
- Preview Vercel dan Cloudflare harus menunjuk commit branch yang sama.
- Uji halaman Beranda, Stok, Input, PO, Riwayat, Agent, Pengaturan, dan Antrian Sinkronisasi pada Android/mobile dan desktop; uji ketiga tema serta state loading/empty/error/success/offline.
- Status produksi tetap tertahan sampai semua pemeriksaan preview dan persetujuan owner selesai.
