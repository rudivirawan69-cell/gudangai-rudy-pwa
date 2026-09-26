import { useMemo, useState, useEffect, useCallback } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import {
  getPendingQueue, getStatusPO,
} from '../data/api';
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

function EntityStockChart({ cvItems, ptItems }) {
  const calc = (items) => {
    const list = items || [];
    const total = list.length;
    const zero = list.filter((i) => Number(i.stok) === 0).length;
    const low = list.filter((i) => {
      const s = Number(i.stok) || 0;
      const aman = Number(i.stockAman) || 0;
      if (s === 0) return false;
      if (aman > 0) return s < aman;
      return s > 0 && s <= 10;
    }).length;
    const ok = Math.max(0, total - zero - low);
    return { total, zero, low, ok };
  };
  const cv = useMemo(() => calc(cvItems), [cvItems]);
  const pt = useMemo(() => calc(ptItems), [ptItems]);
  const Card = ({ title, d, tone }) => (
    <div className={`rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ${tone}`}>
      <p className="text-xs font-semibold opacity-70 mb-2">{title}</p>
      <p className="text-2xl font-bold tabular-nums">{d.total}</p>
      <p className="text-[11px] opacity-60 mt-1">item master</p>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
        <div className="rounded-lg bg-emerald-500/15 px-1.5 py-1 text-center">
          <div className="font-bold">{d.ok}</div><div className="opacity-60">Aman</div>
        </div>
        <div className="rounded-lg bg-amber-500/15 px-1.5 py-1 text-center">
          <div className="font-bold">{d.low}</div><div className="opacity-60">Menipis</div>
        </div>
        <div className="rounded-lg bg-rose-500/15 px-1.5 py-1 text-center">
          <div className="font-bold">{d.zero}</div><div className="opacity-60">Habis</div>
        </div>
      </div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-2">
      <Card title="Stock CV" d={cv} tone="text-slate-800" />
      <Card title="Stock PT" d={pt} tone="text-slate-800" />
    </div>
  );
}

function normalizeStatusPO(raw) {
  if (!raw) return { success: false, error: 'Kosong' };
  if (raw.success === false) return { success: false, error: raw.error || 'Gagal' };
  const items = raw.items || raw.data || raw.rows || [];
  const list = Array.isArray(items) ? items : [];
  return { success: true, items: list, updatedAt: raw.updatedAt || raw.ts };
}

function statusPOColor(status) {
  const s = String(status || '').toUpperCase();
  if (/SELESAI|DATANG|COMPLETE/.test(s)) return 'text-emerald-300 bg-emerald-500/15';
  if (/SEBAGIAN|PARTIAL/.test(s)) return 'text-amber-300 bg-amber-500/15';
  return 'text-cyan-200 bg-cyan-500/15';
}

const CHART_COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#60a5fa'];

function getStatusGroup(status) {
  const value = String(status || '').toUpperCase();
  if (/SELESAI|DATANG|COMPLETE/.test(value)) return 'Selesai';
  if (/SEBAGIAN|PARTIAL/.test(value)) return 'Sebagian';
  return 'Menunggu';
}

function DonutPOChart({ items }) {
  const summary = useMemo(() => {
    const groups = ['Menunggu', 'Sebagian', 'Selesai'].map((label) => ({
      label,
      value: items.filter((item) => getStatusGroup(item.status) === label).length,
    }));
    return groups;
  }, [items]);
  const total = summary.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const gradient = total
    ? summary.map((item, index) => {
      const start = (cursor / total) * 100;
      cursor += item.value;
      return `${CHART_COLORS[index]} ${start}% ${(cursor / total) * 100}%`;
    }).join(', ')
    : 'rgba(255,255,255,.12) 0 100%';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="Grafik donat status PO">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-bold text-slate-800">Ringkasan Status PO</p>
          <p className="text-[10px] text-slate-500">Distribusi PO aktif</p>
        </div>
        <span className="rounded-full bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-200">{total} total</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative grid size-32 shrink-0 place-items-center rounded-full shadow-[0_14px_0_-5px_rgba(8,47,73,.9),0_18px_20px_rgba(0,0,0,.3)]" style={{ background: `conic-gradient(${gradient})` }}>
          <div className="grid size-20 place-items-center rounded-full border border-white/10 bg-slate-950/90 shadow-inner">
            <span className="text-2xl font-black text-slate-800 tabular-nums">{total}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {summary.map((item, index) => (
            <div key={item.label} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex items-center gap-2 text-slate-600"><i className="size-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index] }} />{item.label}</span>
              <b className="text-white tabular-nums">{item.value}</b>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DivisionPOChart({ items }) {
  const data = useMemo(() => {
    const counts = items.reduce((result, item) => {
      const division = item.divisi || item.division || 'Tanpa divisi';
      result[division] = (result[division] || 0) + 1;
      return result;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [items]);
  const max = Math.max(...data.map(([, value]) => value), 1);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="Grafik status PO per divisi">
      <div className="mb-3">
        <p className="text-sm font-bold text-slate-800">Status PO per Divisi</p>
        <p className="text-[10px] text-slate-500">Jumlah PO aktif berdasarkan divisi</p>
      </div>
      {data.length ? (
        <div className="space-y-2.5">
          {data.map(([division, value], index) => (
            <div key={division} className="grid grid-cols-[5.5rem_1fr_1.5rem] items-center gap-2 text-[10px]">
              <span className="truncate font-semibold text-slate-600" title={division}>{division}</span>
              <div className="h-5 rounded-md bg-white/5 shadow-inner">
                <div className="h-full rounded-md shadow-[0_4px_0_rgba(15,23,42,.55),0_5px_10px_rgba(0,0,0,.2)]" style={{ width: `${Math.max(8, (value / max) * 100)}%`, background: `linear-gradient(90deg, ${CHART_COLORS[(index + 1) % CHART_COLORS.length]}, ${CHART_COLORS[(index + 2) % CHART_COLORS.length]})` }} />
              </div>
              <b className="text-right text-white tabular-nums">{value}</b>
            </div>
          ))}
        </div>
      ) : <p className="text-xs text-white/40">Belum ada data divisi untuk ditampilkan.</p>}
    </section>
  );
}

function StatusPOCard({ data, loading, error, onRefresh }) {
  const items = data?.items || [];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-cyan-300" />
          <div>
            <h3 className="text-sm font-semibold text-white">Status PO Aktif</h3>
            <p className="text-[10px] text-white/40">
              {loading ? 'Memuat…' : items.length ? `${items.length} baris` : 'Belum ada data'}
            </p>
          </div>
        </div>
        <button type="button" onClick={onRefresh} className="p-1.5 rounded-lg bg-white/10">
          <RefreshCw className={`w-3.5 h-3.5 text-white/70 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {error && (
        <p className="text-xs text-rose-300 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-xs text-white/40">Belum ada Status PO minggu ini. Cek sheet purchase order.</p>
      )}
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {items.slice(0, 12).map((row, i) => (
          <div key={i} className="flex items-center justify-between gap-2 rounded-xl bg-black/20 px-2.5 py-1.5">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">{row.nama || row.name || row.keterangan || `PO ${i + 1}`}</p>
              <p className="text-[10px] text-white/40 truncate">
                {[row.noPO || row.no, row.qty != null ? `qty ${row.qty}` : null].filter(Boolean).join(' · ')}
              </p>
            </div>
            <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusPOColor(row.status)}`}>
              {row.status || 'MENUNGGU'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function reminderWithEmoji(hour) {
  if (hour < 11) return '🌅 Fokus input masuk pagi';
  if (hour < 15) return '☀️ Cek stok menipis siang';
  if (hour < 18) return '🌤️ Siapkan PO sore';
  return '🌙 Tutup hari — cek antrian sync';
}

export default function DashboardPage({ onNavigate }) {
  const { user } = useAuth();
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const [poData, setPoData] = useState(null);
  const [poLoading, setPoLoading] = useState(true);
  const [poError, setPoError] = useState(null);
  const [pending, setPending] = useState(0);

  const loadPO = useCallback(async () => {
    setPoLoading(true);
    setPoError(null);
    try {
      const res = await getStatusPO();
      const norm = normalizeStatusPO(res);
      if (norm.success) setPoData(norm);
      else { setPoData(null); setPoError(norm.error || 'Gagal memuat Status PO'); }
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
  const name = user?.name || user?.username || 'Rudi';
  const refreshing = stockCV.loading || stockPT.loading;

  const refreshAll = () => {
    stockCV.refresh?.({ force: true });
    stockPT.refresh?.({ force: true });
    loadPO();
  };

  return (
    <div className="pb-6 space-y-3 text-slate-800">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={name} size="lg" />
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">Halo, {name}</p>
            <p className="text-[11px] text-white/50 truncate">{EMAIL}</p>
            <p className="text-[11px] text-cyan-300/80 mt-0.5">{reminderWithEmoji(hour)}</p>
          </div>
        </div>
        <button type="button" onClick={refreshAll} className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm" aria-label="Muat ulang">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <EntityStockChart cvItems={stockCV.items} ptItems={stockPT.items} />

      {(stockCV.error || stockPT.error) && (
        <p className="text-xs text-amber-200 flex items-center gap-1 px-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          {stockCV.error || stockPT.error} — data terakhir dipertahankan bila ada
        </p>
      )}

      <DonutPOChart items={poData?.items || []} />

      <StatusPOCard data={poData} loading={poLoading} error={poError} onRefresh={loadPO} />

      <DivisionPOChart items={poData?.items || []} />

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onNavigate?.('input')}
          className="rounded-xl bg-cyan-600 py-3 text-sm font-semibold flex items-center justify-center gap-2">
          <Package className="w-4 h-4" /> Input
        </button>
        <button type="button" onClick={() => onNavigate?.('stok')}
          className="rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 shadow-sm flex items-center justify-center gap-2">
          <ShieldAlert className="w-4 h-4" /> Stok
        </button>
      </div>

      {pending > 0 && (
        <div className="rounded-xl bg-amber-500/15 border border-amber-400/30 px-3 py-2 text-xs text-amber-100">
          <b>{pending}</b> transaksi menunggu sync — buka Atur → Sinkronisasi
        </div>
      )}
    </div>
  );
}
