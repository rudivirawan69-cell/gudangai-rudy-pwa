import { useState, useEffect, Component, lazy, Suspense } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import { useConnection } from './hooks/useConnection';
import {
  LayoutDashboard,
  Package,
  PackagePlus,
  FileText,
  Clock,
  Settings,
  Wifi,
  WifiOff,
} from 'lucide-react';
import bgDataUrl from './assets/bgDataUrl';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const StokPage = lazy(() => import('./pages/StokPage'));
const InputPage = lazy(() => import('./pages/InputPage'));
const RiwayatPage = lazy(() => import('./pages/RiwayatPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SyncQueuePage = lazy(() => import('./pages/SyncQueuePage'));
const POPage = lazy(() => import('./pages/POPage'));

class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          <p className="font-bold mb-1">Halaman error</p>
          <p className="text-xs break-all">{String(this.state.error?.message || this.state.error)}</p>
          <button type="button" className="mt-3 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold"
            onClick={() => this.setState({ error: null })}>
            Coba lagi
          </button>
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
  dashboard: 'from-cyan-400 to-cyan-600',
  stok: 'from-blue-400 to-blue-600',
  input: 'from-emerald-400 to-emerald-600',
  po: 'from-violet-400 to-violet-600',
  riwayat: 'from-amber-400 to-amber-600',
  settings: 'from-slate-400 to-slate-600',
};

function ConnectionBanner() {
  const { online, hasUrl, status, message, syncing } = useConnection({ pollMs: 90000 });
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    if (status === 'ok' && message) {
      setFlash(message);
      const t = setTimeout(() => setFlash(null), 2500);
      return () => clearTimeout(t);
    }
  }, [status, message]);

  if (!hasUrl) {
    return (
      <div className="bg-amber-50 border-b border-amber-100 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-amber-800 font-medium relative z-[2]">
        <WifiOff className="w-3 h-3 shrink-0" />
        Mode Demo — isi API di Atur
      </div>
    );
  }
  if (!online || status === 'offline') {
    return (
      <div className="bg-red-50 border-b border-red-100 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-red-700 font-medium relative z-[2]">
        <WifiOff className="w-3 h-3 shrink-0" />
        Offline
      </div>
    );
  }
  if (syncing || status === 'syncing') {
    return (
      <div className="bg-cyan-50 border-b border-cyan-100 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-cyan-800 font-medium relative z-[2]">
        <Wifi className="w-3 h-3 shrink-0 animate-pulse" />
        Sinkron…
      </div>
    );
  }
  if (flash) {
    return (
      <div className="bg-emerald-50 border-b border-emerald-100 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-emerald-800 font-medium relative z-[2]">
        <Wifi className="w-3 h-3 shrink-0" />
        {flash}
      </div>
    );
  }
  return (
    <div className="bg-emerald-50/95 border-b border-emerald-100 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-emerald-800 font-medium relative z-[2]">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-soft-pulse" />
      Terhubung
      <span className="opacity-50">·</span>
      <span className="tabular-nums font-semibold">
        {new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date())}
      </span>
    </div>
  );
}

function AppShell() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pageKey, setPageKey] = useState(0);

  const goTab = (id) => {
    setActiveTab(id);
    setPageKey((k) => k + 1);
  };

  if (loading) {
    return (
      <div className="app-shell min-h-dvh flex items-center justify-center">
        <div className="app-bg" aria-hidden style={{ backgroundImage: `linear-gradient(to bottom, rgba(6,16,24,0.5), rgba(6,16,24,0.85)), url(${bgDataUrl})` }} />
        <div className="w-8 h-8 rounded-full border-2 border-cyan-400/40 border-t-cyan-300 animate-spin relative z-[1]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell">
        <div className="app-bg" aria-hidden style={{ backgroundImage: `linear-gradient(to bottom, rgba(6,16,24,0.35), rgba(6,16,24,0.7)), url(${bgDataUrl})` }} />
        <div className="relative z-[1]">
          <LoginPage />
        </div>
      </div>
    );
  }

  const renderPage = () => {
    switch (activeTab) {
      case 'stok': return <StokPage />;
      case 'input': return <InputPage />;
      case 'po': return <POPage />;
      case 'riwayat': return <RiwayatPage />;
      case 'settings': return <SettingsPage />;
      case 'sync': return <SyncQueuePage />;
      default: return <DashboardPage onNavigate={goTab} />;
    }
  };

  return (
    <div className="app-shell">
      <div
        className="app-bg"
        aria-hidden="true"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(6,16,24,0.40) 0%, rgba(6,16,24,0.58) 50%, rgba(6,16,24,0.82) 100%), url(${bgDataUrl})`,
        }}
      />
      <ConnectionBanner />

      <main className="flex-1 px-3.5 pt-3.5 pb-24 max-w-lg mx-auto w-full overflow-y-auto relative z-[1]">
        <div key={pageKey} className="animate-page-in">
          <PageErrorBoundary>
            <Suspense fallback={<div className="py-16 flex justify-center"><div className="w-8 h-8 rounded-full border-2 border-cyan-300/40 border-t-cyan-200 animate-spin" /></div>}>
              {renderPage()}
            </Suspense>
          </PageErrorBoundary>
        </div>
      </main>

      <nav className="nav-bar fixed bottom-0 left-0 right-0 safe-bottom z-40">
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
                  isActive ? 'text-cyan-300' : 'text-slate-400'
                }`}
              >
                <div className={`nav-icon-wrap p-1.5 rounded-xl ${
                  isActive ? 'bg-cyan-500/20 text-cyan-300' : ''
                }`}>
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
