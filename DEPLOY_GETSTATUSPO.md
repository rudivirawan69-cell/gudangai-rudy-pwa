# Deploy getStatusPO (Bug A/B/D) ke Apps Script production

## 1. Spreadsheet November
Pastikan Script Properties:
```
SPREADSHEET_ID=115thkEtAJuQFv3bkyDdDeMNQg-T5Nm8uVr9p9YfXUTA
```

## 2. Ganti fungsi getStatusPO
1. Buka project Apps Script yang terikat spreadsheet November.
2. Di `Code.gs`, cari `function getStatusPO`.
3. **Ganti seluruh fungsi** dengan isi file repo:
   `patches/getStatusPO.gs`
   https://github.com/rudivirawan69-cell/gudangai-rudy-pwa/blob/main/patches/getStatusPO.gs

## 3. Routing body (doPost / doGet)
```javascript
case "getStatusPO": return jsonResponse(getStatusPO(body));
```
Dan di doGet:
```javascript
case "getStatusPO": return jsonResponse(getStatusPO({ from: e.parameter.from, to: e.parameter.to }));
```

## 4. Deploy Web App
Deploy → New version → Execute as: Me → Who has access: Anyone
Salin URL exec (harus sama dengan yang dipakai PWA).

## 5. Opsional Bug H
Di sheet **Dashboard Live**, sel tanggal acuan pergerakan 7 hari: isi `=TODAY()`.

## 6. Verifikasi
Dari PWA hard refresh → Status PO harus:
- Menunggu 7, Sebagian 1, Selesai 1 (atau nilai sheet saat ini)
- Detail 9 baris dengan Datang/Belum Datang sesuai Dashboard Live
