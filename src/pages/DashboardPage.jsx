import { useMemo, useState, useEffect, useCallback } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import {
  getPendingQueue, getStatusPO,
} from '../data/api';
import { DIVISIONS } from '../data/master';
import {
  AlertTriangle, RefreshCw, FileText, Package, CheckCircle2, AlertCircle, ShieldAlert,
} from 'lucide-react';

function DivisionStatusBars({ items }) {
  const rows = useMemo(() => {
    const map = {};
    DIVISIONS.forEach((d) => { map[d] = { divisi: d, total: 0, aman: 0, waspada: 0, kritis: 0 }; });
    (items || []).forEach((it) => {
      const d = String(it.divisi || 'CS').trim() || 'CS';
      if (!map[d]) map[d] = { divisi: d, total: 0, aman: 0, waspada: 0, kritis: 0 };
      map[d].total += 1;
      const stok = Number(it.stok) || 0;
      const aman = Number(it.stockAman ?? it.aman ?? 0);
      if (aman > 0) {
        if (stok <= 0 || stok <= Math.max(5, Math.floor(aman * 0.25))) map[d].kritis += 1;
        else if (stok < aman) map[d].waspada += 1;
        else map[d].aman += 1;
      } else {
        if (stok <= 5) map[d].kritis += 1;
        else if (stok <= 20) map[d].waspada += 1;
        else map[d].aman += 1;
      }
    });
    return Object.values(map).filter((r) => r.total > 0).sort((a, b) => b.kritis - a.kritis || b.total - a.total);
  }, [items]);
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  if (rows.length === 0) {
    return <p className="text-[11px] text-slate-400 text-center py-3">Belum ada data divisi</p>;
  }
  return (
    <div className="space-y-3">
      {rows.map((r, idx) => {
        const pct = (n) => Math.max(n > 0 ? 3 : 0, Math.round((n / maxTotal) * 100));
        const kritisPct = r.total ? Math.round((r.kritis / r.total) * 100) : 0;
        return (
          <div
            key={r.divisi}
            className="animate-slide-up"
            style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'both' }}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-semibold text-slate-200 truncate">{r.divisi}</span>
              <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                {r.total} SKU · <span className="text-rose-400 font-medium">{kritisPct}%</span> kritis
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-800/80 overflow-hidden flex">
              <div
                className="h-full bg-emerald-500 transition-all duration-500 ease-out"
                style={{ width: `${pct(r.aman)}%` }}
              />
              <div
                className="h-full bg-amber-400 transition-all duration-500 ease-out"
                style={{ width: `${pct(r.waspada)}%` }}
              />
              <div
                className="h-full bg-rose-500 transition-all duration-500 ease-out"
                style={{ width: `${pct(r.kritis)}%` }}
              />
            </div>
            <div className="flex gap-3 mt-1 text-[9px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{r.aman}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{r.waspada}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />{r.kritis}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function normalizeStatusPO(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ok = raw.success === true || raw.status === 'OK' || raw.status === 'ok' || raw.status === 'APPLIED';
  if (!ok && raw.code === 'UNAUTHORIZED') {
    return { success: false, error: raw.error || 'Unauthorized — isi API Secret di Atur' };
  }
  if (!ok) {
    return { success: false, error: raw.error || 'Gagal memuat Status PO' };
  }
  const itemsRaw = raw.items || raw.data?.items || raw.list || raw.poItems || [];
  const items = (Array.isArray(itemsRaw) ? itemsRaw : []).map((it, idx) => {
    const statusRaw = String(it.status || it.Status || it.statusPO || it.keteranganStatus || '').trim();
    let status = statusRaw || 'Menunggu';
    const low = status.toLowerCase();
    if (low.includes('sebagian')) status = 'Sebagian';
    else if (low.includes('selesai') || low === 'datang' || (low.includes('datang') && !low.includes('belum'))) status = 'Selesai';
    else if (low.includes('belum') || low.includes('menunggu') || low.includes('aktif')) status = 'Menunggu';
    return {
      itemNo: it.itemNo || it.no || it.No || idx + 1,
      nama: it.nama || it.Nama || it.name || it.barang || '—',
      size: it.size || it.ukuran || it.Size || '',
      satuan: it.satuan || it.Satuan || 'Pack',
      tglRencana: it.tglRencana || it.tglKedatangan || it.tanggal || it.Tgl || '',
      qtyPO: Number(it.qtyPO ?? it.qty ?? it.Qty ?? it.jumlah ?? 0) || 0,
      qtyDatang: Number(it.qtyDatang ?? it.datang ?? it.qtyMasuk ?? 0) || 0,
      status,
    };
  });
  const summaryRaw = raw.summary || raw.data?.summary || raw.rekap || {};
  let menunggu = Number(summaryRaw.itemMenunggu ?? summaryRaw.menunggu ?? summaryRaw.pending ?? summaryRaw.belum ?? 0) || 0;
  let sebagian = Number(summaryRaw.itemSebagian ?? summaryRaw.sebagian ?? summaryRaw.partial ?? 0) || 0;
  let selesai = Number(summaryRaw.itemSelesai ?? summaryRaw.selesai ?? summaryRaw.done ?? summaryRaw.datang ?? 0) || 0;
  if (items.length && menunggu + sebagian + selesai === 0) {
    for (const it of items) {
      if (it.status === 'Selesai') selesai += 1;
      else if (it.status === 'Sebagian') sebagian += 1;
      else menunggu += 1;
    }
  }
  const totalItem = Number(summaryRaw.totalItem ?? summaryRaw.total ?? 0) || items.length || (menunggu + sebagian + selesai);
  const totalAktif = Number(summaryRaw.totalAktif ?? summaryRaw.aktif ?? 0) || (menunggu + sebagian);
  const totalKonfirmasi = Number(summaryRaw.totalKonfirmasi ?? summaryRaw.konfirmasi ?? 0) || selesai;
  return {
    success: true,
    noPO: raw.noPO || raw.no_po || raw.nomorPO || raw.poNumber || summaryRaw.noPO || '',
    weekLabel: raw.weekLabel || raw.minggu || summaryRaw.weekLabel || '',
    items,
    summary: { totalItem, itemMenunggu: menunggu, itemSebagian: sebagian, itemSelesai: selesai, totalAktif, totalKonfirmasi },
  };
}

function statusPOColor(status) {
  if (status === 'Selesai') return { bg: 'bg-emerald-500/15', text: 'text-emerald-300', bar: 'bg-emerald-500' };
  if (status === 'Sebagian') return { bg: 'bg-amber-500/15', text: 'text-amber-300', bar: 'bg-amber-400' };
  return { bg: 'bg-slate-500/20', text: 'text-slate-300', bar: 'bg-slate-400' };
}

function StatusPOCard({ data, loading, error, onRefresh }) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-slate-900/70 border border-slate-700/60 shadow-lg p-4 animate-slide-up backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-violet-500/20 flex items-center justify-center">
            <FileText className="w-4 h-4 text-violet-300" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Status Purchase Order</h3>
            <p className="text-[10px] text-slate-400">Memuat data PO…</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="skeleton h-3 rounded-full bg-slate-700" />
          <div className="skeleton h-14 rounded-xl bg-slate-700" />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl bg-slate-900/70 border border-amber-500/30 shadow-lg p-4 animate-slide-up backdrop-blur-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-violet-500/20 flex items-center justify-center">
              <FileText className="w-4 h-4 text-violet-300" />
            </div>
            <h3 className="text-sm font-semibold text-slate-100">Status Purchase Order</h3>
          </div>
          <button type="button" onClick={onRefresh} className="text-[11px] text-cyan-300 font-medium">
            Muat ulang
          </button>
        </div>
        <p className="text-[11px] text-amber-200 bg-amber-500/10 rounded-xl px-3 py-2.5 border border-amber-500/20">
          {error}
        </p>
      </div>
    );
  }
  if (!data || !data.success) {
    return (
      <div className="rounded-2xl bg-slate-900/70 border border-slate-700/60 shadow-lg p-4 animate-slide-up backdrop-blur-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-violet-500/20 flex items-center justify-center">
              <FileText className="w-4 h-4 text-violet-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Status Purchase Order</h3>
              <p className="text-[10px] text-slate-400">Belum ada data PO aktif</p>
            </div>
          </div>
          <button type="button" onClick={onRefresh} className="text-[11px] text-cyan-300 font-medium">
            Muat ulang
          </button>
        </div>
        <p className="text-[11px] text-slate-400 bg-slate-800/60 rounded-xl px-3 py-2.5 border border-slate-700/50">
          Pastikan sheet <b className="text-slate-200">purchase order</b> terisi & API Secret benar di Atur.
        </p>
      </div>
    );
  }
  const summary = data.summary || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const noPO = data.noPO;
  const totalItem = summary.totalItem || items.length || 0;
  const menunggu = summary.itemMenunggu || 0;
  const sebagian = summary.itemSebagian || 0;
  const selesai = summary.itemSelesai || 0;
  const totalAktif = summary.totalAktif || 0;
  const totalKonfirmasi = summary.totalKonfirmasi || 0;
  const progressPct = totalItem > 0 ? Math.round(((selesai + sebagian * 0.5) / totalItem) * 100) : 0;
  const size = 132;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const totalSeg = Math.max(1, menunggu + sebagian + selesai);
  const segMenunggu = (menunggu / totalSeg) * c;
  const segSebagian = (sebagian / totalSeg) * c;
  const segSelesai = (selesai / totalSeg) * c;
  const offsetSebagian = segMenunggu;
  const offsetSelesai = segMenunggu + segSebagian;
  return (
    <div className="rounded-2xl bg-slate-900/70 border border-slate-700/60 shadow-lg p-4 animate-slide-up backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-violet-500/25">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-100 leading-tight">Status Purchase Order</h3>
            <p className="text-[10px] text-slate-400 truncate">
              {noPO ? `No. PO ${noPO}` : 'Tidak ada No. PO aktif'} · {totalItem} item
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="w-8 h-8 rounded-full bg-slate-800/80 border border-slate-600/50 flex items-center justify-center text-slate-300 active:scale-95 shrink-0"
          aria-label="Refresh PO"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-center gap-4 mb-4">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke} />
            {menunggu > 0 && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={stroke}
                strokeDasharray={`${segMenunggu} ${c - segMenunggu}`}
                strokeDashoffset={0}
                strokeLinecap="butt"
              />
            )}
            {sebagian > 0 && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="#fbbf24"
                strokeWidth={stroke}
                strokeDasharray={`${segSebagian} ${c - segSebagian}`}
                strokeDashoffset={-offsetSebagian}
                strokeLinecap="butt"
              />
            )}
            {selesai > 0 && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="#10b981"
                strokeWidth={stroke}
                strokeDasharray={`${segSelesai} ${c - segSelesai}`}
                strokeDashoffset={-offsetSelesai}
                strokeLinecap="butt"
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold text-slate-100 tabular-nums leading-none">{progressPct}%</span>
            <span className="text-[10px] text-slate-400 mt-0.5 font-medium">Progress</span>
          </div>
        </div>
        <div className="flex flex-col gap-2.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400 leading-none">Menunggu</p>
              <p className="text-sm font-bold text-slate-100 tabular-nums">{menunggu}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400 leading-none">Sebagian</p>
              <p className="text-sm font-bold text-amber-300 tabular-nums">{sebagian}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400 leading-none">Selesai</p>
              <p className="text-sm font-bold text-emerald-300 tabular-nums">{selesai}</p>
            </div>
          </div>
        </div>
      </div>
      {totalItem === 0 && (
        <p className="text-[11px] text-slate-400 bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5 mb-3">
          Belum ada baris Status PO minggu ini. Cek sheet <b className="text-slate-200">purchase order</b> / jalankan refresh dashboard di Apps Script.
        </p>
      )}
      <div className="flex justify-between mb-3 px-0.5 text-[10px] text-slate-400">
        <span>
          Konfirmasi <b className="text-slate-200">{Number(totalKonfirmasi).toLocaleString('id-ID')}</b>
        </span>
        <span>
          Sisa aktif <b className="text-slate-200">{Number(totalAktif).toLocaleString('id-ID')}</b>
        </span>
      </div>
      {items.length > 0 && (
        <div className="space-y-0 divide-y divide-slate-700/50 max-h-56 overflow-y-auto -mx-1 px-1">
          {items.slice(0, 8).map((it, idx) => {
            const st = it.status || 'Menunggu';
            const col = statusPOColor(st);
            const qtyPO = Number(it.qtyPO) || 0;
            const qtyDatang = Number(it.qtyDatang) || 0;
            const pct = qtyPO > 0 ? Math.min(100, Math.round((qtyDatang / qtyPO) * 100) : 0;
            return (
              <div key={it.itemNo || idx} className="py-2.5 first:pt-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-slate-100 truncate">
                      <span className="text-slate-500 font-medium mr-1.5">
                        #{String(it.itemNo || idx + 1).padStart(2, '0')}
                      </span>
                      {it.nama}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {it.size ? `${it.size} · ` : ''}
                      {it.satuan || 'Pack'}
                      {it.tglRencana ? ` · Rencana ${it.tglRencana}` : ''}
                    </p>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${col.text} ${col.bg}`}>
                    {st}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${col.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                    {qtyDatang}/{qtyPO}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const { user } = useAuth();
  const [poData, setPoData] = useState(null);
  const [poLoading, setPoLoading] = useState(true);
  const [poError, setPoError] = useState(null);
  const allItems = useMemo(
    () => [...(stockCV.items || []), ...(stockPT.items || [])],
    [stockCV.items, stockPT.items],
  );
  const stats = useMemo(() => {
    const total = allItems.length;
    let aman = 0;
    let waspada = 0;
    let kritis = 0;
    let totalUnit = 0;
    allItems.forEach((it) => {
      const s = Number(it.stok) || 0;
      totalUnit += s;
      const a = Number(it.stockAman ?? it.aman ?? 0);
      if (a > 0) {
        if (s <= 0 || s <= Math.max(5, Math.floor(a * 0.25))) kritis += 1;
        else if (s < a) waspada += 1;
        else aman += 1;
      } else {
        if (s <= 5) kritis += 1;
        else if (s <= 20) waspada += 1;
        else aman += 1;
      }
    });
    return { total, aman, waspada, kritis, totalUnit };
  }, [allItems]);

  const loadPO = useCallback(async () => {
    setPoLoading(true);
    setPoError(null);
    try {
      const res = await getStatusPO();
      const norm = normalizeStatusPO(res);
      if (norm && norm.success) {
        setPoData(norm);
        setPoError(null);
      } else {
        setPoData(null);
        setPoError(norm?.error || res?.error || 'Gagal memuat Status PO');
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
    const t = setInterval(loadPO, 60000);
    return () => clearInterval(t);
  }, [loadPO]);

  const pending = getPendingQueue().length;
  const lastSync = stockCV.lastRefresh || stockPT.lastRefresh;
  const hour = new Date().getHours();
  const firstName = (user?.name || 'Rudi').split(' ')[0];
  let greeting = 'Selamat malam';
  let reminder = 'Jangan lupa input data real-time ya.';
  if (hour >= 4 && hour < 10) {
    greeting = 'Selamat pagi';
    reminder = 'Cek kedatangan barang ya';
  } else if (hour >= 10 && hour < 15) {
    greeting = 'Selamat siang';
    reminder = 'Jangan lupa input barang datang';
  } else if (hour >= 15 && hour < 18) {
    greeting = 'Selamat sore';
    reminder = 'Apakah pengeluaran hari ini sudah diinput? Jangan lupa input data real-time ya.';
  }

  const pct = (n) => (stats.total ? Math.round((n / stats.total) * 100) : 0);
  const updateLabel = lastSync
    ? lastSync.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="pb-6 animate-fade-in space-y-3">
      {/* Header / branding */}
      <div className="rounded-2xl bg-slate-900/75 border border-slate-700/50 shadow-lg p-3.5 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shrink-0 shadow-md shadow-cyan-500/30">
              <span className="text-white font-bold text-sm">N69</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-50 leading-tight truncate">NASGOR 69</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-soft-pulse" />
                <span className="text-[10px] text-emerald-300/90 font-medium">System Active · Live Sync</span>
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-slate-400 tabular-nums">Update {updateLabel}</p>
          </div>
        </div>
        <p className="text-sm font-semibold text-slate-100">
          {greeting}, {firstName}
        </p>
        <p className="text-[11px] text-cyan-300/90 leading-snug mt-0.5">{reminder}</p>
      </div>

      {/* Summary cards — 2×2 grid matching Gemini layout */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* TOTAL ITEM */}
        <div className="rounded-2xl bg-slate-900/70 border border-slate-600/40 p-3.5 shadow-md backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Total Item</p>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 flex items-center justify-center">
              <Package className="w-4 h-4 text-cyan-300" />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-slate-50 leading-none">{stats.total}</p>
          <p className="text-[10px] text-slate-400 mt-1.5">Semua Entitas CV & PT</p>
        </div>

        {/* KRITIS */}
        <div className="rounded-2xl bg-slate-900/70 border border-rose-500/35 p-3.5 shadow-md backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-rose-300/90 uppercase tracking-wide">Kritis</p>
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-rose-400 leading-none">
            {stats.kritis}
            <span className="text-sm font-semibold text-rose-400/70 ml-1">({pct(stats.kritis)}%)</span>
          </p>
          <p className="text-[10px] text-rose-300/70 mt-1.5">Stok di bawah batas minimal</p>
        </div>

        {/* WASPADA */}
        <div className="rounded-2xl bg-slate-900/70 border border-amber-500/35 p-3.5 shadow-md backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-amber-300/90 uppercase tracking-wide">Waspada</p>
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-amber-400 leading-none">
            {stats.waspada}
            <span className="text-sm font-semibold text-amber-400/70 ml-1">({pct(stats.waspada)}%)</span>
          </p>
          <p className="text-[10px] text-amber-300/70 mt-1.5">Mendekati ambang batas</p>
        </div>

        {/* AMAN */}
        <div className="rounded-2xl bg-slate-900/70 border border-emerald-500/35 p-3.5 shadow-md backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-emerald-300/90 uppercase tracking-wide">Aman</p>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-emerald-400 leading-none">
            {stats.aman}
            <span className="text-sm font-semibold text-emerald-400/70 ml-1">({pct(stats.aman)}%)</span>
          </p>
          <p className="text-[10px] text-emerald-300/70 mt-1.5">Kapasitas stok tercukupi</p>
        </div>
      </div>

      {/* Title banner */}
      <div className="rounded-xl bg-gradient-to-r from-slate-800/80 to-slate-900/80 border border-slate-700/40 px-3.5 py-2.5 text-center">
        <p className="text-[13px] font-bold text-slate-100 tracking-wide">DASHBOARD GUDANG NASGOR 69</p>
        <p className="text-[10px] text-slate-400 mt-0.5">Sistem Pemantauan Stok & Logistik Realtime</p>
      </div>

      {/* Status PO */}
      <StatusPOCard data={poData} loading={poLoading} error={poError} onRefresh={loadPO} />

      {/* Status per Divisi */}
      <div className="rounded-2xl bg-slate-900/70 border border-slate-700/60 shadow-lg p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-cyan-500/15 flex items-center justify-center">
            <Package className="w-4 h-4 text-cyan-300" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Status Stok Per Divisi</h3>
            <p className="text-[10px] text-slate-400">Aman · Waspada · Kritis</p>
          </div>
        </div>
        <DivisionStatusBars items={allItems} />
      </div>

      {pending > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2.5 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-[11px] text-amber-200">
            <b>{pending}</b> transaksi menunggu sync — buka Atur
          </span>
        </div>
      )}
    </div>
  );
}
