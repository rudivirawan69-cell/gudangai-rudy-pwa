/**
 * ============================================================
 * PATCH MINIMAL — Hormati tanggal dari PWA
 * Target: Code.gs V6.6.5+BULK-STABLE (tempel di BAWAH, atau
 * ganti HANYA fungsi helper tanggal yang menimpa payload)
 * ============================================================
 *
 * Masalah: tanggal yang dipilih user di PWA (mis. 02/10/2026)
 * kadang diganti jadi tanggal server / hari ini.
 *
 * Perbaikan: satu helper yang WAJIB dipakai sebelum write
 * transaksi. Tidak menyentuh bulk logic, stock, atau PO.
 *
 * Cara pakai:
 * 1. Tempel fungsi resolveTanggalDariPwa_ di bawah Code.gs
 * 2. Di setiap titik write transaksi (addTransaction /
 *    bulkTransaction / addTransactionBatch), ganti
 *    pengambilan tanggal menjadi:
 *      var tanggal = resolveTanggalDariPwa_(body || payload);
 * 3. Jangan pakai new Date() / Utilities.formatDate(new Date())
 *    sebagai sumber tanggal transaksi.
 * 4. Save → Deploy New version
 * ============================================================
 */

/**
 * Ambil tanggal dari payload PWA.
 * Format diterima: yyyy-mm-dd | dd/mm/yyyy | dd-mm-yyyy
 * Jika valid → kembalikan yyyy-mm-dd.
 * Jika kosong/invalid → baru fallback ke hari ini (timezone script).
 */
function resolveTanggalDariPwa_(body) {
  body = body || {};
  var raw = String(body.tanggal || body.date || body.tgl || '').trim();
  if (!raw) {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
  }
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // dd/mm/yyyy atau dd-mm-yyyy
  var m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    var dd = ('0' + m[1]).slice(-2);
    var mm = ('0' + m[2]).slice(-2);
    return m[3] + '-' + mm + '-' + dd;
  }
  // fallback parse
  var d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
  }
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
}
