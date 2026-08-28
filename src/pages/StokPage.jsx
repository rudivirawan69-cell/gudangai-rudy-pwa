import { useState, useMemo } from 'react';
import { useStock } from '../hooks/useStock';
import { DIVISIONS } from '../data/master';
import {
  Package, RefreshCw, Search, ChevronDown, AlertTriangle,
  CheckCircle2, XCircle, TrendingUp, Filter
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

function StatBox({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-[11px] text-gray-500">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-800">{value}</p>
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
      list = list.filter(i =>
        i.kode.toLowerCase().includes(q) || i.nama.toLowerCase().includes(q)
      );
    }
    if (filterDiv !== 'Semua') {
      list = list.filter(i => i.divisi === filterDiv);
    }
    if (filterStatus !== 'Semua') {
      if (filterStatus === 'Kritis') list = list.filter(i => i.stok > 0 && i.stok <= 5);
      if (filterStatus === 'Menipis') list = list.filter(i => i.stok > 5 && i.stok <= 20);
      if (filterStatus === 'Aman') list = list.filter(i => i.stok > 20);
      if (filterStatus === 'Habis') list = list.filter(i => i.stok === 0);
    }
    return list;
  }, [items, search, filterDiv, filterStatus]);

  const divisions = ['Semua', ...DIVISIONS];

  return (
    <div className="pb-4 animate-fade-in">
      <div className="flex gap-2 mb-4">
        {['CV', 'PT'].map(e => (
          <button key={e} onClick={() => setEntity(e)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              entity === e
                ? 'bg-gradient-to-r from-[#0b2a55] to-[#164e8a] text-white shadow-lg'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
            }`}>
            {e === 'CV' ? 'CV. Selera Bogatama' : 'PT. Rasyuka Inti Pratama'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        <StatBox icon={Package} label="Total" value={stats.total} color="text-blue-500" />
        <StatBox icon={CheckCircle2} label="Aman" value={stats.safe} color="text-emerald-500" />
        <StatBox icon={AlertTriangle} label="Menipis" value={stats.warning} color="text-amber-500" />
        <StatBox icon={XCircle} label="Kritis" value={stats.danger + stats.zero} color="text-red-500" />
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Cari kode atau nama barang..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
        {divisions.map(d => (
          <button key={d} onClick={() => setFilterDiv(d)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filterDiv === d
                ? 'bg-[#0b2a55] text-white'
                : 'bg-white text-gray-600 border border-gray-200'
            }`}>
            {d}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        {['Semua', 'Kritis', 'Menipis', 'Aman', 'Habis'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-all ${
              filterStatus === s
                ? s === 'Kritis' ? 'bg-red-500 text-white'
                : s === 'Menipis' ? 'bg-amber-500 text-white'
                : s === 'Aman' ? 'bg-emerald-500 text-white'
                : s === 'Habis' ? 'bg-gray-500 text-white'
                : 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-600'
            }`}>
            {s}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-gray-400">
          {filtered.length} item · Update: {lastRefresh ? new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(lastRefresh) : '-'}
        </p>
        <button onClick={refresh} disabled={loading}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Tidak ada item ditemukan</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <StockCard key={item.kode} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
