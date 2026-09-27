import { useState, useEffect, Component } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import StokPage from './pages/StokPage';
import InputPage from './pages/InputPage';
import RiwayatPage from './pages/RiwayatPage';
import SettingsPage from './pages/SettingsPage';
import POPage from './pages/POPage';
import { useConnection } from './hooks/useConnection';
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


class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('Page crash:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          <p className="font-bold mb-1">Halaman error</p>
          <p className="text-xs break-all">{String(this.state.error?.message || this.state.error)}</p>
          <button type="button" className="mt-3 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold"
            onClick={() => this.setState({ error: null })}>Coba lagi</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const TABS = [
  { id: 'dashboard', label: 'Beranda', icon: LayoutDashboard, active: 'text-cyan-700', chip: 'bg-cyan-50' },
  { id: 'stok', label: 'Stok', icon: Package, active: 'text-blue-700', chip: 'bg-blue-50' },
  { id: 'input', label: 'Input', icon: PackagePlus, active: 'text-emerald-700', chip: 'bg-emerald-50' },
  { id: 'po', label: 'PO', icon: FileText, active: 'text-violet-700', chip: 'bg-violet-50' },
  { id: 'riwayat', label: 'Riwayat', icon: Clock, active: 'text-amber-700', chip: 'bg-amber-50' },
  { id: 'settings', label: 'Atur', icon: Settings, active: 'text-slate-700', chip: 'bg-slate-100' },
];

const TAB_ACCENT = {
  dashboard: 'from-cyan-400 to-blue-500',
  stok: 'from-blue-400 to-indigo-500',
  input: 'from-emerald-400 to-teal-500',
  po: 'from-violet-400 to-purple-500',
  riwayat: 'from-amber-400 to-orange-500',
  settings: 'from-slate-400 to-slate-600',
};

function ConnectionBanner() {
  const { online, hasUrl, status, message, syncing } = useConnection({ pollMs: 90000 });
  const [flash, setFlash] = useState('');

  useEffect(() => {
    const onConn = (e) => {
      const d = e.detail || {};
      if (d.state === 'recovered') {
        setFlash('Koneksi stabil');
        setTimeout(() => setFlash(''), 1800);
      } else if (d.state === 'failed' && d.error) {
        // Hanya tampilkan error nyata (bukan setiap retry)
        setFlash(d.error);
        setTimeout(() => setFlash(''), 3500);
      }
    };
    window.addEventListener('gudangai-conn', onConn);
    return () => window.removeEventListener('gudangai-conn', onConn);
  }, []);

  if (!hasUrl) {
    return (
      <div className="bg-amber-50/95 border-b border-amber-100/80 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-amber-800 font-medium backdrop-blur-sm transition-colors duration-300">
        <WifiOff className="w-3 h-3 shrink-0" />
        Mode Demo · Atur URL API di Pengaturan
      </div>
    );
  }

  if (!online || status === 'offline') {
    return (
      <div className="bg-red-50/95 border-b border-red-100/80 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-red-700 font-medium backdrop-blur-sm transition-colors duration-300">
        <WifiOff className="w-3 h-3 shrink-0" />
        Offline · Antrian disimpan lokal
      </div>
    );
  }

  if (syncing) {
    return (
      <div className="bg-cyan-50/95 border-b border-cyan-100/80 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-cyan-800 font-medium backdrop-blur-sm">
        <Wifi className="w-3 h-3 shrink-0 animate-pulse" />
        Menyinkronkan antrian…
      </div>
    );
  }

  if (flash) {
    const isErr = flash.length > 20 || /gagal|error|fail/i.test(flash);
    return (
      <div className={`${isErr ? 'bg-amber-50/95 border-amber-100 text-amber-800' : 'bg-emerald-50/95 border-emerald-100 text-emerald-800'} border-b px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] font-medium backdrop-blur-sm transition-colors duration-300`}>
        <Wifi className="w-3 h-3 shrink-0" />
        {flash}
      </div>
    );
  }

  return (
    <div className="bg-emerald-50/90 border-b border-emerald-100/80 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-emerald-800 font-medium backdrop-blur-sm">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-soft-pulse" />
      Terhubung ke GudangAI RUDY
    </div>
  );
}

function AppShell() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pageKey, setPageKey] = useState(0);

  const goTab = (id) => {
    if (id === activeTab) return;
    setActiveTab(id);
    setPageKey((k) => k + 1);
  };

  if (!user) return <LoginPage />;

  const renderPage = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardPage onNavigate={goTab} />;
      case 'stok':
        return <StokPage />;
      case 'input':
        return <ErrorBoundary><InputPage /></ErrorBoundary>;
      case 'po':
        return <POPage />;
      case 'riwayat':
        return <RiwayatPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage onNavigate={goTab} />;
    }
  };

  return (
    <div className="min-h-dvh bg-slate-100 flex flex-col">
      <ConnectionBanner />

      <main className="flex-1 px-3.5 pt-3.5 pb-24 max-w-lg mx-auto w-full overflow-y-auto">
        <div key={pageKey} className="animate-page-in">
          {renderPage()}
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/92 backdrop-blur-xl border-t border-slate-200/80 safe-bottom z-40 shadow-[0_-4px_20px_rgb(15_23_42/0.04)]">
        <div className="max-w-lg mx-auto flex">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => goTab(tab.id)}
                className={`nav-btn flex-1 flex flex-col items-center pt-2 pb-1 relative ${
                  isActive ? tab.active : 'text-slate-400'
                }`}
              >
                <div
                  className={`nav-icon-wrap p-1.5 rounded-xl ${
                    isActive ? `${tab.chip} ${tab.active}` : ''
                  } ${isActive ? 'animate-nav-pop' : ''}`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.25]' : 'stroke-[1.5]'}`} />
                </div>
                <span className={`text-[10px] mt-0.5 tracking-wide transition-all duration-250 ${
                  isActive ? 'font-semibold' : 'font-medium'
                }`}>
                  {tab.label}
                </span>
                {isActive && (
                  <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gradient-to-r ${TAB_ACCENT[tab.id]}`} />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <SpeedInsights />
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
