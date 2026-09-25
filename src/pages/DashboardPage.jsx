import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import {
  getPendingQueue, getStatusPO,
} from '../data/api';
import { DIVISIONS } from '../data/master';
import { AVATAR_DATA_URL } from '../assets/imageAssets';
import {
  AlertTriangle, RefreshCw, FileText, Package, CheckCircle2, AlertCircle, ShieldAlert,
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
    <div className={`rounded-2xl border p-3 ${tone}`}>
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
      <Card title="Stock CV" d={cv} tone="bg-white/5 border-white/10 text-white" />
      <Card title="Stock PT" d={pt} tone="bg-white/5 border-white/10 text-white" />
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

function StatusPOCard({ data, loading, error, onRefresh }) {
  const items = data?.items || [];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2">
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
              <p className="text-xs font-medium text-white truncate">{row.nama || row.name || row.keterangan || `PO ${i + 1}`}</p>
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
    <div className="pb-6 space-y-3 text-white">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={name} size="lg" />
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">Halo, {name}</p>
            <p className="text-[11px] text-white/50 truncate">{EMAIL}</p>
            <p className="text-[11px] text-cyan-300/80 mt-0.5">{reminderWithEmoji(hour)}</p>
          </div>
        </div>
        <button type="button" onClick={refreshAll} className="p-2 rounded-xl bg-white/10" aria-label="Muat ulang">
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

      <StatusPOCard data={poData} loading={poLoading} error={poError} onRefresh={loadPO} />

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onNavigate?.('input')}
          className="rounded-xl bg-cyan-600 py-3 text-sm font-semibold flex items-center justify-center gap-2">
          <Package className="w-4 h-4" /> Input
        </button>
        <button type="button" onClick={() => onNavigate?.('stok')}
          className="rounded-xl bg-white/10 py-3 text-sm font-semibold flex items-center justify-center gap-2">
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
