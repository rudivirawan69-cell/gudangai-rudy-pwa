# Instruksi Cepat — Status PO Sederhana (Mobile Friendly)

## 1. Nonaktifkan fungsi rusak di Apps Script (agar bisa Save)

1. Buka Code.gs di handphone.
2. Cari teks: `buildMasterExecutiveDashboardV69`
3. Di depan kata `function` tambahkan `// ` sehingga menjadi:
   ```
   // function buildMasterExecutiveDashboardV69
   ```
4. Simpan (Save).

Jika masih error, cari semua baris yang mengandung `buildMasterExecutiveDashboard` dan tambahkan `//` di depannya.

## 2. Tempel fungsi Status PO sederhana

1. Buka file di GitHub:
   https://github.com/rudivirawan69-cell/gudangai-rudy-pwa/blob/main/docs/STATUS_PO_SIMPLE_BACKEND.gs
2. Copy seluruh isinya.
3. Di Code.gs, tempel di **paling bawah**.
4. Save → Deploy → New version (Execute as Me, Anyone).

## 3. Uji di PWA

1. Buka https://gudangai-rudy-pwa.vercel.app
2. Masuk ke Dashboard.
3. Pada item Status PO yang berstatus Menunggu, tekan tombol **Konfirmasi**.
4. Status akan berubah menjadi Selesai dan tersinkron ke spreadsheet.

## Catatan

- Tidak ada matching kode unik yang rumit.
- Cukup tekan tombol di PWA → spreadsheet langsung update kolom status + qtyDatang.
- Dashboard spreadsheet akan menampilkan status sesuai konfirmasi PWA setelah refresh.
