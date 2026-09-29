import { useState, useMemo, useEffect } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { useStock } from '../hooks/useStock';

function levelOf(stok) {
  if (stok === 0) return 'zero';
  if (stok <= 5) return 'danger';
  if (stok <= 20) return 'warning';
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
    <div className={`rounded-2xl bg-white border border-slate-200 shadow-sm border-l-4 ${border} px-3 py-2.5`}>
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-slate-400 font-mono font-medium truncate">{item.kode}</p>
          <p className="text-[13px] font-bold text-slate-900 truncate leading-tight mt-0.5">{item.nama}</p>
          <p className="text-[11px] text-slate-500 mt-1 font-medium truncate">{item.divisi || '—'} · {item.satuan || 'Pack'}</p>
        </div>
        <div className="text-right shrink-0 pl-1">
          <p className={`text-xl font-extrabold tabular-nums leading-none ${numColor}`}>{qty}</p>
          <p className="text-[9px] text-slate-400 mt-0.5 font-medium">sisa</p>
        </div>
      </div>
    </div>
  );
}

export default function StokPage() {
  const { items, loading, error, refresh, getStats } = useStock();
  const [entity, setEntity] = useState('CV');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [divisi, setDivisi] = useState('Semua');
  const [dense, setDense] = useState(() => {
    try { return localStorage.getItem('gudangai_density') === 'compact'; } catch { return false; }
  });

  const stats = useMemo(() => {
    try { return getStats(); } catch { return { total: 0, aman: 0, waspada: 0, kritis: 0, habis: 0 }; }
  }, [getStats, items]);

  const divisions = useMemo(() => {
    const set = new Set();
    (items || []).forEach((it) => { if (it.divisi) set.add(it.divisi); });
    return ['Semua', ...Array.from(set).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    let list = (items || []).filter((it) => (it.entity || it.entitas || 'CV') === entity);
    if (divisi !== 'Semua') list = list.filter((it) => it.divisi === divisi);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((it) => (it.kode || '').toLowerCase().includes(q) || (it.nama || '').toLowerCase().includes(q));
    }
    if (filterStatus === 'aman') list = list.filter((it) => levelOf(Number(it.stok ?? it.stockAkhir ?? 0) || 0) === 'safe');
    if (filterStatus === 'menipis') list = list.filter((it) => levelOf(Number(it.stok ?? it.stockAkhir ?? 0) || 0) === 'warning');
    if (filterStatus === 'kritis') list = list.filter((it) => {
      const l = levelOf(Number(it.stok ?? it.stockAkhir ?? 0) || 0);
      return l === 'danger' || l === 'zero';
    });
    return list;
  }, [items, entity, divisi, search, filterStatus]);

  const topStats = [
    { key: 'total', label: 'TOTAL', value: stats.total ?? items?.length ?? 0, color: 'text-slate-900', border: 'border-slate-200', filter: 'all' },
    { key: 'aman', label: 'AMAN', value: stats.aman ?? 0, color: 'text-emerald-600', border: 'border-emerald-200', filter: 'aman' },
    { key: 'menipis', label: 'MENIPIS', value: stats.waspada ?? 0, color: 'text-amber-600', border: 'border-amber-200', filter: 'menipis' },
    { key: 'kritis', label: 'KRITIS', value: (stats.kritis ?? 0) + (stats.habis ?? 0), color: 'text-red-600', border: 'border-red-200', filter: 'kritis' },
  ];

  return (
    <div className="pb-28 animate-fade-in space-y-3 overflow-x-hidden">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-white drop-shadow-sm">Stok</h1>
      </div>

      <div className="flex rounded-2xl bg-white/95 p-1 shadow-sm border border-slate-200">
        {['CV', 'PT'].map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEntity(e)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              entity === e
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-500'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        {topStats.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setFilterStatus(s.filter)}
            className={`flex-1 min-w-0 rounded-xl bg-white border ${s.border} px-1.5 py-2 text-center shadow-sm ${
              filterStatus === s.filter ? 'ring-2 ring-cyan-400' : ''
            }`}
          >
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wide truncate">{s.label}</p>
            <p className={`text-base font-extrabold tabular-nums leading-tight ${s.color}`}>{s.value}</p>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari kode / nama…"
          className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 shadow-sm"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
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

      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] text-slate-300 font-medium">{filtered.length} item · {entity}</p>
        <button type="button" onClick={() => refresh?.()} className="p-2 rounded-full bg-white/90 border border-slate-200 shadow-sm" aria-label="Refresh">
          <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      <div className={`space-y-${dense ? '1.5' : '2.5'}`}>
        {loading && !filtered.length && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 skeleton" />)}
          </div>
        )}
        {filtered.map((item) => (
          <StockCard key={item.kode + (item.entity || '')} item={item} />
        ))}
        {!loading && !filtered.length && (
          <p className="text-center text-sm text-slate-400 py-10">Tidak ada item</p>
        )}
      </div>
    </div>
  );
}
