/**
 * Tambahkan ke Code.gs 6.4.x — action createPO
 * Sheet target: Purchase Order
 */
function handleCreatePO(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Purchase Order');
  if (!sh) {
    sh = ss.insertSheet('Purchase Order');
    sh.appendRow(['Timestamp','Entity','POType','Week','Kode','Nama','Qty','Satuan','Divisi','Keterangan','Note']);
  }
  var items = body.items || [];
  var now = new Date();
  items.forEach(function(it) {
    sh.appendRow([
      now,
      body.entity || '',
      body.poType || '',
      body.weekLabel || '',
      it.kode || '',
      it.nama || '',
      it.qty || 0,
      it.satuan || '',
      it.divisi || '',
      it.keterangan || '',
      body.note || ''
    ]);
  });
  return { success: true, written: items.length, message: 'PO written ' + items.length + ' rows' };
}
// Di doPost: case 'createPO': return json(handleCreatePO(body));
