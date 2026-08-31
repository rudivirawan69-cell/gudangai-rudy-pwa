import { useState, useMemo } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import { getPendingQueue, getTransactionHistory } from '../data/api';
import {
  Bell, Package, AlertTriangle, ShieldCheck, Activity,
  WifiOff, TrendingUp, TrendingDown, ChevronRight,
  RefreshCw, ArrowDownCircle, ArrowUpCircle
} from 'lucide-react';

function LineChart({ series }) {
  const w = 320;
  const h = 120;
  const pad = { t: 12, r: 8, b: 22, l: 8 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const maxY = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const toX = (i, n) => pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const toY = (v) => pad.t + innerH - (v / maxY) * innerH;
  const pathFor = (points) => {
    if (!points.length) return '';
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i, points.length).toFixed(1)} ${toY(p.value).toFixed(1)}`)
      .join(' ');
  };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28" preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad.l} x2={w - pad.r} y1={pad.t + innerH * (1 - g)} y2={pad.t + innerH * (1 - g)} stroke="#e2e8f0" strokeWidth="1" />
      ))}
      {series.map((s) => (
        <g key={s.key}>
          <path d={pathFor(s.points)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {s.points.map((p, i) => (
            <circle key={i} cx={toX(i, s.points.length)} cy={toY(p.value)} r="3" fill="#fff" stroke={s.color} strokeWidth="2" />
          ))}
        </g>
      ))}
      {series[0]?.points.map((p, i) => (
        <text key={i} x={toX(i, series[0].points.length)} y={h - 6} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 9 }}>
          {p.label}
        </text>
      ))}
    </svg>
  );
}

function statusChip(stok) {
  if (stok <= 0) return { label: 'Habis', cls: 'bg-slate-100 text-slate-600' };
  if (stok <= 5) return { label: 'Kritis', cls: 'bg-red-50 text-red-600' };
  if (stok <= 20) return { label: 'Waspada', cls: 'bg-amber-50 text-amber-700' };
  return { label: 'Aman', cls: 'bg-emerald-50 text-emerald-700' };
}

export default function DashboardPage({ onNavigate }) {
  const { user, logout } = useAuth();
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const [showLogout, setShowLogout] = useState(false);
  const [entityTab, setEntityTab] = useState('ALL');

  const statsCV = useMemo(() => stockCV.getStats(), [stockCV.items]);
  const statsPT = useMemo(() => stockPT.getStats(), [stockPT.items]);

  const pendingQueue = getPendingQueue();
  const history = getTransactionHistory();
  const isOnline = navigator.onLine;
  const now = new Date();
  const dateLabel = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  const totalItems = statsCV.total + statsPT.total;
  const kritis = statsCV.danger + statsPT.danger + statsCV.zero + statsPT.zero;
  const waspada = statsCV.warning + statsPT.warning;
  const aman = statsCV.safe + statsPT.safe;
  const totalStokUnits = statsCV.totalStok + statsPT.totalStok;

  const lastRefresh = stockCV.lastRefresh || stockPT.lastRefresh;
  const lastSyncLabel = lastRefresh
    ? lastRefresh.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : '—';

  const criticalItems = useMemo(() => {
    return [
      ...stockCV.items.filter((i) => i.stok <= 5).map((i) => ({ ...i, entity: 'CV' })),
      ...stockPT.items.filter((i) => i.stok <= 5).map((i) => ({ ...i, entity: 'PT' })),
    ]
      .sort((a, b) => a.stok - b.stok)
      .slice(0, 6);
  }, [stockCV.items, stockPT.items]);

  const recentActivity = useMemo(() => {
    return (history || []).slice(0, 5).map((h) => {
      const first = (h.items && h.items[0]) || {};
      const qtySum = (h.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
      const t = h.savedAt ? new Date(h.savedAt) : null;
      return {
        id: h.savedAt + (h.type || ''),
        type: h.type || 'keluar',
        entity: h.entity || '',
        title:
          h.type === 'masuk'
            ? `Barang masuk · ${first.nama || first.kode || '—'}`
            : h.type === 'rusak'
              ? `Barang rusak · ${first.nama || first.kode || '—'}`
              : `Barang keluar · ${first.nama || first.kode || '—'}`,
        qty: Math.round(qtySum * 10) / 10,
        time: t ? t.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—',
        offline: !!h.offline,
        success: h.success !== false,
      };
    });
  }, [history]);

  const chartSeries = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      let masuk = 0;
      let keluar = 0;
      history.forEach((h) => {
        if (!h.savedAt) return;
        const hd = new Date(h.savedAt);
        if (hd.toDateString() !== key) return;
        const q = (h.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
        if (h.type === 'masuk') masuk += q;
        if (h.type === 'keluar') keluar += q;
      });
      days.push({ label, masuk: Math.round(masuk * 10) / 10, keluar: Math.round(keluar * 10) / 10 });
    }
    return [
      { key: 'masuk', color: '#3b82f6', points: days.map((d) => ({ label: d.label, value: d.masuk })) },
      { key: 'keluar', color: '#f97316', points: days.map((d) => ({ label: d.label, value: d.keluar })) },
    ];
  }, [history, now.toDateString()]);

  const todayKeluar = chartSeries[1]?.points[6]?.value || 0;
  const yesterdayKeluar = chartSeries[1]?.points[5]?.value || 0;
  const deltaPct =
    yesterdayKeluar > 0
      ? Math.round(((todayKeluar - yesterdayKeluar) / yesterdayKeluar) * 100)
      : todayKeluar > 0
        ? 100
        : 0;

  const loading = stockCV.loading || stockPT.loading;
  const refreshAll = () => { stockCV.refresh(); stockPT.refresh(); };

  return (
    <div className="pb-2 animate-fade-in space-y-3.5">
      <div className="flex items-start justify-between gap-3 pt-0.5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Gudang<span className="text-cyan-600">AI</span>
            </h1>
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {dateLabel}
            {lastRefresh && <span className="ml-1.5">· Last sync {lastSyncLabel}</span>}
          </p>
          {user?.name && <p className="text-[11px] text-slate-500 mt-0.5">Halo, {user.name}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={refreshAll} disabled={loading}
            className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 active:scale-95 shadow-sm" aria-label="Refresh stok">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={() => onNavigate?.('riwayat')}
            className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 relative shadow-sm" aria-label="Notifikasi">
            <Bell className="w-4 h-4" />
            {pendingQueue.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[9px] text-white font-bold flex items-center justify-center">
                {pendingQueue.length > 9 ? '9+' : pendingQueue.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="card p-3 text-center">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Total Barang</p>
          <p className="text-xl font-bold text-slate-900 tabular-nums mt-0.5">{loading ? '…' : totalItems.toLocaleString('id-ID')}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{totalStokUnits.toLocaleString('id-ID')} unit</p>
        </div>
        <div className="card p-3 text-center border-emerald-100/80">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-emerald-600/80">Stok Aman</p>
          <p className="text-xl font-bold text-emerald-600 tabular-nums mt-0.5">{loading ? '…' : aman}</p>
          <p className="text-[10px] text-emerald-600/70 mt-0.5 flex items-center justify-center gap-0.5">
            <ShieldCheck className="w-3 h-3" />
            {totalItems ? Math.round((aman / totalItems) * 100) : 0}% dari total
          </p>
        </div>
        <div className="card p-3 text-center border-red-100/80">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-red-500/80">Kritis</p>
          <p className="text-xl font-bold text-red-600 tabular-nums mt-0.5">{loading ? '…' : kritis}</p>
          <p className="text-[10px] text-red-500/80 mt-0.5 flex items-center justify-center gap-0.5">
            <AlertTriangle className="w-3 h-3" />
            {waspada > 0 ? `${waspada} waspada` : 'perlu restock'}
          </p>
        </div>
      </div>

      <div className="flex gap-2 items-center">
        {['ALL', 'CV', 'PT'].map((e) => (
          <button key={e} type="button" onClick={() => setEntityTab(e)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
              entityTab === e ? 'bg-[#0b2a55] text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200'
            }`}>{e === 'ALL' ? 'Semua' : e}</button>
        ))}
        <div className="flex-1" />
        <button type="button" onClick={() => onNavigate?.('stok')} className="text-[11px] font-medium text-cyan-700 flex items-center gap-0.5">
          Lihat Stok <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-slate-800">Grafik Masuk vs Keluar</h3>
          <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">7 Hari Terakhir</span>
        </div>
        <div className="flex items-center gap-3 mb-2 text-[10px]">
          <span className="flex items-center gap-1 text-blue-600 font-medium"><span className="w-2 h-2 rounded-full bg-blue-500" /> Masuk</span>
          <span className="flex items-center gap-1 text-orange-600 font-medium"><span className="w-2 h-2 rounded-full bg-orange-500" /> Keluar</span>
          <span className={`ml-auto font-semibold px-1.5 py-0.5 rounded-full ${
            deltaPct > 0 ? 'bg-red-50 text-red-600' : deltaPct < 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'
          }`}>
            {deltaPct > 0 ? <TrendingUp className="w-3 h-3 inline" /> : deltaPct < 0 ? <TrendingDown className="w-3 h-3 inline" /> : null}{' '}
            keluar {deltaPct > 0 ? '+' : ''}{deltaPct}% vs kemarin
          </span>
        </div>
        <LineChart series={chartSeries} />
        <p className="text-[10px] text-slate-400 text-center mt-1">Dari riwayat perangkat · sinkron backend meningkatkan akurasi</p>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-red-500" /> Stok Kritis
          </h3>
          <button type="button" onClick={() => onNavigate?.('stok')} className="text-[11px] font-medium text-cyan-700 flex items-center">
            Lihat Semua <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        {criticalItems.length === 0 ? (
          <div className="py-6 text-center">
            <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600 font-medium">Tidak ada stok kritis</p>
            <p className="text-[11px] text-slate-400">Semua item di atas ambang aman</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {criticalItems.filter((i) => entityTab === 'ALL' || i.entity === entityTab).map((item) => {
              const chip = statusChip(item.stok);
              return (
                <li key={`${item.entity}-${item.kode}`} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${item.stok === 0 ? 'bg-slate-400' : 'bg-red-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{item.nama}</p>
                    <p className="text-[10px] text-slate-400">{item.entity} · {item.kode}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-800 tabular-nums">
                      {item.stok} <span className="text-[10px] font-normal text-slate-400">{item.satuan || 'pack'}</span>
                    </p>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${chip.cls}`}>{chip.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-cyan-600" /> Aktivitas Terbaru
          </h3>
          <button type="button" onClick={() => onNavigate?.('riwayat')} className="text-[11px] font-medium text-cyan-700 flex items-center">
            Lihat Semua <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        {recentActivity.length === 0 ? (
          <p className="text-center text-[12px] text-slate-400 py-4">Belum ada transaksi di perangkat ini</p>
        ) : (
          <ul className="space-y-2.5">
            {recentActivity.map((a) => (
              <li key={a.id} className="flex items-start gap-2.5">
                <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  a.type === 'masuk' ? 'bg-emerald-50 text-emerald-600' : a.type === 'rusak' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'
                }`}>
                  {a.type === 'masuk' ? <ArrowDownCircle className="w-4 h-4" /> : a.type === 'rusak' ? <AlertTriangle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-slate-800 truncate">{a.title}</p>
                  <p className="text-[10px] text-slate-400">
                    {a.time}{a.entity ? ` · ${a.entity}` : ''}{a.offline ? ' · offline queue' : a.success ? '' : ' · gagal'}
                  </p>
                </div>
                <span className="text-xs font-bold text-slate-700 tabular-nums shrink-0">{a.qty > 0 ? a.qty : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => onNavigate?.('input')} className="card card-interactive p-3.5 flex items-center gap-3 text-left">
          <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center"><Package className="w-5 h-5" /></div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Input Cepat</p>
            <p className="text-[10px] text-slate-400">Masuk · Keluar · Rusak</p>
          </div>
        </button>
        <button type="button" onClick={() => onNavigate?.('po')} className="card card-interactive p-3.5 flex items-center gap-3 text-left">
          <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center"><TrendingUp className="w-5 h-5" /></div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Purchase Order</p>
            <p className="text-[10px] text-slate-400">Rekomendasi PO</p>
          </div>
        </button>
      </div>

      {pendingQueue.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 flex items-center gap-2 text-[11px] text-amber-800">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span><strong>{pendingQueue.length}</strong> transaksi menunggu sync</span>
        </div>
      )}

      <button type="button" onClick={() => setShowLogout(true)} className="w-full py-2.5 rounded-xl text-slate-400 text-xs font-medium hover:text-slate-600">
        Keluar dari akun
      </button>

      {showLogout && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowLogout(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-slate-100" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Keluar?</h3>
            <p className="text-sm text-slate-500 mb-6">Anda perlu login kembali dengan PIN.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowLogout(false)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium">Batal</button>
              <button type="button" onClick={logout} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-medium">Ya, Keluar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
