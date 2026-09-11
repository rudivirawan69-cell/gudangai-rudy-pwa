import { useMemo, useState, useEffect, useCallback } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import {
  getPendingQueue, getStatusPO, getNotifications, markNotificationsRead, unreadNotificationCount,
} from '../data/api';
import { DIVISIONS } from '../data/master';
import {
  AlertTriangle, ShieldCheck, WifiOff, ChevronRight, RefreshCw,
  Snowflake, FileText, Package, Bell
} from 'lucide-react';

function statusChip(stok) {
  if (stok <= 0) return { label: 'Habis', cls: 'bg-slate-100 text-slate-600' };
  if (stok <= 5) return { label: 'Kritis', cls: 'bg-red-50 text-red-600' };
  if (stok <= 20) return { label: 'Waspada', cls: 'bg-amber-50 text-amber-700' };
  return { label: 'Aman', cls: 'bg-emerald-50 text-emerald-700' };
}

function DivisionStatusBars({ items }) {
  const rows = useMemo(() => {
    const map = {};
    DIVISIONS.forEach((d) => { map[d] = { divisi: d, total: 0, aman: 0, waspada: 0, kritis: 0 }; });
    items.forEach((it) => {
      const d = it.divisi || 'CS';
      if (!map[d]) map[d] = { divisi: d, total: 0, aman: 0, waspada: 0, kritis: 0 };
      map[d].total += 1;
      if (it.stok <= 5) map[d].kritis += 1;
      else if (it.stok <= 20) map[d].waspada += 1;
      else map[d].aman += 1;
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
              <div className="h-full bg-emerald-500 transition-all duration-500 ease-out" style={{ width: `${pct(r.aman)}%` }} />
              <div className="h-full bg-amber-400 transition-all duration-500 ease-out" style={{ width: `${pct(r.waspada)}%` }} />
              <div className="h-full bg-red-500 transition-all duration-500 ease-out" style={{ width: `${pct(r.kritis)}%` }} />
            </div>
            <div className="flex gap-3 mt-0.5 text-[9px] text-slate-400">
              <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{r.aman}</span>
              <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{r.waspada}</span>
              <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{r.kritis}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function statusPOColor(status) {
  if (status === 'Selesai') return { bg: 'bg-emerald-50/80', text: 'text-emerald-700', bar: 'bg-emerald-500', border: 'border-emerald-100/80' };
  if (status === 'Sebagian') return { bg: 'bg-amber-50/80', text: 'text-amber-700', bar: 'bg-amber-400', border: 'border-amber-100/80' };
  return { bg: 'bg-slate-50/80', text: 'text-slate-600', bar: 'bg-slate-300', border: 'border-slate-100/80' };
}

/** Status PO — soft list style (bukan kotak statistik seperti SKU) */
function StatusPOCard({ data, loading, error, onRefresh }) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 animate-slide-up">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center">
            <FileText className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Status Purchase Order</h3>
            <p className="text-[10px] text-slate-400">Memuat data PO…</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="skeleton h-3 rounded-full" />
          <div className="skeleton h-14 rounded-xl" />
          <div className="skeleton h-14 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-white border border-amber-100 shadow-sm p-4 animate-slide-up">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center">
              <FileText className="w-4 h-4 text-violet-600" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Status Purchase Order</h3>
          </div>
          <button type="button" onClick={onRefresh} className="text-[11px] text-cyan-700 font-medium">Muat ulang</button>
        </div>
        <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">{error}</p>
      </div>
    );
  }

  if (!data || !data.success) {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 animate-slide-up">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center">
            <FileText className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Status Purchase Order</h3>
            <p className="text-[10px] text-slate-400">Belum ada data PO aktif</p>
          </div>
        </div>
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
  const selesaiPct = totalItem ? Math.round((selesai / totalItem) * 100) : 0;
  const sebagianPct = totalItem ? Math.round((sebagian / totalItem) * 100) : 0;

  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-800 leading-tight">Status Purchase Order</h3>
            <p className="text-[10px] text-slate-400 truncate">
              {noPO ? `No. PO ${noPO}` : 'Tidak ada No. PO aktif'} · {totalItem} item
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500 active:scale-95 shrink-0"
          aria-label="Refresh PO"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-2.5 text-[11px]">
        <span className="inline-flex items-center gap-1 text-slate-600">
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          Menunggu <b className="tabular-nums text-slate-800">{menunggu}</b>
        </span>
        <span className="inline-flex items-center gap-1 text-amber-700">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          Sebagian <b className="tabular-nums">{sebagian}</b>
        </span>
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Selesai <b className="tabular-nums">{selesai}</b>
        </span>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-500 font-medium">Progress kedatangan</span>
          <span className="text-[12px] font-bold text-violet-700 tabular-nums">{progressPct}%</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${selesaiPct}%` }} />
          <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${sebagianPct}%` }} />
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-slate-400">
          <span>Konfirmasi <b className="text-slate-600">{Number(totalKonfirmasi).toLocaleString('id-ID')}</b></span>
          <span>Sisa aktif <b className="text-slate-600">{Number(totalAktif).toLocaleString('id-ID')}</b></span>
        </div>
      </div>

      {items.length > 0 && (
        <div className="space-y-0 divide-y divide-slate-100 max-h-56 overflow-y-auto -mx-1 px-1">
          {items.slice(0, 8).map((it, idx) => {
            const st = it.status || 'Menunggu';
            const col = statusPOColor(st);
            const qtyPO = Number(it.qtyPO) || 0;
            const qtyDatang = Number(it.qtyDatang) || 0;
            const pct = qtyPO > 0 ? Math.min(100, Math.round((qtyDatang / qtyPO) * 100)) : 0;
            return (
              <div key={it.itemNo || idx} className="py-2.5 first:pt-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-slate-800 truncate">
                      <span className="text-slate-400 font-medium mr-1.5">#{String(it.itemNo || idx + 1).padStart(2, '0')}</span>
                      {it.nama}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {it.size ? `${it.size} · ` : ''}{it.satuan || 'Pack'}
                      {it.tglRencana ? ` · Rencana ${it.tglRencana}` : ''}
                    </p>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${col.text} ${col.bg}`}>{st}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${col.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-600 tabular-nums shrink-0">{qtyDatang}/{qtyPO}</span>
                </div>
              </div>
            );
          })}
          {items.length > 8 && (
            <p className="text-[10px] text-slate-400 text-center py-2">+{items.length - 8} item lainnya</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage({ onNavigate }) {
  const { user } = useAuth();
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const statsCV = useMemo(() => stockCV.getStats(), [stockCV.items]);
  const statsPT = useMemo(() => stockPT.getStats(), [stockPT.items]);
  const pendingQueue = getPendingQueue();
  const isOnline = navigator.onLine;
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 11 ? 'Selamat Pagi' : hour < 15 ? 'Selamat Siang' : hour < 18 ? 'Selamat Sore' : 'Selamat Malam';
  const dateLabel = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const totalItems = statsCV.total + statsPT.total;
  const kritis = statsCV.danger + statsPT.danger + statsCV.zero + statsPT.zero;
  const waspada = statsCV.warning + statsPT.warning;
  const aman = statsCV.safe + statsPT.safe;
  const totalStokUnits = statsCV.totalStok + statsPT.totalStok;
  const loading = stockCV.loading || stockPT.loading;
  const lastRefresh = stockCV.lastRefresh || stockPT.lastRefresh;

  const [poData, setPoData] = useState(null);
  const [poLoading, setPoLoading] = useState(true);
  const [poError, setPoError] = useState(null);
  const [showNotif, setShowNotif] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);

  const refreshNotifications = useCallback(() => {
    setNotifs(getNotifications());
    setUnread(unreadNotificationCount());
  }, []);

  useEffect(() => {
    refreshNotifications();
    window.addEventListener('gudangai-notif', refreshNotifications);
    return () => window.removeEventListener('gudangai-notif', refreshNotifications);
  }, [refreshNotifications]);

  const toggleNotifications = () => {
    const next = !showNotif;
    setShowNotif(next);
    if (next) {
      markNotificationsRead();
      setUnread(0);
    }
  };

  const loadStatusPO = useCallback(async () => {
    setPoLoading(true);
    setPoError(null);
    try {
      const res = await getStatusPO();
      if (res && res.success) {
        setPoData(res);
        setPoError(null);
      } else {
        setPoData(res);
        setPoError(res?.error || 'Gagal memuat Status PO');
      }
    } catch (err) {
      setPoError(err?.message || 'Gagal memuat Status PO');
    } finally {
      setPoLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatusPO();
    const id = setInterval(() => {
      if (navigator.onLine) loadStatusPO();
    }, 90000);
    return () => clearInterval(id);
  }, [loadStatusPO]);

  const allItems = useMemo(
    () => [...(stockCV.items || []), ...(stockPT.items || [])],
    [stockCV.items, stockPT.items]
  );

  const criticalItems = useMemo(() => {
    return [
      ...stockCV.items.filter((i) => i.stok <= 5).map((i) => ({ ...i, entity: 'CV' })),
      ...stockPT.items.filter((i) => i.stok <= 5).map((i) => ({ ...i, entity: 'PT' })),
    ]
      .sort((a, b) => a.stok - b.stok)
      .slice(0, 5);
  }, [stockCV.items, stockPT.items]);

  return (
    <div className="pb-3 animate-fade-in space-y-3">
      <div className="bg-gradient-to-br from-[#063b3a] via-[#075e54] to-[#0a766b] rounded-2xl p-4 shadow-xl relative overflow-visible animate-slide-up">
        <div className="absolute top-0 right-0 w-36 h-36 bg-teal-300/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Snowflake className="w-4 h-4 text-teal-200 shrink-0" />
                <span className="text-[11px] text-teal-100/90 font-medium tracking-wide">GudangAI RUDY</span>
                <span
                  className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                    isOnline ? 'bg-emerald-400/20 text-emerald-200' : 'bg-red-400/20 text-red-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-300' : 'bg-red-300'}`} />
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <h1 className="text-xl font-bold text-white leading-tight tracking-tight">{greeting},</h1>
              <p className="text-base font-semibold text-teal-50/95 truncate">{user?.name || 'Rudi Virawan'}</p>
              <p className="text-[11px] text-teal-100/70 mt-0.5 capitalize">{dateLabel}</p>
              {lastRefresh && (
                <p className="text-[10px] text-teal-100/60 mt-0.5">
                  Stok disinkron {lastRefresh.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="relative">
                <button type="button" onClick={toggleNotifications} className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white/90 active:scale-95" aria-label="Notifikasi">
                  <Bell className="w-4 h-4" />
                  {unread > 0 && <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
                </button>
                {showNotif && <div className="absolute right-0 top-11 z-50 w-64 rounded-2xl bg-white border border-slate-100 shadow-xl p-3 text-left">
                  <div className="flex items-center justify-between mb-2"><p className="text-xs font-bold text-slate-800">Notifikasi</p><span className="text-[10px] text-slate-400">Terbaru</span></div>
                  {notifs.length === 0 ? <p className="text-[11px] text-slate-400 text-center py-3">Belum ada notifikasi</p> : <ul className="space-y-2 max-h-56 overflow-y-auto">{notifs.slice(0, 12).map((n) => <li key={n.id} className="text-[11px] border-b border-slate-50 pb-2 last:border-0"><p className={`font-semibold ${n.type === 'ok' ? 'text-emerald-700' : n.type === 'err' ? 'text-rose-700' : 'text-amber-700'}`}>{n.title}</p><p className="text-slate-500">{n.body}</p></li>)}</ul>}
                </div>}
              </div>
              <button type="button" onClick={() => { stockCV.refresh(); stockPT.refresh(); loadStatusPO(); }} disabled={loading} className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white/80 active:scale-95" aria-label="Refresh"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/10 border border-white/10 px-2 py-2.5 text-center">
              <p className="text-[9px] uppercase tracking-wider text-blue-100/70">Total SKU</p>
              <p className="text-lg font-bold text-white tabular-nums leading-tight">{loading ? '…' : totalItems}</p>
              <p className="text-[9px] text-blue-100/50">{totalStokUnits.toLocaleString('id-ID')} unit</p>
            </div>
            <div className="rounded-xl bg-emerald-400/15 border border-emerald-300/20 px-2 py-2.5 text-center">
              <p className="text-[9px] uppercase tracking-wider text-emerald-100/80">Aman</p>
              <p className="text-lg font-bold text-emerald-200 tabular-nums leading-tight">{loading ? '…' : aman}</p>
              <p className="text-[9px] text-emerald-100/50">
                {totalItems ? Math.round((aman / totalItems) * 100) : 0}% SKU
              </p>
            </div>
            <div className="rounded-xl bg-red-400/15 border border-red-300/20 px-2 py-2.5 text-center">
              <p className="text-[9px] uppercase tracking-wider text-red-100/80">Kritis</p>
              <p className="text-lg font-bold text-red-200 tabular-nums leading-tight">{loading ? '…' : kritis}</p>
              <p className="text-[9px] text-red-100/50">{waspada} waspada</p>
            </div>
          </div>
        </div>
      </div>

      <StatusPOCard data={poData} loading={poLoading} error={poError} onRefresh={loadStatusPO} />

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 animate-slide-up" style={{ animationDelay: '60ms', animationFillMode: 'both' }}>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <Package className="w-4 h-4 text-cyan-600" /> Status per Divisi
          </h3>
          <div className="flex items-center gap-2 text-[9px] text-slate-400">
            <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Aman</span>
            <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Waspada</span>
            <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Kritis</span>
          </div>
        </div>
        <DivisionStatusBars items={allItems} />
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 animate-slide-up" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-red-500" /> Stok Kritis
          </h3>
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('stok')}
            className="text-[11px] text-cyan-700 font-medium flex items-center gap-0.5"
          >
            Lihat semua <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        {criticalItems.length === 0 ? (
          <div className="flex items-center gap-2 py-3 text-emerald-700">
            <ShieldCheck className="w-5 h-5" />
            <p className="text-sm font-medium">Semua stok dalam batas aman</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {criticalItems.map((item) => {
              const chip = statusChip(item.stok);
              return (
                <li key={`${item.entity}-${item.kode}`} className="flex items-center justify-between gap-2 py-2.5 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-slate-800 truncate">{item.nama}</p>
                    <p className="text-[10px] text-slate-400">{item.entity} · {item.kode}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums text-slate-800">
                      {item.stok}{' '}
                      <span className="text-[10px] font-normal text-slate-400">{item.satuan || 'pack'}</span>
                    </p>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${chip.cls}`}>{chip.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pendingQueue.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 flex items-center gap-2 text-[11px] text-amber-800 animate-slide-up">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            <strong>{pendingQueue.length}</strong> transaksi menunggu sync — buka Atur
          </span>
        </div>
      )}
    </div>
  );
}
