# Rubee — Perbaikan Analisis Stok Live (25 Nov 2026)

## Status
Perbaikan routing Worker dibuat pada branch `fix/rubee-stock-live-read-20261125`. Belum di-merge dan belum di-deploy.

## Temuan yang dibuktikan
1. `LIVE_INTENTS` sebelumnya memeriksa pola `searchByName` yang terlalu luas (`stok|stock|sisa`) sebelum pola `getAllStock`. Prompt "Analisis Stok" karena itu dapat dipetakan menjadi pencarian nama barang, bukan pembacaan dataset stok.
2. Code.gs Library `Code.gs.6.6.6-HOLD-SIMPLE-AGENT-KNOWLEDGE.gs` mengembalikan hasil `getAllStock`, `getLowStock`, `getStockoutRisk`, `getStockByCode`, `searchByName`, dan `getDashboardData` tanpa `sourceReadAt` pada jalur dispatch `doPost`. Worker memvalidasi field ini dan menolak payload yang tidak memilikinya.
3. `getTransactionHistory` pada file Library juga tidak mengembalikan `sheet`, sedangkan Worker memverifikasi identitas sheet dan timestamp. Ini merupakan ketidaksesuaian kontrak tambahan untuk fitur audit transaksi.

## Perubahan Worker yang diajukan
- Tambahkan intent spesifik `analisis stok|analisa stok|ringkasan stok|data stok gudang|kondisi stok|stok gudang` ke `getAllStock` sebelum pencarian nama.
- Batasi `searchByName` pada frasa pencarian barang/nama barang atau nama barang yang mengikuti kata stok/stock/sisa; kata "stok" sendirian tidak lagi menjadi pencarian nama.
- Tes regresi untuk "Analisis Stok", "analisa stok gudang", dan "Cari stok Ayam Fillet".

## Patch yang diperlukan pada Code.gs 6.6.6 yang terpasang
Jangan mengganti seluruh file dengan Code.gs GitHub `main` (yang masih 6.6.5). Terapkan patch kompatibilitas berikut pada file 6.6.6 yang sudah dikonfirmasi operator.

Tambahkan helper sebelum `doPost(e)`:

```javascript
function withSourceReadAt_(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { success: false, code: "INVALID_READ_RESPONSE", error: "Respons baca tidak valid." };
  }
  if (!result.sourceReadAt) result.sourceReadAt = new Date().toISOString();
  return result;
}
```

Pada switch `doPost(e)`, bungkus hanya action baca berikut:
- `getStock` / `getStockByCode`
- `getAllStock` / `getStockAll`
- `getLowStock`
- `getStockoutRisk`
- `getTransactionHistory`
- `searchByName`
- `getDashboard` / `getDashboardData`
- `getDashboardLegacy`
- `getLastUpdate`
- `getStatusPO`
- `getStockDelta`
- `getSyncMetrics`
- `getPOAnalysis` / `runPOAnalysis`
- `getPORequestStatus`
- `getAgentKnowledge` (opsional; fungsi ini sudah menghasilkan sourceReadAt, sehingga wrapper hanya mempertahankan nilai yang ada).

Contoh:
```javascript
case "getAllStock":
case "getStockAll": return jsonResponse(withSourceReadAt_(getAllStock(body.entitas || body.entity || "ALL")));
case "getLowStock": return jsonResponse(withSourceReadAt_(getLowStock()));
case "getStockoutRisk": return jsonResponse(withSourceReadAt_(getStockoutRisk(body)));
```

Pada fungsi `getTransactionHistory(params)`, tambahkan `sheet: sheetName` dan `sourceReadAt: new Date().toISOString()` pada kedua jalur sukses (termasuk hasil kosong). Timestamp paling baik dihasilkan sedekat mungkin dengan pembacaan data; wrapper dispatch menjadi fallback konsisten untuk semua action.

## Batas keamanan dan akurasi
- Jangan menambahkan timestamp pada Worker sebagai pengganti timestamp sumber. Waktu penerimaan gateway bukan bukti waktu baca Apps Script.
- Jangan menurunkan validasi `success === true`, schema stok, exact SKU, atau identitas sheet.
- Jangan mengubah endpoint write, transaksi, PO, stok, formula, atau struktur spreadsheet.
- Semua pembacaan tetap read-only.
- Setelah patch Code.gs, jalankan tes kontrak dan smoke test live; verifikasi bahwa `dataSources` berisi `getAllStock`, `ok: true`, `sourceReadAt` valid, dan payload item stok diteruskan ke konteks AI.

## Deployment yang diperlukan setelah review
1. Merge PR Worker ke `main`.
2. Deploy Worker `gudangai-rudy-pwa69`.
3. Terapkan patch helper/dispatch pada Apps Script 6.6.6 dan deploy versi Apps Script baru yang terhubung ke spreadsheet utama.
4. Tes ulang di PWA dengan "Analisis Stok"; pastikan angka yang dijawab dapat ditelusuri ke payload live dan timestamp sumber.

Tidak ada deployment atau perubahan spreadsheet yang dilakukan oleh patch ini.
