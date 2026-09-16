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

/** Nav unified with the cyan/teal cold-storage theme. */
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
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onConn = (e) => {
      const d = e.detail || {};
      if (d.state === 'write_unknown') {
        setFlash('Menunggu respons server…');
        setTimeout(() => setFlash(''), 4000);
        return;
      }
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

  const dateLabel = now.toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
  const timeLabel = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const boxBase =
    'mx-3.5 mt-2.5 mb-0 rounded-xl border backdrop-blur-md px-3 py-2 flex items-center justify-between gap-2 text-[11px] font-medium shadow-sm transition-colors duration-300';

  let statusContent;
  let boxTone;

  if (!hasUrl) {
    boxTone = 'bg-amber-500/20 border-amber-300/40 text-amber-50';
    statusContent = (
      <>
        <WifiOff className="w-3.5 h-3.5 shrink-0" />
        <span className="font-semibold">Mode Demo</span>
        <span className="opacity-80">· Atur URL API</span>
      </>
    );
  } else if (!online || status === 'offline') {
    boxTone = 'bg-red-500/25 border-red-300/40 text-red-50';
    statusContent = (
      <>
        <WifiOff className="w-3.5 h-3.5 shrink-0" />
        <span className="font-semibold">Offline</span>
        <span className="opacity-80">· Antrian lokal</span>
      </>
    );
  } else if (syncing) {
    boxTone = 'bg-cyan-500/20 border-cyan-300/40 text-cyan-50';
    statusContent = (
      <>
        <Wifi className="w-3.5 h-3.5 shrink-0 animate-pulse" />
        <span className="font-semibold">Menyinkronkan…</span>
      </>
    );
  } else if (flash) {
    const isErr = flash.length > 20 || /gagal|error|fail/i.test(flash);
    const isWait = /Menunggu respons/i.test(flash);
    boxTone = isWait
      ? 'bg-slate-500/25 border-slate-300/40 text-slate-50'
      : isErr
        ? 'bg-amber-500/25 border-amber-300/40 text-amber-50'
        : 'bg-emerald-500/25 border-emerald-300/40 text-emerald-50';
    statusContent = (
      <>
        <Wifi className="w-3.5 h-3.5 shrink-0" />
        <span className="font-semibold truncate">{flash}</span>
      </>
    );
  } else {
    boxTone = 'bg-cyan-500/15 border-cyan-300/35 text-cyan-50';
    statusContent = (
      <>
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-soft-pulse shrink-0" />
        <span className="font-semibold">Terhubung</span>
      </>
    );
  }

  return (
    <div className={`${boxBase} ${boxTone}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        {statusContent}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 tabular-nums text-[10px]">
        <span className="font-medium opacity-95">{dateLabel}</span>
        <span className="opacity-40">·</span>
        <span className="font-bold">{timeLabel}</span>
      </div>
    </div>
  );
}

function AppShell() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pageKey, setPageKey] = useState(0);
  const [showSyncQueue, setShowSyncQueue] = useState(false);

  const goTab = (id, push = true) => {
    if (id === activeTab && !showSyncQueue) return;
    setShowSyncQueue(false);
    setActiveTab(id);
    setPageKey((k) => k + 1);
    if (push && typeof history !== 'undefined') {
      try {
        history.pushState({ tab: id }, '', `#${id}`);
      } catch (_) {}
    }
  };

  useEffect(() => {
    const onPop = (e) => {
      const state = e.state;
      if (state && state.sync) {
        setShowSyncQueue(true);
        return;
      }
      if (state && state.tab) {
        setShowSyncQueue(false);
        setActiveTab(state.tab);
        setPageKey((k) => k + 1);
        return;
      }
      setShowSyncQueue(false);
      setActiveTab('dashboard');
      setPageKey((k) => k + 1);
      try {
        if (typeof history !== 'undefined') {
          history.pushState({ tab: 'dashboard' }, '', '#dashboard');
        }
      } catch (_) {}
    };
    window.addEventListener('popstate', onPop);
    try {
      if (typeof history !== 'undefined' && !history.state?.tab) {
        history.replaceState({ tab: activeTab }, '', `#${activeTab}`);
      }
    } catch (_) {}
    return () => window.removeEventListener('popstate', onPop);
  }, [activeTab]);

  if (!user) {
    return <LoginPage />;
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
                onBack={() => {
                  setShowSyncQueue(false);
                  try {
                    history.pushState({ tab: activeTab }, '', `#${activeTab}`);
                  } catch (_) {}
                }}
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
            onOpenSyncQueue={() => {
              setShowSyncQueue(true);
              try {
                history.pushState({ tab: activeTab, sync: true }, '', '#sync');
              } catch (_) {}
            }}
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
          <div className="max-w-lg mx-auto flex gap-1 px-1.5 py-1.5">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => goTab(tab.id)}
                  className={`nav-btn flex-1 flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl border transition-all duration-250 relative
                    ${isActive
                      ? 'bg-gradient-to-br from-cyan-50 to-teal-50 border-cyan-300 text-cyan-800 shadow-sm scale-[1.02]'
                      : 'bg-white/60 border-transparent text-slate-400 hover:bg-white/80 hover:border-slate-200'
                    }`}
                >
                  <div
                    className={`p-1 rounded-lg transition-colors duration-250 ${
                      isActive ? 'text-cyan-700' : 'text-slate-400'
                    } ${isActive ? 'animate-nav-pop' : ''}`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.5]'}`} />
                  </div>
                  <span
                    className={`text-[10px] mt-0.5 tracking-wide transition-all duration-250 ${
                      isActive ? 'font-extrabold text-cyan-800' : 'font-semibold text-slate-500'
                    }`}
                  >
                    {tab.label}
                  </span>
                  {isActive && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-gradient-to-r from-cyan-400 to-teal-500" />
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
