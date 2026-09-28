import { useState, useEffect, Component, lazy, Suspense } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import { useConnection } from './hooks/useConnection';
import {
  LayoutDashboard, Package, PackagePlus, FileText, Clock, Settings,
  Wifi, WifiOff, AlertTriangle, Loader2,
} from 'lucide-react';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const StokPage = lazy(() => import('./pages/StokPage'));
const InputPage = lazy(() => import('./pages/InputPage'));
const POPage = lazy(() => import('./pages/POPage'));
const RiwayatPage = lazy(() => import('./pages/RiwayatPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SyncQueuePage = lazy(() => import('./pages/SyncQueuePage'));

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, message: err?.message || 'Terjadi kesalahan' };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
          <div className="max-w-sm w-full bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-sm">
            <p className="font-bold text-slate-900">Halaman gagal dimuat</p>
            <p className="text-xs text-slate-500">{this.state.message}</p>
            <button type="button" onClick={() => window.location.reload()} className="w-full py-2.5 rounded-xl bg-[#0b2a55] text-white text-sm font-semibold">Muat ulang</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const TABS = [
  { id: 'dashboard', label: 'Beranda', icon: LayoutDashboard, active: 'text-cyan-300', chip: 'bg-cyan-500/20' },
  { id: 'stok', label: 'Stok', icon: Package, active: 'text-blue-300', chip: 'bg-blue-500/20' },
  { id: 'input', label: 'Input', icon: PackagePlus, active: 'text-emerald-300', chip: 'bg-emerald-500/20' },
  { id: 'po', label: 'PO', icon: FileText, active: 'text-violet-300', chip: 'bg-violet-500/20' },
  { id: 'riwayat', label: 'Riwayat', icon: Clock, active: 'text-amber-300', chip: 'bg-amber-500/20' },
  { id: 'settings', label: 'Atur', icon: Settings, active: 'text-slate-200', chip: 'bg-slate-500/20' },
];

const TAB_ACCENT = {
  dashboard: 'from-cyan-400 to-cyan-600',
  stok: 'from-blue-400 to-blue-600',
  input: 'from-emerald-400 to-emerald-600',
  po: 'from-violet-400 to-violet-600',
  riwayat: 'from-amber-400 to-amber-600',
  settings: 'from-slate-400 to-slate-600',
};

function ConnBanner({ online, hasUrl, status, message, syncing }) {
  if (!hasUrl) return null;
  if (syncing || status === 'syncing') {
    return (
      <div className="px-3 py-1.5 bg-cyan-600/90 text-white text-[11px] font-semibold flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Menyinkronkan...
      </div>
    );
  }
  if (!online || status === 'offline') {
    return (
      <div className="px-3 py-1.5 bg-amber-500/95 text-white text-[11px] font-semibold flex items-center gap-2">
        <WifiOff className="w-3.5 h-3.5" /> Offline — data antrian aman di perangkat
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="px-3 py-1.5 bg-rose-600/90 text-white text-[11px] font-semibold flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5" /> {message || 'Backend tidak merespons'}
      </div>
    );
  }
  return null;
}

function AppShell() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [pageKey, setPageKey] = useState(0);
  const { online, hasUrl, status, message, syncing } = useConnection({ pollMs: 90000 });

  const goTab = (id) => {
    setTab(id);
    setPageKey((k) => k + 1);
  };

  useEffect(() => {
    const onNav = (e) => {
      const id = e?.detail?.tab;
      if (id) goTab(id);
    };
    window.addEventListener('gudangai-navigate', onNav);
    return () => window.removeEventListener('gudangai-navigate', onNav);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#06101f]">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }
  if (!user) return <LoginPage />;

  let page;
  switch (tab) {
    case 'dashboard': page = <DashboardPage onNavigate={goTab} />; break;
    case 'stok': page = <StokPage />; break;
    case 'input': page = <InputPage />; break;
    case 'po': page = <POPage />; break;
    case 'riwayat': page = <RiwayatPage onNavigate={goTab} />; break;
    case 'settings': page = <SettingsPage onNavigate={goTab} />; break;
    case 'sync': page = <SyncQueuePage onBack={() => goTab('riwayat')} />; break;
    default: page = <DashboardPage onNavigate={goTab} />;
  }

  return (
    <div className="min-h-screen bg-[#06101f] text-slate-100">
      <ConnBanner online={online} hasUrl={hasUrl} status={status} message={message} syncing={syncing} />
      <main className="max-w-lg mx-auto min-h-screen pb-20">
        <div key={pageKey} className="animate-page-in">
          <ErrorBoundary>
            <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-cyan-400 animate-spin" /></div>}>
              {page}
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>
      <nav className="nav-bar fixed bottom-0 left-0 right-0 safe-bottom z-40">
        <div className="max-w-lg mx-auto flex">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => goTab(t.id)}
                className={`nav-btn flex-1 flex flex-col items-center pt-2.5 pb-1.5 relative ${
                  isActive ? t.active : 'text-slate-400'
                }`}
              >
                <div className={`nav-icon-wrap p-1.5 rounded-xl ${isActive ? t.chip : ''}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`text-[10px] mt-0.5 ${
                  isActive ? 'font-bold opacity-100' : 'font-medium opacity-80'
                }`}>
                  {t.label}
                </span>
                {isActive && (
                  <span className={`nav-underline absolute bottom-0 left-1/2 -translate-x-1/2 w-7 h-[3px] rounded-full bg-gradient-to-r ${TAB_ACCENT[t.id]}`} />
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
