import { useMemo } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import { getPendingQueue, getTransactionHistory } from '../data/api';
import { DIVISIONS } from '../data/master';
import {
  AlertTriangle, ShieldCheck, WifiOff, ChevronRight, RefreshCw,
  Snowflake, BarChart3
} from 'lucide-react';
import { BG_DATA_URL } from '../assets/imageAssets';

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

function DivisionStatusBars({ items }) {
  const rows = useMemo(() => {
    const map = {};
    DIVISIONS.forEach((d) => {
      map[d] = { divisi: d, total: 0, aman: 0, waspada: 0, kritis: 0 };
    });
    items.forEach((it) => {
      const d = it.divisi || 'CS';
      if (!map[d]) map[d] = { divisi: d, total: 0, aman: 0, waspada: 0, kritis: 0 };
      map[d].total += 1;
      if (it.stok <= 5) map[d].kritis += 1;
      else if (it.stok <= 20) map[d].waspada += 1;
      else map[d].aman += 1;
    });
    return Object.values(map)
      .filter((r) => r.total > 0)
      .sort((a, b) => b.kritis - a.kritis || b.total - a.total);
  }, [items]);

  const maxTotal = Math.max(1, ...rows.map((r) => r.total));

  if (rows.length === 0) {
    return <p className="text-[11px] text-slate-400 text-center py-3">Belum ada data divisi</p>;
  }

  return (
    <div className="space-y-2.5">
      {rows.map((r, idx) => {
        const pct = (n) => Math.max(n > 0 ? 4 : 0, Math.round((n / maxTotal) * 100));
        const kritisPct = r.total ? Math.round((r.kritis / r.total) * 100) : 0;
        return (
          <div
            key={r.divisi}
            className="animate-slide-up"
            style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'both' }}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-semibold text-slate-700 truncate">{r.divisi}</span>
              <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                {r.total} SKU · <span className="text-red-600 font-medium">{kritisPct}%</span> kritis
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
              <div className="h-full bg-emerald-500 transition-all duration-500 ease-out" style={{ width: `${pct(r.aman)}%` }} title={`Aman ${r.aman}`} />
              <div className="h-full bg-amber-400 transition-all duration-500 ease-out" style={{ width: `${pct(r.waspada)}%` }} title={`Waspada ${r.waspada}`} />
              <div className="h-full bg-red-500 transition-all duration-500 ease-out" style={{ width: `${pct(r.kritis)}%` }} title={`Kritis ${r.kritis}`} />
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

  const allItems = useMemo(
    () => [...(stockCV.items || []), ...(stockPT.items || [])],
    [stockCV.items, stockPT.items]
  );

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

  const pieT = Math.max(1, totalItems);
  const circ = 2 * Math.PI * 14;
  const pieSegs = [
    { n: aman, c: '#10b981' },
    { n: waspada, c: '#f59e0b' },
    { n: kritis, c: '#ef4444' },
  ];
  let pieOff = 0;
  const piePaths = pieSegs.map((s) => {
    const len = (s.n / pieT) * circ;
    const seg = { ...s, len, offset: pieOff };
    pieOff += len;
    return seg;
  });

  return (
    <div className="pb-3 animate-fade-in space-y-3">
      <div className="rounded-2xl p-4 shadow-xl relative overflow-hidden animate-slide-up">
        <div className="absolute inset-0 bg-cover bg-center scale-105" style={{ backgroundImage: `url(${BG_DATA_URL})` }} aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0b2a55]/92 via-[#0f3a73]/88 to-[#164e8a]/90 backdrop-blur-[2px]" />
        <div className="absolute top-0 right-0 w-36 h-36 bg-cyan-400/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
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
              <h1 className="text-xl font-bold text-white leading-tight tracking-tight">{greeting},</h1>
              <p className="text-base font-semibold text-cyan-100/95 truncate">{user?.name || 'Rudi Virawan'}</p>
              <p className="text-[11px] text-blue-100/70 mt-0.5 capitalize">{dateLabel}</p>
              {lastRefresh && (
                <p className="text-[10px] text-blue-200/50 mt-0.5">
                  Stok disinkron {lastRefresh.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <button type="button" onClick={() => { stockCV.refresh(); stockPT.refresh(); }} disabled={loading}
              className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white/80 active:scale-95 shrink-0 transition-transform" aria-label="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/10 border border-white/10 px-2 py-2 text-center">
              <p className="text-[9px] uppercase tracking-wider text-blue-100/70">Total SKU</p>
              <p className="text-lg font-bold text-white tabular-nums leading-tight">{loading ? '…' : totalItems}</p>
              <p className="text-[9px] text-blue-100/50">{totalStokUnits.toLocaleString('id-ID')} unit</p>
            </div>
            <div className="rounded-xl bg-emerald-400/15 border border-emerald-300/20 px-2 py-2 text-center">
              <p className="text-[9px] uppercase tracking-wider text-emerald-100/80">Aman</p>
              <p className="text-lg font-bold text-emerald-200 tabular-nums leading-tight">{loading ? '…' : aman}</p>
              <p className="text-[9px] text-emerald-100/50">{totalItems ? Math.round((aman / totalItems) * 100) : 0}% SKU</p>
            </div>
            <div className="rounded-xl bg-red-400/15 border border-red-300/20 px-2 py-2 text-center">
              <p className="text-[9px] uppercase tracking-wider text-red-100/80">Kritis</p>
              <p className="text-lg font-bold text-red-200 tabular-nums leading-tight">{loading ? '…' : kritis}</p>
              <p className="text-[9px] text-red-100/50">{waspada} waspada</p>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-black/15 border border-white/10 p-2.5">
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

      <div className="card p-3.5 animate-slide-up" style={{ animationDelay: '60ms', animationFillMode: 'both' }}>
        <h3 className="text-sm font-semibold text-slate-800 mb-2.5 flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-cyan-600" /> Analisa Stok
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-slate-400 mb-2 font-medium">Komposisi status</p>
            <div className="flex items-center gap-2.5">
              <svg viewBox="0 0 36 36" className="w-14 h-14 shrink-0" style={{ transform: 'rotate(-90deg)' }}>
                {piePaths.map((s, i) => (
                  <circle key={i} cx="18" cy="18" r="14" fill="none" stroke={s.c} strokeWidth="5"
                    strokeDasharray={`${s.len} ${circ - s.len}`} strokeDashoffset={-s.offset} />
                ))}
              </svg>
              <div className="space-y-1 text-[10px]">
                <p className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Aman {aman}</p>
                <p className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Waspada {waspada}</p>
                <p className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Kritis {kritis}</p>
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-slate-400 mb-2 font-medium">Unit stok CV vs PT</p>
            {(() => {
              const maxU = Math.max(statsCV.totalStok, statsPT.totalStok, 1);
              const pctCV = Math.max(4, Math.round((statsCV.totalStok / maxU) * 100));
              const pctPT = Math.max(4, Math.round((statsPT.totalStok / maxU) * 100));
              return (
                <div className="space-y-2.5">
                  <div>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-blue-700">CV</span>
                      <span className="text-[12px] font-bold text-blue-600 tabular-nums">{statsCV.totalStok.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-blue-100 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: pctCV + '%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-violet-700">PT</span>
                      <span className="text-[12px] font-bold text-violet-600 tabular-nums">{statsPT.totalStok.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-violet-100 overflow-hidden">
                      <div className="h-full rounded-full bg-violet-500 transition-all duration-500" style={{ width: pctPT + '%' }} />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        <div className="mt-2.5 pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2 text-[10px] text-slate-500">
          <p>SKU CV: <span className="font-semibold text-slate-700">{statsCV.total}</span> · kritis {statsCV.danger + statsCV.zero}</p>
          <p>SKU PT: <span className="font-semibold text-slate-700">{statsPT.total}</span> · kritis {statsPT.danger + statsPT.zero}</p>
        </div>
      </div>

      <div className="card p-3.5 animate-slide-up" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-cyan-600" /> Status per Divisi
          </h3>
          <div className="flex items-center gap-2 text-[9px] text-slate-400">
            <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Aman</span>
            <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Waspada</span>
            <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Kritis</span>
          </div>
        </div>
        <DivisionStatusBars items={allItems} />
      </div>

      <div className="card p-3.5 animate-slide-up" style={{ animationDelay: '140ms', animationFillMode: 'both' }}>
        <h3 className="text-sm font-semibold text-slate-800 mb-2.5">Volume minggu ini</h3>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-2.5 text-center">
            <p className="text-[9px] text-cyan-700 font-medium">Masuk</p>
            <p className="text-base font-bold text-cyan-800 tabular-nums leading-tight">{Math.round(weekMasuk)}</p>
          </div>
          <div className="rounded-xl bg-orange-50 border border-orange-100 p-2.5 text-center">
            <p className="text-[9px] text-orange-700 font-medium">Keluar</p>
            <p className="text-base font-bold text-orange-800 tabular-nums leading-tight">{Math.round(weekKeluar)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-center">
            <p className="text-[9px] text-slate-600 font-medium">Netto</p>
            <p className={`text-base font-bold tabular-nums leading-tight ${weekMasuk - weekKeluar >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {Math.round(weekMasuk - weekKeluar)}
            </p>
          </div>
        </div>
      </div>

      <div className="card p-3.5 animate-slide-up" style={{ animationDelay: '180ms', animationFillMode: 'both' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-red-500" /> Stok Kritis
            <span className="text-[10px] font-normal text-slate-400">(≤5 unit)</span>
          </h3>
          <button type="button" onClick={() => onNavigate?.('stok')} className="text-[11px] font-medium text-cyan-700 flex items-center">
            Semua <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        {criticalItems.length === 0 ? (
          <div className="py-3 text-center">
            <ShieldCheck className="w-7 h-7 text-emerald-400 mx-auto mb-1" />
            <p className="text-xs text-slate-500">Tidak ada stok kritis</p>
          </div>
        ) : (
          <ul className="space-y-1">
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
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 flex items-center gap-2 text-[11px] text-amber-800 animate-slide-up">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span><strong>{pendingQueue.length}</strong> transaksi menunggu sync — buka Atur</span>
        </div>
      )}
    </div>
  );
}
