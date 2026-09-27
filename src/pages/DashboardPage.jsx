import { useMemo, useState, useEffect, useCallback } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import {
  getPendingQueue, getStatusPO,
} from '../data/api';
import { DIVISIONS } from '../data/master';
import {
  AlertTriangle, RefreshCw, FileText, Package, Snowflake,
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
  if (rows.length === 0) return <p className="text-[11px] text-slate-400 text-center py-3">Belum ada data divisi</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((r, idx) => {
        const pct = (n) => Math.max(n > 0 ? 4 : 0, Math.round((n / maxTotal) * 100));
        const kritisPct = r.total ? Math.round((r.kritis / r.total) * 100) : 0;
        return (
          <div key={r.divisi} className="animate-slide-up" style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'both' }}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-semibold text-slate-700 truncate">{r.divisi}</span>
              <span className="text-[10px] text-slate-400 tabular-nums shrink-0">{r.total} SKU · <span className="text-red-600 font-medium">{kritisPct}%</span> kritis</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
              <div className="h-full bg-emerald-500" style={{ width: `${pct(r.aman)}%` }} />
              <div className="h-full bg-amber-400" style={{ width: `${pct(r.waspada)}%` }} />
              <div className="h-full bg-red-500" style={{ width: `${pct(r.kritis)}%` }} />
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
  if (!ok) return { success: false, error: raw.error || 'Gagal memuat Status PO' };
  const itemsRaw = raw.items || raw.data?.items || raw.list || [];
  const items = (Array.isArray(itemsRaw) ? itemsRaw : []).map((it, idx) => {
    const statusRaw = String(it.status || it.Status || '').trim();
    let status = statusRaw || 'Menunggu';
    const low = status.toLowerCase();
    if (low.includes('sebagian')) status = 'Sebagian';
    else if (low.includes('selesai') || low === 'datang') status = 'Selesai';
    else if (low.includes('belum') || low.includes('menunggu')) status = 'Menunggu';
    return {
      itemNo: it.itemNo || it.no || idx + 1,
      nama: it.nama || it.Nama || it.name || '—',
      size: it.size || '',
      satuan: it.satuan || 'Pack',
      tglRencana: it.tglRencana || it.tglKedatangan || '',
      qtyPO: Number(it.qtyPO ?? it.qty ?? 0) || 0,
      qtyDatang: Number(it.qtyDatang ?? it.datang ?? 0) || 0,
      status,
    };
  });
  const summaryRaw = raw.summary || raw.data?.summary || {};
  let menunggu = Number(summaryRaw.itemMenunggu ?? summaryRaw.menunggu ?? 0) || 0;
  let sebagian = Number(summaryRaw.itemSebagian ?? summaryRaw.sebagian ?? 0) || 0;
  let selesai = Number(summaryRaw.itemSelesai ?? summaryRaw.selesai ?? 0) || 0;
  if (items.length && menunggu + sebagian + selesai === 0) {
    for (const it of items) {
      if (it.status === 'Selesai') selesai += 1;
      else if (it.status === 'Sebagian') sebagian += 1;
      else menunggu += 1;
    }
  }
  const totalItem = Number(summaryRaw.totalItem ?? 0) || items.length || (menunggu + sebagian + selesai);
  return {
    success: true,
    noPO: raw.noPO || summaryRaw.noPO || '',
    items,
    summary: { totalItem, itemMenunggu: menunggu, itemSebagian: sebagian, itemSelesai: selesai, totalAktif: menunggu + sebagian, totalKonfirmasi: selesai },
  };
}

function StatusPOCard({ data, loading, error, onRefresh }) {
  if (loading) {
    return (
      <div className="section-card">
        <div className="p-3.5 flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center"><FileText className="w-4 h-4 text-violet-600" /></div>
          <div><h3 className="text-sm font-semibold text-slate-800">Status Purchase Order</h3><p className="text-[10px] text-slate-400">Memuat…</p></div>
        </div>
        <div className="skeleton h-14 rounded-xl" />
      </div>
    );
  }
  if (error || !data?.success) {
    return (
      <div className="section-card">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center"><FileText className="w-4 h-4 text-violet-600" /></div>
            <h3 className="text-sm font-semibold text-slate-800">Status Purchase Order</h3>
          </div>
          <button type="button" onClick={onRefresh} className="text-[11px] text-cyan-700 font-medium">Muat ulang</button>
        </div>
        <p className="info-box px-3 py-2.5 text-[11px]">{error || 'Belum ada data PO aktif. Pastikan API Secret di Atur.'}</p>
      </div>
    );
  }
  const summary = data.summary || {};
  const items = data.items || [];
  const totalItem = summary.totalItem || 0;
  const menunggu = summary.itemMenunggu || 0;
  const sebagian = summary.itemSebagian || 0;
  const selesai = summary.itemSelesai || 0;
  const progressPct = totalItem > 0 ? Math.round(((selesai + sebagian * 0.5) / totalItem) * 100) : 0;
  return (
    <div className="section-card">
      <div className="section-card-header">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-white" /></div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-800">Status Purchase Order</h3>
            <p className="text-[10px] text-slate-400 truncate">{data.noPO ? `No. PO ${data.noPO}` : 'PO aktif'} · {totalItem} item</p>
          </div>
        </div>
        <button type="button" onClick={onRefresh} className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500" aria-label="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3.5">
        <div className="metric-card border-cyan-200 bg-cyan-50/50 py-2 text-center"><p className="text-[9px] text-cyan-700 font-semibold uppercase">Progress</p><p className="metric-value text-cyan-800">{progressPct}%</p></div>
        <div className="metric-card py-2 text-center"><p className="text-[9px] text-slate-500 font-semibold uppercase">Menunggu</p><p className="metric-value text-slate-600">{menunggu}</p></div>
        <div className="metric-card border-amber-200 bg-amber-50 py-2 text-center"><p className="text-[9px] text-amber-600 font-semibold uppercase">Sebagian</p><p className="text-lg font-bold text-amber-700">{sebagian}</p></div>
        <div className="metric-card border-emerald-200 bg-emerald-50 py-2 text-center"><p className="text-[9px] text-emerald-600 font-semibold uppercase">Selesai</p><p className="text-lg font-bold text-emerald-700">{selesai}</p></div>
      </div>
      {items.length > 0 && (
        <div className="mx-3.5 mb-3.5 space-y-0 divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
          {items.slice(0, 8).map((it, idx) => (
            <div key={it.itemNo || idx} className="py-2 first:pt-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12px] font-semibold text-slate-800 truncate"><span className="text-slate-400 mr-1">#{String(it.itemNo || idx + 1).padStart(2, '0')}</span>{it.nama}</p>
                <span className={`status-pill ${it.status === 'Selesai' ? 'status-pill-safe' : it.status === 'Sebagian' ? 'status-pill-warn' : 'status-pill-neutral'}`}>{it.status}</span>
              </div>
              <p className="text-[10px] text-slate-400">{it.qtyDatang}/{it.qtyPO} {it.satuan}</p>
            </div>
          ))}
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
  const allItems = useMemo(() => [...(stockCV.items || []), ...(stockPT.items || [])], [stockCV.items, stockPT.items]);
  const stats = useMemo(() => {
    let aman = 0, waspada = 0, kritis = 0, totalUnit = 0;
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
    return { total: allItems.length, aman, waspada, kritis, totalUnit };
  }, [allItems]);
  const loadPO = useCallback(async () => {
    setPoLoading(true);
    setPoError(null);
    try {
      const res = await getStatusPO();
      const norm = normalizeStatusPO(res);
      if (norm?.success) { setPoData(norm); setPoError(null); }
      else { setPoData(null); setPoError(norm?.error || res?.error || 'Gagal memuat Status PO'); }
    } catch (err) {
      setPoError(err?.message || 'Gagal memuat Status PO');
      setPoData(null);
    } finally { setPoLoading(false); }
  }, []);
  useEffect(() => { loadPO(); const t = setInterval(loadPO, 60000); return () => clearInterval(t); }, [loadPO]);
  const pending = getPendingQueue().length;
  const lastSync = stockCV.lastRefresh || stockPT.lastRefresh;
  const hour = new Date().getHours();
  const firstName = (user?.name || 'Rudy').split(' ')[0];
  let greeting = 'Selamat malam';
  let reminder = null;
  if (hour >= 4 && hour < 10) { greeting = 'Selamat pagi'; reminder = 'Cek kedatangan barang ya'; }
  else if (hour >= 10 && hour < 15) { greeting = 'Selamat siang'; reminder = 'jangan lupa input barang datang'; }
  else if (hour >= 15 && hour < 18) { greeting = 'Selamat sore'; reminder = 'apakah pengeluaran hari ini sudah di input...'; }
  const now = new Date();
  const dateLabel = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeLabel = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const loading = stockCV.loading || stockPT.loading;

  return (
    <div className="pb-6 animate-fade-in space-y-3">
      <div className="page-header">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="page-kicker flex items-center gap-2"><Snowflake className="w-3.5 h-3.5" /> GudangAI RUDY · Beranda</div>
            <div className="page-title">{greeting}, <span className="text-cyan-700">{firstName}</span></div>
            <p className="page-subtitle">{dateLabel} · <span className="tabular-nums font-semibold text-slate-700">{timeLabel}</span>{lastSync ? ' · Stok sinkron ' + lastSync.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}</p>
            {reminder && <p className="text-[11px] font-bold text-pink-600 mt-2">{reminder}</p>}
          </div>
          <button type="button" onClick={() => { stockCV.refresh(); stockPT.refresh(); loadPO(); }} disabled={loading}
            className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 shadow-sm shrink-0" aria-label="Refresh beranda">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="mt-3.5 grid grid-cols-3 gap-2">
          <div className="metric-card px-2 py-2.5 text-center">
            <p className="metric-label text-slate-500">Total SKU</p>
            <p className="metric-value text-slate-900">{loading ? '…' : stats.total}</p>
            <p className="text-[9px] text-slate-400">{stats.totalUnit.toLocaleString('id-ID')} unit</p>
          </div>
          <div className="metric-card border-emerald-200 bg-emerald-50/60 px-2 py-2.5 text-center">
            <p className="metric-label text-emerald-700">Aman</p>
            <p className="metric-value text-emerald-700">{loading ? '…' : stats.aman}</p>
            <p className="text-[9px] text-emerald-600/70">{stats.total ? Math.round((stats.aman / stats.total) * 100) : 0}% SKU</p>
          </div>
          <div className="metric-card border-red-200 bg-red-50/60 px-2 py-2.5 text-center">
            <p className="metric-label text-red-700">Kritis</p>
            <p className="metric-value text-red-700">{loading ? '…' : stats.kritis}</p>
            <p className="text-[9px] text-amber-600">{stats.waspada} waspada</p>
          </div>
        </div>
        <p className="mt-2 text-[9px] text-slate-400">Data gabungan CV + PT · pembaruan stok & PO otomatis</p>
      </div>

      <StatusPOCard data={poData} loading={poLoading} error={poError} onRefresh={loadPO} />

      <div className="section-card">
        <div className="section-card-header">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-50 flex items-center justify-center"><Package className="w-4 h-4 text-cyan-600" /></div>
            <div><p className="section-label">Distribusi operasional</p><h2 className="text-sm font-bold text-slate-800">Status per Divisi</h2></div>
          </div>
          <span className="status-pill status-pill-neutral">CV + PT</span>
        </div>
        <div className="p-3.5">
          <div className="mb-3 text-[10px] text-slate-500 font-semibold">7 divisi aktif · hijau aman · kuning waspada · merah kritis</div>
          <DivisionStatusBars items={allItems} />
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="status-pill status-pill-safe">Aman</span>
            <span className="status-pill status-pill-warn">Waspada</span>
            <span className="status-pill status-pill-danger">Kritis</span>
          </div>
        </div>
      </div>

      {pending > 0 && (
        <div className="info-box info-box-warn px-3 py-2.5 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-[11px] text-amber-800"><b>{pending}</b> transaksi menunggu sync — buka Atur</span>
        </div>
      )}
    </div>
  );
}
