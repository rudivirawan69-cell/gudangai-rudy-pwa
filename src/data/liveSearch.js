/** Search live stock items from September spreadsheet (via useStock / fetchStock). */
export function searchLiveStock(items, query) {
  const list = Array.isArray(items) ? items : [];
  const q = String(query || '').trim().toLowerCase();
  const filtered = !q
    ? list
    : list.filter((it) => {
        const blob = `${it.kode || ''} ${it.nama || ''} ${it.divisi || ''} ${it.satuan || ''}`.toLowerCase();
        return blob.includes(q) || String(it.kode || '').toLowerCase().startsWith(q);
      });
  return filtered
    .slice()
    .sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id'))
    .map((it) => ({
      kode: it.kode,
      nama: it.nama,
      satuan: it.satuan || 'Pack',
      divisi: it.divisi || '',
      stok: it.stok,
    }));
}
