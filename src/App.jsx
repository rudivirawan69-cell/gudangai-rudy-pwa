import { useState, useEffect, Component, lazy, Suspense } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import LoginPage from './pages/LoginPage';
import { useConnection } from './hooks/useConnection';
import { useBootstrap } from './hooks/useBootstrap';
import { getDashboardData } from './data/api';
import {
  LayoutDashboard, Package, PackagePlus, Clock, Settings, ClipboardList,
  WifiOff, AlertTriangle, Loader2, Mail,
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
  { id: 'dashboard', label: 'Beranda', icon: LayoutDashboard, active: 'text-cyan-300', chip: 'bg-cyan-500/25' },
  { id: 'stok', label: 'Stok', icon: Package, active: 'text-blue-300', chip: 'bg-blue-500/25' },
  { id: 'input', label: 'Input', icon: PackagePlus, active: 'text-emerald-300', chip: 'bg-emerald-500/25' },
  { id: 'po', label: 'PO', icon: ClipboardList, active: 'text-violet-300', chip: 'bg-violet-500/25' },
  { id: 'riwayat', label: 'Riwayat', icon: Clock, active: 'text-amber-300', chip: 'bg-amber-500/25' },
  { id: 'settings', label: 'Atur', icon: Settings, active: 'text-slate-200', chip: 'bg-slate-500/25' },
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

function SharedLiveBar() {
  const [sheetTime, setSheetTime] = useState('Memuat status spreadsheet…');
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await getDashboardData();
        if (!alive || !data?.success) return;
        const value = data.lastUpdate ?? data.lastUpdatedAt ?? data.lastUpdated ?? data.updatedAt ?? data.updateTime ?? data.waktuUpdate ?? data.waktu_update ?? data.terakhirUpdate ?? data.timestamp;
        if (value == null || value === '') {
          setSheetTime('Timestamp belum tersedia dari spreadsheet');
          return;
        }
        let d;
        if (typeof value === 'number') d = new Date(value < 1e12 ? value * 1000 : value);
        else d = new Date(value);
        setSheetTime(Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat('id-ID', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
          hourCycle: 'h23', timeZone: 'Asia/Jakarta',
        }).format(d) + ' WIB');
      } catch (_) {
        if (alive) setSheetTime('Status spreadsheet belum dapat dibaca');
      } finally { if (alive) setRefreshing(false); }
    };
    void load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) void load(); }, 30000);
    const onRefresh = () => { setRefreshing(true); void load(); };
    window.addEventListener('gudangai-dashboard-refresh', onRefresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('gudangai-dashboard-refresh', onRefresh); };
  }, []);
  return (
    <div className="shared-live-bar sticky top-0 z-30 mx-auto w-full max-w-lg px-3 py-2">
      <div className="shared-live-inner flex items-center justify-between gap-2 rounded-xl border px-3 py-2 shadow-sm">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-extrabold">
            <span className="shared-live-dot h-2 w-2 rounded-full shrink-0" />
            <span className="truncate">Update Sheet: {sheetTime}</span>
          </div>
          <a href="mailto:rudivirawan69@gmail.com" className="shared-live-email mt-0.5 flex items-center gap-1 text-[10px] font-semibold truncate">
            <Mail className="h-3 w-3 shrink-0" /> rudivirawan69@gmail.com
          </a>
        </div>
        <button type="button" aria-label="Segarkan status spreadsheet" onClick={() => { setRefreshing(true); window.dispatchEvent(new Event('gudangai-dashboard-refresh')); }} className="shared-live-refresh shrink-0 rounded-lg border px-2.5 py-2 text-[10px] font-bold active:scale-95">
          {refreshing ? 'Cek…' : 'Sync'}
        </button>
      </div>
    </div>
  );
}

function AppShell() {
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const onBeforeInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
  };

  const { user, loading } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [pageKey, setPageKey] = useState(0);
  const { online, hasUrl, status, message, syncing } = useConnection({ pollMs: 90000 });
  useBootstrap();

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
    case 'po': page = <POPage onNavigate={goTab} />; break;
    case 'riwayat': page = <RiwayatPage onNavigate={goTab} />; break;
    case 'settings': page = <SettingsPage onNavigate={goTab} />; break;
    case 'sync': page = <SyncQueuePage onBack={() => goTab('settings')} />; break;
    default: page = <DashboardPage onNavigate={goTab} />;
  }

  const navIndex = Math.max(0, TABS.findIndex((t) => t.id === tab));

  return (
    <div className="app-shell min-h-screen text-slate-100">
      <div className="app-bg" aria-hidden="true" />
      <ConnBanner online={online} hasUrl={hasUrl} status={status} message={message} syncing={syncing} />
      <SharedLiveBar />
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
