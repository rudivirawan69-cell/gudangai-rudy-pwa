import { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import StokPage from './pages/StokPage';
import InputPage from './pages/InputPage';
import RiwayatPage from './pages/RiwayatPage';
import SettingsPage from './pages/SettingsPage';
import { getApiUrl, getApiSecret, healthCheck, syncPendingQueue } from './data/api';
import {
  LayoutDashboard,
  Package,
  PackagePlus,
  Clock,
  Settings,
  Snowflake,
  Wifi,
  WifiOff,
  RefreshCw,
} from 'lucide-react';

const TABS = [
  { id: 'dashboard', label: 'Beranda', icon: LayoutDashboard },
  { id: 'stok', label: 'Stok', icon: Package },
  { id: 'input', label: 'Input', icon: PackagePlus },
  { id: 'riwayat', label: 'Riwayat', icon: Clock },
  { id: 'settings', label: 'Atur', icon: Settings },
];

function getStoredConnection() {
  try { return JSON.parse(localStorage.getItem('gudangai_conn_state') || 'null'); } catch { return null; }
}
function setStoredConnection(state) {
  localStorage.setItem('gudangai_conn_state', JSON.stringify({ ...state, at: Date.now() }));
}

function ConnectionBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [connState, setConnState] = useState(() => getStoredConnection()?.status || 'unknown');
  const [reconnecting, setReconnecting] = useState(false);
  const hasUrl = Boolean(getApiUrl());

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const checkConnection = useCallback(async () => {
    if (!hasUrl || !online) return;
    setReconnecting(true);
    try {
      const result = await healthCheck();
      const status = result.ok ? 'connected' : 'error';
      setConnState(status);
      setStoredConnection({ status, error: result.error || null });
    } catch {
      setConnState('error');
      setStoredConnection({ status: 'error', error: 'Health check failed' });
    } finally {
      setReconnecting(false);
    }
  }, [hasUrl, online]);

  useEffect(() => {
    if (hasUrl && online) {
      const stored = getStoredConnection();
      if (stored && stored.status === 'connected' && stored.at && (Date.now() - stored.at) < 120000) {
        setConnState('connected');
      } else {
        checkConnection();
      }
    }
  }, [hasUrl, online, checkConnection]);

  useEffect(() => {
    if (!hasUrl || !online) return;
    const interval = setInterval(checkConnection, 90000);
    return () => clearInterval(interval);
  }, [hasUrl, online, checkConnection]);

  useEffect(() => {
    if (online && hasUrl) {
      syncPendingQueue().catch(() => {});
      checkConnection();
    }
  }, [online, hasUrl, checkConnection]);

  if (!hasUrl) {
    return (
      <div className="bg-amber-50 border-b border-amber-100 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-amber-700 font-medium">
        <WifiOff className="w-3 h-3" />
        Mode Demo \u00b7 Atur URL API di Pengaturan
      </div>
    );
  }

  if (!online) {
    return (
      <div className="bg-red-50 border-b border-red-100 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-red-700 font-medium">
        <WifiOff className="w-3 h-3" />
        Mode Offline \u00b7 Data disimpan lokal
      </div>
    );
  }

  if (reconnecting) {
    return (
      <div className="bg-blue-50 border-b border-blue-100 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-blue-700 font-medium">
        <RefreshCw className="w-3 h-3 animate-spin" />
        Menghubungkan ke GudangAI RUDY...
      </div>
    );
  }

  if (connState === 'connected') {
    return (
      <div className="bg-emerald-50 border-b border-emerald-100 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-emerald-700 font-medium">
        <Wifi className="w-3 h-3" />
        Terhubung ke GudangAI RUDY
      </div>
    );
  }

  if (connState === 'error') {
    return (
      <div className="bg-amber-50 border-b border-amber-100 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-amber-700 font-medium cursor-pointer"
           onClick={checkConnection}>
        <WifiOff className="w-3 h-3" />
        Koneksi terputus \u00b7 Tap untuk coba lagi
      </div>
    );
  }

  return (
    <div className="bg-emerald-50 border-b border-emerald-100 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-emerald-700 font-medium">
      <Wifi className="w-3 h-3" />
      Terhubung ke GudangAI RUDY
    </div>
  );
}

function AppShell() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-[#0a1628] to-[#0b2a55] flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center mx-auto mb-4 shadow-[0_0_40px_rgba(34,211,238,0.3)]">
            <Snowflake className="w-8 h-8 text-white animate-spin" style={{ animationDuration: '3s' }} />
          </div>
          <p className="text-white text-lg font-bold tracking-tight">GudangAI <span className="text-cyan-400 font-extrabold">RUDY</span></p>
          <p className="text-cyan-300/60 text-sm mt-1">Memuat...</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  const renderPage = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardPage onNavigate={setActiveTab} />;
      case 'stok': return <StokPage />;
      case 'input': return <InputPage />;
      case 'riwayat': return <RiwayatPage />;
      case 'settings': return <SettingsPage />;
      default: return <DashboardPage onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-dvh bg-[#f0f4f8] flex flex-col">
      <ConnectionBanner />
      <main className="flex-1 px-4 pt-4 pb-24 max-w-lg mx-auto w-full overflow-y-auto">
        {renderPage()}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-gray-200 safe-bottom z-40">
        <div className="max-w-lg mx-auto flex">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center pt-2 pb-1 relative transition-all ${isActive ? 'text-[#0b2a55]' : 'text-gray-400'}`}>
                <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-cyan-100/80' : ''}`}>
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.5]'}`} />
                </div>
                <span className={`text-[10px] mt-0.5 ${isActive ? 'font-semibold' : 'font-medium'}`}>{tab.label}</span>
                {isActive && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[3px] bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
