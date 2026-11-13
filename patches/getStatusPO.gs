function getStatusPO(body) {
  body = body || {};
  const ss = getSS();
  const po = ss.getSheetByName('purchase order');
  const masuk = ss.getSheetByName('Barang masuk');
  if (!po) return { success: false, status: 'ERROR', code: 'PO_SHEET_NOT_FOUND', error: "Sheet 'purchase order' tidak ditemukan" };
  if (!masuk) return { success: false, status: 'ERROR', code: 'INBOUND_SHEET_NOT_FOUND', error: "Sheet 'Barang masuk' tidak ditemukan" };

  const periodFrom = String(body.from || body.periodFrom || '').trim();
  const periodTo = String(body.to || body.periodTo || '').trim();
  let rangeStart = null, rangeEnd = null;
  if (periodFrom) {
    const p = periodFrom.split('-');
    if (p.length === 3) rangeStart = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 0, 0, 0);
  }
  if (periodTo) {
    const p = periodTo.split('-');
    if (p.length === 3) rangeEnd = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 23, 59, 59);
  }

  const info = getPOInfoFromHeader_(po);
  const noPO = info.noPO;
  const tanggalPO = info.tanggal || null;
  const last = po.getLastRow();
  const rows = last >= PO_DATA_START_ROW
    ? po.getRange(PO_DATA_START_ROW, PO_DATA_START_COL, last - PO_DATA_START_ROW + 1, PO_DATA_NUM_COLS).getDisplayValues()
    : [];
  const allStockForPO_ = getAllStock("ALL").items || [];

  const arrivalsByIndex = {};
  const arrivalsByName = {};
  if (masuk.getLastRow() >= 4) {
    const a = masuk.getRange(4, 2, masuk.getLastRow() - 3, 6).getDisplayValues();
    const safeNoPO = noPO ? String(noPO).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
    const reIndex = safeNoPO
      ? new RegExp('No\\s*:?\\s*' + safeNoPO + '\\s*\\[\\s*ITEM\\s*:\\s*([0-9]+)\\s*\\]', 'i')
      : null;
    a.forEach(function(r) {
      const tglRaw = r[0];
      const qty = Math.max(0, toNumber_(r[4]));
      const ket = String(r[5] || '').trim();
      const namaMasuk = String(r[2] || '').trim();
      if (qty <= 0) return;
      const ketUp = ket.toUpperCase();
      if (ketUp.indexOf('RETUR') >= 0) return;
      if (/^DARI\\b/.test(ketUp) || /^DARI\\s/.test(ketUp)) return;
      if (tanggalPO) {
        const dMasuk = parseTransactionDate_(tglRaw);
        if (dMasuk && dMasuk instanceof Date && !isNaN(dMasuk.getTime())) {
          const poDay = new Date(tanggalPO.getFullYear(), tanggalPO.getMonth(), tanggalPO.getDate());
          const mDay = new Date(dMasuk.getFullYear(), dMasuk.getMonth(), dMasuk.getDate());
          if (mDay < poDay) return;
        }
      }
      if (reIndex && ket) {
        const m = ket.match(reIndex);
        if (m) {
          const idx = Number(m[1]);
          if (idx > 0) {
            arrivalsByIndex[idx] = (arrivalsByIndex[idx] || 0) + qty;
            return;
          }
        }
      }
      if (noPO && ket && ket.toLowerCase().indexOf(String(noPO).toLowerCase()) < 0) return;
      if (namaMasuk) {
        const key = normalizePONameKey_(namaMasuk);
        if (key) arrivalsByName[key] = (arrivalsByName[key] || 0) + qty;
      }
    });
  }

  const items = [];
  const tertundaItems = [];
  let totalAktif = 0, totalKonfirmasi = 0, itemMenunggu = 0, itemSebagian = 0, itemSelesai = 0;
  let totalKonfirmasiQty = 0, totalPOQty = 0;
  let qtyMenunggu = 0, qtySebagian = 0, qtySelesai = 0;

  rows.forEach(function(r, idx) {
    if (!String(r.join('')).trim()) return;
    const no = toNumber_(r[0]) || (idx + 1);
    const nama = String(r[1] || '').trim();
    const poCV = toNumber_(r[4]);
    const poPT = toNumber_(r[5]);
    const total = Math.max(0, toNumber_(r[6]) || poCV + poPT);
    if (!nama || total <= 0) return;
    const byIndex = arrivalsByIndex[no] || 0;
    const byName = arrivalsByName[normalizePONameKey_(nama)] || 0;
    const datang = Math.min(total, Math.max(0, byIndex > 0 ? byIndex : byName));
    const belumDatang = Math.max(0, total - datang);
    const status = datang <= 0 ? 'MENUNGGU' : (datang < total ? 'SEBAGIAN' : 'SELESAI');
    const cvCandidates = allStockForPO_.filter(function(it) { return it.entitas === "CV" && normalizePONameKey_(it.nama) === normalizePONameKey_(nama); });
    const ptCandidates = allStockForPO_.filter(function(it) { return it.entitas === "PT" && normalizePONameKey_(it.nama) === normalizePONameKey_(nama); });
    const item = {
      no: no, itemNo: no, nama: nama, totalPO: total, qtyPO: total, poCV: poCV, poPT: poPT,
      kodeCV: cvCandidates.length === 1 ? cvCandidates[0].kode : null,
      kodePT: ptCandidates.length === 1 ? ptCandidates[0].kode : null,
      qtyDatang: datang, qtyBelumDatang: belumDatang, status: status,
      tanggalPO: tanggalPO ? Utilities.formatDate(tanggalPO, TIMEZONE, 'yyyy-MM-dd') : (info.tanggalText || null),
      kodeUnik: noPO ? ('No : ' + noPO + '[ ITEM : ' + String(no).padStart(2, '0') + ' ]') : null,
      progressPct: total ? Math.min(100, Math.round(datang / total * 1000) / 10) : 0
    };

    let inPeriod = true;
    if (rangeStart || rangeEnd) {
      const tItem = tanggalPO;
      if (tItem) {
        if (rangeStart && tItem < rangeStart) inPeriod = false;
        if (rangeEnd && tItem > rangeEnd) inPeriod = false;
      }
    }

    if (!inPeriod) {
      if (status === 'MENUNGGU' || status === 'SEBAGIAN') {
        const ageDays = tanggalPO ? Math.max(0, Math.floor((new Date() - tanggalPO) / 86400000)) : 0;
        tertundaItems.push(Object.assign({}, item, { umurHari: ageDays }));
      }
      return;
    }

    totalPOQty += total;
    totalKonfirmasiQty += datang;
    if (status === 'SELESAI') { itemSelesai++; totalKonfirmasi++; qtySelesai += datang; }
    else if (status === 'SEBAGIAN') { itemSebagian++; totalAktif++; qtySebagian += datang; qtyMenunggu += belumDatang; }
    else { itemMenunggu++; totalAktif++; qtyMenunggu += belumDatang; }
    items.push(item);
  });

  tertundaItems.sort(function(a, b) { return (b.umurHari || 0) - (a.umurHari || 0); });

  const minggu = info.weekKey || null;
  const diambilPada = new Date().toISOString();

  return {
    success: true, status: 'OK', timestamp: diambilPada, diambilPada: diambilPada,
    noPO: noPO,
    tanggalPO: tanggalPO ? Utilities.formatDate(tanggalPO, TIMEZONE, 'yyyy-MM-dd') : (info.tanggalText || null),
    weekKey: minggu,
    periode: {
      from: periodFrom || (tanggalPO ? Utilities.formatDate(tanggalPO, TIMEZONE, 'yyyy-MM-dd') : null),
      to: periodTo || null,
      minggu: minggu
    },
    sumber: "purchase order + Barang masuk (aturan Dashboard Live: exclude RETUR/DARI, sejak Tanggal PO)",
    ringkasan: {
      menunggu: itemMenunggu, sebagian: itemSebagian, selesai: itemSelesai,
      qtyMenunggu: qtyMenunggu, qtySebagian: qtySebagian, qtySelesai: qtySelesai
    },
    summary: {
      totalAktif: totalAktif, totalKonfirmasi: totalKonfirmasi,
      itemMenunggu: itemMenunggu, itemSebagian: itemSebagian, itemSelesai: itemSelesai,
      totalItem: items.length,
      totalPOQty: totalPOQty, totalKonfirmasiQty: totalKonfirmasiQty,
      totalSisaQty: Math.max(0, totalPOQty - totalKonfirmasiQty)
    },
    items: items,
    tertunda: {
      totalItem: tertundaItems.length,
      items: tertundaItems
    }
  };
}
