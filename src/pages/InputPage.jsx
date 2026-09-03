import { useMemo, useState } from 'react';
import { PackagePlus, Search } from 'lucide-react';
import { useStock } from '../hooks/useStock';

export default function InputPage() {
  const { items, loading } = useStock('CV');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState('');

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items.slice(0, 8);
    return items
      .filter((item) => `${item.kode} ${item.nama}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [items, search]);

  return (
    <section className="space-y-4" aria-labelledby="input-title">
      <header className="flex items-center gap-3">
        <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
          <PackagePlus className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Persediaan</p>
          <h1 id="input-title" className="text-xl font-bold text-slate-800">Input barang masuk</h1>
        </div>
      </header>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="stock-search" className="text-sm font-semibold text-slate-700">Pilih barang</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            id="stock-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari kode atau nama barang"
            className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        {loading ? (
          <p className="py-3 text-sm text-slate-500">Memuat daftar barang…</p>
        ) : filteredItems.length > 0 ? (
          <div className="space-y-2" role="listbox" aria-label="Daftar barang">
            {filteredItems.map((item) => (
              <button
                key={item.kode}
                type="button"
                onClick={() => setSelected(item)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${selected?.kode === item.kode ? 'border-emerald-400 bg-emerald-50' : 'border-slate-100 bg-slate-50 hover:border-emerald-200'}`}
              >
                <span className="block text-xs font-mono text-slate-400">{item.kode}</span>
                <span className="block text-sm font-semibold text-slate-800">{item.nama}</span>
                <span className="block text-xs text-slate-500">Stok saat ini: {item.stok} {item.satuan}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="py-3 text-sm text-slate-500">Barang tidak ditemukan.</p>
        )}
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="quantity" className="text-sm font-semibold text-slate-700">Jumlah barang masuk</label>
        <input
          id="quantity"
          type="number"
          min="1"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          placeholder="Masukkan jumlah"
          className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        />
        <button type="button" disabled={!selected || !quantity} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
          Simpan input
        </button>
      </div>
    </section>
  );
}
