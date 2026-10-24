import { useState, useMemo } from 'react';
import { getLocalHistory } from '../data/api';
import {
  Clock, ArrowUpRight, ArrowDownRight, Search,
  AlertTriangle, Package, WifiOff, CheckCircle2, TrendingUp,
} from 'lucide-react';

const TYPE_META = {
  masuk: { label: 'Masuk', Icon: ArrowDownRight, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  keluar: { label: 'Keluar', Icon: ArrowUpRight, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  rusak: { label: 'Rusak', Icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
};

function qtySum(h) {
  return (h.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
}

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
  const [expandedId, setExpandedId] = useState(null);
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
      const key = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    });
    return Object.entries(groups).sort((a, b) => {
      const da = entryDate(a[1][0]).getTime();
      const db = entryDate(b[1][0]).getTime();
      return db - da;
    });
  }, [filtered]);

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
          <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-600 page-kicker">Riwayat</p>
          <h1 className="text-xl font-extrabold text-slate-900 page-title">Transaksi</h1>
          <p className="text-[11px] text-slate-400 mt-0.5 page-sub">
            {history.length} transaksi · lokal perangkat
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => onNavigate?.('sync')}
            className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
            Antrian
          </button>
          <button type="button" onClick={() => setDense((v) => !v)}
            className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-white text-slate-600 border border-slate-200">
            {dense ? 'Grid padat' : 'List'}
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari kode, nama, keterangan..."
          className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {typeFilters.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilterType(t.id)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-bold border ${
              filterType === t.id
                ? 'bg-cyan-600 text-white border-cyan-600'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {['all', 'CV', 'PT'].map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setFilterEntity(e)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-bold border ${
              filterEntity === e
                ? 'bg-cyan-600 text-white border-cyan-600'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            {e === 'all' ? 'Semua' : e}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm py-12 text-center">
          <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-500">Belum ada riwayat</p>
          <p className="text-[11px] text-slate-400 mt-1">Transaksi berhasil akan muncul di sini</p>
        </div>
      )}

      {grouped.map(([day, items]) => (
        <div key={day} className="space-y-2">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide px-0.5">{day}</p>
          {items.map((h, idx) => {
            const meta = TYPE_META[h.type] || TYPE_META.masuk;
            const Icon = meta.Icon;
            const id = h.id || `${day}-${idx}`;
            const open = expandedId === id;
            return (
              <div key={id} className={`rounded-2xl border shadow-sm bg-white overflow-hidden ${meta.border}`}>
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : id)}
                  className="w-full px-3 py-3 flex items-center gap-3 text-left"
                >
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.bg} ${meta.color}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-slate-900 truncate">
                      {meta.label} · {h.entity || '—'} · {h.items?.length || 0} item
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Qty {qtySum(h).toLocaleString('id-ID')} · {entryDate(h).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB
                    </p>
                  </div>
                  <span className="text-slate-400 text-lg font-bold">{open ? '−' : '+'}</span>
                </button>
                {open && (
                  <div className="px-3 pb-3 border-t border-slate-100 space-y-1.5 pt-2">
                    {(h.items || []).map((it, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-[12px]">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{it.nama || it.kode}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{it.kode}</p>
                        </div>
                        <p className="font-bold tabular-nums text-slate-900 shrink-0">{Number(it.qty || 0).toLocaleString('id-ID')}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
