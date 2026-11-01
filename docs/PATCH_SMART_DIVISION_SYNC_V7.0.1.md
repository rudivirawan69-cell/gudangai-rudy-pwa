# Patch: Smart Structural Rebuild — Data Stok Per Divisi (V7.0.1)

**Tanggal:** 1 November 2026  
**Target:** Code.gs production (setelah V7.0.0-RECONSTRUCTION-CANDIDATE)  
**Masalah:** Item baru di Stock Awal (contoh: Daging sapi utuh / DAPUR 1) tidak otomatis muncul di Data Stok Per Divisi.

## Penyebab
Setelah transaksi, sistem hanya memanggil `syncDivisionStockLightweight_()` yang **hanya mengaudit formula** (tidak menambah baris). Full rebuild hanya dijalankan saat setup / API eksplisit.

## Solusi
Tambah deteksi struktural. Jika ada item di Stock Awal yang belum ada di Data Stok Per Divisi → jalankan full rebuild terkontrol. Jika struktur sudah lengkap → tetap formula-safe (lightweight).

---

## Langkah penerapan di Apps Script

### 1. Pastikan data sumber benar
Di sheet **Stock Awal**, pastikan baris item (mis. Daging sapi utuh) memiliki:
- Kode barang terisi
- Kolom **Divisi** = `DAPUR 1` (atau `DAPUR1` — akan dinormalisasi)

### 2. Tambah dua fungsi baru
Tempel **tepat sebelum** `function syncDivisionStockLightweight_() {`

```javascript
/**
 * Structural check: does Data Stok Per Divisi miss any item that exists in Stock Awal?
 * Returns { needed:boolean, reason:string, missingCount:number, missingSample:string[] }
 * Formula-safe: pure read, zero writes.
 */
function needsDivisionStockRebuild_() {
  var ss = getSS();
  var src = ss.getSheetByName("Stock Awal");
  var dest = ss.getSheetByName("Data Stok Per Divisi");
  if (!src || !dest) {
    return { needed: false, reason: "SHEETS_MISSING", missingCount: 0, missingSample: [] };
  }

  var data = src.getDataRange().getValues();
  if (data.length < 2) {
    return { needed: false, reason: "STOCK_AWAL_EMPTY", missingCount: 0, missingSample: [] };
  }

  var header = data[0].map(function(h) { return String(h).toLowerCase().trim(); });
  var idxKode = header.findIndex(function(h) { return h.indexOf("kode") >= 0; });
  var idxDivisi = header.findIndex(function(h) { return h.indexOf("divisi") >= 0; });
  if (idxKode < 0 || idxDivisi < 0) {
    return { needed: false, reason: "STOCK_AWAL_HEADER_INCOMPLETE", missingCount: 0, missingSample: [] };
  }

  var knownGroups = {
    "DAPUR 1": true, "DAPUR 2": true, "MIE": true, "PACKING": true,
    "CS": true, "BAHAN BAKU": true, "REKANAN": true
  };

  var expected = {};
  for (var i = 1; i < data.length; i++) {
    var kode = String(data[i][idxKode] || "").trim().toUpperCase();
    if (!kode || /^TOTAL/i.test(kode)) continue;
    var div = normalizeDivision_(data[i][idxDivisi]);
    if (kode.indexOf("BBCV-") === 0 || kode.indexOf("BBPT-") === 0) div = "BAHAN BAKU";
    if (!knownGroups[div]) continue;
    expected[kode] = div;
  }

  var existing = {};
  var lastRow = Math.min(dest.getLastRow(), 5000);
  if (lastRow >= 1) {
    var codes = dest.getRange(1, 2, lastRow, 1).getDisplayValues();
    for (var r = 0; r < codes.length; r++) {
      var c = String(codes[r][0] || "").trim().toUpperCase();
      if (c && !/^TOTAL/i.test(c) && c.indexOf("DIVISI") < 0 && c.indexOf("KODE") < 0) {
        existing[c] = true;
      }
    }
  }

  var missing = [];
  Object.keys(expected).forEach(function(kode) {
    if (!existing[kode]) missing.push(kode);
  });

  if (missing.length === 0) {
    return { needed: false, reason: "STRUCTURE_OK", missingCount: 0, missingSample: [] };
  }

  return {
    needed: true,
    reason: "MISSING_ITEMS_FROM_STOCK_AWAL",
    missingCount: missing.length,
    missingSample: missing.slice(0, 8)
  };
}

/**
 * Smart sync entry-point used after stock-impacting writes.
 * - If Stock Awal contains items not yet present in Data Stok Per Divisi → full controlled rebuild.
 * - Otherwise → formula-safe lightweight path (zero writes to column F).
 */
function syncDivisionStockSmart_() {
  try {
    var check = needsDivisionStockRebuild_();
    if (check.needed) {
      console.log("syncDivisionStockSmart_: full rebuild triggered — " +
        check.reason + " (missing " + check.missingCount +
        ", sample: " + (check.missingSample || []).join(", ") + ")");
      var result = syncDivisionStock({
        reason: check.reason,
        missingCount: check.missingCount,
        missingSample: check.missingSample
      });
      result.smartMode = "FULL_REBUILD";
      result.missingCount = check.missingCount;
      return result;
    }
  } catch (structErr) {
    console.error("needsDivisionStockRebuild_ gagal, fallback lightweight: " + structErr.message);
  }
  var light = syncDivisionStockLightweight_();
  light.smartMode = "FORMULA_ONLY";
  return light;
}
```

### 3. Ganti pemanggilan
Cari semua:
```javascript
syncDivisionStockLightweight_()
```
Ganti menjadi:
```javascript
syncDivisionStockSmart_()
```
(termasuk di path setelah transaksi sukses dan di handler onEdit).

### 4. (Opsional) Update versi
```javascript
const BACKEND_VERSION = "7.0.1-SMART-DIVISION-SYNC";
```

### 5. Uji
Jalankan sekali di editor Apps Script:
```javascript
function forceDivisionRebuild() {
  var r = syncDivisionStockSmart_();
  Logger.log(JSON.stringify(r));
}
```
Periksa sheet **Data Stok Per Divisi** — item yang sebelumnya hilang harus muncul dengan formula Sisa Stok.

---

## Perilaku setelah patch
| Kondisi | Aksi |
|---------|------|
| Ada item baru di Stock Awal yang belum di Data Stok Per Divisi | Full rebuild terkontrol |
| Hanya perubahan kuantitas (struktur sudah lengkap) | Lightweight (formula-safe, zero write kolom F) |

## Catatan keamanan
- Full rebuild tetap **tidak menulis** ke Stock CV / Stock PT / Stock Bahan Baku.
- Kolom F tetap diisi formula (bukan nilai statis).
- Fallback ke lightweight jika deteksi struktural gagal.
