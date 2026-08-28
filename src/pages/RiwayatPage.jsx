import { useState, useMemo } from 'react';
import { getTransactionHistory } from '../data/api';
import {
  Clock, ArrowUpRight, ArrowDownRight, Search, Filter,
  Calendar, Package
} from 'lucide-react';

export default function RiwayatPage() {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('Semua');
  const [filterEntity, setFilterEntity] = useState('Semua');
  const history = getTransactionHistory();

  const filtered = useMemo(() => {
    let list = history;
    if (filterType !== 'Semua') list = list.filter(h => h.type === filterType.toLowerCase());
    if (filterEntity !== 'Semua') list = list.filter(h => h.entity === filterEntity);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(h =>
        h.items?.some(i => i.kode?.toLowerCase().includes(q) || i.nama?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [history, search, filterType, filterEntity]);

  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(h => {
      const date = new Date(h.savedAt).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      if (!groups[date]) groups[date] = [];
      groups[date].push(h);
    });
    return groups;
  }, [filtered]);

  return (
    <div className="pb-4 animate-fade-in">
      <h2 className="text-lg font-bold text-gray-800 mb-4">Riwayat Transaksi</h2>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Cari item di riwayat..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="flex gap-2 mb-4">
        {['Semua', 'Masuk', 'Keluar'].map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filterType === t
                ? t === 'Masuk' ? 'bg-emerald-500 text-white' : t === 'Keluar' ? 'bg-orange-500 text-white' : 'bg-blue-500 text-white'
                : 'bg-white text-gray-600 border border-gray-200'
            }`}>
            {t}
          </button>
        ))}
        <div className="border-l border-gray-200 mx-1" />
        {['Semua', 'CV', 'PT'].map(e => (
          <button key={e} onClick={() => setFilterEntity(e)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filterEntity === e ? 'bg-[#0b2a55] text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}>
            {e}
          </button>
        ))}
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Belum ada riwayat transaksi</p>
        </div>
      ) : (
        Object.entries(grouped).map(([date, entries]) => (
          <div key={date} className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-xs font-semibold text-gray-500">{date}</p>
            </div>
            <div className="space-y-2">
              {entries.map((h, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      h.type === 'masuk' ? 'bg-emerald-100' : 'bg-orange-100'
                    }`}>
                      {h.type === 'masuk'
                        ? <ArrowDownRight className="w-5 h-5 text-emerald-600" />
                        : <ArrowUpRight className="w-5 h-5 text-orange-600" />
                      }
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-800">Barang {h.type === 'masuk' ? 'Masuk' : 'Keluar'}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          h.entity === 'CV' ? 'bg-blue-100 text-blue-600' : 'bg-violet-100 text-violet-600'
                        }`}>{h.entity}</span>
                        {h.offline && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 font-medium">Offline</span>}
                      </div>
                      <p className="text-[11px] text-gray-400">
                        {new Date(h.savedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}{h.items?.length || 0} item
                      </p>
                    </div>
                  </div>
                  {h.items && (
                    <div className="px-4 pb-3 space-y-1">
                      {h.items.map((item, j) => (
                        <div key={j} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-1.5">
                          <span className="text-gray-600 truncate flex-1">{item.nama || item.kode}</span>
                          <span className="font-semibold text-gray-800 ml-2">{item.qty}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
