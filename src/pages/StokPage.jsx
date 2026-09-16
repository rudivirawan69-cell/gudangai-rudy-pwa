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
    warning: 'border-l-amber-400 bg-amber-50/40',
    danger: 'border-l-red-500 bg-red-50/40',
    zero: 'border-l-slate-300 bg-slate-50/50',
  };
  const badges = {
    safe: <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">Aman</span>,
    warning: <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Menipis</span>,
    danger: <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">Kritis</span>,
    zero: <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">Habis</span>,
  };

  return (
    <div className={`border-l-4 ${colors[level]} rounded-xl p-3 shadow-sm border border-slate-100/80 hover:shadow-md transition-shadow duration-200`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-slate-400 font-mono tracking-tight">{item.kode}</p>
          <p className="text-sm font-bold text-slate-800 truncate leading-snug mt-0.5">{item.nama}</p>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">{item.divisi} · {item.satuan}</p>
        </div>
        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
          <p className={`text-2xl font-black tabular-nums leading-none ${
            level === 'danger' ? 'text-red-600' : level === 'warning' ? 'text-amber-600' : level === 'zero' ? 'text-slate-400' : 'text-slate-800'
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
      <div className="grid grid-cols-2 gap-2">
        {['CV', 'PT'].map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onEntity(e)}
            className={`py-2.5 px-2 rounded-xl text-[12px] font-extrabold border transition-all duration-250 ${
              entity === e
                ? 'bg-gradient-to-r from-[#0b2a55] to-[#164e8a] text-white border-transparent shadow-md scale-[1.01]'
                : 'bg-white text-slate-600 border-slate-200 shadow-sm hover:border-cyan-300'
            }`}
          >
            {e === 'CV' ? 'CV. Selera Bogatama' : 'PT. Rasyuka Inti Pratama'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="bg-white rounded-2xl p-2.5 shadow-sm border border-slate-100 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Package className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[10px] font-bold text-slate-500 uppercase">Total</span>
          </div>
          <p className="text-lg font-black text-slate-800 tabular-nums leading-none">{stats.total}</p>
        </div>
        <div className="bg-white rounded-2xl p-2.5 shadow-sm border border-emerald-100 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[10px] font-bold text-slate-500 uppercase">Aman</span>
          </div>
          <p className="text-lg font-black text-emerald-700 tabular-nums leading-none">{stats.safe}</p>
        </div>
        <div className="bg-white rounded-2xl p-2.5 shadow-sm border border-amber-100 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] font-bold text-slate-500 uppercase">Menipis</span>
          </div>
          <p className="text-lg font-black text-amber-700 tabular-nums leading-none">{stats.warning}</p>
        </div>
        <div className="bg-white rounded-2xl p-2.5 shadow-sm border border-red-100 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <XCircle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-[10px] font-bold text-slate-500 uppercase">Kritis</span>
          </div>
          <p className="text-lg font-black text-red-600 tabular-nums leading-none">{stats.danger + stats.zero}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-3 space-y-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari kode atau nama barang..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 rounded-xl border border-slate-100 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {divisions.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onFilterDiv(d)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-extrabold border transition-all duration-200 ${
                filterDiv === d
                  ? 'bg-[#0b2a55] text-white border-[#0b2a55] shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-cyan-300'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {['Semua', 'Kritis', 'Menipis', 'Aman', 'Habis'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onFilterStatus(s)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border transition-all duration-200 ${
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
                  : 'bg-white text-slate-600 border-slate-200 hover:border-cyan-300'
              }`}
            >
              {s}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <p className="text-[11px] font-bold text-slate-500 tabular-nums">
              {resultCount} item
              {lastRefresh
                ? ` · ${new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(lastRefresh)}`
                : ''}
            </p>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center gap-1 text-xs text-cyan-600 font-extrabold"
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
        <div className="space-y-2.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-[72px] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-bold">Tidak ada item ditemukan</p>
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
