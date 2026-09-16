import { useState, useMemo } from 'react';
import { useStock } from '../hooks/useStock';
import { DIVISIONS } from '../data/master';
import {
  Package, RefreshCw, Search, AlertTriangle,
  CheckCircle2, XCircle, Filter
} from 'lucide-react';

function StockCard({ item }) {
  const level = item.stok === 0 ? 'zero' : item.stok <= 5 ? 'danger' : item.stok <= 20 ? 'warning' : 'safe';
  const colors = {
    safe: 'border-l-emerald-500 bg-white',
    warning: 'border-l-amber-400 bg-amber-50/50',
    danger: 'border-l-red-500 bg-red-50/50',
    zero: 'border-l-gray-300 bg-gray-50/50',
  };
  const badges = {
    safe: <span className="chip-safe text-[10px] px-2 py-0.5 rounded-full font-medium">Aman</span>,
    warning: <span className="chip-warning text-[10px] px-2 py-0.5 rounded-full font-medium">Menipis</span>,
    danger: <span className="chip-danger text-[10px] px-2 py-0.5 rounded-full font-medium">Kritis</span>,
    zero: <span className="chip-zero text-[10px] px-2 py-0.5 rounded-full font-medium">Habis</span>,
  };

  return (
    <div className={`border-l-4 ${colors[level]} rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 font-mono">{item.kode}</p>
          <p className="text-sm font-semibold text-gray-800 truncate leading-tight mt-0.5">{item.nama}</p>
          <p className="text-[11px] text-gray-400 mt-1">{item.divisi} · {item.satuan}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-2xl font-bold tabular-nums ${
            level === 'danger' ? 'text-red-600' : level === 'warning' ? 'text-amber-600' : level === 'zero' ? 'text-gray-400' : 'text-gray-800'
          }`}>{item.stok}</p>
          {badges[level]}
        </div>
      </div>
    </div>
  );
}

function StokSummaryBar({
  stats,
  search,
  onSearch,
  filterStatus,
  onFilterStatus,
  filterDiv,
  onFilterDiv,
  divisions,
  entity,
  onEntity,
  loading,
  onRefresh,
  lastRefresh,
  resultCount,
}) {
  return (
    <div className="space-y-3 mb-4">
      <div className="flex gap-2">
        {['CV', 'PT'].map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onEntity(e)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
              entity === e
                ? 'bg-gradient-to-r from-[#0b2a55] to-[#164e8a] text-white border-transparent shadow-lg'
                : 'bg-white/90 text-slate-600 border-slate-200 hover:border-cyan-300'
            }`}
          >
            {e === 'CV' ? 'CV. Selera Bogatama' : 'PT. Rasyuka Inti Pratama'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="bg-white/95 rounded-xl p-3 shadow-sm border border-white/60">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Package className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[10px] text-slate-500">Total</span>
          </div>
          <p className="text-lg font-bold text-slate-800 tabular-nums">{stats.total}</p>
        </div>
        <div className="bg-white/95 rounded-xl p-3 shadow-sm border border-emerald-100">
          <div className="flex items-center gap-1.5 mb-0.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[10px] text-slate-500">Aman</span>
          </div>
          <p className="text-lg font-bold text-emerald-700 tabular-nums">{stats.safe}</p>
        </div>
        <div className="bg-white/95 rounded-xl p-3 shadow-sm border border-amber-100">
          <div className="flex items-center gap-1.5 mb-0.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] text-slate-500">Menipis</span>
          </div>
          <p className="text-lg font-bold text-amber-700 tabular-nums">{stats.warning}</p>
        </div>
        <div className="bg-white/95 rounded-xl p-3 shadow-sm border border-red-100">
          <div className="flex items-center gap-1.5 mb-0.5">
            <XCircle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-[10px] text-slate-500">Kritis</span>
          </div>
          <p className="text-lg font-bold text-red-600 tabular-nums">{stats.danger + stats.zero}</p>
        </div>
      </div>

      <div className="sticky top-0 z-20 -mx-1 px-1 py-2.5 space-y-2.5 bg-slate-900/40 backdrop-blur-md border-b border-white/10 rounded-b-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari kode atau nama barang..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white/95 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100/50 shadow-sm"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {divisions.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onFilterDiv(d)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                filterDiv === d
                  ? 'bg-[#0b2a55] text-white border-[#0b2a55] shadow-sm'
                  : 'bg-white/90 text-slate-600 border-slate-200 hover:border-cyan-300'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-cyan-200/80 shrink-0" />
          {['Semua', 'Kritis', 'Menipis', 'Aman', 'Habis'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onFilterStatus(s)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                filterStatus === s
                  ? s === 'Kritis'
                    ? 'bg-red-500 text-white border-red-500'
                    : s === 'Menipis'
                      ? 'bg-amber-500 text-white border-amber-500'
                      : s === 'Aman'
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : s === 'Habis'
                          ? 'bg-slate-500 text-white border-slate-500'
                          : 'bg-cyan-600 text-white border-cyan-600'
                  : 'bg-white/90 text-slate-600 border-slate-200 hover:border-cyan-300'
              }`}
            >
              {s}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <p className="text-[11px] text-cyan-100/70">
              {resultCount} item
              {lastRefresh
                ? ` · ${new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(lastRefresh)}`
                : ''}
            </p>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center gap-1 text-xs text-cyan-200 hover:text-white"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
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

  const stats = useMemo(() => getStats(), [getStats]);

  const filtered = useMemo(() => {
    let list = items;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) => i.kode.toLowerCase().includes(q) || i.nama.toLowerCase().includes(q)
      );
    }
    if (filterDiv !== 'Semua') {
      list = list.filter((i) => i.divisi === filterDiv);
    }
    if (filterStatus !== 'Semua') {
      if (filterStatus === 'Kritis') list = list.filter((i) => i.stok > 0 && i.stok <= 5);
      if (filterStatus === 'Menipis') list = list.filter((i) => i.stok > 5 && i.stok <= 20);
      if (filterStatus === 'Aman') list = list.filter((i) => i.stok > 20);
      if (filterStatus === 'Habis') list = list.filter((i) => i.stok === 0);
    }
    return list;
  }, [items, search, filterDiv, filterStatus]);

  const divisions = ['Semua', ...DIVISIONS];

  return (
    <div className="pb-4 animate-fade-in">
      <StokSummaryBar
        stats={stats}
        search={search}
        onSearch={setSearch}
        filterStatus={filterStatus}
        onFilterStatus={setFilterStatus}
        filterDiv={filterDiv}
        onFilterDiv={setFilterDiv}
        divisions={divisions}
        entity={entity}
        onEntity={setEntity}
        loading={loading}
        onRefresh={refresh}
        lastRefresh={lastRefresh}
        resultCount={filtered.length}
      />

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-cyan-200/50 mx-auto mb-3" />
          <p className="text-cyan-100/80 text-sm font-medium">Tidak ada item ditemukan</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <StockCard key={item.kode} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
