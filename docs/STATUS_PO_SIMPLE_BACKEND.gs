/**
 * ============================================================
 * STATUS PO SEDERHANA — V6.6.6+SIMPLE
 * Tempel fungsi ini di BAWAH Code.gs (setelah semua kode valid).
 * Tidak bentrok dengan transaksi. Tidak membuat chart.
 * ============================================================
 *
 * Cara pakai:
 * 1. Pastikan Code.gs sudah bisa di-Save (nonaktifkan fungsi rusak dengan // ).
 * 2. Tempel seluruh isi file ini di paling bawah.
 * 3. Save → Deploy New version.
 * 4. Di PWA tekan tombol Konfirmasi / Datang pada item PO.
 * ============================================================
 */

/**
 * getStatusPO — versi sederhana
 * Membaca sheet purchase order.
 * Status default MENUNGGU.
 * Kolom J = status, Kolom K = qtyDatang (ditulis oleh confirmPOStatus).
 */
function getStatusPO() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var poSheet = ss.getSheetByName('purchase order') ||
                  ss.getSheetByName('Purchase Order') ||
                  ss.getSheetByName('Purchase order');
    if (!poSheet) {
      return { success: false, error: 'Sheet purchase order tidak ditemukan' };
    }

    var lastRow = Math.max(poSheet.getLastRow(), 6);
    if (lastRow < 6) {
      return { success: true, items: [], summary: { totalItem: 0, itemMenunggu: 0, itemSebagian: 0, itemSelesai: 0 } };
    }

    var data = poSheet.getRange(6, 2, lastRow, 11).getValues(); // B s/d K
    var items = [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var no = row[0];
      var nama = String(row[1] || '').trim();
      if (!nama) continue;

      var totalQty = Number(row[6]) || 0;     // H TOTAL
      var tgl = row[7];                       // I TGL
      var statusCell = String(row[8] || '').toUpperCase(); // J
      var qtyDatang = Number(row[9]) || 0;    // K

      var status = 'MENUNGGU';
      if (qtyDatang >= totalQty && totalQty > 0) status = 'SELESAI';
      else if (qtyDatang > 0) status = 'SEBAGIAN';
      else if (statusCell.indexOf('SELESAI') >= 0 || statusCell.indexOf('DATANG') >= 0) status = 'SELESAI';
      else if (statusCell.indexOf('SEBAGIAN') >= 0) status = 'SEBAGIAN';

      items.push({
        itemNo: no || (i + 1),
        nama: nama,
        size: String(row[2] || ''),
        satuan: String(row[3] || 'Pack'),
        qtyPO: totalQty,
        qtyDatang: qtyDatang,
        tglKedatangan: tgl,
        status: status
      });
    }

    var menunggu = 0, sebagian = 0, selesai = 0;
    items.forEach(function(it) {
      if (it.status === 'SELESAI') selesai++;
      else if (it.status === 'SEBAGIAN') sebagian++;
      else menunggu++;
    });

    return {
      success: true,
      items: items,
      summary: {
        totalItem: items.length,
        itemMenunggu: menunggu,
        itemSebagian: sebagian,
        itemSelesai: selesai
      }
    };
  } catch (err) {
    return { success: false, error: String(err.message || err) };
  }
}

/**
 * confirmPOStatus — dipanggil dari tombol Konfirmasi di PWA
 * Hanya update kolom J (status) dan K (qtyDatang).
 */
function confirmPOStatus(body) {
  try {
    body = body || {};
    var itemNo = body.itemNo;
    var nama = String(body.nama || '').trim();
    var qtyDatang = Number(body.qtyDatang) || 0;
    var status = String(body.status || 'SELESAI').toUpperCase();

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var poSheet = ss.getSheetByName('purchase order') ||
                  ss.getSheetByName('Purchase Order') ||
                  ss.getSheetByName('Purchase order');
    if (!poSheet) {
      return { success: false, error: 'Sheet purchase order tidak ditemukan' };
    }

    var lastRow = Math.max(poSheet.getLastRow(), 6);
    var data = poSheet.getRange(6, 2, lastRow, 3).getValues(); // B=NO, C=NAMA

    for (var i = 0; i < data.length; i++) {
      var no = data[i][0];
      var nm = String(data[i][1] || '').trim();
      if ((itemNo && String(no) === String(itemNo)) ||
          (nama && nm.toLowerCase() === nama.toLowerCase())) {

        poSheet.getRange(i + 6, 10).setValue(status);     // J
        poSheet.getRange(i + 6, 11).setValue(qtyDatang);  // K
        SpreadsheetApp.flush();

        return {
          success: true,
          status: 'APPLIED',
          itemNo: no,
          nama: nm,
          qtyDatang: qtyDatang
        };
      }
    }

    return { success: false, error: 'Item PO tidak ditemukan' };
  } catch (err) {
    return { success: false, error: String(err.message || err) };
  }
}

/** Alias agar route_ yang memanggil confirmPOStatus_ juga jalan */
function confirmPOStatus_(body) {
  return confirmPOStatus(body);
}
