import { useState, useMemo } from 'react';
import { getLocalHistory } from '../data/api';
import {
  Clock, ArrowUpRight, ArrowDownRight, Search,
  AlertTriangle, Package, WifiOff, CheckCircle2, TrendingUp
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

/** Resolve a safe Date from history entry (supports at / savedAt / timestamp). */
function entryDate(h) {
  const raw = h?.savedAt ?? h?.at ?? h?.timestamp ?? h?.createdAt ?? null;
  if (raw == null || raw === '') return new Date();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export default function RiwayatPage({ onNavigate }) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterEntity, setFilterEntity] = useState('all');
  const [dense, setDense] = useState(true);
  const history = getLocalHistory();

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
      const d = entryDate(h);
      const key = d.toDateString();
      const label = d.toLocaleDateString('id-ID', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      });
      if (!groups[key]) groups[key] = { label, items: [], sort: d.getTime() };
      groups[key].items.push(h);
    });
    return Object.values(groups).sort((a, b) => b.sort - a.sort);
  }, [filtered]);

  const stats = useMemo(() => {
    let ok = 0, offline = 0, fail = 0;
    history.forEach((h) => {
      if (h.status === 'offline' || h.queued) offline += 1;
      else if (h.status === 'error' || h.failed) fail += 1;
      else ok += 1;
    });
    return { ok, offline, fail, total: history.length };
  }, [history]);

  const typeFilters = [
    { id: 'all', label: 'Semua' },
    { id: 'masuk', label: 'Masuk' },
    { id: 'keluar', label: 'Keluar' },
    { id: 'rusak', label: 'Rusak' },
  ];

  return (
    <div className="px-3 pt-3 pb-24 space-y-3 max-w-lg mx-auto">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-600">Riwayat</p>
          <h1 className="text-xl font-extrabold text-slate-900">Transaksi</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {history.length} transaksi · lokal perangkat
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => onNavigate?.('sync')}
            className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
            Antrian
          </button>
          <button type="button" onClick={() => setDense((v) => !v)}
            className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600">
            {dense ? 'Grid padat' : 'Grid longgar'}
          </button>
        </div>
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
        <div className="flex justify-center gap-1.5">
          {typeFilters.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilterType(f.id)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold ${
                filterType === f.id ? 'bg-cyan-700 text-white' : 'bg-white border border-slate-200 text-slate-600'
              }`}>{f.label}</button>
          ))}
        </div>
        <div className="flex justify-center gap-1.5">
          {['all', 'CV', 'PT'].map((e) => (
            <button key={e} type="button" onClick={() => setFilterEntity(e)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold ${
                filterEntity === e ? 'bg-cyan-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
              }`}>{e === 'all' ? 'Semua' : e}</button>
          ))}
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center">
          <Clock className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-600">Belum ada riwayat</p>
          <p className="text-xs text-slate-400 mt-1">Transaksi berhasil akan muncul di sini</p>
        </div>
      ) : dense ? (
        <div className="space-y-3">
          {grouped.map((g) => (
            <div key={g.label}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 px-1">{g.label}</p>
              <div className="space-y-1.5">
                {g.items.map((h, idx) => {
                  const m = typeMeta(h.type);
                  const d = entryDate(h);
                  return (
                    <div key={h.id || idx} className={`rounded-xl border border-slate-200 bg-white px-3 py-2.5 flex items-center gap-2.5 shadow-sm`}>
                      <div className={`w-8 h-8 rounded-lg ${m.bg} flex items-center justify-center shrink-0`}>
                        <TypeIcon type={h.type} className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-slate-900 truncate">
                          {h.items?.[0]?.nama || h.type} {h.items?.length > 1 ? `+${h.items.length - 1}` : ''}
                        </p>
                        <p className="text-[10px] text-slate-500 tabular-nums">
                          {h.entity} · {qtyOf(h)} unit · {d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${m.chip}`}>{m.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.label}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 px-1">{g.label}</p>
              <div className="space-y-2.5">
                {g.items.map((h, idx) => {
                  const m = typeMeta(h.type);
                  const d = entryDate(h);
                  return (
                    <div key={h.id || idx} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-9 h-9 rounded-xl ${m.bg} flex items-center justify-center`}>
                          <TypeIcon type={h.type} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-slate-900">{m.label} · {h.entity}</p>
                          <p className="text-[10px] text-slate-400">{d.toLocaleString('id-ID')}</p>
                        </div>
                        <span className="text-sm font-extrabold text-slate-900 tabular-nums">{qtyOf(h)}</span>
                      </div>
                      <div className="space-y-1">
                        {(h.items || []).slice(0, 5).map((it, j) => (
                          <p key={j} className="text-[11px] text-slate-600 truncate">
                            <span className="font-mono text-slate-400">{it.kode}</span> {it.nama} × {it.qty}
                          </p>
                        ))}
                        {(h.items || []).length > 5 && (
                          <p className="text-[10px] text-slate-400">+{(h.items || []).length - 5} item lainnya</p>
                        )}
                      </div>
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
