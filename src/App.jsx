import { useState, useEffect, Component, lazy, Suspense } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import {
  LayoutDashboard, Package, PackagePlus, Clock, Settings, ClipboardList,
  Loader2, Wifi, WifiOff, CloudOff,
} from 'lucide-react';
import { useConnection } from './hooks/useConnection';
import LoginPage from './pages/LoginPage';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const StokPage = lazy(() => import('./pages/StokPage'));
const InputPage = lazy(() => import('./pages/InputPage'));
const POPage = lazy(() => import('./pages/POPage'));
const RiwayatPage = lazy(() => import('./pages/RiwayatPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SyncQueuePage = lazy(() => import('./pages/SyncQueuePage'));

const TABS = [
  { id: 'dashboard', label: 'Beranda', icon: LayoutDashboard, active: 'text-cyan-300', chip: 'bg-cyan-500/25' },
  { id: 'stok', label: 'Stok', icon: Package, active: 'text-emerald-300', chip: 'bg-emerald-500/25' },
  { id: 'input', label: 'Input', icon: PackagePlus, active: 'text-amber-300', chip: 'bg-amber-500/25' },
  { id: 'po', label: 'PO', icon: ClipboardList, active: 'text-violet-300', chip: 'bg-violet-500/25' },
  { id: 'riwayat', label: 'Riwayat', icon: Clock, active: 'text-sky-300', chip: 'bg-sky-500/25' },
  { id: 'settings', label: 'Atur', icon: Settings, active: 'text-slate-200', chip: 'bg-slate-500/25' },
];

const TAB_ACCENT = {
  dashboard: 'from-cyan-400 to-cyan-600',
  stok: 'from-emerald-400 to-emerald-600',
  input: 'from-amber-400 to-amber-600',
  po: 'from-violet-400 to-violet-600',
  riwayat: 'from-sky-400 to-sky-600',
  settings: 'from-slate-300 to-slate-500',
};

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Terjadi kesalahan' };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center space-y-3">
          <p className="text-sm font-semibold text-rose-300">Halaman gagal dimuat</p>
          <p className="text-xs text-slate-400">{this.state.message}</p>
          <button type="button" className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm font-bold" onClick={() => this.setState({ hasError: false, message: '' })}>
            Coba lagi
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ConnBanner({ online, hasUrl, status, message, syncing }) {
  if (online && hasUrl && status !== 'error' && !syncing) return null;
  let text = message || '';
  let Icon = Wifi;
  let cls = 'bg-slate-800/90 text-slate-200';
  if (!online) { text = 'Offline — transaksi masuk antrean lokal'; Icon = WifiOff; cls = 'bg-amber-900/90 text-amber-100'; }
  else if (!hasUrl) { text = 'URL API belum diatur — buka Atur'; Icon = CloudOff; cls = 'bg-rose-900/90 text-rose-100'; }
  else if (syncing) { text = 'Menyinkronkan antrean...'; Icon = Loader2; cls = 'bg-cyan-900/90 text-cyan-100'; }
  else if (status === 'error') { text = message || 'Koneksi bermasalah'; Icon = CloudOff; cls = 'bg-rose-900/90 text-rose-100'; }
  return (
    <div className={`fixed top-0 left-0 right-0 z-50 px-3 py-2 text-[11px] font-semibold flex items-center justify-center gap-2 ${cls}`}>
      <Icon className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
      <span className="truncate">{text}</span>
    </div>
  );
}

function AppShell() {
  const { user } = useAuth();
  const { online, hasUrl, status, message, syncing } = useConnection();
  const [tab, setTab] = useState('dashboard');
  const [pageKey, setPageKey] = useState('dashboard');
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const goTab = (id) => {
    setTab(id);
    setPageKey(id + '-' + Date.now());
  };

  const installApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  if (!user) return <LoginPage />;

  let page;
  switch (tab) {
    case 'stok': page = <StokPage />; break;
    case 'input': page = <InputPage />; break;
    case 'po': page = <POPage onNavigate={goTab} />; break;
    case 'riwayat': page = <RiwayatPage />; break;
    case 'settings': page = <SettingsPage onNavigate={goTab} />; break;
    case 'sync': page = <SyncQueuePage onBack={() => goTab('settings')} />; break;
    default: page = <DashboardPage onNavigate={goTab} />;
  }

  const navIndex = Math.max(0, TABS.findIndex((t) => t.id === tab));

  return (
    <div className="app-shell min-h-screen text-slate-100">
      <div className="app-bg" aria-hidden="true" />
      <ConnBanner online={online} hasUrl={hasUrl} status={status} message={message} syncing={syncing} />
      {installPrompt && (
        <button type="button" onClick={installApp} className="fixed top-3 right-3 z-[60] rounded-full bg-[#0f9f9a] px-4 py-2 text-xs font-extrabold text-white shadow-lg border border-white/30">
          Pasang Aplikasi
        </button>
      )}
      <main className="page-content app-content max-w-lg mx-auto min-h-screen px-3 pb-28">
        <div key={pageKey} className="animate-page-in">
          <ErrorBoundary>
            <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-cyan-400 animate-spin" /></div>}>
              {page}
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>
      <nav className="nav-bar nav-bar-6 fixed bottom-0 left-0 right-0 safe-bottom z-40">
        <div className="max-w-lg mx-auto flex relative" style={{ '--nav-index': navIndex, '--nav-count': 6 }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => goTab(t.id)}
                className={`nav-btn flex-1 flex flex-col items-center pt-2 pb-1.5 relative min-w-0 ${
                  isActive ? `${t.active} is-active` : 'text-slate-400 is-inactive'
                }`}
              >
                <div className={`nav-icon-wrap p-1 rounded-xl ${isActive ? t.chip : ''}`}>
                  <Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.5 : 2.15} />
                </div>
                <span className={`nav-label text-[9px] sm:text-[10px] mt-0.5 truncate max-w-full px-0.5 ${
                  isActive ? 'font-bold opacity-100' : 'font-semibold opacity-80'
                }`}>
                  {t.label}
                </span>
                {isActive && (
                  <span className={`nav-underline absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-[3px] rounded-full bg-gradient-to-r ${TAB_ACCENT[t.id]}`} />
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
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}
