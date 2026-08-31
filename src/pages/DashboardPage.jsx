import { useMemo } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import { getPendingQueue, getTransactionHistory } from '../data/api';
import {
  Package, PackagePlus, PackageMinus, AlertTriangle, ShieldCheck,
  WifiOff, ChevronRight, RefreshCw,
  FileText, ScanLine, Snowflake, BarChart3
} from 'lucide-react';

function LineChart({ series }) {
  const w = 320;
  const h = 110;
  const pad = { t: 10, r: 6, b: 20, l: 6 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const maxY = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const toX = (i, n) => pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const toY = (v) => pad.t + innerH - (v / maxY) * innerH;
  const pathFor = (points) => {
    if (!points.length) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i, points.length).toFixed(1)} ${toY(p.value).toFixed(1)}`).join(' ');
  };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24" preserveAspectRatio="none">
      {[0.33, 0.66].map((g) => (
        <line key={g} x1={pad.l} x2={w - pad.r} y1={pad.t + innerH * (1 - g)} y2={pad.t + innerH * (1 - g)} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      ))}
      {series.map((s) => (
        <g key={s.key}>
          <path d={pathFor(s.points)} fill="none" stroke={s.color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
          {s.points.map((p, i) => (
            <circle key={i} cx={toX(i, s.points.length)} cy={toY(p.value)} r="2.5" fill={s.color} stroke="#0b2a55" strokeWidth="1" />
          ))}
        </g>
      ))}
      {series[0]?.points.map((p, i) => (
        <text key={i} x={toX(i, series[0].points.length)} y={h - 4} textAnchor="middle" fill="rgba(255,255,255,0.55)" style={{ fontSize: 8 }}>{p.label}</text>
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
  const { user } = useAuth();
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const statsCV = useMemo(() => stockCV.getStats(), [stockCV.items]);
  const statsPT = useMemo(() => stockPT.getStats(), [stockPT.items]);
  const pendingQueue = getPendingQueue();
  const history = getTransactionHistory();
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

  const criticalItems = useMemo(() => {
    return [
      ...stockCV.items.filter((i) => i.stok <= 5).map((i) => ({ ...i, entity: 'CV' })),
      ...stockPT.items.filter((i) => i.stok <= 5).map((i) => ({ ...i, entity: 'PT' })),
    ].sort((a, b) => a.stok - b.stok).slice(0, 5);
  }, [stockCV.items, stockPT.items]);

  const chartSeries = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      let masuk = 0, keluar = 0;
      history.forEach((h) => {
        if (!h.savedAt || new Date(h.savedAt).toDateString() !== key) return;
        const q = (h.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
        if (h.type === 'masuk') masuk += q;
        if (h.type === 'keluar') keluar += q;
      });
      days.push({ label, masuk: Math.round(masuk * 10) / 10, keluar: Math.round(keluar * 10) / 10 });
    }
    return [
      { key: 'masuk', color: '#22d3ee', points: days.map((d) => ({ label: d.label, value: d.masuk })) },
      { key: 'keluar', color: '#fb923c', points: days.map((d) => ({ label: d.label, value: d.keluar })) },
    ];
  }, [history, now.toDateString()]);

  const weekMasuk = chartSeries[0].points.reduce((s, p) => s + p.value, 0);
  const weekKeluar = chartSeries[1].points.reduce((s, p) => s + p.value, 0);
  const todayKeluar = chartSeries[1].points[6]?.value || 0;
  const yesterdayKeluar = chartSeries[1].points[5]?.value || 0;
  const deltaPct = yesterdayKeluar > 0 ? Math.round(((todayKeluar - yesterdayKeluar) / yesterdayKeluar) * 100) : todayKeluar > 0 ? 100 : 0;

  const quickActions = [
    { id: 'masuk', label: 'Barang Masuk', sub: 'Tambah stok', icon: PackagePlus, color: 'bg-emerald-50 text-emerald-600', tab: 'input' },
    { id: 'keluar', label: 'Barang Keluar', sub: 'Kurangi stok', icon: PackageMinus, color: 'bg-orange-50 text-orange-600', tab: 'input' },
    { id: 'rusak', label: 'Barang Rusak', sub: 'Catat rusak', icon: AlertTriangle, color: 'bg-red-50 text-red-600', tab: 'input' },
    { id: 'scan', label: 'PDF / QR', sub: 'Validasi nota', icon: ScanLine, color: 'bg-cyan-50 text-cyan-700', tab: 'input' },
    { id: 'stok', label: 'Cek Stok', sub: 'CV & PT', icon: Package, color: 'bg-blue-50 text-blue-600', tab: 'stok' },
    { id: 'po', label: 'PO & Laporan', sub: 'Mingguan', icon: FileText, color: 'bg-violet-50 text-violet-600', tab: 'po' },
  ];

  return (
    <div className="pb-2 animate-fade-in space-y-3.5">
      <div className="bg-gradient-to-br from-[#0b2a55] via-[#0f3a73] to-[#164e8a] rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-36 h-36 bg-cyan-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Snowflake className="w-4 h-4 text-cyan-300 shrink-0" />
                <span className="text-[11px] text-cyan-200/90 font-medium tracking-wide">GudangAI RUDY</span>
                <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                  isOnline ? 'bg-emerald-400/20 text-emerald-200' : 'bg-red-400/20 text-red-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-300' : 'bg-red-300'}`} />
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-white leading-tight tracking-tight">{greeting},</h1>
              <p className="text-lg font-semibold text-cyan-100/95 truncate">{user?.name || 'Rudi Virawan'}</p>
              <p className="text-[11px] text-blue-100/70 mt-1 capitalize">{dateLabel}</p>
              {lastRefresh && (
                <p className="text-[10px] text-blue-200/50 mt-0.5">
                  Stok disinkron {lastRefresh.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <button type="button" onClick={() => { stockCV.refresh(); stockPT.refresh(); }} disabled={loading}
              className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white/80 active:scale-95 shrink-0" aria-label="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="rounded-xl bg-white/10 border border-white/10 px-2.5 py-2 text-center">
              <p className="text-[9px] uppercase tracking-wider text-blue-100/70">Total SKU</p>
              <p className="text-lg font-bold text-white tabular-nums">{loading ? '…' : totalItems}</p>
              <p className="text-[9px] text-blue-100/50">{totalStokUnits.toLocaleString('id-ID')} unit</p>
            </div>
            <div className="rounded-xl bg-emerald-400/15 border border-emerald-300/20 px-2.5 py-2 text-center">
              <p className="text-[9px] uppercase tracking-wider text-emerald-100/80">Aman</p>
              <p className="text-lg font-bold text-emerald-200 tabular-nums">{loading ? '…' : aman}</p>
              <p className="text-[9px] text-emerald-100/50">{totalItems ? Math.round((aman / totalItems) * 100) : 0}% SKU</p>
            </div>
            <div className="rounded-xl bg-red-400/15 border border-red-300/20 px-2.5 py-2 text-center">
              <p className="text-[9px] uppercase tracking-wider text-red-100/80">Kritis</p>
              <p className="text-lg font-bold text-red-200 tabular-nums">{loading ? '…' : kritis}</p>
              <p className="text-[9px] text-red-100/50">{waspada} waspada</p>
            </div>
          </div>

          <div className="mt-3.5 rounded-xl bg-black/15 border border-white/10 p-2.5">
            <div className="flex items-center justify-between mb-1 px-0.5">
              <p className="text-[11px] font-semibold text-white/90 flex items-center gap-1">
                <BarChart3 className="w-3.5 h-3.5 text-cyan-300" /> Pergerakan 7 Hari
              </p>
              <div className="flex items-center gap-2 text-[9px]">
                <span className="text-cyan-300">● Masuk {Math.round(weekMasuk)}</span>
                <span className="text-orange-300">● Keluar {Math.round(weekKeluar)}</span>
              </div>
            </div>
            <LineChart series={chartSeries} />
            <p className="text-[9px] text-blue-100/45 text-center mt-0.5">
              Hari ini keluar {todayKeluar}
              {deltaPct !== 0 && (
                <span className={deltaPct > 0 ? ' text-orange-300' : ' text-emerald-300'}>
                  {' '}({deltaPct > 0 ? '+' : ''}{deltaPct}% vs kemarin)
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2 px-0.5">
          <h2 className="text-sm font-semibold text-slate-800">Quick Action</h2>
          {pendingQueue.length > 0 && (
            <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{pendingQueue.length} antri sync</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <button key={a.id} type="button" onClick={() => onNavigate?.(a.tab)}
                className="card card-interactive p-3 flex flex-col items-center text-center gap-1.5 min-h-[88px] justify-center">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${a.color}`}><Icon className="w-5 h-5" /></div>
                <p className="text-[11px] font-semibold text-slate-800 leading-tight">{a.label}</p>
                <p className="text-[9px] text-slate-400 leading-tight">{a.sub}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-red-500" /> Stok Kritis
            <span className="text-[10px] font-normal text-slate-400">(≤5 unit)</span>
          </h3>
          <button type="button" onClick={() => onNavigate?.('stok')} className="text-[11px] font-medium text-cyan-700 flex items-center">
            Semua <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        {criticalItems.length === 0 ? (
          <div className="py-4 text-center">
            <ShieldCheck className="w-7 h-7 text-emerald-400 mx-auto mb-1" />
            <p className="text-xs text-slate-500">Tidak ada stok kritis</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {criticalItems.map((item) => {
              const chip = statusChip(item.stok);
              return (
                <li key={`${item.entity}-${item.kode}`} className="flex items-center gap-2.5 py-1.5 border-b border-slate-50 last:border-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.stok === 0 ? 'bg-slate-400' : 'bg-red-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-800 truncate">{item.nama}</p>
                    <p className="text-[10px] text-slate-400">{item.entity} · {item.kode}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums text-slate-800">
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

      {pendingQueue.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 flex items-center gap-2 text-[11px] text-amber-800">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span><strong>{pendingQueue.length}</strong> transaksi menunggu sync — buka Atur</span>
        </div>
      )}
    </div>
  );
}
