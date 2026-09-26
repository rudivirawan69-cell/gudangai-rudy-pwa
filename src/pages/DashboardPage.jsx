import { useMemo, useState, useEffect, useCallback } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import { getPendingQueue, getStatusPO } from '../data/api';
import { DIVISIONS } from '../data/master';
import { AVATAR_DATA_URL } from '../assets/imageAssets';
import {
  AlertTriangle, RefreshCw, FileText, Package, AlertCircle, ShieldAlert,
} from 'lucide-react';

const EMAIL = 'rudivirawan69@gmail.com';

function Avatar({ name, size = 'md' }) {
  const [err, setErr] = useState(false);
  const dim = size === 'lg' ? 'w-12 h-12' : 'w-10 h-10';
  if (err) {
    return (
      <div className={`${dim} rounded-2xl bg-gradient-to-br from-cyan-600 to-teal-700 flex items-center justify-center text-white text-sm font-bold shadow-md shrink-0`}>
        {(name || 'R').charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <img src={AVATAR_DATA_URL} alt={name || 'Avatar'} className={`${dim} rounded-2xl object-cover shadow-md border-2 border-white/90 shrink-0`} onError={() => setErr(true)} />
  );
}

function classifyItem(it) {
  const stok = Number(it.stok) || 0;
  const thr = Number(it.stockAman ?? it.aman ?? 0);
  if (stok <= 0) return 'kritis';
  if (thr > 0) {
    if (stok <= Math.max(5, Math.floor(thr * 0.25))) return 'kritis';
    if (stok < thr) return 'waspada';
    return 'aman';
  }
  if (stok <= 5) return 'kritis';
  if (stok <= 20) return 'waspada';
  return 'aman';
}

function SummaryStatCards({ items }) {
  const stats = useMemo(() => {
    let kritis = 0, menipis = 0, aman = 0;
    (items || []).forEach((it) => {
      const c = classifyItem(it);
      if (c === 'kritis') kritis += 1;
      else if (c === 'waspada') menipis += 1;
      else aman += 1;
    });
    const total = Math.max(1, kritis + menipis + aman);
    return {
      kritis, menipis, aman,
      pctK: Math.round((kritis / total) * 100),
      pctM: Math.round((menipis / total) * 100),
      pctA: Math.round((aman / total) * 100),
    };
  }, [items]);

  const cards = [
    { key: 'kritis', label: 'Kritis', value: stats.kritis, pct: stats.pctK, color: 'text-rose-600', bar: 'bg-rose-500', border: 'border-rose-100', sub: 'Stok habis / sangat rendah' },
    { key: 'menipis', label: 'Menipis', value: stats.menipis, pct: stats.pctM, color: 'text-amber-600', bar: 'bg-amber-400', border: 'border-amber-100', sub: 'Di bawah stok aman' },
    { key: 'aman', label: 'Aman', value: stats.aman, pct: stats.pctA, color: 'text-emerald-600', bar: 'bg-emerald-500', border: 'border-emerald-100', sub: 'Kapasitas tercukupi' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((c) => (
        <div key={c.key} className={`rounded-2xl bg-white border ${c.border} shadow-sm p-3`}>
          <p className={`text-[10px] font-bold uppercase tracking-wide ${c.color}`}>{c.label}</p>
          <p className={`text-2xl font-black tabular-nums leading-tight mt-1 ${c.color}`}>
            {c.value}
            <span className="text-xs font-semibold opacity-70 ml-1">({c.pct}%)</span>
          </p>
          <div className="mt-2 h-1 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full ${c.bar} rounded-full`} style={{ width: `${c.pct}%` }} />
          </div>
          <p className="text-[9px] text-slate-400 mt-1.5 leading-snug">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

function EntityStockChart({ cvItems, ptItems }) {
  const calc = (items) => {
    let aman = 0, waspada = 0, kritis = 0;
    (items || []).forEach((it) => {
      const c = classifyItem(it);
      if (c === 'kritis') kritis += 1;
      else if (c === 'waspada') waspada += 1;
      else aman += 1;
    });
    return { total: (items || []).length, aman, waspada, kritis };
  };
  const cv = useMemo(() => calc(cvItems), [cvItems]);
  const pt = useMemo(() => calc(ptItems), [ptItems]);

  const Donut3D = ({ data, label, accent }) => {
    const size = 108;
    const stroke = 14;
    const rad = (size - stroke) / 2;
    const circ = 2 * Math.PI * rad;
    const total = Math.max(1, data.total);
    const a = (data.aman / total) * circ;
    const w = (data.waspada / total) * circ;
    const k = (data.kritis / total) * circ;
    return (
      <div className="flex flex-col items-center gap-2">
        <div
          className="relative"
          style={{
            width: size,
            height: size,
            transform: 'perspective(420px) rotateX(18deg)',
            filter: 'drop-shadow(0 8px 14px rgba(15,23,42,0.18))',
          }}
        >
          <svg width={size} height={size} className="block">
            <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
            <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="#10b981" strokeWidth={stroke}
              strokeDasharray={`${a} ${circ - a}`} strokeDashoffset={0}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
            <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="#fbbf24" strokeWidth={stroke}
              strokeDasharray={`${w} ${circ - w}`} strokeDashoffset={-a}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
            <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="#f43f5e" strokeWidth={stroke}
              strokeDasharray={`${k} ${circ - k}`} strokeDashoffset={-(a + w)}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className={`text-xl font-black tabular-nums ${accent}`}>{data.total}</span>
            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
          </div>
        </div>
        <div className="flex gap-2 text-[9px] text-slate-500 font-medium">
          <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{data.aman}</span>
          <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{data.waspada}</span>
          <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" />{data.kritis}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-cyan-50 flex items-center justify-center">
          <Package className="w-4 h-4 text-cyan-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Analisa Stok CV & PT</h3>
          <p className="text-[10px] text-slate-400">Donat 3D · Aman · Menipis · Kritis</p>
        </div>
      </div>
      <div className="flex items-center justify-around gap-4 py-1">
        <Donut3D data={cv} label="CV" accent="text-cyan-600" />
        <Donut3D data={pt} label="PT" accent="text-violet-600" />
      </div>
    </div>
  );
}

function DivisionStatusBars({ items }) {
  const rows = useMemo(() => {
    const map = {};
    DIVISIONS.forEach((d) => { map[d] = { divisi: d, total: 0, aman: 0, waspada: 0, kritis: 0 }; });
    (items || []).forEach((it) => {
      const d = String(it.divisi || 'CS').trim() || 'CS';
      if (!map[d]) map[d] = { divisi: d, total: 0, aman: 0, waspada: 0, kritis: 0 };
      map[d].total += 1;
      const c = classifyItem(it);
      if (c === 'kritis') map[d].kritis += 1;
      else if (c === 'waspada') map[d].waspada += 1;
      else map[d].aman += 1;
    });
    return Object.values(map).filter((r) => r.total > 0).sort((a, b) => b.kritis - a.kritis || b.total - a.total);
  }, [items]);

  if (rows.length === 0) {
    return <p className="text-[11px] text-slate-400 text-center py-4">Belum ada data divisi</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const kritisPct = r.total ? Math.round((r.kritis / r.total) * 100) : 0;
        const size = 48;
        const stroke = 6;
        const rad = (size - stroke) / 2;
        const c = 2 * Math.PI * rad;
        const total = Math.max(1, r.total);
        const segA = (r.aman / total) * c;
        const segW = (r.waspada / total) * c;
        const segK = (r.kritis / total) * c;
        return (
          <div key={r.divisi} className="flex items-center gap-3 rounded-2xl bg-white border border-slate-200 shadow-sm p-2.5">
            <div className="relative shrink-0" style={{ width: size, height: size }}>
              <svg width={size} height={size} className="block" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
                <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="#10b981" strokeWidth={stroke}
                  strokeDasharray={`${segA} ${c - segA}`} />
                <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="#fbbf24" strokeWidth={stroke}
                  strokeDasharray={`${segW} ${c - segW}`} strokeDashoffset={-segA} />
                <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="#f43f5e" strokeWidth={stroke}
                  strokeDasharray={`${segK} ${c - segK}`} strokeDashoffset={-(segA + segW)} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-bold tabular-nums text-slate-800">{r.total}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[12px] font-bold text-slate-800 truncate">{r.divisi}</span>
                <span className="text-[10px] text-slate-400 tabular-nums shrink-0">{r.total} SKU</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
                <div className="h-full bg-emerald-500" style={{ width: `${(r.aman / r.total) * 100}%` }} />
                <div className="h-full bg-amber-400" style={{ width: `${(r.waspada / r.total) * 100}%` }} />
                <div className="h-full bg-rose-500" style={{ width: `${(r.kritis / r.total) * 100}%` }} />
              </div>
              <div className="flex gap-3 mt-1 text-[9px] text-slate-500 font-medium">
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{r.aman}</span>
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{r.waspada}</span>
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" />{r.kritis}</span>
                {kritisPct > 0 && (
                  <span className="ml-auto text-rose-600 font-semibold tabular-nums">{kritisPct}% kritis</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusPOCard({ data, loading, error, onRefresh }) {
  const items = data?.items || [];
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-50 flex items-center justify-center">
            <FileText className="w-4 h-4 text-cyan-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800 leading-tight">Status PO Aktif</h3>
            <p className="text-[10px] text-slate-400">
              {loading ? 'Memuat…' : items.length ? `${items.length} baris aktif` : 'Belum ada data'}
            </p>
          </div>
        </div>
        <button type="button" onClick={onRefresh} className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200" aria-label="Muat ulang PO">
          <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {error && (
        <p className="text-xs text-rose-600 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-xs text-slate-400 py-1">Belum ada Status PO minggu ini. Cek sheet purchase order.</p>
      )}
      <div className="space-y-1.5 max-h-52 overflow-y-auto">
        {items.slice(0, 15).map((row, i) => (
          <div key={i} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">
                {row.nama || row.name || row.keterangan || `PO ${i + 1}`}
              </p>
              <p className="text-[10px] text-slate-400 tabular-nums truncate">
                {[row.noPO || row.no, row.qty != null ? `qty ${row.qty}` : null].filter(Boolean).join(' · ')}
              </p>
            </div>
            <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full text-cyan-700 bg-cyan-50">
              {row.status || 'MENUNGGU'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function reminderLine(hour) {
  if (hour < 11) return { emoji: '🌅', text: 'Fokus input masuk pagi' };
  if (hour < 15) return { emoji: '☀️', text: 'Cek stok menipis siang' };
  if (hour < 18) return { emoji: '🌤️', text: 'Siapkan PO sore' };
  return { emoji: '🌙', text: 'Tutup hari — cek antrian sync' };
}

export default function DashboardPage({ onNavigate }) {
  const { user } = useAuth();
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const [poData, setPoData] = useState(null);
  const [poLoading, setPoLoading] = useState(true);
  const [poError, setPoError] = useState(null);
  const [pending, setPending] = useState(0);

  const allItems = useMemo(
    () => [...(stockCV.items || []), ...(stockPT.items || [])],
    [stockCV.items, stockPT.items]
  );

  const loadPO = useCallback(async () => {
    setPoLoading(true);
    setPoError(null);
    try {
      const res = await getStatusPO();
      if (res?.success === false) {
        setPoData(null);
        setPoError(res.error || 'Gagal memuat Status PO');
      } else {
        const items = res?.items || res?.data || res?.rows || [];
        setPoData({ success: true, items: Array.isArray(items) ? items : [] });
      }
    } catch (err) {
      setPoError(err?.message || 'Gagal memuat Status PO');
      setPoData(null);
    } finally {
      setPoLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPO();
    setPending((getPendingQueue() || []).length);
    const t = setInterval(() => setPending((getPendingQueue() || []).length), 15000);
    return () => clearInterval(t);
  }, [loadPO]);

  const hour = new Date().getHours();
  const rem = reminderLine(hour);
  const name = user?.name || user?.username || 'Rudi';
  const refreshing = stockCV.loading || stockPT.loading;

  const refreshAll = () => {
    stockCV.refresh?.({ force: true });
    stockPT.refresh?.({ force: true });
    loadPO();
  };

  return (
    <div className="pb-6 space-y-3">
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar name={name} size="lg" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-[11px] text-slate-400 font-medium">Beranda</p>
              <p className="text-base font-bold text-slate-900 truncate leading-tight">Halo, {name}</p>
              <p className="text-[11px] text-slate-400 truncate">{EMAIL}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 shrink-0"
            aria-label="Muat ulang"
          >
            <RefreshCw className={`w-4 h-4 text-slate-600 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-cyan-50 border border-cyan-100 px-3 py-2">
          <span className="text-sm leading-none">{rem.emoji}</span>
          <p className="text-[12px] font-medium text-cyan-800">{rem.text}</p>
        </div>
      </div>

      {(stockCV.error || stockPT.error) && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {stockCV.error || stockPT.error}
        </div>
      )}

      <SummaryStatCards items={allItems} />

      <EntityStockChart cvItems={stockCV.items} ptItems={stockPT.items} />

      <StatusPOCard data={poData} loading={poLoading} error={poError} onRefresh={loadPO} />

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-3.5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
            <ShieldAlert className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800 leading-tight">Status Stok Per Divisi</h3>
            <p className="text-[10px] text-slate-400">Aman · Waspada · Kritis</p>
          </div>
        </div>
        <DivisionStatusBars items={allItems} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onNavigate?.('input')}
          className="rounded-xl bg-cyan-600 py-3 text-sm font-semibold text-white flex items-center justify-center gap-2 shadow-sm"
        >
          <Package className="w-4 h-4" /> Input
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.('stok')}
          className="rounded-xl bg-white border border-slate-200 py-3 text-sm font-semibold text-slate-800 flex items-center justify-center gap-2 shadow-sm"
        >
          <ShieldAlert className="w-4 h-4" /> Stok
        </button>
      </div>

      {pending > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-[11px] text-amber-800">
            <b className="tabular-nums">{pending}</b> transaksi menunggu sync — buka Atur → Sinkronisasi
          </span>
        </div>
      )}
    </div>
  );
}
