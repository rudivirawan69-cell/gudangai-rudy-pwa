import { useState, useMemo } from 'react';
import {
  Search, RefreshCw, Package, CheckCircle2, AlertTriangle, XCircle,
  LayoutGrid, List,
} from 'lucide-react';
import { useStock } from '../hooks/useStock';
import { DIVISIONS } from '../data/master';

function StockCardList({ item }) {
  const level = item.stok === 0 ? 'zero' : item.stok <= 5 ? 'danger' : item.stok <= 20 ? 'warning' : 'safe';
  const badges = {
    safe: <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Aman</span>,
    warning: <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Menipis</span>,
    danger: <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">Kritis</span>,
    zero: <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Habis</span>,
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-slate-500 font-mono tracking-tight">{item.kode}</p>
          <p className="text-sm font-bold text-slate-900 truncate leading-snug mt-0.5">{item.nama}</p>
          <p className="text-[11px] text-slate-600 mt-1 font-medium">{item.divisi} · {item.satuan}</p>
        </div>
        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
          <p className={`text-2xl font-black tabular-nums leading-none ${
            level === 'danger' ? 'text-red-600' : level === 'warning' ? 'text-amber-600' : level === 'zero' ? 'text-slate-500' : 'text-slate-900'
          }`}>{item.stok}</p>
          {badges[level]}
        </div>
      </div>
    </div>
  );
}

function StockCardGrid({ item }) {
  const level = item.stok === 0 ? 'zero' : item.stok <= 5 ? 'danger' : item.stok <= 20 ? 'warning' : 'safe';
  const badgeCls = {
    safe: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-rose-100 text-rose-800',
    zero: 'bg-slate-200 text-slate-700',
  };
  const label = { safe: 'Aman', warning: 'Menipis', danger: 'Kritis', zero: 'Habis' }[level];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm transition-all active:scale-[0.97] space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded-md">
          {item.kode?.startsWith('PT') ? 'PT' : 'CV'}
        </span>
        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md ${badgeCls[level]}`}>{label}</span>
      </div>
      <div>
        <span className="text-[10px] font-bold text-slate-500 block">{item.kode}</span>
        <h4 className="text-xs font-black text-slate-900 leading-snug line-clamp-2 mt-0.5">{item.nama}</h4>
        <p className="text-[10px] font-semibold text-slate-600 mt-0.5">{item.divisi} · {item.satuan}</p>
      </div>
      <div className="pt-1 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[10px] text-slate-500 font-bold">QTY</span>
        <span className={`text-base font-black tabular-nums ${
          level === 'danger' ? 'text-red-600' : level === 'warning' ? 'text-amber-600' : level === 'zero' ? 'text-slate-500' : 'text-slate-900'
        }`}>{item.stok}</span>
      </div>
    </div>
  );
}

export default function StokPage() {
  const [entity, setEntity] = useState('CV');
  const [search, setSearch] = useState('');
  const [filterDiv, setFilterDiv] = useState('Semua');
  const [filterStatus, setFilterStatus] = useState('Semua');
  const [dense, setDense] = useState(true);
  const { items, loading, refresh, lastRefresh, getStats } = useStock(entity);

  const stats = useMemo(() => getStats(), [getStats]);

  const filtered = useMemo(() => {
    let list = items;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) => i.kode.toLowerCase().includes(q) || i.nama.toLowerCase().includes(q) || (i.divisi || '').toLowerCase().includes(q)
      );
    }
    if (filterDiv !== 'Semua') list = list.filter((i) => i.divisi === filterDiv);
    if (filterStatus !== 'Semua') {
      if (filterStatus === 'Kritis') list = list.filter((i) => Number(i.stok ?? i.qty ?? 0) <= 5);
      if (filterStatus === 'Menipis') list = list.filter((i) => { const q = Number(i.stok ?? i.qty ?? 0); return q > 5 && q <= 20; });
      if (filterStatus === 'Aman') list = list.filter((i) => Number(i.stok ?? i.qty ?? 0) > 20);
      if (filterStatus === 'Habis') list = list.filter((i) => Number(i.stok ?? i.qty ?? 0) === 0);
    }
    return list;
  }, [items, search, filterDiv, filterStatus]);

  const divisions = ['Semua', ...DIVISIONS];

  return (
    <div className="pb-4 animate-fade-in space-y-3.5">
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="min-w-0">
          <h1 className="text-base font-black text-white drop-shadow-sm tracking-tight">Daftar Stok</h1>
          <p className="text-[11px] text-white font-semibold drop-shadow-sm">
            {filtered.length} item SKU · Realtime Gudang
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDense((v) => !v)}
          className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-[11px] font-extrabold shadow-sm flex items-center gap-1.5 active:scale-95 transition shrink-0"
        >
          {dense ? <LayoutGrid className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
          <span>{dense ? 'Grid padat' : 'List longgar'}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {['CV', 'PT'].map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEntity(e)}
            className={`py-2.5 px-2 rounded-xl text-[12px] font-extrabold border transition-all duration-250 ${
              entity === e
                ? 'bg-gradient-to-r from-[#0b2a55] to-[#164e8a] text-white border-transparent shadow-md scale-[1.01]'
                : 'bg-white text-slate-700 border-slate-200 shadow-sm'
            }`}
          >
            {e === 'CV' ? 'CV. Selera Bogatama' : 'PT. Rasyuka Inti Pratama'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { id: 'Semua', label: 'Total', value: stats.total, icon: Package, active: 'border-blue-500 ring-2 ring-blue-200', idle: 'border-slate-200', num: 'text-slate-900', iconCls: 'text-blue-600' },
          { id: 'Aman', label: 'Aman', value: stats.safe, icon: CheckCircle2, active: 'border-emerald-500 ring-2 ring-emerald-200', idle: 'border-emerald-200', num: 'text-emerald-800', iconCls: 'text-emerald-600' },
          { id: 'Menipis', label: 'Menipis', value: stats.warning, icon: AlertTriangle, active: 'border-amber-500 ring-2 ring-amber-200', idle: 'border-amber-200', num: 'text-amber-800', iconCls: 'text-amber-600' },
          { id: 'Kritis', label: 'Kritis', value: (stats.danger || 0) + (stats.zero || 0), icon: XCircle, active: 'border-rose-500 ring-2 ring-rose-200', idle: 'border-rose-200', num: 'text-rose-700', iconCls: 'text-rose-600' },
        ].map((b) => {
          const Icon = b.icon;
          const on = filterStatus === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setFilterStatus(b.id)}
              className={`rounded-2xl p-2.5 shadow-sm border-2 text-center transition active:scale-[0.97] bg-white ${on ? b.active : b.idle}`}
            >
              <div className="flex items-center justify-center gap-1 mb-1">
                <Icon className={`w-3.5 h-3.5 ${b.iconCls}`} />
                <span className="text-[10px] font-bold text-slate-600 uppercase">{b.label}</span>
              </div>
              <p className={`text-lg font-black tabular-nums leading-none ${b.num}`}>{b.value}</p>
            </button>
          );
        })}
      </div>
      {filterStatus !== 'Semua' && (
        <p className="text-[11px] text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-1.5 font-semibold shadow-sm">
          Filter: <span className="font-bold text-slate-900">{filterStatus}</span>
          {' · '}ketuk Total untuk menampilkan semua
        </p>
      )}

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Cari kode, nama barang, atau divisi..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white text-slate-900 text-xs font-semibold rounded-2xl border border-slate-200 shadow-sm focus:outline-none focus:border-cyan-500 placeholder:text-slate-400 transition"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {divisions.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setFilterDiv(d)}
            className={`px-3 py-1.5 rounded-xl text-[11px] transition ${
              filterDiv === d
                ? 'font-black bg-slate-900 text-white shadow-sm'
                : 'font-bold bg-white border border-slate-200 text-slate-700 shadow-sm'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between px-0.5">
        <p className="text-[11px] font-bold text-white drop-shadow-sm tabular-nums">
          {filtered.length} item
          {lastRefresh
            ? ` · ${new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(lastRefresh)}`
            : ''}
        </p>
        <button type="button" onClick={refresh} disabled={loading}
          className="flex items-center gap-1 text-xs text-cyan-200 font-extrabold drop-shadow-sm">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className={dense ? 'grid grid-cols-2 gap-2.5' : 'space-y-2.5'}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-[88px] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-700">Tidak ada item</p>
          <p className="text-[11px] text-slate-500 mt-1">Ubah filter atau ketuk Total</p>
        </div>
      ) : dense ? (
        <div className="grid grid-cols-2 gap-2.5">
          {filtered.map((item) => (
            <StockCardGrid key={item.kode} item={item} />
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((item) => (
            <StockCardList key={item.kode} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
