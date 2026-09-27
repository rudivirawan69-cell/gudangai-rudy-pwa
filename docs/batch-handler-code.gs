// =====================================================================
// BATCH TRANSACTION HANDLER — V6.7.0
// Tambahkan ke route_() dan paste fungsi addBatchTransaction_ di bawah
// =====================================================================

// === TAMBAHKAN di route_() sebelum UNKNOWN_ACTION: ===
// if (a === 'addBatchTransaction' || a === 'batchTransaction') {
//   return json_(addBatchTransaction_(body));
// }

/**
 * addBatchTransaction_(body)
 * Proses banyak item transaksi dalam 1 request Apps Script.
 * Menghilangkan 80x HTTP round-trip → 1 request.
 *
 * body.items = [{kodeBarang, qty, keterangan, clientItemId}, ...]
 * body.sheet = 'Barang masuk' / 'Barang keluar' / 'Barang Rusak'
 * body.entitas = 'CV' / 'PT'
 */
function addBatchTransaction_(body) {
  var rawItems = body.items || [];
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { success: false, error: 'items kosong' };
  }
  if (rawItems.length > 100) {
    return { success: false, error: 'Maksimal 100 item per batch' };
  }

  var sheetName = String(body.sheet || '').trim();
  var entitas = String(body.entitas || body.entity || 'CV').toUpperCase();

  if (entitas !== 'CV' && entitas !== 'PT') {
    return { success: false, error: 'entitas harus CV atau PT' };
  }
  if (!sheetName) {
    return { success: false, error: 'sheet wajib' };
  }

  var results = [];
  var successCount = 0;
  var failCount = 0;

  for (var i = 0; i < rawItems.length; i++) {
    var item = rawItems[i] || {};
    try {
      var singleBody = {
        sheet: sheetName,
        entitas: entitas,
        entity: entitas,
        kodeBarang: String(item.kodeBarang || item.kode || '').trim(),
        kode: String(item.kode || item.kodeBarang || '').trim(),
        qty: item.qty,
        keterangan: String(item.keterangan || '').trim(),
        tanggal: body.tanggal || item.tanggal,
        requestId: item.requestId || item.clientItemId || '',
        transactionId: item.transactionId || '',
        clientItemId: item.clientItemId || ''
      };

      var res = addTransaction_(singleBody);
      if (res.success !== false) {
        successCount++;
        results.push({
          success: true,
          kode: singleBody.kodeBarang,
          clientItemId: item.clientItemId || '',
          stockAkhir: res.stockAkhir,
          status: 'APPLIED'
        });
      } else {
        failCount++;
        results.push({
          success: false,
          kode: singleBody.kodeBarang,
          clientItemId: item.clientItemId || '',
          error: res.error || 'Gagal'
        });
      }
    } catch (err) {
      failCount++;
      results.push({
        success: false,
        kode: String(item.kodeBarang || item.kode || ''),
        clientItemId: item.clientItemId || '',
        error: String(err.message || err)
      });
    }

    // Flush setiap 15 item untuk cegah timeout
    if ((i + 1) % 15 === 0) {
      try { SpreadsheetApp.flush(); } catch (_) {}
    }
  }

  try { SpreadsheetApp.flush(); } catch (_) {}

  return {
    success: successCount > 0,
    status: failCount === 0 ? 'ALL_APPLIED' : (successCount > 0 ? 'PARTIAL' : 'ALL_FAILED'),
    total: rawItems.length,
    successCount: successCount,
    failCount: failCount,
    results: results
  };
}
