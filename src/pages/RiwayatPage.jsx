import { useState, useMemo } from 'react';
import { getTransactionHistory } from '../data/api';
import {
  Clock, ArrowUpRight, ArrowDownRight, Search, Calendar,
  AlertTriangle, BarChart3
} from 'lucide-react';

function typeMeta(type) {
  if (type === 'masuk') return { label: 'Masuk', bg: 'bg-emerald-100', iconColor: 'text-emerald-600' };
  if (type === 'rusak') return { label: 'Rusak', bg: 'bg-red-100', iconColor: 'text-red-600' };
  return { label: 'Keluar', bg: 'bg-orange-100', iconColor: 'text-orange-600' };
}

function TypeIcon({ type }) {
  const m = typeMeta(type);
  if (type === 'masuk') return <ArrowDownRight className={`w-5 h-5 ${m.iconColor}`} />;
  if (type === 'rusak') return <AlertTriangle className={`w-5 h-5 ${m.iconColor}`} />;
  return <ArrowUpRight className={`w-5 h-5 ${m.iconColor}`} />;
}

export default function RiwayatPage() {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('Semua');
  const [filterEntity, setFilterEntity] = useState('Semua');
  const history = getTransactionHistory();
  const now = new Date();

  const filtered = useMemo(() => {
    let list = history;
    if (filterType !== 'Semua') list = list.filter((h) => h.type === filterType.toLowerCase());
    if (filterEntity !== 'Semua') list = list.filter((h) => h.entity === filterEntity);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((h) =>
        h.items?.some((i) => i.kode?.toLowerCase().includes(q) || i.nama?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [history, search, filterType, filterEntity]);

  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach((h) => {
      const date = new Date(h.savedAt).toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(h);
    });
    return groups;
  }, [filtered]);

  const dailyCompare = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      let keluar = 0, masuk = 0, rusak = 0;
      history.forEach((h) => {
        if (new Date(h.savedAt).toDateString() !== key) return;
        const sum = (h.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
        if (h.type === 'keluar') keluar += sum;
        else if (h.type === 'masuk') masuk += sum;
        else if (h.type === 'rusak') rusak += sum;
      });
      days.push({
        key,
        label: d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }),
        keluar: Math.round(keluar * 10) / 10,
        masuk: Math.round(masuk * 10) / 10,
        rusak: Math.round(rusak * 10) / 10,
        isToday: i === 0,
      });
    }
    return days;
  }, [history, now.toDateString()]);

  const today = dailyCompare[6] || { keluar: 0, masuk: 0, rusak: 0 };
  const yesterday = dailyCompare[5] || { keluar: 0 };
  const maxKeluar = Math.max(...dailyCompare.map((d) => d.keluar), 1);
  const delta =
    yesterday.keluar > 0
      ? Math.round(((today.keluar - yesterday.keluar) / yesterday.keluar) * 100)
      : today.keluar > 0 ? 100 : 0;

  return (
    <div className="pb-4 animate-fade-in">
      <h2 className="text-lg font-bold text-gray-800 mb-4">Riwayat Transaksi</h2>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-orange-500" /> Pengeluaran Harian
          </h3>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            delta > 0 ? 'bg-red-50 text-red-600' : delta < 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-500'
          }`}>
            vs kemarin {delta > 0 ? '+' : ''}{delta}%
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-lg bg-orange-50 p-2 text-center">
            <p className="text-lg font-bold text-orange-600">{today.keluar}</p>
            <p className="text-[10px] text-orange-600">Keluar hari ini</p>
          </div>
          <div className="rounded-lg bg-emerald-50 p-2 text-center">
            <p className="text-lg font-bold text-emerald-600">{today.masuk}</p>
            <p className="text-[10px] text-emerald-600">Masuk hari ini</p>
          </div>
          <div className="rounded-lg bg-red-50 p-2 text-center">
            <p className="text-lg font-bold text-red-600">{today.rusak}</p>
            <p className="text-[10px] text-red-600">Rusak hari ini</p>
          </div>
        </div>
        <div className="flex items-end gap-1 h-20">
          {dailyCompare.map((d) => {
            const h = Math.max(4, Math.round((d.keluar / maxKeluar) * 100));
            return (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-0.5">
                <span className="text-[8px] text-gray-500 tabular-nums">{d.keluar || ''}</span>
                <div className="w-full flex items-end justify-center" style={{ height: 48 }}>
                  <div className={`w-full max-w-[24px] rounded-t ${d.isToday ? 'bg-orange-500' : 'bg-orange-200'}`} style={{ height: `${h}%` }} />
                </div>
                <span className="text-[8px] text-gray-400 text-center leading-tight">{d.label}</span>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-400 mt-2 text-center">Qty keluar 7 hari · riwayat lokal</p>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Cari item di riwayat..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { id: 'Semua', active: 'bg-blue-500 text-white' },
          { id: 'Masuk', active: 'bg-emerald-500 text-white' },
          { id: 'Keluar', active: 'bg-orange-500 text-white' },
          { id: 'Rusak', active: 'bg-red-600 text-white' },
        ].map((t) => (
          <button key={t.id} onClick={() => setFilterType(t.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filterType === t.id ? t.active : 'bg-white text-gray-600 border border-gray-200'
            }`}>{t.id}</button>
        ))}
        <div className="border-l border-gray-200 mx-0.5 self-stretch" />
        {['Semua', 'CV', 'PT'].map((e) => (
          <button key={e} onClick={() => setFilterEntity(e)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filterEntity === e ? 'bg-[#0b2a55] text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}>{e}</button>
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
              {entries.map((h, i) => {
                const m = typeMeta(h.type);
                return (
                  <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.bg}`}>
                        <TypeIcon type={h.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-800">Barang {m.label}</p>
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
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
