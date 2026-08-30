import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import StokPage from './pages/StokPage';
import InputPage from './pages/InputPage';
import RiwayatPage from './pages/RiwayatPage';
import SettingsPage from './pages/SettingsPage';
import POPage from './pages/POPage';
import { getApiUrl, syncPendingQueue } from './data/api';
import {
  LayoutDashboard,
  Package,
  PackagePlus,
  Clock,
  Settings,
  FileText,
  Wifi,
  WifiOff,
} from 'lucide-react';

const TABS = [
  { id: 'dashboard', label: 'Beranda', icon: LayoutDashboard },
  { id: 'stok', label: 'Stok', icon: Package },
  { id: 'input', label: 'Input', icon: PackagePlus },
  { id: 'po', label: 'PO', icon: FileText },
  { id: 'riwayat', label: 'Riwayat', icon: Clock },
  { id: 'settings', label: 'Atur', icon: Settings },
];

function ConnectionBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [connMsg, setConnMsg] = useState('');
  const hasUrl = Boolean(getApiUrl());

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const onConn = (e) => {
      const d = e.detail || {};
      if (d.state === 'retry') {
        setConnMsg(`Mencoba ulang ${d.attempt}/${d.max}…`);
      } else if (d.state === 'recovered') {
        setConnMsg('Koneksi pulih');
        setTimeout(() => setConnMsg(''), 2000);
      } else if (d.state === 'failed') {
        setConnMsg(d.error || 'Gagal terhubung');
        setTimeout(() => setConnMsg(''), 4000);
      }
    };
    window.addEventListener('gudangai-conn', onConn);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('gudangai-conn', onConn);
    };
  }, []);

  useEffect(() => {
    if (online && hasUrl) {
      syncPendingQueue().catch(() => {});
    }
  }, [online, hasUrl]);

  if (!hasUrl) {
    return (
      <div className="bg-amber-50/95 border-b border-amber-100/80 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-amber-800 font-medium backdrop-blur-sm">
        <WifiOff className="w-3 h-3 shrink-0" />
        Mode Demo · Atur URL API di Pengaturan
      </div>
    );
  }

  if (!online) {
    return (
      <div className="bg-red-50/95 border-b border-red-100/80 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-red-700 font-medium backdrop-blur-sm">
        <WifiOff className="w-3 h-3 shrink-0" />
        Offline · Antrian lokal aktif
      </div>
    );
  }

  if (connMsg) {
    return (
      <div className="bg-sky-50/95 border-b border-sky-100/80 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-sky-800 font-medium backdrop-blur-sm">
        <Wifi className="w-3 h-3 shrink-0 animate-soft-pulse" />
        {connMsg}
      </div>
    );
  }

  return (
    <div className="bg-emerald-50/90 border-b border-emerald-100/70 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-emerald-700 font-medium backdrop-blur-sm">
      <span className="relative flex h-2 w-2">
        <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      Terhubung ke GudangAI RUDY
    </div>
  );
}

function AppShell() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  if (!user) return <LoginPage />;

  const renderPage = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardPage onNavigate={setActiveTab} />;
      case 'stok':
        return <StokPage />;
      case 'input':
        return <InputPage />;
      case 'po':
        return <POPage />;
      case 'riwayat':
        return <RiwayatPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-dvh bg-slate-100 flex flex-col">
      <ConnectionBanner />

      <main className="flex-1 px-3.5 pt-3.5 pb-24 max-w-lg mx-auto w-full overflow-y-auto">
        {renderPage()}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/92 backdrop-blur-xl border-t border-slate-200/80 safe-bottom z-40 shadow-[0_-4px_20px_rgb(15_23_42/0.04)]">
        <div className="max-w-lg mx-auto flex">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center pt-2 pb-1 relative transition-colors duration-200 ${
                  isActive ? 'text-navy-900' : 'text-slate-400'
                }`}
              >
                <div
                  className={`p-1.5 rounded-xl transition-all duration-200 ${
                    isActive ? 'bg-cyan-50 text-navy-900' : ''
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.25]' : 'stroke-[1.5]'}`} />
                </div>
                <span className={`text-[10px] mt-0.5 tracking-wide ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-[3px] bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full" />
                )}
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
