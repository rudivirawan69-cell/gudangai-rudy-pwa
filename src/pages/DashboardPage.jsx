import { useState, useMemo } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import { getPendingQueue, getTransactionHistory } from '../data/api';
import {
  Snowflake, AlertTriangle, ShieldCheck, Activity,
  Wifi, WifiOff, TrendingDown
} from 'lucide-react';

function StatusBar({ label, count, total, bg }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="text-xs font-bold text-gray-800">{count} <span className="font-normal text-gray-400">({pct}%)</span></span>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${bg} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MiniBarChart({ data }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1.5 h-28 px-1">
      {data.map((d) => {
        const h = Math.max(4, Math.round((d.value / max) * 100));
        return (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[9px] font-semibold text-gray-500 tabular-nums">{d.value || ''}</span>
            <div className="w-full flex items-end justify-center" style={{ height: 72 }}>
              <div
                className={`w-full max-w-[28px] rounded-t-md ${d.highlight ? 'bg-orange-500' : 'bg-orange-200'}`}
                style={{ height: `${h}%` }}
                title={`${d.label}: ${d.value}`}
              />
            </div>
            <span className="text-[9px] text-gray-400 font-medium">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const [showLogout, setShowLogout] = useState(false);

  const statsCV = useMemo(() => stockCV.getStats(), [stockCV.items]);
  const statsPT = useMemo(() => stockPT.getStats(), [stockPT.items]);

  const pendingQueue = getPendingQueue();
  const history = getTransactionHistory();
  const isOnline = navigator.onLine;
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Selamat Pagi' : now.getHours() < 17 ? 'Selamat Siang' : 'Selamat Malam';

  const totalItems = statsCV.total + statsPT.total;
  const kritis = statsCV.danger + statsPT.danger + statsCV.zero + statsPT.zero;
  const waspada = statsCV.warning + statsPT.warning;
  const aman = statsCV.safe + statsPT.safe;

  const criticalItems = useMemo(() => {
    return [
      ...stockCV.items.filter((i) => i.stok <= 5).map((i) => ({ ...i, entity: 'CV' })),
      ...stockPT.items.filter((i) => i.stok <= 5).map((i) => ({ ...i, entity: 'PT' })),
    ]
      .sort((a, b) => a.stok - b.stok)
      .slice(0, 8);
  }, [stockCV.items, stockPT.items]);

  const dailyKeluar = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const label = d.toLocaleDateString('id-ID', { weekday: 'short' }).replace('.', '');
      let qty = 0;
      history.forEach((h) => {
        if (h.type !== 'keluar') return;
        if (new Date(h.savedAt).toDateString() !== key) return;
        (h.items || []).forEach((it) => { qty += Number(it.qty) || 0; });
      });
      days.push({ label, value: Math.round(qty * 10) / 10, highlight: i === 0 });
    }
    return days;
  }, [history, now.toDateString()]);

  const todayKeluar = dailyKeluar[6]?.value || 0;
  const yesterdayKeluar = dailyKeluar[5]?.value || 0;
  const deltaPct =
    yesterdayKeluar > 0
      ? Math.round(((todayKeluar - yesterdayKeluar) / yesterdayKeluar) * 100)
      : todayKeluar > 0
        ? 100
        : 0;

  return (
    <div className="pb-4 animate-fade-in">
      <div className="bg-gradient-to-br from-[#0b2a55] via-[#0f3a73] to-[#164e8a] rounded-2xl p-5 mb-4 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-400/10 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg">
                <Snowflake className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-white text-lg font-bold tracking-tight">
                  GudangAI <span className="text-cyan-400 font-extrabold">RUDY</span>
                </h1>
                <p className="text-cyan-300/70 text-[11px]">Cold Storage Control</p>
              </div>
            </div>
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${
              isOnline ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
            }`}>
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isOnline ? 'Online' : 'Offline'}
            </div>
          </div>
          <div>
            <p className="text-cyan-200/80 text-sm">{greeting},</p>
            <p className="text-white text-xl font-bold">{user?.name || 'Boss'} 👋</p>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex-1">
              <p className="text-cyan-300/50 text-[10px] uppercase tracking-wider">Total Item</p>
              <p className="text-white text-3xl font-bold">{totalItems || 189}</p>
            </div>
            <div className="flex-1">
              <p className="text-cyan-300/50 text-[10px] uppercase tracking-wider">CV / PT</p>
              <p className="text-white text-3xl font-bold">{statsCV.total || 81} / {statsPT.total || 108}</p>
            </div>
            <div className="flex-1">
              <p className="text-cyan-300/50 text-[10px] uppercase tracking-wider">Pending</p>
              <p className="text-white text-3xl font-bold">{pendingQueue.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#0b2a55]" /> Status Stok
        </h3>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-center">
            <AlertTriangle className="w-4 h-4 text-red-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-red-600">{kritis}</p>
            <p className="text-[10px] text-red-500 font-medium">Kritis ≤5</p>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
            <Activity className="w-4 h-4 text-amber-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-amber-600">{waspada}</p>
            <p className="text-[10px] text-amber-600 font-medium">Waspada 6–20</p>
          </div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
            <ShieldCheck className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-emerald-600">{aman}</p>
            <p className="text-[10px] text-emerald-600 font-medium">Aman &gt;20</p>
          </div>
        </div>
        <StatusBar label="Kritis (habis / ≤5)" count={kritis} total={totalItems || 1} bg="bg-red-500" />
        <StatusBar label="Waspada (6–20)" count={waspada} total={totalItems || 1} bg="bg-amber-400" />
        <StatusBar label="Aman (&gt;20)" count={aman} total={totalItems || 1} bg="bg-emerald-500" />
        <div className="mt-3 pt-3 border-t border-gray-50 flex justify-between text-[11px] text-gray-500">
          <span>CV: {statsCV.totalStok.toLocaleString('id-ID')} unit</span>
          <span>PT: {statsPT.totalStok.toLocaleString('id-ID')} unit</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-orange-500" /> Pengeluaran 7 Hari
          </h3>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            deltaPct > 0 ? 'bg-red-50 text-red-600' : deltaPct < 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-500'
          }`}>
            vs kemarin {deltaPct > 0 ? '+' : ''}{deltaPct}%
          </span>
        </div>
        <p className="text-[11px] text-gray-400 mb-3">
          Hari ini <span className="font-semibold text-gray-700">{todayKeluar}</span> · Kemarin{' '}
          <span className="font-semibold text-gray-700">{yesterdayKeluar}</span> (qty keluar)
        </p>
        <MiniBarChart data={dailyKeluar} />
        <p className="text-[10px] text-gray-400 mt-2 text-center">Dari riwayat di perangkat</p>
      </div>

      {criticalItems.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" /> Stok Kritis / Habis
            </h3>
            <span className="text-[10px] text-gray-400">{criticalItems.length} item</span>
          </div>
          <div className="space-y-1.5">
            {criticalItems.map((item) => (
              <div
                key={`${item.entity}-${item.kode}`}
                className={`bg-white rounded-xl px-3 py-2.5 border flex items-center justify-between ${
                  item.stok === 0 ? 'border-red-200 bg-red-50/40' : 'border-red-100'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    item.entity === 'CV' ? 'bg-blue-100 text-blue-600' : 'bg-violet-100 text-violet-600'
                  }`}>{item.entity}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.nama}</p>
                    <p className="text-[11px] text-gray-400">{item.kode}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-lg font-bold ${item.stok === 0 ? 'text-red-700' : 'text-red-600'}`}>{item.stok}</p>
                  <p className="text-[10px] text-gray-400">{item.satuan || 'unit'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => setShowLogout(true)} className="w-full py-3 rounded-xl bg-gray-100 text-gray-500 text-sm mt-2">Keluar</button>
      {showLogout && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowLogout(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Keluar?</h3>
            <p className="text-sm text-gray-500 mb-6">Kamu perlu login kembali dengan PIN.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogout(false)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium">Batal</button>
              <button onClick={logout} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-medium">Ya, Keluar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
