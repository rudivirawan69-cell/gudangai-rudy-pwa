import { useState, useMemo } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import { getPendingQueue, getTransactionHistory } from '../data/api';
import {
  Snowflake, Package, TrendingUp, AlertTriangle, Clock,
  CheckCircle2, XCircle, Activity, ArrowUpRight, ArrowDownRight,
  Wifi, WifiOff, ChevronRight
} from 'lucide-react';

function QuickStatCard({ icon: Icon, label, value, sub, color, gradient }) {
  return (
    <div className={`rounded-2xl p-4 ${gradient} shadow-sm`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const [showLogout, setShowLogout] = useState(false);

  const statsCV = useMemo(() => stockCV.getStats(), [stockCV.getStats]);
  const statsPT = useMemo(() => stockPT.getStats(), [stockPT.getStats]);

  const pendingQueue = getPendingQueue();
  const recentHistory = getTransactionHistory().slice(0, 5);

  const isOnline = navigator.onLine;
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Selamat Pagi' : now.getHours() < 17 ? 'Selamat Siang' : 'Selamat Malam';

  const criticalItems = [
    ...stockCV.items.filter(i => i.stok <= 5 && i.stok > 0).map(i => ({ ...i, entity: 'CV' })),
    ...stockPT.items.filter(i => i.stok <= 5 && i.stok > 0).map(i => ({ ...i, entity: 'PT' })),
  ].sort((a, b) => a.stok - b.stok).slice(0, 6);

  return (
    <div className="pb-4 animate-fade-in">
      <div className="bg-gradient-to-br from-[#0b2a55] via-[#0f3a73] to-[#164e8a] rounded-2xl p-5 mb-4 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-400/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-400/10 rounded-full blur-2xl" />

        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg">
                <Snowflake className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-white text-lg font-bold tracking-tight">GudangAI <span className="text-cyan-400 font-extrabold">RUDY</span></h1>
                <p className="text-cyan-300/70 text-[11px]">Cold Storage Control</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${
                isOnline ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
              }`}>
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {isOnline ? 'Online' : 'Offline'}
              </div>
            </div>
          </div>

          <div>
            <p className="text-cyan-200/80 text-sm">{greeting},</p>
            <p className="text-white text-xl font-bold">{user?.name || 'Boss'} 👋</p>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <div className="flex-1">
              <p className="text-cyan-300/50 text-[10px] uppercase tracking-wider">Total Item</p>
              <p className="text-white text-3xl font-bold">189</p>
            </div>
            <div className="flex-1">
              <p className="text-cyan-300/50 text-[10px] uppercase tracking-wider">CV / PT</p>
              <p className="text-white text-3xl font-bold">81 / 108</p>
            </div>
            <div className="flex-1">
              <p className="text-cyan-300/50 text-[10px] uppercase tracking-wider">Pending</p>
              <p className="text-white text-3xl font-bold">{pendingQueue.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <QuickStatCard
          icon={Package} label="Stok CV" value={statsCV.totalStok}
          sub={`${statsCV.danger + statsCV.zero} kritis`}
          color="text-blue-600" gradient="bg-gradient-to-br from-blue-50 to-cyan-50"
        />
        <QuickStatCard
          icon={Package} label="Stok PT" value={statsPT.totalStok}
          sub={`${statsPT.danger + statsPT.zero} kritis`}
          color="text-violet-600" gradient="bg-gradient-to-br from-violet-50 to-purple-50"
        />
        <QuickStatCard
          icon={AlertTriangle} label="Item Kritis" value={statsCV.danger + statsPT.danger + statsCV.zero + statsPT.zero}
          sub="Perlu restock"
          color="text-red-600" gradient="bg-gradient-to-br from-red-50 to-orange-50"
        />
        <QuickStatCard
          icon={Activity} label="Transaksi Hari Ini"
          value={recentHistory.filter(h => {
            const d = new Date(h.savedAt);
            return d.toDateString() === now.toDateString();
          }).length}
          sub="Masuk + Keluar"
          color="text-emerald-600" gradient="bg-gradient-to-br from-emerald-50 to-green-50"
        />
      </div>

      {criticalItems.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" /> Stok Kritis
            </h3>
          </div>
          <div className="space-y-1.5">
            {criticalItems.map(item => (
              <div key={item.kode} className="bg-white rounded-xl px-3 py-2.5 border border-red-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                    item.entity === 'CV' ? 'bg-blue-100 text-blue-600' : 'bg-violet-100 text-violet-600'
                  }`}>{item.entity}</div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{item.nama}</p>
                    <p className="text-[11px] text-gray-400">{item.kode}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-red-600">{item.stok}</p>
                  <p className="text-[10px] text-gray-400">{item.satuan}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentHistory.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" /> Aktivitas Terakhir
          </h3>
          <div className="space-y-1.5">
            {recentHistory.map((h, i) => (
              <div key={i} className="bg-white rounded-xl px-3 py-2.5 border border-gray-100 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  h.type === 'masuk' ? 'bg-emerald-100' : 'bg-orange-100'
                }`}>
                  {h.type === 'masuk'
                    ? <ArrowDownRight className="w-4 h-4 text-emerald-600" />
                    : <ArrowUpRight className="w-4 h-4 text-orange-600" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {h.items?.length || 0} item {h.type}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {h.entity} · {new Date(h.savedAt).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                    {h.offline && ' · Offline'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => setShowLogout(true)}
        className="w-full py-3 rounded-xl bg-gray-100 text-gray-500 text-sm hover:bg-gray-200 transition-colors mt-4">
        Keluar
      </button>

      {showLogout && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowLogout(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
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
