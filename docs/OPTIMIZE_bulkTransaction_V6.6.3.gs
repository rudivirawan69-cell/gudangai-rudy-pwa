/**
 * ============================================================
 * OPTIMIZED bulkTransaction for V6.6.3 — REPLACE function bulkTransaction only
 * Target: 40–80 item barang keluar tanpa timeout client
 * Prinsip: 1 lock, load stok 1x, setValues bulk, flush 1x
 * JANGAN ganti seluruh Code.gs — hanya ganti function bulkTransaction(...)
 * ============================================================
 */
function bulkTransaction(body) {
  if (body && (body._syncMode || body.offlineContext || body.operation === "syncTransaction") && body.queueApproved !== true) {
    return { success: false, status: "REJECTED", code: "QUEUE_APPROVAL_REQUIRED", batchId: body.batchId || null, error: "queueApproved=true wajib untuk bulk outbox." };
  }
  var list = (body && (body.transactions || body.items || body.rows)) || [];
  if (!list.length) return { success: false, error: "transactions array kosong" };
  if (list.length > 200) return { success: false, error: "Batch melebihi batas 200 transaksi" };

  var batchId = String(body.batchId || body.transactionId || body.nonce || ("BATCH-" + Utilities.getUuid())).trim();
  var batchCache = CacheService.getScriptCache();
  var cachedBatch = batchCache.get("batchResult_" + batchId);
  if (cachedBatch) {
    try {
      var previous = JSON.parse(cachedBatch);
      previous.replayed = true;
      return previous;
    } catch (e) { batchCache.remove("batchResult_" + batchId); }
  }

  var t0 = Date.now();
  var sheetName = String(body.sheet || (list[0] && list[0].sheet) || "").trim();
  var entitas = String(body.entitas || body.entity || (list[0] && (list[0].entitas || list[0].entity)) || "").trim().toUpperCase();
  if (!(sheetName in SHEET_CONFIG)) {
    return { success: false, status: "REJECTED", code: "SHEET_NOT_ALLOWED", batchId: batchId, error: "Sheet tidak diizinkan: " + sheetName };
  }
  if (["CV", "PT"].indexOf(entitas) < 0) {
    return { success: false, status: "REJECTED", code: "ENTITY_REQUIRED", batchId: batchId, error: "entitas wajib CV atau PT." };
  }

  var config = SHEET_CONFIG[sheetName];
  var ss = getSS();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return { success: false, status: "REJECTED", code: "SHEET_NOT_FOUND", batchId: batchId, error: "Sheet fisik tidak ditemukan: " + sheetName };
  }

  // Preflight — validasi semua dulu tanpa write
  var prepared = [];
  var validationErrors = [];
  var seenKeys = {};
  for (var i = 0; i < list.length; i++) {
    var original = list[i] || {};
    var tx = Object.assign({}, original);
    if (!tx.sheet) tx.sheet = sheetName;
    if (!tx.entitas) tx.entitas = entitas;
    if (tx.queueApproved !== true && body.queueApproved === true) tx.queueApproved = true;
    if (!tx.client && body.client) tx.client = body.client;
    tx.transactionId = String(tx.transactionId || (batchId + "-" + String(i + 1).padStart(3, "0")));
    if (!tx.nonce) tx.nonce = tx.transactionId;
    var check = validateTransactionRequest_(tx, { requireDate: !!tx._syncMode || !!body._syncMode, requireEntity: true });
    if (!check.valid) {
      validationErrors.push({ index: i + 1, error: check.error });
      continue;
    }
    var normalizedKode = String(check.kode || tx.kodeBarang || tx.kode || "").trim();
    var duplicateKey = String(tx.sheet) + "|" + normalizedKode + "|" + String(tx.qty);
    if (seenKeys[duplicateKey]) {
      validationErrors.push({ index: i + 1, error: "Duplikat item dalam batch: " + normalizedKode + " qty " + tx.qty });
      continue;
    }
    seenKeys[duplicateKey] = true;
    tx.kodeBarang = normalizedKode;
    prepared.push(tx);
  }
  if (validationErrors.length > 0) {
    var rejected = { success: false, status: "PRECHECK_REJECTED", batchId: batchId, total: list.length, validationErrors: validationErrors, results: [] };
    batchCache.put("batchResult_" + batchId, JSON.stringify(rejected), DUP_CACHE_TTL_SEC);
    return rejected;
  }

  // Load stok 1x (untuk shortage HOLD pada keluar)
  var stockMap = {};
  try {
    var allStock = getAllStock(entitas);
    if (allStock && allStock.success && allStock.items) {
      allStock.items.forEach(function(it) {
        stockMap[String(it.kode || "").trim()] = {
          stockAkhir: clampStockToZero_(it.stockAkhir),
          nama: it.nama || "",
          entitas: it.entitas || entitas
        };
      });
    }
  } catch (eStock) {
    console.error("bulkTransaction stock load: " + eStock.message);
  }

  var isKeluar = sheetName === "Barang keluar";
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { success: false, status: "UNKNOWN", code: "LOCK_TIMEOUT", batchId: batchId, writeOccurred: "unknown", error: "Lock backend tidak tersedia; lakukan read-back sebelum retry." };
  }

  var results = [];
  var successCount = 0;
  var failCount = 0;
  var writeTouched = false;
  var rowsToWrite = [];

  try {
    for (var p = 0; p < prepared.length; p++) {
      var item = prepared[p];
      var prior = findIdempotencyRecord_(item.transactionId, item.nonce);
      if (prior && prior.status === "APPLIED") {
        results.push({
          success: true, status: "APPLIED", code: "IDEMPOTENT_REPLAY",
          batchId: batchId, batchIndex: p + 1,
          transactionId: item.transactionId, nonce: item.nonce,
          sheet: sheetName, kode: item.kodeBarang,
          qty: prior.qty != null ? prior.qty : item.qty, replayed: true
        });
        successCount++;
        continue;
      }

      var numericQty = Number(item.qty) || 0;
      var formattedDate = item.tanggal || Utilities.formatDate(new Date(), TIMEZONE, DATE_FORMAT);
      var finalDateCheck = validateTransactionDate(formattedDate);
      if (!finalDateCheck.valid) {
        results.push({ success: false, status: "REJECTED", code: "INVALID_DATE", batchId: batchId, batchIndex: p + 1, error: finalDateCheck.error, kode: item.kodeBarang });
        failCount++;
        break;
      }

      var finalQty = numericQty;
      var keterangan = String(item.keterangan || "").trim();
      var shortageMode = false;
      var availableQty = null;

      if (isKeluar && numericQty > 0) {
        var st = stockMap[item.kodeBarang];
        var sisa = st ? Math.max(0, Number(st.stockAkhir) || 0) : 0;
        availableQty = sisa;
        var kekurangan = Math.max(0, numericQty - sisa);
        if (kekurangan > 0) {
          shortageMode = true;
          finalQty = 0;
          var structured = "HOLD; orderQty: " + numericQty + "; availableQty: " + sisa + "; shortageQty: " + kekurangan + "; followUp: verifikasi pembelian manual";
          keterangan = keterangan ? (keterangan + " | " + structured) : structured;
        }
        if (st) st.stockAkhir = Math.max(0, sisa - (shortageMode ? 0 : finalQty));
      }

      keterangan = appendIdentityMarker_(keterangan, item.transactionId, item.nonce);

      try {
        if (prior) {
          updateIdempotencyRecord_(prior, { status: "IN_PROGRESS", requestId: item.requestId || batchId, writeOccurred: false });
        } else {
          appendIdempotencyRecord_({
            transactionId: item.transactionId, nonce: item.nonce,
            requestId: item.requestId || batchId, deviceId: (item.client && item.client.deviceId) || "",
            operation: "bulkTransaction", sheet: sheetName, entitas: entitas,
            kodeBarang: item.kodeBarang, qty: numericQty, tanggal: normalizeTransactionDateKey_(formattedDate),
            status: "IN_PROGRESS", writeOccurred: false, details: "Batch claim " + batchId
          });
        }
      } catch (ledErr) { console.error("ledger claim: " + ledErr.message); }

      rowsToWrite.push({
        index: p, date: formattedDate, kode: item.kodeBarang,
        qty: finalQty, originalQty: numericQty, ket: keterangan,
        txId: item.transactionId, nonce: item.nonce,
        shortage: shortageMode, availableQty: availableQty
      });
    }

    if (rowsToWrite.length === 0 && failCount === 0) {
      var replayResp = {
        success: true, status: "COMMITTED", batchId: batchId,
        total: prepared.length, successCount: successCount, failCount: 0,
        results: results, replayed: true, execMs: Date.now() - t0
      };
      batchCache.put("batchResult_" + batchId, JSON.stringify(replayResp), DUP_CACHE_TTL_SEC);
      return replayResp;
    }

    if (rowsToWrite.length > 0) {
      var startRow = findSafeEmptyRowAdaptively(sheet, config);
      var needEnd = startRow + rowsToWrite.length - 1;
      if (sheet.getMaxRows() < needEnd) {
        try { sheet.insertRowsAfter(sheet.getMaxRows(), needEnd - sheet.getMaxRows() + 10); } catch (insErr) {}
      }
      if (!verifyRowStillEmptyPath2(sheet, startRow)) {
        startRow = findSafeEmptyRowAdaptively(sheet, config);
      }

      var bcValues = [];
      var fgValues = [];
      for (var r = 0; r < rowsToWrite.length; r++) {
        bcValues.push([rowsToWrite[r].date, rowsToWrite[r].kode]);
        fgValues.push([rowsToWrite[r].qty, rowsToWrite[r].ket]);
      }

      sheet.getRange(startRow, 2, rowsToWrite.length, 2).setValues(bcValues);
      writeTouched = true;
      sheet.getRange(startRow, 6, rowsToWrite.length, 2).setValues(fgValues);
      SpreadsheetApp.flush();

      for (var v = 0; v < rowsToWrite.length; v++) {
        var rowNum = startRow + v;
        var rw = rowsToWrite[v];
        var vBC = sheet.getRange(rowNum, 2, 1, 2).getValues()[0];
        var vFG = sheet.getRange(rowNum, 6, 1, 2).getValues()[0];
        var ok = (normalizeTransactionDateKey_(vBC[0]) === normalizeTransactionDateKey_(rw.date) || String(vBC[0]) === String(rw.date))
          && String(vBC[1] || "").trim() === rw.kode
          && Number(vFG[0]) === Number(rw.qty);

        if (ok) {
          successCount++;
          try {
            var rec = findIdempotencyRecord_(rw.txId, rw.nonce);
            if (rec) updateIdempotencyRecord_(rec, { status: "APPLIED", dataRow: rowNum, writeOccurred: true, errorCode: "" });
          } catch (uErr) {}
          results.push({
            success: true, status: "APPLIED", code: "TRANSACTION_APPLIED",
            batchId: batchId, batchIndex: rw.index + 1,
            transactionId: rw.txId, nonce: rw.nonce,
            sheet: sheetName, row: rowNum, kode: rw.kode,
            qty: rw.qty, originalQty: rw.originalQty,
            shortage: rw.shortage, writeOccurred: true
          });
          if (rw.shortage) {
            try {
              writeAuditLogSecure("SHORTAGE_HOLD", "HOLD_CREATED", {
                batchId: batchId, transactionId: rw.txId, entitas: entitas, kode: rw.kode,
                orderQty: rw.originalQty, availableQty: rw.availableQty, holdQty: 0
              }, "", rw.txId);
            } catch (aErr) {}
          }
        } else {
          failCount++;
          try {
            var rec2 = findIdempotencyRecord_(rw.txId, rw.nonce);
            if (rec2) updateIdempotencyRecord_(rec2, { status: "UNKNOWN", dataRow: rowNum, writeOccurred: "unknown", errorCode: "VERIFY_FAILED" });
          } catch (u2) {}
          results.push({
            success: false, status: "UNKNOWN", code: "VERIFY_FAILED",
            batchId: batchId, batchIndex: rw.index + 1,
            transactionId: rw.txId, kode: rw.kode,
            writeOccurred: "unknown", error: "Verifikasi integritas gagal di baris " + rowNum
          });
          break;
        }
      }
    }

    updateLastUpdateTimestamp();
    clearMasterCache();
  } catch (outerErr) {
    failCount++;
    try { sendErrorEmailWithCooldown("bulkTransaction", outerErr, { batchId: batchId, sheet: sheetName, count: prepared.length }); } catch (n) {}
    results.push({ success: false, status: writeTouched ? "UNKNOWN" : "FAILED", code: writeTouched ? "PARTIAL_WRITE_READBACK_REQUIRED" : "WRITE_FAILED", batchId: batchId, error: String(outerErr.message || outerErr) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }

  var response = {
    success: failCount === 0 && successCount === prepared.length,
    status: failCount === 0 ? "COMMITTED" : (writeTouched ? "PARTIAL_FAILURE_REVIEW_REQUIRED" : "FAILED"),
    batchId: batchId,
    total: prepared.length,
    successCount: successCount,
    failCount: failCount,
    failedIndex: failCount ? (results.length ? results[results.length - 1].batchIndex : null) : null,
    resumable: failCount > 0,
    retryPolicy: failCount > 0 ? "READBACK_FIRST_FOR_UNKNOWN; RESUME_UNSENT_ITEMS_ONLY" : "NONE",
    results: results,
    execMs: Date.now() - t0,
    writeOccurred: writeTouched
  };
  try { batchCache.put("batchResult_" + batchId, JSON.stringify(response), DUP_CACHE_TTL_SEC); } catch (cErr) {}
  try {
    writeAuditLogSecure("BULK_TRANSACTION", response.success ? "SUCCESS" : "PARTIAL_FAILURE", {
      batchId: batchId, total: prepared.length, successCount: successCount, failCount: failCount, execMs: response.execMs
    }, response.success ? "" : "Jangan ulangi batch sebelum review.", batchId);
  } catch (logErr) {}
  return response;
}
