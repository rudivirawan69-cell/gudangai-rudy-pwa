import { useState, useEffect, Component, lazy, Suspense } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth, DEFAULT_PROFILE_PHOTO } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import LoginPage from './pages/LoginPage';
import { useConnection } from './hooks/useConnection';
import { useBootstrap } from './hooks/useBootstrap';
import {
  LayoutDashboard, Package, PackagePlus, Clock, Settings, ClipboardList,
  WifiOff, AlertTriangle, Loader2, Mail, RefreshCw,
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
  { id: 'dashboard', label: 'Beranda', icon: LayoutDashboard, chip: 'bg-cyan-500/25' },
  { id: 'stok', label: 'Stok', icon: Package, chip: 'bg-blue-500/25' },
  { id: 'input', label: 'Input', icon: PackagePlus, chip: 'bg-emerald-500/25' },
  { id: 'po', label: 'PO', icon: ClipboardList, chip: 'bg-violet-500/25' },
  { id: 'riwayat', label: 'Riwayat', icon: Clock, chip: 'bg-amber-500/25' },
  { id: 'settings', label: 'Atur', icon: Settings, chip: 'bg-slate-500/25' },
];

const TAB_ACCENT = {
  dashboard: 'from-cyan-400 to-cyan-600',
  stok: 'from-blue-400 to-blue-600',
  input: 'from-emerald-400 to-emerald-600',
  po: 'from-violet-400 to-violet-600',
  riwayat: 'from-amber-400 to-amber-600',
  settings: 'from-slate-400 to-slate-600',
};

const TAB_SUBTITLE = {
  dashboard: 'STATUS UPDATE REAL TIME',
  stok: 'MONITORING STOK RAK',
  input: 'PENERIMAAN & PENGELUARAN',
  po: 'PURCHASE ORDER SYSTEM',
  riwayat: 'LOG AUDIT TRANSAKSI',
  settings: 'PENGATURAN SYSTEM',
  sync: 'ANTRIAN SINKRONISASI',
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

function AppHeader({ user, tab, onOpenSettings, online, status, onRefreshClock, liveTime }) {
  const photo = (user?.photo && String(user.photo).length > 40) ? user.photo : DEFAULT_PROFILE_PHOTO;
  const connected = online && status !== 'offline' && status !== 'error';

  return (
    <header className="app-top-header sticky top-0 z-50 px-3 pt-2 pb-2 bg-transparent">
      <div className="app-header-card max-w-lg mx-auto rounded-2xl border px-3 py-2.5 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onOpenSettings}
            className="shrink-0 relative rounded-xl overflow-hidden ring-2 ring-cyan-500/30 active:scale-95 transition"
            aria-label="Profil — ganti foto di Atur"
            title="Ganti foto di Pengaturan"
          >
            <img
              src={photo}
              alt={user?.name || 'Profil'}
              className="w-10 h-10 object-cover block"
              onError={(e) => { e.currentTarget.src = DEFAULT_PROFILE_PHOTO; }}
            />
            <span
              className={`absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                connected ? 'bg-emerald-500' : 'bg-amber-400'
              }`}
            />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-[13px] font-black tracking-wide text-slate-900 dark:text-slate-100 uppercase truncate leading-none">
                GUDANG-69 RUDI
              </h1>
              <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                connected
                  ? 'bg-emerald-500/15 text-emerald-700'
                  : 'bg-amber-500/15 text-amber-700'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {connected ? 'Terhubung' : 'Cek koneksi'}
              </span>
            </div>
            <p className="text-[9px] font-bold text-slate-500 tracking-wide mt-0.5 truncate">
              {TAB_SUBTITLE[tab] || 'STATUS UPDATE REAL TIME'}
            </p>
            <div className="mt-1 flex flex-col gap-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate">
                  Update Sheet: <strong className="text-slate-800 dark:text-slate-100 font-bold">{liveTime}</strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <Mail className="w-3 h-3 text-cyan-700 shrink-0" aria-hidden />
                <a className="truncate hover:underline text-cyan-800 dark:text-cyan-300" href="mailto:rudivirawan69@gmail.com">
                  rudivirawan69@gmail.com
                </a>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onRefreshClock}
            className="shrink-0 w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center active:scale-95"
            aria-label="Refresh waktu"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
          </button>
        </div>
      </div>
    </header>
  );
}

function AppShell() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [liveTime, setLiveTime] = useState('—');

  const tickClock = () => {
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta',
      });
      const timeStr = now.toLocaleTimeString('id-ID', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta',
      });
      setLiveTime(`${dateStr}, ${timeStr} WIB`);
    } catch (_) {
      setLiveTime(new Date().toLocaleString('id-ID'));
    }
  };

  useEffect(() => {
    tickClock();
    const id = setInterval(tickClock, 1000);
    return () => clearInterval(id);
  }, []);

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
      <AppHeader
        user={user}
        tab={tab}
        onOpenSettings={() => goTab('settings')}
        online={online}
        status={status}
        onRefreshClock={tickClock}
        liveTime={liveTime}
      />
      {installPrompt && (
        <button type="button" onClick={installApp} className="fixed top-3 right-3 z-[60] rounded-full bg-[#0f9f9a] px-4 py-2 text-xs font-extrabold text-white shadow-lg border border-white/30">
          Pasang Aplikasi
        </button>
      )}
      <main className="page-content app-content max-w-lg mx-auto min-h-screen px-3 pb-28 pt-1">
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
                  isActive ? 'is-active' : 'is-inactive'
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
