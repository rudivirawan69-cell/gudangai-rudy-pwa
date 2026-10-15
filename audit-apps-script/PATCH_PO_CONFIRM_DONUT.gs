/**
 * PATCH GudangAI — Konfirmasi PO + Donat Status PO (15 Okt 2026)
 * Tempel/ganti HANYA dua fungsi ini di Code.gs production (jangan replace seluruh file).
 * 1) getCurrentWeekPOStatus_
 * 2) recordPOArrival
 */

function getCurrentWeekPOStatus_() {
  // Read-only facade: callers on GET routes must not mutate script properties or sheets.
  const live = getStatusPO();
  if (!live || live.success !== true) return live;
  const currentWeekKey = getWeekKey_(new Date());
  if (String(live.weekKey || "") === currentWeekKey) return live;

  // Jika sheet masih berisi item aktif, JANGAN kosongkan (cegah donat/status PO kosong
  // hanya karena weekKey header tidak sama format dengan getWeekKey_ minggu ini).
  const liveItems = live.items || [];
  if (liveItems.length > 0) {
    return Object.assign({}, live, {
      weekKey: live.weekKey || currentWeekKey,
      previousWeek: live.previousWeek || getPreviousPOStatus_(),
      isCurrentWeekEmpty: false,
      activeSourceWeekKey: live.weekKey || currentWeekKey
    });
  }

  // Tidak ada item live → tampilkan minggu berjalan kosong + arsip minggu lalu.
  const emptySummary = {
    totalAktif: 0, totalKonfirmasi: 0, itemMenunggu: 0, itemSebagian: 0,
    itemSelesai: 0, totalItem: 0, totalPOQty: 0,
    totalKonfirmasiQty: 0, totalSisaQty: 0
  };
  return Object.assign({}, live, {
    noPO: null,
    tanggalPO: null,
    weekKey: currentWeekKey,
    summary: emptySummary,
    items: [],
    previousWeek: getPreviousPOStatus_(),
    isCurrentWeekEmpty: true,
    activeSourceWeekKey: live.weekKey || null
  });
}

function recordPOArrival(body) {
  body = body || {};
  const requestId = String(body.requestId || "").trim();
  const transactionId = String(body.transactionId || (requestId ? "POARR-" + requestId : "")).trim();
  const qty = parsePOQty_(body.qtyDatangBaru != null ? body.qtyDatangBaru : body.qtyDatang);
  if (!requestId) return { success: false, status: "REJECTED", code: "REQUEST_ID_REQUIRED", error: "requestId wajib untuk kedatangan PO." };
  if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) return { success: false, status: "REJECTED", code: "INVALID_QTY", error: "Qty kedatangan harus lebih dari 0 dan <= " + MAX_QTY + "." };

  const ss = getSS();
  const po = ss.getSheetByName("purchase order");
  if (!po) return { success: false, status: "REJECTED", code: "PO_SHEET_NOT_FOUND", error: "Sheet purchase order tidak ditemukan." };
  const last = po.getLastRow();
  if (last < PO_DATA_START_ROW) return { success: false, status: "REJECTED", code: "PO_EMPTY", error: "Tabel purchase order kosong." };

  const rows = po.getRange(PO_DATA_START_ROW, PO_DATA_START_COL, last - PO_DATA_START_ROW + 1, PO_DATA_NUM_COLS).getDisplayValues();
  const wantedNo = body.itemNo == null ? "" : String(body.itemNo).trim();
  const wantedName = normalizePONameKey_(body.nama || "");
  let found = null;
  rows.forEach(function(r, idx) {
    if (found) return;
    const no = String(r[0] || "").trim();
    const nama = String(r[1] || "").trim();
    if (!nama) return;
    if ((wantedNo && no === wantedNo) || (wantedName && normalizePONameKey_(nama) === wantedName)) {
      const poCV = parsePOQty_(r[4]);
      const poPT = parsePOQty_(r[5]);
      const totalH = parsePOQty_(r[6]);
      found = { row: idx + PO_DATA_START_ROW, no: no || String(idx + 1), nama: nama, poCV: poCV, poPT: poPT, total: Math.max(0, totalH > 0 ? totalH : poCV + poPT) };
    }
  });
  if (!found) return { success: false, status: "REJECTED", code: "PO_ITEM_NOT_FOUND", error: "Item PO tidak ditemukan." };

  const entityInfo = normalizeEntityGroup_(body.entitas || body.entity, body.kode || body.kodeBarang);
  let entitas = entityInfo.valid ? entityInfo.entitas : "";
  const dualAuto = !entitas && found.poCV > 0 && found.poPT > 0;
  if (!entitas) {
    if (found.poCV > 0 && found.poPT <= 0) entitas = "CV";
    else if (found.poPT > 0 && found.poCV <= 0) entitas = "PT";
    else if (dualAuto) entitas = "CV";
    else return { success: false, status: "REJECTED", code: "PO_ENTITY_REQUIRED", error: "Item PO memiliki kebutuhan CV dan PT. Pilih entitas kedatangan: CV atau PT." };
  }

  function resolveKodeForEntity_(ent, preferredKode) {
    let kode = String(preferredKode || body.kode || body.kodeBarang || "").trim();
    if (kode) {
      const stockCheck = getStockByCode(kode, ent);
      if (stockCheck && stockCheck.success) return kode;
      kode = "";
    }
    const all = getAllStock(ent);
    const candidates = all.success ? all.items.filter(function(it) { return normalizePONameKey_(it.nama) === normalizePONameKey_(found.nama); }) : [];
    if (candidates.length !== 1) return null;
    return candidates[0].kode;
  }

  function writeArrivalForEntity_(ent, qtyWrite, reqSuffix) {
    const entityPOQty = ent === "CV" ? found.poCV : found.poPT;
    if (entityPOQty <= 0) return { success: false, code: "PO_ENTITY_NOT_ELIGIBLE", error: "Item PO tidak memiliki kebutuhan " + ent + "." };
    const qtyUse = Math.min(qtyWrite, entityPOQty);
    if (qtyUse <= 0) return { success: false, code: "INVALID_QTY", error: "Qty " + ent + " tidak valid." };
    const kode = resolveKodeForEntity_(ent, body.kode || body.kodeBarang);
    if (!kode) return { success: false, code: "PO_CODE_AMBIGUOUS", error: "Kode master untuk item PO ambigu/tidak ditemukan pada " + ent + "." };
    const stock = getStockByCode(kode, ent);
    if (!stock || !stock.success) return { success: false, code: "PO_CODE_ENTITY_MISMATCH", error: "Kode item tidak cocok dengan entitas " + ent + "." };
    const rid = reqSuffix ? (requestId + reqSuffix) : requestId;
    const tid = reqSuffix ? (transactionId + reqSuffix) : transactionId;
    const tx = addTransaction({
      action: "addTransaction", operation: "addTransaction", sheet: "Barang masuk", entitas: ent, kodeBarang: kode, qty: qtyUse,
      tanggal: body.tanggal || Utilities.formatDate(new Date(), TIMEZONE, DATE_FORMAT),
      keterangan: "No : " + (getPOInfoFromHeader_(po).noPO || body.noPO || "-") + " [ITEM : " + String(found.no).padStart(2, "0") + " ]",
      requestId: rid, transactionId: tid, nonce: String(body.nonce || tid), queueApproved: true, client: body.client || {}
    });
    if (!tx || tx.success !== true || tx.writeOccurred !== true) {
      return Object.assign({}, tx || { success: false }, { code: (tx && tx.code) || "PO_ARRIVAL_WRITE_FAILED", entitas: ent, kode: kode });
    }
    return { success: true, entitas: ent, kode: kode, qty: qtyUse, transactionId: tx.transactionId, readBack: tx.readBack || null };
  }

  let applied = [];
  if (dualAuto) {
    const qtyCV = Math.min(qty, found.poCV);
    const qtyPT = Math.min(Math.max(0, qty - qtyCV), found.poPT);
    if (qtyCV > 0) {
      const rCV = writeArrivalForEntity_("CV", qtyCV, "-CV");
      if (!rCV.success) return Object.assign({ success: false, status: "REJECTED" }, rCV);
      applied.push(rCV);
    }
    if (qtyPT > 0) {
      const rPT = writeArrivalForEntity_("PT", qtyPT, "-PT");
      if (!rPT.success) return Object.assign({ success: false, status: "REJECTED", partial: applied }, rPT);
      applied.push(rPT);
    }
  } else {
    const r = writeArrivalForEntity_(entitas, qty, "");
    if (!r.success) return Object.assign({ success: false, status: "REJECTED" }, r);
    applied.push(r);
  }

  try {
    if (typeof dashboardRefreshPOSectionLight_ === "function") {
      dashboardRefreshPOSectionLight_();
    } else if (typeof refreshDashboardPOSection_ === "function") {
      refreshDashboardPOSection_({ renderCharts: false, lightweight: true });
    }
  } catch (dashErr) {
    console.error("recordPOArrival dashboard refresh: " + (dashErr && dashErr.message));
  }

  const totalQty = applied.reduce(function(s, x) { return s + (Number(x.qty) || 0); }, 0);
  return {
    success: true,
    status: "APPLIED",
    code: "PO_ARRIVAL_APPLIED",
    itemNo: found.no,
    nama: found.nama,
    qtyDatangBaru: totalQty,
    applied: applied,
    transactionId: applied[0] && applied[0].transactionId,
    message: "Kedatangan PO tercatat sebagai Barang masuk (" + applied.map(function(x) { return x.entitas + ":" + x.qty; }).join(", ") + ")."
  };
}
