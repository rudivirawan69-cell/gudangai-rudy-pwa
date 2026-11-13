# Audit Sinkronisasi PWA ↔ Dashboard Live (November 2026)

Tanggal audit: 13 Nov 2026
Domain produksi: https://gudangai-rudy-pwa-69.rudivirawan69.workers.dev/

## 1. Sumber data / ID spreadsheet

| Lokasi | Temuan |
|--------|--------|
| `Code.gs` | `SPREADSHEET_ID` **dinamis** via `PropertiesService` + bound spreadsheet. Fallback fail-closed kosong. **Tidak hardcode ID Oktober/November di repo.** |
| `wrangler.jsonc` | Hanya `GUDANGAI_SHEETS_API_URL` (Web App), bukan ID sheet. |
| PWA `api.js` | DEFAULT_API_URL = Web App exec URL; secret di localStorage/Script Properties. |
| Worker | Gateway read-only ke Apps Script URL + secret. |

**Wajib di Apps Script (Script Properties):**
```
SPREADSHEET_ID = 115thkEtAJuQFv3bkyDdDeMNQg-T5Nm8uVr9p9YfXUTA
```
Spreadsheet: **COLD STORAGE, edisi November 2026**. Verifikasi dengan menjalankan `setupEnvironment()` / cek log `SPREADSHEET_ID = ...`.

Tidak ditemukan string ID Oktober (`1YAJKGm5...`) di worker.js / wrangler produksi saat audit ini. ID lama mungkin masih di Script Properties production — **cek manual di Apps Script.**

## 2. Bug status (A–H)

| Bug | Status | Catatan |
|-----|--------|---------|
| A Status PO ≠ sheet | **Backend** | `getStatusPO` di Code.gs menghitung ulang dari sheet `purchase order` + `Barang masuk` (regex No PO), **bukan** membaca blok Dashboard Live baris 46+. Perbaikan penuh: ubah `getStatusPO` agar membaca Dashboard Live ATAU samakan rumus Datang dengan sheet (abaikan RETUR / awalan DARI). |
| B Detail PO kosong | Tergantung A | UI sudah merender `items` jika API mengirim array. Jika items kosong di respons, daftar kosong. |
| C Banner kontradiktif | **Diperbaiki** | `useSheetUpdate.js` aktif poll `getDashboardData` + cache sync + event. `realTimeSync` emit `gudangai-sheet-updated`. |
| D Donut "50 Progress" | **Perlu patch UI** | Pusat donut masih formula progress item, bukan % Qty datang. Label masih "Datang/Sebagian/Belum". Helper `largestRemainderPercents` sudah ada di `src/utils/formatTanggal.js`. |
| E % ≠ 100 | Helper siap | `largestRemainderPercents` di utils. |
| F Periode W46 | Belum | Selektor Minggu ini/lalu/bulan + `from`/`to` pada `getStatusPO` belum di Code.gs. |
| G Format tanggal | **Helper siap** | `src/utils/formatTanggal.js` — terapkan bertahap ke Dashboard/PO/Riwayat. |
| H Tanggal acuan sheet | **Usulan sheet** | Isi sel acuan Dashboard Live dengan `=TODAY()` (laporkan ke pemilik sebelum ubah sheet). |

## 3. Yang sudah di-deploy ke main (13 Nov)

- UI v2 (FAB, Agent tab, Login tema, Settings eye-toggle + kompresi foto)
- Header Update Sheet aktif (poll + event)
- Helper `formatTanggal` / `parseTanggal` / `parseAngkaID` / `largestRemainderPercents`
- Deploy Cloudflare Worker `gudangai-rudy-pwa-69` sukses

## 4. Keputusan pemilik yang dibutuhkan

1. Konfirmasi Script Properties production memakai ID November `115thkEtAJuQFv3bkyDdDeMNQg-T5Nm8uVr9p9YfXUTA`.
2. Izinkan ubah `getStatusPO` di Code.gs production agar membaca **Dashboard Live** (bukan hitung ulang) — atau setujui menyalin rumus Datang sheet ke Apps Script.
3. Izinkan `=TODAY()` di sel tanggal acuan Dashboard Live (Bug H).
4. Kolom `Tanggal PO` per item di sheet `purchase order` jika periode multi-PO diperlukan.

## 5. Langkah berikutnya (prioritas)

1. Verifikasi SPREADSHEET_ID production.
2. Patch Code.gs `getStatusPO` → sumber Dashboard Live / rumus identik.
3. Patch DonutPO labels + % qty datang + largest remainder.
4. Selektor periode + field `tertunda`.
5. Agent: `getRingkasanGudang`, `getPOTerlambat`, `getRekomendasiOrder` (tetap ≤ 2 live actions).
6. Tes penerimaan Bagian 8.
