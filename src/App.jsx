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
  Snowflake,
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
  const hasUrl = Boolean(getApiUrl());

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (online && hasUrl) syncPendingQueue().catch(() => {});
  }, [online, hasUrl]);

  if (!hasUrl) {
    return (
      <div className="bg-amber-50 border-b border-amber-100 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-amber-700 font-medium">
        <WifiOff className="w-3 h-3" /> Mode Demo · Atur URL API di Pengaturan
      </div>
    );
  }
  if (!online) {
    return (
      <div className="bg-red-50 border-b border-red-100 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-red-700 font-medium">
        <WifiOff className="w-3 h-3" /> Mode Offline · Data disimpan lokal
      </div>
    );
  }
  return (
    <div className="bg-emerald-50 border-b border-emerald-100 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-emerald-700 font-medium">
      <Wifi className="w-3 h-3" /> Terhubung ke GudangAI RUDY
    </div>
  );
}

function AppShell() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-[#0a1628] to-[#0b2a55] flex items-center justify-center">
        <div className="text-center">
          <Snowflake className="w-8 h-8 text-white animate-spin mx-auto mb-4" style={{ animationDuration: '3s' }} />
          <p className="text-white text-lg font-bold">GudangAI <span className="text-cyan-400">RUDY</span></p>
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
      case 'po': return <POPage />;
      case 'riwayat': return <RiwayatPage />;
      case 'settings': return <SettingsPage />;
      default: return <DashboardPage onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-dvh bg-[#f0f4f8] flex flex-col">
      <ConnectionBanner />
      <main className="flex-1 overflow-y-auto px-3 pt-3 pb-24 max-w-lg mx-auto w-full">{renderPage()}</main>
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] z-40">
        <div className="max-w-lg mx-auto flex items-stretch justify-around px-1 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 rounded-xl ${
                  active ? 'text-[#0b2a55]' : 'text-gray-400'
                }`}>
                <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
                <span className={`text-[10px] font-medium ${active ? 'font-semibold' : ''}`}>{label}</span>
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
