// =====================================================================
// BATCH TRANSACTION HANDLER — V6.7.1 STOCK-SOURCE-LOCK
// =====================================================================
// PENTING:
// Jangan gunakan loop addTransaction_() satu-per-satu untuk batch PWA.
// Backend final harus memakai bulkTransaction(), karena fungsi tersebut:
// - 1x ScriptLock untuk seluruh batch
// - 1x baca Idempotency Ledger
// - claim ledger secara batch
// - 1x setValues() contiguous untuk B:C
// - 1x setValues() contiguous untuk F:G
// - 1x read-back seluruh blok
// - update ledger secara batch setelah lock dilepas
// - tidak pernah menulis Stock CV/PT
//
// Route doPost() yang benar:
// case "addTransactionBatch":
//   return jsonResponse(bulkTransaction(Object.assign({}, body, {
//     transactions: body.transactions || body.items || body.rows
//   })));
//
// Jika bulkTransaction() belum ada di Code.gs production, integrasikan
// fungsi bulkTransaction() dari artifact STOCK_SOURCE_LOCK sebelum deploy.
// Jangan mengganti seluruh Code.gs production dengan file patch ini.

// Compatibility wrapper hanya untuk deployment yang sudah memiliki
// bulkTransaction() sebagai engine utama.
function addBatchTransaction_(body) {
  body = body || {};
  var items = body.transactions || body.items || body.rows || [];
  if (!Array.isArray(items) || !items.length) {
    return {
      success: false,
      status: "REJECTED",
      code: "BATCH_ITEMS_REQUIRED",
      error: "transactions/items/rows kosong"
    };
  }

  // Hard guard: batch hanya boleh menuju sheet transaksi.
  var sheetName = String(body.sheet || "").trim();
  if (["Barang masuk", "Barang keluar", "Barang Rusak"].indexOf(sheetName) < 0) {
    return {
      success: false,
      status: "REJECTED",
      code: "SHEET_NOT_ALLOWED",
      error: "Batch hanya boleh menulis Barang masuk, Barang keluar, atau Barang Rusak."
    };
  }

  var entitas = String(body.entitas || body.entity || "").trim().toUpperCase();
  if (["CV", "PT"].indexOf(entitas) < 0) {
    return {
      success: false,
      status: "REJECTED",
      code: "ENTITY_REQUIRED",
      error: "entitas wajib CV atau PT."
    };
  }

  if (typeof bulkTransaction !== "function") {
    return {
      success: false,
      status: "REJECTED",
      code: "BULK_ENGINE_MISSING",
      error: "bulkTransaction() belum terpasang di Code.gs production."
    };
  }

  return bulkTransaction(Object.assign({}, body, {
    transactions: items,
    sheet: sheetName,
    entitas: entitas
  }));
}
