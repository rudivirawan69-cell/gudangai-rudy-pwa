import { useState, useMemo } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { useStock } from '../hooks/useStock';

function levelOf(stok) {
  const n = Number(stok) || 0;
  if (n === 0) return 'zero';
  if (n <= 5) return 'danger';
  if (n <= 20) return 'warning';
  return 'safe';
}

function StockCard({ item }) {
  const qty = Number(item.stok ?? item.stockAkhir ?? item.sisa ?? 0) || 0;
  const level = levelOf(qty);
  const border = {
    safe: 'border-l-emerald-500',
    warning: 'border-l-amber-400',
    danger: 'border-l-red-500',
    zero: 'border-l-slate-300',
  }[level];
  const numColor = {
    safe: 'text-slate-900',
    warning: 'text-amber-600',
    danger: 'text-red-600',
    zero: 'text-slate-400',
  }[level];

  return (
    <div className={`rounded-2xl bg-white border border-slate-200 shadow-sm border-l-4 ${border} px-3 py-3`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-slate-400 font-mono font-medium truncate">{item.kode}</p>
          <p className="text-[13px] font-bold text-slate-900 truncate leading-tight mt-0.5">{item.nama}</p>
          <p className="text-[11px] text-slate-500 mt-1 font-medium truncate">{item.divisi || '—'} · {item.satuan || 'Pack'}</p>
        </div>
        <div className="shrink-0 text-right w-16">
          <p className={`text-xl font-extrabold tabular-nums leading-none ${numColor}`}>{qty.toLocaleString('id-ID')}</p>
          <p className="text-[9px] text-slate-400 mt-0.5 font-semibold uppercase">sisa</p>
        </div>
      </div>
    </div>
  );
}

export default function StokPage() {
  const { items, loading, error, refresh } = useStock();
  const [entity, setEntity] = useState('CV');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [divisi, setDivisi] = useState('Semua');
  const [dense, setDense] = useState(() => {
    try { return localStorage.getItem('gudangai_density') === 'compact'; } catch { return false; }
  });

  const entityItems = useMemo(
    () => (items || []).filter((it) => (it.entity || it.entitas || 'CV') === entity),
    [items, entity]
  );

  const divisions = useMemo(() => {
    const set = new Set();
    entityItems.forEach((it) => { if (it.divisi) set.add(it.divisi); });
    return ['Semua', ...Array.from(set).sort()];
  }, [entityItems]);

  // Stats dari item entity aktif (bukan seluruh CV+PT)
  const stats = useMemo(() => {
    let aman = 0, waspada = 0, kritis = 0, habis = 0;
    entityItems.forEach((it) => {
      const n = Number(it.stok ?? it.stockAkhir ?? 0) || 0;
      const l = levelOf(n);
      if (l === 'safe') aman += 1;
      else if (l === 'warning') waspada += 1;
      else if (l === 'danger') kritis += 1;
      else habis += 1;
    });
    return {
      total: entityItems.length,
      aman,
      waspada,
      kritis,
      habis,
    };
  }, [entityItems]);

  const filtered = useMemo(() => {
    let list = entityItems;
    if (divisi !== 'Semua') list = list.filter((it) => it.divisi === divisi);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((it) =>
        (it.kode || '').toLowerCase().includes(q) || (it.nama || '').toLowerCase().includes(q)
      );
    }
    if (filterStatus === 'aman') list = list.filter((it) => levelOf(it.stok ?? it.stockAkhir) === 'safe');
    if (filterStatus === 'menipis') list = list.filter((it) => levelOf(it.stok ?? it.stockAkhir) === 'warning');
    if (filterStatus === 'kritis') {
      list = list.filter((it) => {
        const l = levelOf(it.stok ?? it.stockAkhir);
        return l === 'danger' || l === 'zero';
      });
    }
    return list;
  }, [entityItems, divisi, search, filterStatus]);

  const topStats = [
    { key: 'total', label: 'TOTAL', value: stats.total, color: 'text-slate-900', border: 'border-slate-200', filter: 'all' },
    { key: 'aman', label: 'AMAN', value: stats.aman, color: 'text-emerald-600', border: 'border-emerald-200', filter: 'aman' },
    { key: 'menipis', label: 'MENIPIS', value: stats.waspada, color: 'text-amber-600', border: 'border-amber-200', filter: 'menipis' },
    { key: 'kritis', label: 'KRITIS', value: stats.kritis + stats.habis, color: 'text-red-600', border: 'border-red-200', filter: 'kritis' },
  ];

  return (
    <div className="pb-28 animate-fade-in space-y-3.5 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <h1 className="text-xl font-extrabold text-white drop-shadow-sm">Stok</h1>
        <button
          type="button"
          onClick={() => {
            const next = !dense;
            setDense(next);
            try { localStorage.setItem('gudangai_density', next ? 'compact' : 'comfortable'); } catch (_) {}
          }}
          className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 shadow-sm shrink-0"
        >
          {dense ? 'Grid padat' : 'Grid longgar'}
        </button>
      </div>

      {/* CV / PT */}
      <div className="flex rounded-2xl bg-white p-1 shadow-sm border border-slate-200">
        {['CV', 'PT'].map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => { setEntity(e); setDivisi('Semua'); setFilterStatus('all'); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              entity === e ? 'bg-cyan-600 text-white shadow' : 'text-slate-500'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Stats 4 kolom sejajar — grid agar tidak terpotong */}
      <div className="grid grid-cols-4 gap-1.5">
        {topStats.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setFilterStatus(s.filter)}
            className={`rounded-xl bg-white border ${s.border} px-1 py-2.5 text-center shadow-sm min-w-0 ${
              filterStatus === s.filter ? 'ring-2 ring-cyan-400' : ''
            }`}
          >
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wide truncate">{s.label}</p>
            <p className={`text-[15px] font-extrabold tabular-nums leading-tight mt-0.5 ${s.color}`}>{s.value}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari kode / nama…"
          className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 shadow-sm"
        />
      </div>

      {/* Divisi chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
        {divisions.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDivisi(d)}
            className={`chip-btn shrink-0 ${divisi === d ? 'is-active' : ''}`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Count + refresh */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-300 font-medium">{filtered.length} item · {entity}</p>
        <button
          type="button"
          onClick={() => refresh?.({ force: true })}
          className="p-2 rounded-full bg-white border border-slate-200 shadow-sm"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {/* List */}
      <div className={dense ? 'space-y-1.5' : 'space-y-2.5'}>
        {loading && !filtered.length && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 skeleton" />)}
          </div>
        )}
        {filtered.map((item) => (
          <StockCard key={(item.kode || '') + (item.entity || '')} item={item} />
        ))}
        {!loading && !filtered.length && (
          <p className="text-center text-sm text-slate-400 py-10">Tidak ada item</p>
        )}
      </div>
    </div>
  );
}
