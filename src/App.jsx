import { useState, useEffect, Component } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import StokPage from './pages/StokPage';
import InputPage from './pages/InputPage';
import RiwayatPage from './pages/RiwayatPage';
import SettingsPage from './pages/SettingsPage';
import SyncQueuePage from './pages/SyncQueuePage';
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
        <div className="p-4 rounded-2xl bg-white/90 border border-red-200 text-sm text-red-800 shadow-lg">
          <p className="font-bold mb-1">Halaman error</p>
          <p className="text-xs break-all">{String(this.state.error?.message || this.state.error)}</p>
          <button
            type="button"
            className="mt-3 px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold"
            onClick={() => this.setState({ error: null })}
          >
            Coba lagi
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Nav unified with the teal-green cold-storage theme. */
const TABS = [
  { id: 'dashboard', label: 'Beranda', icon: LayoutDashboard },
  { id: 'stok', label: 'Stok', icon: Package },
  { id: 'input', label: 'Input', icon: PackagePlus },
  { id: 'po', label: 'PO', icon: FileText },
  { id: 'riwayat', label: 'Riwayat', icon: Clock },
  { id: 'settings', label: 'Atur', icon: Settings },
];

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
        setFlash(d.error);
        setTimeout(() => setFlash(''), 3500);
      }
    };
    window.addEventListener('gudangai-conn', onConn);
    return () => window.removeEventListener('gudangai-conn', onConn);
  }, []);

  const base =
    'px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] font-medium backdrop-blur-md border-b transition-colors duration-300';

  if (!hasUrl) {
    return (
      <div className={`${base} bg-amber-500/20 border-amber-300/30 text-amber-100`}>
        <WifiOff className="w-3 h-3 shrink-0" />
        Mode Demo · Atur URL API di Pengaturan
      </div>
    );
  }

  if (!online || status === 'offline') {
    return (
      <div className={`${base} bg-red-500/25 border-red-300/30 text-red-100`}>
        <WifiOff className="w-3 h-3 shrink-0" />
        Offline · Antrian disimpan lokal
      </div>
    );
  }

  if (syncing) {
    return (
      <div className={`${base} bg-cyan-500/20 border-cyan-300/30 text-cyan-50`}>
        <Wifi className="w-3 h-3 shrink-0 animate-pulse" />
        Menyinkronkan antrian…
      </div>
    );
  }

  if (flash) {
    const isErr = flash.length > 20 || /gagal|error|fail/i.test(flash);
    return (
      <div
        className={`${base} ${
          isErr
            ? 'bg-amber-500/25 border-amber-300/30 text-amber-50'
            : 'bg-emerald-500/25 border-emerald-300/30 text-emerald-50'
        }`}
      >
        <Wifi className="w-3 h-3 shrink-0" />
        {flash}
      </div>
    );
  }

  return (
    <div className={`${base} bg-emerald-500/15 border-emerald-300/25 text-emerald-50`}>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-soft-pulse" />
      Terhubung ke GudangAI RUDY
    </div>
  );
}

function AppShell() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pageKey, setPageKey] = useState(0);
  const [showSyncQueue, setShowSyncQueue] = useState(false);

  const goTab = (id) => {
    if (id === activeTab) return;
    setActiveTab(id);
    setPageKey((k) => k + 1);
  };

  if (!user) {
    return (
      <>
        <div className="app-bg" aria-hidden>
          <div className="app-bg-photo" />
        </div>
        <div className="app-shell">
          <LoginPage />
        </div>
      </>
    );
  }

  if (showSyncQueue) {
    return (
      <>
        <div className="app-bg" aria-hidden>
          <div className="app-bg-photo" />
        </div>

        <div className="app-shell">
          <ConnectionBanner />

          <main className="flex-1 px-3.5 pt-3.5 pb-6 max-w-lg mx-auto w-full overflow-y-auto">
            <ErrorBoundary>
              <SyncQueuePage
                onBack={() => setShowSyncQueue(false)}
              />
            </ErrorBoundary>
          </main>
        </div>
      </>
    );
  }

  const renderPage = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardPage onNavigate={goTab} />;
      case 'stok':
        return <StokPage />;
      case 'input':
        return (
          <ErrorBoundary>
            <InputPage />
          </ErrorBoundary>
        );
      case 'po':
        return <POPage />;
      case 'riwayat':
        return <RiwayatPage />;
      case 'settings':
        return (
          <SettingsPage
            onOpenSyncQueue={() => setShowSyncQueue(true)}
          />
        );
      default:
        return <DashboardPage onNavigate={goTab} />;
    }
  };

  return (
    <>
      <div className="app-bg" aria-hidden>
        <div className="app-bg-photo" />
      </div>

      <div className="app-shell">
        <ConnectionBanner />

        <main className="flex-1 px-3.5 pt-3.5 pb-24 max-w-lg mx-auto w-full overflow-y-auto">
          <div key={pageKey} className="animate-page-in">
            {renderPage()}
          </div>
        </main>

        <nav className="nav-glass fixed bottom-0 left-0 right-0 safe-bottom z-40">
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
                    isActive ? 'text-teal-700' : 'text-slate-400'
                  }`}
                >
                  <div
                    className={`nav-icon-wrap p-1.5 rounded-xl transition-colors ${
                      isActive ? 'bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-700' : ''
                    } ${isActive ? 'animate-nav-pop' : ''}`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.25]' : 'stroke-[1.5]'}`} />
                  </div>
                  <span
                    className={`text-[10px] mt-0.5 tracking-wide transition-all duration-250 ${
                      isActive ? 'font-semibold text-teal-800' : 'font-medium'
                    }`}
                  >
                    {tab.label}
                  </span>
                  {isActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gradient-to-r from-teal-400 to-emerald-500" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <SpeedInsights />
      </div>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
