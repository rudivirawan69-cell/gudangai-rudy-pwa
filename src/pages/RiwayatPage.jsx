import { useState, useMemo } from 'react';
import { getTransactionHistory } from '../data/api';
import {
  Clock, ArrowUpRight, ArrowDownRight, Search,
  AlertTriangle, BarChart3, Package, WifiOff, CheckCircle2, TrendingUp
} from 'lucide-react';

function typeMeta(type) {
  if (type === 'masuk') return { label: 'Masuk', bg: 'bg-emerald-50', iconColor: 'text-emerald-600', chip: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-400' };
  if (type === 'rusak') return { label: 'Rusak', bg: 'bg-red-50', iconColor: 'text-red-600', chip: 'bg-red-100 text-red-700', bar: 'bg-red-400' };
  return { label: 'Keluar', bg: 'bg-orange-50', iconColor: 'text-orange-600', chip: 'bg-orange-100 text-orange-700', bar: 'bg-orange-400' };
}

function TypeIcon({ type, className = 'w-4 h-4' }) {
  const m = typeMeta(type);
  if (type === 'masuk') return <ArrowDownRight className={`${className} ${m.iconColor}`} />;
  if (type === 'rusak') return <AlertTriangle className={`${className} ${m.iconColor}`} />;
  return <ArrowUpRight className={`${className} ${m.iconColor}`} />;
}

function qtyOf(h) {
  return (h.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
}

export default function RiwayatPage() {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterEntity, setFilterEntity] = useState('all');
  const [dense, setDense] = useState(true);
  const history = getTransactionHistory();
  const now = new Date();

  const filtered = useMemo(() => {
    let list = history;
    if (filterType !== 'all') list = list.filter((h) => h.type === filterType);
    if (filterEntity !== 'all') list = list.filter((h) => h.entity === filterEntity);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((h) =>
        h.items?.some(
          (i) =>
            i.kode?.toLowerCase().includes(q) ||
            i.nama?.toLowerCase().includes(q) ||
            i.keterangan?.toLowerCase().includes(q)
        ) ||
        h.type?.includes(q) ||
        h.entity?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [history, search, filterType, filterEntity]);

  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach((h) => {
      const d = new Date(h.savedAt);
      const key = d.toDateString();
      const label = d.toLocaleDateString('id-ID', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      });
      if (!groups[key]) groups[key] = { label, items: [], sort: d.getTime() };
      groups[key].items.push(h);
    });
    return Object.values(groups).sort((a, b) => b.sort - a.sort);
  }, [filtered]);

  const dailyCompare = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      let keluar = 0, masuk = 0, rusak = 0, tx = 0;
      history.forEach((h) => {
        if (!h.savedAt || new Date(h.savedAt).toDateString() !== key) return;
        const q = qtyOf(h);
        if (h.type === 'keluar') keluar += q;
        else if (h.type === 'masuk') masuk += q;
        else if (h.type === 'rusak') rusak += q;
        tx += 1;
      });
      days.push({
        key,
        label: d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }),
        dayNum: d.getDate(),
        keluar: Math.round(keluar * 10) / 10,
        masuk: Math.round(masuk * 10) / 10,
        rusak: Math.round(rusak * 10) / 10,
        tx,
        isToday: i === 0,
      });
    }
    return days;
  }, [history, now.toDateString()]);

  const today = dailyCompare[6] || { keluar: 0, masuk: 0, rusak: 0, tx: 0 };
  const yesterday = dailyCompare[5] || { keluar: 0 };
  const deltaKeluar =
    yesterday.keluar > 0
      ? Math.round(((today.keluar - yesterday.keluar) / yesterday.keluar) * 100)
      : today.keluar > 0
        ? 100
        : 0;

  const weekTotals = useMemo(() => {
    return dailyCompare.reduce(
      (a, d) => ({
        keluar: a.keluar + d.keluar,
        masuk: a.masuk + d.masuk,
        rusak: a.rusak + d.rusak,
        tx: a.tx + d.tx,
      }),
      { keluar: 0, masuk: 0, rusak: 0, tx: 0 }
    );
  }, [dailyCompare]);

  const maxBar = Math.max(1, ...dailyCompare.map((d) => Math.max(d.keluar, d.masuk, d.rusak)));

  const stats = useMemo(() => {
    const total = history.length;
    const ok = history.filter((h) => h.success !== false && !h.offline).length;
    const offline = history.filter((h) => h.offline).length;
    const fail = history.filter((h) => h.success === false).length;
    const itemsCount = history.reduce((s, h) => s + (h.items?.length || 0), 0);
    return { total, ok, offline, fail, itemsCount };
  }, [history]);

  const typeFilters = [
    { id: 'all', label: 'Semua' },
    { id: 'masuk', label: 'Masuk' },
    { id: 'keluar', label: 'Keluar' },
    { id: 'rusak', label: 'Rusak' },
  ];
  const entityFilters = [
    { id: 'all', label: 'CV+PT' },
    { id: 'CV', label: 'CV' },
    { id: 'PT', label: 'PT' },
  ];

  return (
    <div className="pb-2 animate-fade-in space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Riwayat</h1>
          <p className="text-[11px] text-slate-400">
            {stats.total} transaksi · {stats.itemsCount} baris item · lokal perangkat
          </p>
        </div>
        <button type="button" onClick={() => setDense((v) => !v)}
          className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600">
          {dense ? 'Grid padat' : 'List longgar'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-orange-50 border border-orange-100 p-2.5 text-center">
          <p className="text-lg font-bold text-orange-600 tabular-nums leading-none">{today.keluar}</p>
          <p className="text-[9px] text-orange-700/80 mt-1 font-medium">Keluar hari ini</p>
        </div>
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2.5 text-center">
          <p className="text-lg font-bold text-emerald-600 tabular-nums leading-none">{today.masuk}</p>
          <p className="text-[9px] text-emerald-700/80 mt-1 font-medium">Masuk hari ini</p>
        </div>
        <div className="rounded-xl bg-red-50 border border-red-100 p-2.5 text-center">
          <p className="text-lg font-bold text-red-600 tabular-nums leading-none">{today.rusak}</p>
          <p className="text-[9px] text-red-700/80 mt-1 font-medium">Rusak hari ini</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-center">
          <p className="text-lg font-bold text-slate-800 tabular-nums leading-none">{Math.round(weekTotals.keluar)}</p>
          <p className="text-[9px] text-slate-500 mt-1">Keluar 7 hari</p>
        </div>
        <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-2.5 text-center">
          <p className="text-lg font-bold text-cyan-700 tabular-nums leading-none">{Math.round(weekTotals.masuk - weekTotals.keluar)}</p>
          <p className="text-[9px] text-cyan-700/80 mt-1">Netto minggu</p>
        </div>
        <div className="rounded-xl bg-violet-50 border border-violet-100 p-2.5 text-center">
          <p className={`text-lg font-bold tabular-nums leading-none ${deltaKeluar > 0 ? 'text-orange-600' : deltaKeluar < 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
            {deltaKeluar > 0 ? '+' : ''}{deltaKeluar}%
          </p>
          <p className="text-[9px] text-violet-700/80 mt-1">vs kemarin</p>
        </div>
      </div>

      <div className="card p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
            <BarChart3 className="w-3.5 h-3.5 text-cyan-600" /> Pergerakan 7 hari
          </p>
          <div className="flex items-center gap-2 text-[9px] text-slate-400">
            <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-400" />Keluar</span>
            <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Masuk</span>
            <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />Rusak</span>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5 items-end h-[72px]">
          {dailyCompare.map((d) => (
            <div key={d.key} className="flex flex-col items-center gap-0.5 h-full justify-end">
              <div className="w-full flex flex-col-reverse gap-0.5 items-stretch justify-end flex-1 min-h-0">
                {d.keluar > 0 && (
                  <div className={`w-full rounded-sm ${d.isToday ? 'bg-orange-500' : 'bg-orange-300'}`}
                    style={{ height: `${Math.max(4, (d.keluar / maxBar) * 56)}px` }} title={`Keluar ${d.keluar}`} />
                )}
                {d.masuk > 0 && (
                  <div className="w-full rounded-sm bg-emerald-400"
                    style={{ height: `${Math.max(3, (d.masuk / maxBar) * 56)}px` }} title={`Masuk ${d.masuk}`} />
                )}
                {d.rusak > 0 && (
                  <div className="w-full rounded-sm bg-red-400"
                    style={{ height: `${Math.max(3, (d.rusak / maxBar) * 56)}px` }} title={`Rusak ${d.rusak}`} />
                )}
                {d.keluar === 0 && d.masuk === 0 && d.rusak === 0 && (
                  <div className="w-full h-1 rounded-sm bg-slate-100" />
                )}
              </div>
              <p className={`text-[9px] font-medium ${d.isToday ? 'text-cyan-700' : 'text-slate-400'}`}>{d.dayNum}</p>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-slate-400 text-center mt-1.5">
          {weekTotals.tx} transaksi minggu ini · qty keluar {Math.round(weekTotals.keluar * 10) / 10}
        </p>
      </div>

      {stats.total > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-[11px] font-bold text-emerald-700 tabular-nums">{stats.ok}</p>
              <p className="text-[9px] text-emerald-600/80">Terkirim</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5">
            <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <div>
              <p className="text-[11px] font-bold text-amber-700 tabular-nums">{stats.offline}</p>
              <p className="text-[9px] text-amber-600/80">Offline</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-red-50 px-2 py-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <div>
              <p className="text-[11px] font-bold text-red-700 tabular-nums">{stats.fail}</p>
              <p className="text-[9px] text-red-600/80">Gagal</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode, nama, keterangan…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-cyan-400" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {typeFilters.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilterType(f.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold ${
                filterType === f.id ? 'bg-[#0b2a55] text-white' : 'bg-white border border-slate-200 text-slate-600'
              }`}>{f.label}</button>
          ))}
          <span className="w-px bg-slate-200 self-stretch mx-0.5" />
          {entityFilters.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilterEntity(f.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold ${
                filterEntity === f.id ? 'bg-cyan-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
              }`}>{f.label}</button>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 px-0.5">
          Menampilkan <span className="font-semibold text-slate-600">{filtered.length}</span> dari {history.length}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-6 text-center space-y-2">
          <Clock className="w-10 h-10 text-slate-200 mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Belum ada riwayat</p>
          <p className="text-[11px] text-slate-400 leading-relaxed max-w-xs mx-auto">
            Transaksi dari Input (manual, PDF, atau Suara) tersimpan di sini setelah dikirim — termasuk offline.
          </p>
          <div className="grid grid-cols-3 gap-2 pt-2 text-left">
            <div className="rounded-lg bg-slate-50 p-2">
              <Package className="w-3.5 h-3.5 text-slate-500 mb-1" />
              <p className="text-[10px] font-medium text-slate-700">Input item</p>
              <p className="text-[9px] text-slate-400">Masuk / keluar / rusak</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <TrendingUp className="w-3.5 h-3.5 text-slate-500 mb-1" />
              <p className="text-[10px] font-medium text-slate-700">Grafik terisi</p>
              <p className="text-[9px] text-slate-400">Otomatis 7 hari</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-500 mb-1" />
              <p className="text-[10px] font-medium text-slate-700">Status kirim</p>
              <p className="text-[9px] text-slate-400">OK / offline / gagal</p>
            </div>
          </div>
        </div>
      ) : dense ? (
        <div className="space-y-3">
          {grouped.map((g) => (
            <div key={g.label}>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 px-0.5">
                {g.label} · {g.items.length} tx
              </p>
              <div className="grid grid-cols-2 gap-2">
                {g.items.map((h, idx) => {
                  const m = typeMeta(h.type);
                  const q = Math.round(qtyOf(h) * 10) / 10;
                  const time = new Date(h.savedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={`${h.savedAt}-${idx}`} className="card p-2.5 flex flex-col gap-1.5 min-h-[88px]">
                      <div className="flex items-start gap-1.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${m.bg}`}>
                          <TypeIcon type={h.type} className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${m.chip}`}>{m.label}</span>
                            <span className={`text-[9px] font-semibold px-1 py-0.5 rounded ${
                              h.entity === 'CV' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'
                            }`}>{h.entity}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">{time}</p>
                        </div>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-800 tabular-nums">
                        {q} <span className="font-normal text-slate-400">qty · {h.items?.length || 0} item</span>
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {(h.items || []).map((i) => i.nama || i.kode).filter(Boolean).slice(0, 2).join(', ')}
                        {(h.items || []).length > 2 ? '…' : ''}
                      </p>
                      <div className="flex gap-1 mt-auto">
                        {h.offline && <span className="text-[8px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Offline</span>}
                        {h.success === false && <span className="text-[8px] px-1 py-0.5 rounded bg-red-100 text-red-700 font-medium">Gagal</span>}
                        {h.success !== false && !h.offline && <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">OK</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => (
            <div key={g.label}>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 px-0.5">{g.label}</p>
              <div className="space-y-2">
                {g.items.map((h, idx) => {
                  const m = typeMeta(h.type);
                  const time = new Date(h.savedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={`${h.savedAt}-${idx}`} className="card overflow-hidden">
                      <div className="px-3 py-2.5 flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${m.bg}`}>
                          <TypeIcon type={h.type} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold text-slate-800">Barang {m.label}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              h.entity === 'CV' ? 'bg-blue-100 text-blue-600' : 'bg-violet-100 text-violet-600'
                            }`}>{h.entity}</span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            {time} · {h.items?.length || 0} item · qty {Math.round(qtyOf(h) * 10) / 10}
                          </p>
                        </div>
                      </div>
                      {h.items && (
                        <div className="px-3 pb-2.5 space-y-1">
                          {h.items.map((item, j) => (
                            <div key={j} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                              <span className="text-slate-600 truncate flex-1">{item.nama || item.kode}</span>
                              <span className="font-semibold text-slate-800 ml-2 tabular-nums">{item.qty}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
