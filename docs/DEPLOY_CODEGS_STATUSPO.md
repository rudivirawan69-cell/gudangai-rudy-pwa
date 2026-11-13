# Deploy Code.gs getStatusPO (Dashboard Live)

## Langkah wajib di Google Apps Script

1. Buka project Apps Script yang terikat spreadsheet **COLD STORAGE November 2026**
   (`115thkEtAJuQFv3bkyDdDeMNQg-T5Nm8uVr9p9YfXUTA`).
2. Script Properties → pastikan `SPREADSHEET_ID` = ID di atas.
3. Ganti fungsi `getStatusPO` dengan versi V6.6.6 dari repo (`Code.gs` setelah pull),
   termasuk `readStatusPOFromDashboardLive_`.
4. Deploy → **Manage deployments** → Edit → New version → Deploy.
5. Uji: `?action=getStatusPO` harus mengembalikan summary Menunggu/Sebagian/Selesai
   selaras Dashboard Live (contoh acuan: 7 / 1 / 1).

## Opsional sheet

- Sel tanggal acuan Dashboard Live: `=TODAY()` (zona Asia/Jakarta).
