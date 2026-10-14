# Prompt OpenAI — Perbaikan Visual GudangAI RUDY PWA

Gunakan prompt ini untuk model UI/React. **Kerja hanya di branch audit** `audit/ui-visual-polish-20261015`. Jangan merge ke `main` / deploy produksi sebelum review.

## Konteks
- App: GudangAI RUDY (React + Vite + Tailwind PWA), inventory Cold Storage CV/PT.
- 6 tab nav: Beranda, Stok, Input, PO, Riwayat, Atur.
- 3 mode tema via `data-theme` + `useTheme`: `soft_light`, `deep_ocean`, `warm_productive`.
- File kunci: `src/theme-tokens.css`, `src/ui-contrast-3d.css`, `src/App.jsx`, `src/pages/DashboardPage.jsx`, `src/hooks/useTheme.jsx`.

## Acuan visual (mockup user)
1. **Soft Productive** — latar cream `#f3f1ec`, kartu putih-cream, aksen oranye `#f59e0b`, panel teal gelap untuk highlight.
2. **Deep Ocean** — latar navy `#071422` / `#0a1a2e`, kartu `#12263d`, teks putih `#f8fafc`, muted `#c5d4e8`, aksen cyan `#38bdf8`.
3. **Blue Glass** — latar biru muda `#e8f0ff`, kartu glass `#eef4ff`, aksen biru `#3b82f6`, shadow soft biru-putih.

## Tugas wajib (5 poin)

### 1. Ocean — teks & angka tidak terbaca
- Semua `text-slate-*`, `text-cyan-*`, label 9–10px, dan `tabular-nums` di mode `deep_ocean` harus memakai token `--text-main` / `--text-muted` dengan kontras WCAG AA minimum.
- Jangan biarkan teks abu gelap di atas background navy.
- Override `.bg-white` / `.bg-slate-50` di Ocean menjadi `--bg-elevated`.

### 2. Hapus bola mengambang di atas navigasi (SEMUA mode)
- Hapus elemen `.nav-moving-ball` dari `App.jsx`.
- CSS: `display: none !important` sebagai jaring pengaman.
- Indikator tab aktif: underline + warna ikon/label + background soft pada `.nav-icon-wrap` saja.

### 3. Transisi tombol / kartu lebih terasa
- Nav: transition 0.22–0.28s pada color, background, transform.
- Active: `is-active` → background `--accent-soft`, shadow 3D, label bold `--text-main`.
- Kartu/PO hub: state `is-open` / selected → border accent + shadow-2 + tint accent.

### 4. Efek 3D (neumorphic) lebih kuat
- Perkuat `--shadow-1`, `--shadow-2`, `--shadow-press`, `--shadow-inset` per tema.
- Hover: shadow-2 + translateY(-1px). Active: inset press + scale 0.98.

### 5. Beranda — grafik status per divisi & kotak lain
- Label kecil: font-weight 700, color `--text-muted`, opacity 1.
- Angka besar: `--text-main`, font-weight 800.
- Ocean: angka putih `#fff`, label `#b6c7dc`.
- Chart stroke `--chart-line`; track `--bg-muted`; fill `--accent`.

## Batasan
- Jangan ubah logika transaksi, api.js, Apps Script, offline queue, validasi PDF.
- Mode Tampilan tetap hanya di menu **Atur**.
- Branch terisolasi; produksi tidak disentuh sampai approved.

## Definition of done
- [ ] Tidak ada bola oranye di atas nav di ketiga mode.
- [ ] Deep Ocean: semua teks/angka di Beranda & kartu terbaca jelas.
- [ ] Ganti tab nav: warna ikon/label/background berubah jelas.
- [ ] Kartu terasa timbul (shadow dual), tidak flat.
- [ ] Soft / Ocean / Glass cocok mockup.
