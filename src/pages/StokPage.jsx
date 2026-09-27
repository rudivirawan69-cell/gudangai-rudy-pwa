import { useState, useMemo } from 'react';
import { useStock } from '../hooks/useStock';
import { DIVISIONS } from '../data/master';
import {
  Package, RefreshCw, Search, AlertTriangle,
  CheckCircle2, XCircle,
} from 'lucide-react';

function levelOf(stok) {
  if (stok === 0) return 'zero';
  if (stok <= 5) return 'danger';
  if (stok <= 20) return 'warning';
  return 'safe';
}

function StockCard({ item }) {
  const level = levelOf(Number(item.stok) || 0);
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
  const badge = {
    safe: <span className="chip-safe text-[10px] px-2 py-0.5 rounded-full font-bold">Aman</span>,
    warning: <span className="chip-warning text-[10px] px-2 py-0.5 rounded-full font-bold">Menipis</span>,
    danger: <span className="chip-danger text-[10px] px-2 py-0.5 rounded-full font-bold">Kritis</span>,
    zero: <span className="chip-zero text-[10px] px-2 py-0.5 rounded-full font-bold">Habis</span>,
  }[level];

  return (
    <div className={`stock-card border-l-4 ${border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-slate-400 font-mono font-medium">{item.kode}</p>
          <p className="text-[13px] font-bold text-slate-900 truncate leading-tight mt-0.5">{item.nama}</p>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">{item.divisi} · {item.satuan}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-2xl font-extrabold tabular-nums leading-none ${numColor}`}>{item.stok}</p>
          <div className="mt-1 flex justify-end">{badge}</div>
        </div>
      </div>
    </div>
  );
}

export default function StokPage() {
  const [entity, setEntity] = useState('CV');
  const [search, setSearch] = useState('');
  const [filterDiv, setFilterDiv] = useState('Semua');
  const [filterStatus, setFilterStatus] = useState('Semua');
  const { items, loading, refresh, lastRefresh, getStats } = useStock(entity);

  const stats = useMemo(() => {
    try { return getStats(); } catch { return { total: 0, aman: 0, waspada: 0, kritis: 0, habis: 0 }; }
  }, [getStats, items]);

  const filtered = useMemo(() => {
    let list = items || [];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) => String(i.kode || '').toLowerCase().includes(q) || String(i.nama || '').toLowerCase().includes(q)
      );
    }
    if (filterDiv !== 'Semua') list = list.filter((i) => i.divisi === filterDiv);
    if (filterStatus !== 'Semua') {
      if (filterStatus === 'Kritis') list = list.filter((i) => i.stok > 0 && i.stok <= 5);
      if (filterStatus === 'Menipis') list = list.filter((i) => i.stok > 5 && i.stok <= 20);
      if (filterStatus === 'Aman') list = list.filter((i) => i.stok > 20);
      if (filterStatus === 'Habis') list = list.filter((i) => i.stok === 0);
    }
    return list;
  }, [items, search, filterDiv, filterStatus]);

  const divisions = ['Semua', ...DIVISIONS];
  const statusFilters = [
    { id: 'Semua', label: 'Semua', icon: Package },
    { id: 'Aman', label: 'Aman', icon: CheckCircle2 },
    { id: 'Menipis', label: 'Menipis', icon: AlertTriangle },
    { id: 'Kritis', label: 'Kritis', icon: XCircle },
    { id: 'Habis', label: 'Habis', icon: XCircle },
  ];

  const topStats = [
    { key: 'total', label: 'TOTAL', value: stats.total ?? items?.length ?? 0, color: 'text-slate-900', border: 'border-slate-100', filter: 'Semua' },
    { key: 'aman', label: 'AMAN', value: stats.safe ?? stats.aman ?? 0, color: 'text-emerald-600', border: 'border-emerald-100', filter: 'Aman' },
    { key: 'menipis', label: 'MENIPIS', value: stats.warning ?? stats.waspada ?? 0, color: 'text-amber-600', border: 'border-amber-100', filter: 'Menipis' },
    { key: 'kritis', label: 'KRITIS', value: (stats.danger ?? stats.kritis ?? 0) + (stats.zero ?? 0), color: 'text-red-600', border: 'border-red-100', filter: 'Kritis' },
  ];

  return (
    <div className="pb-4 animate-fade-in space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {['CV', 'PT'].map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEntity(e)}
            className={`pressable py-2.5 rounded-2xl text-sm font-bold border shadow-sm transition-colors ${
              entity === e
                ? 'bg-cyan-600 text-white border-cyan-600'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {topStats.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setFilterStatus(s.filter)}
            className={`stat-tile p-2.5 text-center border ${s.border} ${
              filterStatus === s.filter ? 'is-active' : ''
            }`}
          >
            <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">{s.label}</p>
            <p className={`text-xl font-extrabold tabular-nums leading-tight mt-0.5 ${s.color}`}>
              {loading ? '…' : s.value}
            </p>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari kode atau nama barang…"
          className="form-control w-full pl-10 pr-4 py-3 text-sm font-medium shadow-sm"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
        {divisions.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setFilterDiv(d)}
            className={`chip-btn shrink-0 ${filterDiv === d ? 'is-active' : ''}`}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto flex-1">
          {statusFilters.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setFilterStatus(s.id)}
              className={`chip-btn shrink-0 ${filterStatus === s.id ? 'is-active' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => refresh?.()}
          className="pressable w-9 h-9 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 shrink-0"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium px-0.5">
        <span>{filtered.length} item ditampilkan</span>
        {lastRefresh && <span className="tabular-nums">Update {new Date(lastRefresh).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-[72px] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm py-12 text-center">
          <Package className="w-11 h-11 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm font-medium">Tidak ada item ditemukan</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <StockCard key={item.kode + (item.entitas || '')} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
