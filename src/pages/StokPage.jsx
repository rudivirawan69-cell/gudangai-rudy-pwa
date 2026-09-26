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
    zero: <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Habis</span>,
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
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

function StockCardGrid({ item }) {
  const level = item.stok === 0 ? 'zero' : item.stok <= 5 ? 'danger' : item.stok <= 20 ? 'warning' : 'safe';
  const badgeCls = {
    safe: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-rose-100 text-rose-700',
    zero: 'bg-slate-200 text-slate-600',
  };
  const label = { safe: 'Aman', warning: 'Menipis', danger: 'Kritis', zero: 'Habis' }[level];

  return (
    <div className="bg-white rounded-[18px] border border-slate-200 p-3 shadow-sm transition-all active:scale-[0.97] space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-md">
          {item.kode?.startsWith('PT') ? 'PT' : 'CV'}
        </span>
        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md ${badgeCls[level]}`}>{label}</span>
      </div>
      <div>
        <span className="text-[10px] font-bold text-slate-400 block">{item.kode}</span>
        <h4 className="text-xs font-black text-slate-900 leading-snug line-clamp-2 mt-0.5">{item.nama}</h4>
        <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{item.divisi} · {item.satuan}</p>
      </div>
      <div className="pt-1 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[10px] text-slate-400 font-bold">QTY</span>
        <span className={`text-base font-black tabular-nums ${
          level === 'danger' ? 'text-red-600' : level === 'warning' ? 'text-amber-600' : level === 'zero' ? 'text-slate-400' : 'text-slate-900'
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
    if (filterDiv !== 'Semua') {
      list = list.filter((i) => i.divisi === filterDiv);
    }
    if (filterStatus !== 'Semua') {
      // Selaras dengan kartu atas: Kritis = stok rendah + habis
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
          <p className="text-[11px] text-cyan-100/90 font-medium">
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
                : 'bg-white text-slate-600 border-slate-200 shadow-sm hover:border-cyan-300'
            }`}
          >
            {e === 'CV' ? 'CV. Selera Bogatama' : 'PT. Rasyuka Inti Pratama'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { id: 'Semua', label: 'Total', value: stats.total, icon: Package, active: 'border-blue-400 ring-2 ring-blue-100 bg-blue-50/40', idle: 'border-slate-100', num: 'text-slate-800', iconCls: 'text-blue-500' },
          { id: 'Aman', label: 'Aman', value: stats.safe, icon: CheckCircle2, active: 'border-emerald-400 ring-2 ring-emerald-100 bg-emerald-50/50', idle: 'border-emerald-100', num: 'text-emerald-700', iconCls: 'text-emerald-500' },
          { id: 'Menipis', label: 'Menipis', value: stats.warning, icon: AlertTriangle, active: 'border-amber-400 ring-2 ring-amber-100 bg-amber-50/50', idle: 'border-amber-100', num: 'text-amber-700', iconCls: 'text-amber-500' },
          { id: 'Kritis', label: 'Kritis', value: (stats.danger || 0) + (stats.zero || 0), icon: XCircle, active: 'border-rose-400 ring-2 ring-rose-100 bg-rose-50/50', idle: 'border-red-100', num: 'text-red-600', iconCls: 'text-red-500' },
        ].map((b) => {
          const Icon = b.icon;
          const on = filterStatus === b.id || (b.id === 'Semua' && filterStatus === 'Semua');
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setFilterStatus(b.id === 'Semua' ? 'Semua' : b.id)}
              className={`rounded-2xl p-2.5 shadow-sm border text-center transition active:scale-[0.97] ${on ? b.active : `bg-white ${b.idle}`}`}
            >
              <div className="flex items-center justify-center gap-1 mb-1">
                <Icon className={`w-3.5 h-3.5 ${b.iconCls}`} />
                <span className="text-[10px] font-bold text-slate-500 uppercase">{b.label}</span>
              </div>
              <p className={`text-lg font-black tabular-nums leading-none ${b.num}`}>{b.value}</p>
            </button>
          );
        })}
      </div>
      {filterStatus !== 'Semua' && (
        <p className="text-[11px] text-slate-600 bg-white/90 border border-slate-200 rounded-xl px-3 py-1.5 font-medium">
          Filter: <span className="font-bold text-slate-800">{filterStatus}</span>
          {' · '}ketuk Total untuk menampilkan semua
        </p>
      )}

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
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
                : 'font-bold bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between px-0.5">
        <p className="text-[11px] font-bold text-slate-500 tabular-nums">
          {filtered.length} item
          {lastRefresh
            ? ` · ${new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(lastRefresh)}`
            : ''}
        </p>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-cyan-600 font-extrabold"
        >
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
          <p className="text-sm font-semibold text-slate-500">Tidak ada item</p>
          <p className="text-[11px] text-slate-400 mt-1">Ubah filter atau ketuk Total</p>
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
