/**
 * ============================================================
 * GudangAI RUDY — OPTIMIZE BATCH V6.4.15
 * ============================================================
 * Tujuan:
 *   Mempercepat addTransactionBatch agar input massal (30–80 item)
 *   tidak timeout di Apps Script / client 90 detik.
 *
 * Aturan:
 *   - JANGAN overwrite seluruh Code.gs production (2000+ baris).
 *   - Hanya ganti / tambahkan fungsi yang disebut di bawah.
 *   - Pertahankan anti-duplikasi: requestId, clientItemId, CacheService.
 *   - Frontend tetap write-once; timeout → Antrian Sinkronisasi (bukan serial ulang).
 *
 * Cara pakai:
 *   1. Buka Apps Script production (Extensions → Apps Script).
 *   2. Cari function addTransactionBatch_  → ganti seluruh isinya dengan versi di bawah.
 *   3. Jika belum ada, tambahkan helper:
 *        - loadStockMap_
 *        - applyStockDelta_
 *        - appendTransactionRows_
 *        - findTransactionSheet_
 *   4. Pastikan openSS_, num_, norm_, checkIdempotent_, saveIdempotent_,
 *      resolveTanggal_, updateDashboardStatusPO_ sudah ada (biasanya sudah).
 *   5. Save → Deploy → New version.
 *   6. Uji batch 20–40 item dari PWA Input.
 *
 * Prinsip optimasi:
 *   - Baca sheet Stok 1x → map di memori
 *   - Hitung semua delta stok di memori
 *   - Tulis baris transaksi dengan setValues (bulk)
 *   - Tulis stok akhir yang berubah (bukan per-sel di loop)
 *   - Dashboard refresh 1x di akhir
 *   - Tidak ada SpreadsheetApp.flush() di dalam loop item
 * ============================================================
 */

/**
 * ENTRY POINT — ganti fungsi addTransactionBatch_ production dengan ini.
 * Signature tetap sama agar route_ dan frontend tidak berubah.
 */
function addTransactionBatch_(body) {
  body = body || {};
  var list = body.items || body.rows || [];
  if (!list.length) {
    return { success: false, error: 'items kosong', version: typeof VERSION !== 'undefined' ? VERSION : '' };
  }

  var batchRequestId = String(body.requestId || '').trim();
  if (batchRequestId) {
    try {
      var cached = checkIdempotent_(batchRequestId);
      if (cached && cached.success) {
        return cached;
      }
    } catch (e0) {}
  }

  var sheetName = String(body.sheet || '').trim();
  var entitas = String(body.entitas || body.entity || '').toUpperCase();
  if (entitas !== 'CV' && entitas !== 'PT') {
    return { success: false, error: 'entitas harus CV atau PT' };
  }
  if (!sheetName) {
    return { success: false, error: 'sheet wajib' };
  }

  var isKeluar = /keluar/i.test(sheetName);
  var isMasuk = /masuk/i.test(sheetName);
  var isRusak = /rusak/i.test(sheetName);

  var ss = openSS_();
  var txSheet = findTransactionSheet_(ss, sheetName);
  if (!txSheet) {
    return { success: false, error: 'Sheet transaksi tidak ditemukan: ' + sheetName };
  }

  // --- 1) Load stok 1x ke memori ---
  var stockInfo;
  try {
    stockInfo = loadStockMap_(ss, entitas);
  } catch (eLoad) {
    return { success: false, error: 'Gagal load stok: ' + String(eLoad.message || eLoad) };
  }

  var tgl = resolveTanggal_(body);
  var written = [];
  var errors = [];
  var txRows = []; // baris yang akan di-append bulk
  var stockDirty = {}; // kode -> true (perlu tulis ulang stok)

  // --- 2) Proses semua item di memori ---
  for (var i = 0; i < list.length; i++) {
    var it = list[i] || {};
    var kode = String(it.kodeBarang || it.kode || '').trim();
    var qty = num_(it.qty);
    var ket = String(it.keterangan || '').trim();
    var reqId = String(it.requestId || (batchRequestId ? batchRequestId + '-' + i : '')).trim();

    if (!kode) {
      errors.push('item[' + i + ']: kode kosong');
      continue;
    }

    // Idempotency per item
    if (reqId) {
      try {
        var hit = checkIdempotent_(reqId);
        if (hit && hit.success) {
          written.push({
            kode: kode,
            qty: hit.qty != null ? hit.qty : qty,
            status: 'DUPLICATE',
            skipped: true,
            requestId: reqId
          });
          continue;
        }
      } catch (eId) {}
    }

    var entry = stockInfo.map[kode];
    var current = entry ? num_(entry.stockAkhir) : 0;
    var finalQty = qty;
    var finalKet = ket || entitas;
    var newStock = current;
    var adjusted = false;
    var note = '';

    if (isMasuk) {
      newStock = current + qty;
    } else if (isKeluar || isRusak) {
      if (current <= 0) {
        finalQty = 0;
        newStock = 0;
        adjusted = true;
        note = '[STOK HABIS] Order: ' + qty + '; tersedia: 0';
      } else if (qty > current) {
        // Sesuai aturan bisnis: qty disesuaikan atau hold — gunakan disesuaikan aman
        finalQty = current;
        newStock = 0;
        adjusted = true;
        note = '[DISESUAIKAN] Order: ' + qty + '; tersedia: ' + current;
      } else {
        newStock = current - qty;
        finalQty = qty;
      }
    } else {
      newStock = Math.max(0, current - qty);
      finalQty = Math.min(qty, current);
    }

    if (note) {
      finalKet = (finalKet ? finalKet + ' ' : '') + note;
    }

    // Update map di memori
    if (entry) {
      entry.stockAkhir = newStock;
      stockDirty[kode] = true;
    }
    // Jika kode tidak ada di master, tetap tulis transaksi (soft) — stok tidak diubah

    // Kolom transaksi: B=tanggal, C=kode, F=qty, G=keterangan (format existing)
    // Sesuaikan jika production memakai layout berbeda.
    txRows.push({
      tanggal: tgl,
      kode: kode,
      qty: finalQty,
      keterangan: finalKet,
      requestId: reqId,
      adjusted: adjusted,
      stockAkhir: entry ? newStock : null
    });

    written.push({
      kode: kode,
      qty: finalQty,
      status: 'APPLIED',
      adjusted: adjusted,
      requestId: reqId
    });
  }

  if (!txRows.length && !written.length) {
    return {
      success: false,
      error: errors.length ? errors.join('; ') : 'Tidak ada item valid',
      version: typeof VERSION !== 'undefined' ? VERSION : ''
    };
  }

  // --- 3) Append transaksi bulk (1x setValues) ---
  try {
    appendTransactionRows_(txSheet, txRows);
  } catch (eAppend) {
    return {
      success: false,
      error: 'Gagal tulis transaksi: ' + String(eAppend.message || eAppend),
      written: 0,
      details: written
    };
  }

  // --- 4) Tulis stok yang berubah ---
  try {
    applyStockDelta_(stockInfo, stockDirty);
  } catch (eStock) {
    // Transaksi sudah tertulis; laporkan partial
    return {
      success: false,
      error: 'Transaksi tertulis, stok gagal update: ' + String(eStock.message || eStock),
      written: written.length,
      details: written
    };
  }

  // --- 5) Simpan idempotency ---
  for (var w = 0; w < written.length; w++) {
    if (written[w].requestId && written[w].status === 'APPLIED') {
      try {
        saveIdempotent_(written[w].requestId, {
          success: true,
          status: 'APPLIED',
          kode: written[w].kode,
          qty: written[w].qty
        });
      } catch (eSave) {}
    }
  }
  if (batchRequestId) {
    try {
      saveIdempotent_(batchRequestId, {
        success: true,
        status: 'APPLIED',
        written: written.length
      });
    } catch (eBatch) {}
  }

  // --- 6) Dashboard 1x di akhir (khusus masuk) ---
  if (isMasuk) {
    try {
      updateDashboardStatusPO_();
    } catch (eDash) {}
  }

  var allOk = errors.length === 0 && written.length === list.length;
  return {
    success: allOk || written.length > 0,
    status: allOk ? 'APPLIED' : 'PARTIAL',
    written: written.length,
    details: written,
    error: errors.length ? errors.join('; ') : undefined,
    version: typeof VERSION !== 'undefined' ? VERSION : ''
  };
}

/**
 * Cari sheet transaksi dengan beberapa alias nama.
 */
function findTransactionSheet_(ss, sheetName) {
  var candidates = [sheetName];
  if (/masuk/i.test(sheetName)) {
    candidates = candidates.concat(['Barang masuk', 'Barang Masuk', 'barang masuk']);
  }
  if (/keluar/i.test(sheetName)) {
    candidates = candidates.concat(['Barang keluar', 'Barang Keluar', 'barang keluar']);
  }
  if (/rusak/i.test(sheetName)) {
    candidates = candidates.concat(['Barang Rusak', 'Barang rusak', 'barang rusak']);
  }
  for (var i = 0; i < candidates.length; i++) {
    var sh = ss.getSheetByName(candidates[i]);
    if (sh) return sh;
  }
  return null;
}

/**
 * Baca sheet Stock CV / Stock PT sekali → map[kode] = { row, stockAkhir, colStock }
 */
function loadStockMap_(ss, entitas) {
  var names = entitas === 'CV'
    ? ['Stock CV', 'stock CV', 'STOCK CV']
    : ['Stock PT', 'stock PT', 'STOCK PT'];
  var sheet = null;
  for (var i = 0; i < names.length; i++) {
    sheet = ss.getSheetByName(names[i]);
    if (sheet) break;
  }
  if (!sheet) {
    throw new Error('Sheet Stock ' + entitas + ' tidak ditemukan');
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return { sheet: sheet, map: {}, colStock: -1, headerRow: 0 };
  }

  var headerRow = 0;
  for (var r = 0; r < Math.min(6, data.length); r++) {
    var joined = data[r].map(function (x) { return norm_(x); }).join('|');
    if (joined.indexOf('kode') >= 0) {
      headerRow = r;
      break;
    }
  }

  var h = data[headerRow].map(norm_);
  var iK = -1;
  var iQ = -1;
  for (var c = 0; c < h.length; c++) {
    if (iK < 0 && (h[c] === 'kode barang' || h[c] === 'kode' || h[c].indexOf('kode') === 0)) iK = c;
    if (iQ < 0 && (h[c].indexOf('stock akhir') >= 0 || h[c].indexOf('stok akhir') >= 0 || h[c] === 'stok' || h[c] === 'stock')) iQ = c;
  }
  if (iK < 0 || iQ < 0) {
    throw new Error('Kolom Kode / Stock Akhir tidak ditemukan di Stock ' + entitas);
  }

  var map = {};
  for (var row = headerRow + 1; row < data.length; row++) {
    var kode = String(data[row][iK] || '').trim();
    if (!kode || norm_(kode).indexOf('kode') >= 0) continue;
    map[kode] = {
      row: row + 1, // 1-based sheet row
      stockAkhir: num_(data[row][iQ]),
      colStock: iQ + 1 // 1-based
    };
  }

  return {
    sheet: sheet,
    map: map,
    colStock: iQ + 1,
    headerRow: headerRow
  };
}

/**
 * Tulis ulang hanya baris stok yang berubah (bukan seluruh sheet).
 */
function applyStockDelta_(stockInfo, stockDirty) {
  if (!stockInfo || !stockInfo.sheet || !stockDirty) return;
  var sheet = stockInfo.sheet;
  var map = stockInfo.map;
  var codes = Object.keys(stockDirty);
  for (var i = 0; i < codes.length; i++) {
    var kode = codes[i];
    var entry = map[kode];
    if (!entry) continue;
    sheet.getRange(entry.row, entry.colStock).setValue(entry.stockAkhir);
  }
}

/**
 * Append baris transaksi sekaligus.
 * Layout default (sesuai production lama):
 *   Kolom B = tanggal, C = kode, F = qty, G = keterangan
 * Sesuaikan index jika sheet production berbeda.
 */
function appendTransactionRows_(txSheet, txRows) {
  if (!txRows || !txRows.length) return;

  var startRow = Math.max(txSheet.getLastRow(), 1) + 1;
  // Kita tulis minimal kolom B–G (index 2–7)
  // Array per baris: [A='', B=tgl, C=kode, D='', E='', F=qty, G=ket]
  var values = [];
  for (var i = 0; i < txRows.length; i++) {
    var r = txRows[i];
    values.push([
      '',           // A
      r.tanggal,    // B
      r.kode,       // C
      '',           // D — jangan isi Nama
      '',           // E — jangan isi Satuan
      r.qty,        // F
      r.keterangan  // G
    ]);
  }

  txSheet.getRange(startRow, 1, startRow + values.length - 1, 7).setValues(values);
}

/**
 * CATATAN INTEGRASI PRODUCTION
 * ----------------------------
 * Jika production sudah punya checkIdempotent_ / saveIdempotent_ / resolveTanggal_
 * dengan nama berbeda, sesuaikan pemanggilan di addTransactionBatch_.
 *
 * Jika kolom transaksi production berbeda (mis. qty di kolom E), ubah saja
 * array di appendTransactionRows_.
 *
 * Jangan panggil updateStock_ lama di dalam loop batch setelah patch ini aktif,
 * karena stok sudah di-handle lewat loadStockMap_ + applyStockDelta_.
 *
 * Frontend api.js V6.4.15:
 *   - postJsonWrite retries=1, timeout 90s
 *   - timeout / respons tidak jelas → enqueue Antrian (bukan serial)
 *   - Jangan mengembalikan auto-serial setelah batch gagal
 *
 * Uji disarankan:
 *   1. Batch 5 item → harus success cepat
 *   2. Batch 40 item → harus selesai < 60s idealnya
 *   3. Kirim ulang requestId yang sama → DUPLICATE / skipped
 *   4. Stok di sheet Stock CV/PT ikut berubah sesuai aturan masuk/keluar/rusak
 */
