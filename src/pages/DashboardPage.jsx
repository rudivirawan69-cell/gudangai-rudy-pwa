import { useMemo, useState, useEffect, useCallback } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import { getPendingQueue, getStatusPO, confirmPOStatus } from '../data/api';
import { DIVISIONS } from '../data/master';
import { AVATAR_DATA_URL } from '../assets/imageAssets';
import {
  RefreshCw, AlertCircle, FileText, Package, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, ChevronRight, ClipboardList,
} from 'lucide-react';

function statusBadgeClass(status) {
  const s = String(status || '').toUpperCase();
  if ((s.includes('SELESAI') || s.includes('DATANG')) && !s.includes('BELUM') && !s.includes('SEBAGIAN')) {
    return 'text-emerald-700 bg-emerald-50';
  }
  if (s.includes('SEBAGIAN')) return 'text-amber-700 bg-amber-50';
  if (s.includes('MENUNGGU') || s.includes('BELUM')) return 'text-cyan-700 bg-cyan-50';
  return 'text-slate-600 bg-slate-100';
}

function SummaryStatCards({ items }) {
  const total = items.length || 0;
  let kritis = 0, menipis = 0, aman = 0;
  for (const it of items) {
    const q = Number(it.qty ?? it.stok ?? it.sisa ?? 0);
    const min = Number(it.min ?? it.stokMin ?? 5);
    if (q <= 0) kritis++;
    else if (q <= min) menipis++;
    else aman++;
  }
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const cards = [
    { label: 'KRITIS', value: kritis, pct: pct(kritis), color: 'text-rose-600', border: 'border-rose-100', bg: 'bg-rose-50/50', desc: 'Stok habis / sangat rendah' },
    { label: 'MENIPIS', value: menipis, pct: pct(menipis), color: 'text-amber-600', border: 'border-amber-100', bg: 'bg-amber-50/50', desc: 'Di bawah stok aman' },
    { label: 'AMAN', value: aman, pct: pct(aman), color: 'text-emerald-600', border: 'border-emerald-100', bg: 'bg-emerald-50/50', desc: 'Kapasitas tercukupi' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((c) => (
        <div key={c.label} className={`rounded-2xl bg-white border ${c.border} shadow-sm p-3 ${c.bg}`}>
          <p className={`text-[10px] font-bold tracking-wide ${c.color}`}>{c.label}</p>
          <p className={`text-2xl font-black tabular-nums ${c.color}`}>{c.value}<span className="text-xs font-semibold opacity-70"> ({c.pct}%)</span></p>
          <div className="h-1 rounded-full bg-slate-100 mt-1.5 mb-1 overflow-hidden">
            <div className={`h-full rounded-full ${c.color.replace('text-', 'bg-')}`} style={{ width: `${c.pct}%` }} />
          </div>
          <p className="text-[10px] text-slate-400 leading-tight">{c.desc}</p>
        </div>
      ))}
    </div>
  );
}

function Donut3D({ label, aman, menipis, kritis }) {
  const total = Math.max(1, (aman || 0) + (menipis || 0) + (kritis || 0));
  const a = (aman || 0) / total;
  const m = (menipis || 0) / total;
  const k = (kritis || 0) / total;
  const r = 36, stroke = 10;
  const C = 2 * Math.PI * r;
  const seg = [
    { frac: a, color: '#10b981' },
    { frac: m, color: '#f59e0b' },
    { frac: k, color: '#f43f5e' },
  ];
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90 drop-shadow-sm">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
          {seg.map((s, i) => {
            const len = s.frac * C;
            const el = (
              <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth={stroke}
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
                strokeLinecap="round" opacity={0.95} />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-black text-slate-800 tabular-nums">{(aman || 0) + (menipis || 0) + (kritis || 0)}</span>
          <span className="text-[10px] font-semibold text-slate-400 uppercase">{label}</span>
        </div>
      </div>
      <div className="flex gap-2 text-[10px] text-slate-500">
        <span className="flex items-center gap-0.5"><i className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />{aman || 0}</span>
        <span className="flex items-center gap-0.5"><i className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />{menipis || 0}</span>
        <span className="flex items-center gap-0.5"><i className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />{kritis || 0}</span>
      </div>
    </div>
  );
}

function AnalisaStokCard({ items }) {
  const split = useMemo(() => {
    const cv = { aman: 0, menipis: 0, kritis: 0 };
    const pt = { aman: 0, menipis: 0, kritis: 0 };
    for (const it of items || []) {
      const ent = String(it.entity || it.entitas || 'CV').toUpperCase();
      const bucket = ent === 'PT' ? pt : cv;
      const q = Number(it.qty ?? it.stok ?? it.sisa ?? 0);
      const min = Number(it.min ?? it.stokMin ?? 5);
      if (q <= 0) bucket.kritis++;
      else if (q <= min) bucket.menipis++;
      else bucket.aman++;
    }
    return { cv, pt };
  }, [items]);
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
      <div className="flex justify-around">
        <Donut3D label="CV" {...split.cv} />
        <Donut3D label="PT" {...split.pt} />
      </div>
    </div>
  );
}

function DivisionStatusBars({ items }) {
  const rows = useMemo(() => {
    const map = {};
    for (const it of items || []) {
      const d = it.divisi || it.division || 'LAIN';
      if (!map[d]) map[d] = { divisi: d, aman: 0, waspada: 0, kritis: 0, total: 0 };
      const q = Number(it.qty ?? it.stok ?? it.sisa ?? 0);
      const min = Number(it.min ?? it.stokMin ?? 5);
      map[d].total++;
      if (q <= 0) map[d].kritis++;
      else if (q <= min) map[d].waspada++;
      else map[d].aman++;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [items]);
  if (!rows.length) {
    return <p className="text-xs text-slate-400 py-2">Belum ada data divisi</p>;
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const t = Math.max(1, r.total);
        return (
          <div key={r.divisi} className="flex items-center gap-3 rounded-2xl bg-white border border-slate-200 shadow-sm p-2.5">
            <div className="w-16 shrink-0">
              <p className="text-[11px] font-bold text-slate-700 truncate">{r.divisi}</p>
              <p className="text-[10px] text-slate-400">{r.total} item</p>
            </div>
            <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
              <div className="h-full bg-emerald-500" style={{ width: `${(r.aman / t) * 100}%` }} />
              <div className="h-full bg-amber-400" style={{ width: `${(r.waspada / t) * 100}%` }} />
              <div className="h-full bg-rose-500" style={{ width: `${(r.kritis / t) * 100}%` }} />
            </div>
            <div className="text-[10px] text-slate-500 tabular-nums shrink-0 w-16 text-right">
              <span className="text-emerald-600">{r.aman}</span>/
              <span className="text-amber-600">{r.waspada}</span>/
              <span className="text-rose-600">{r.kritis}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusPOCard({ data, loading, error, onRefresh }) {
  const items = data?.items || [];
  const [openKey, setOpenKey] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [msg, setMsg] = useState('');

  const confirm = async (row, status) => {
    const key = String(row.rowIndex ?? row.noPO ?? row.no ?? row.nama ?? '');
    setBusyKey(key);
    setMsg('');
    try {
      const res = await confirmPOStatus({
        noPO: row.noPO || row.no || '',
        nama: row.nama || row.name || '',
        status,
        rowIndex: row.rowIndex ?? row.row ?? null,
        qty: row.qty,
        datang: status === 'SELESAI' ? (row.qty || row.totalQty || 0) : status === 'SEBAGIAN' ? (row.datang || Math.ceil((row.qty || 0) / 2)) : 0,
      });
      if (res?.success === false) {
        setMsg(res.error || 'Gagal konfirmasi PO');
      } else {
        setMsg(`PO ditandai ${status}`);
        setOpenKey(null);
        onRefresh?.();
        try { window.dispatchEvent(new Event('gudangai-stock-refresh')); } catch (_) {}
      }
    } catch (e) {
      setMsg(e?.message || 'Gagal konfirmasi PO');
    } finally {
      setBusyKey(null);
    }
  };

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
              {loading ? 'Memuat…' : items.length ? `${items.length} baris · ketuk untuk konfirmasi` : 'Belum ada data'}
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
      {msg && (
        <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1">{msg}</p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-xs text-slate-400 py-1">Belum ada Status PO minggu ini. Cek sheet purchase order.</p>
      )}
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {items.slice(0, 20).map((row, i) => {
          const key = String(row.rowIndex ?? row.noPO ?? row.no ?? row.nama ?? i);
          const open = openKey === key;
          const busy = busyKey === key;
          const st = row.status || 'MENUNGGU';
          return (
            <div key={key} className="rounded-xl bg-slate-50 border border-slate-100 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenKey(open ? null : key)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left active:bg-slate-100"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">
                    {row.nama || row.name || row.keterangan || `PO ${i + 1}`}
                  </p>
                  <p className="text-[10px] text-slate-400 tabular-nums truncate">
                    {[row.noPO || row.no, row.qty != null ? `qty ${row.qty}` : null, row.datang != null ? `datang ${row.datang}` : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadgeClass(st)}`}>
                  {st}
                </span>
              </button>
              {open && (
                <div className="px-2.5 pb-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                  <button type="button" disabled={busy} onClick={() => confirm(row, 'SELESAI')}
                    className="flex-1 min-w-[5.5rem] py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold disabled:opacity-50">
                    {busy ? '…' : '✓ Selesai'}
                  </button>
                  <button type="button" disabled={busy} onClick={() => confirm(row, 'SEBAGIAN')}
                    className="flex-1 min-w-[5.5rem] py-1.5 rounded-lg bg-amber-500 text-white text-[11px] font-bold disabled:opacity-50">
                    Sebagian
                  </button>
                  <button type="button" disabled={busy} onClick={() => confirm(row, 'MENUNGGU')}
                    className="flex-1 min-w-[5.5rem] py-1.5 rounded-lg bg-slate-200 text-slate-700 text-[11px] font-bold disabled:opacity-50">
                    Menunggu
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function reminderLine(hour) {
  if (hour < 11) return { emoji: '🌅', text: 'Fokus input masuk pagi' };
  if (hour < 15) return { emoji: '☀️', text: 'Cek stok siang' };
  if (hour < 18) return { emoji: '🌤️', text: 'Siapkan PO sore' };
  return { emoji: '🌙', text: 'Tutup hari · cek antrian' };
}

export default function DashboardPage({ onNavigate }) {
  const { user } = useAuth();
  const { items: stockItems, loading: stockLoading, error: stockError, refresh } = useStock();
  const [poData, setPoData] = useState(null);
  const [poLoading, setPoLoading] = useState(true);
  const [poError, setPoError] = useState(null);
  const [pending, setPending] = useState(0);
  const hour = new Date().getHours();
  const remind = reminderLine(hour);

  const allItems = useMemo(() => {
    if (!stockItems) return [];
    if (Array.isArray(stockItems)) return stockItems;
    const cv = stockItems.cv || stockItems.CV || [];
    const pt = stockItems.pt || stockItems.PT || [];
    return [
      ...cv.map((x) => ({ ...x, entity: 'CV' })),
      ...pt.map((x) => ({ ...x, entity: 'PT' })),
    ];
  }, [stockItems]);

  const loadPO = useCallback(async () => {
    setPoLoading(true);
    setPoError(null);
    try {
      const res = await getStatusPO();
      if (res?.success === false) {
        setPoData({ items: [] });
        setPoError(res.error || 'Gagal memuat Status PO');
      } else {
        setPoData(res);
        setPoError(null);
      }
    } catch (err) {
      setPoError(err?.message || 'Gagal memuat Status PO');
      setPoData({ items: [] });
    } finally {
      setPoLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPO();
    try { setPending(getPendingQueue().length); } catch (_) {}
    const onVis = () => { if (document.visibilityState === 'visible') loadPO(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [loadPO]);

  const onRefreshAll = () => {
    refresh?.();
    loadPO();
    try { setPending(getPendingQueue().length); } catch (_) {}
  };

  const name = user?.name || user?.nama || 'Rudi Virawan';
  const email = user?.email || 'rudivirawan69@gmail.com';

  return (
    <div className="pb-24 space-y-3">
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-3.5">
        <div className="flex items-center gap-3">
          <img src={AVATAR_DATA_URL} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-cyan-200" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-400 font-medium">Beranda</p>
            <h2 className="text-base font-bold text-slate-900 truncate">Halo, {name}</h2>
            <p className="text-[11px] text-slate-500 truncate">{email}</p>
          </div>
          <button type="button" onClick={onRefreshAll} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200" aria-label="Refresh">
            <RefreshCw className={`w-4 h-4 text-slate-600 ${stockLoading || poLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="mt-3 rounded-xl bg-cyan-50 border border-cyan-100 px-3 py-2 flex items-center gap-2">
          <span className="text-base">{remind.emoji}</span>
          <p className="text-xs font-medium text-cyan-800">{remind.text}</p>
        </div>
      </div>

      {stockError && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {String(stockError).includes('Unauthorized') || String(stockError).includes('secret')
            ? 'Unauthorized — cek API Secret di Atur'
            : stockError}
        </div>
      )}

      <SummaryStatCards items={allItems} />
      <AnalisaStokCard items={allItems} />
      <StatusPOCard data={poData} loading={poLoading} error={poError} onRefresh={loadPO} />

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-3.5">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
            <ClipboardList className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800 leading-tight">Status Stok Per Divisi</h3>
            <p className="text-[10px] text-slate-400">Aman · Waspada · Kritis</p>
          </div>
        </div>
        <DivisionStatusBars items={allItems} />
      </div>

      {pending > 0 && (
        <button type="button" onClick={() => onNavigate?.('settings')}
          className="w-full rounded-xl bg-amber-50 border border-amber-200 py-3 text-sm font-semibold text-amber-800 flex items-center justify-center gap-2">
          {pending} antrian offline · buka Atur
        </button>
      )}

      <button type="button" onClick={() => onNavigate?.('input')}
        className="rounded-xl bg-white border border-slate-200 py-3 text-sm font-semibold text-slate-800 flex items-center justify-center gap-2 shadow-sm w-full">
        <Package className="w-4 h-4 text-cyan-600" /> Ke Input
      </button>
    </div>
  );
}
