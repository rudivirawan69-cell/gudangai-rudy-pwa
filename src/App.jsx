import { useState, useEffect, Component, lazy, Suspense } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import { useConnection } from './hooks/useConnection';
import {
  LayoutDashboard, Package, PackagePlus, FileText, MoreHorizontal,
  Clock, Settings, RefreshCw, WifiOff, AlertTriangle, Loader2, Bell,
  ChevronRight,
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
            <button type="button" onClick={() => window.location.reload()} className="w-full py-2.5 rounded-xl bg-teal-700 text-white text-sm font-semibold">Muat ulang</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const MAIN_TABS = [
  { id: 'dashboard', label: 'Beranda', icon: LayoutDashboard },
  { id: 'stok', label: 'Stok', icon: Package },
  { id: 'input', label: 'Input', icon: PackagePlus, fab: true },
  { id: 'po', label: 'PO', icon: FileText },
  { id: 'more', label: 'Lainnya', icon: MoreHorizontal },
];

const PAGE_TITLES = {
  dashboard: ['Beranda', 'Kontrol gudang pusat'],
  stok: ['Stok', 'CV & PT'],
  input: ['Input Transaksi', 'Catat pergerakan barang'],
  po: ['Purchase Order', 'Pantau pesanan minggu berjalan'],
  riwayat: ['Riwayat', 'Aktivitas transaksi'],
  settings: ['Atur', 'Pengaturan aplikasi'],
  sync: ['Sinkronisasi', 'Keranjang transaksi tertunda'],
};

function ConnBanner({ online, hasUrl, status, message, syncing }) {
  if (!hasUrl) return null;
  if (syncing || status === 'syncing') {
    return <div className="conn-strip conn-strip-sync"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Menyinkronkan data…</div>;
  }
  if (!online || status === 'offline') {
    return <div className="conn-strip conn-strip-warn"><WifiOff className="w-3.5 h-3.5" /> Offline — antrian tetap aman di perangkat</div>;
  }
  if (status === 'error') {
    return <div className="conn-strip conn-strip-error"><AlertTriangle className="w-3.5 h-3.5" /> {message || 'Backend tidak merespons'}</div>;
  }
  return null;
}

function AppHeader({ tab, user, onMore }) {
  const [title, subtitle] = PAGE_TITLES[tab] || PAGE_TITLES.dashboard;
  const avatar = user?.avatar || '/assets/avatar-rudi.jpg';
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-brand-mark" aria-hidden="true"><img src="/icons/icon-96x96.png" alt="GudangAI RUDY" /></div>
        <div className="app-header-copy">
          <div className="app-header-kicker">GUDANGAI</div>
          <div className="app-header-title">{title}</div>
          <div className="app-header-subtitle">{subtitle}</div>
        </div>
        <div className="app-header-actions">
          <button type="button" className="header-icon-btn" aria-label="Menu" onClick={onMore}>
            <Bell className="w-[18px] h-[18px]" />
          </button>
          <img className="header-avatar" src={avatar} alt="" onError={(e) => { e.currentTarget.src = '/assets/avatar-rudi.jpg'; }} />
        </div>
      </div>
      <div className="header-accent" aria-hidden="true" />
    </header>
  );
}

function MoreSheet({ open, tab, onNavigate, onClose }) {
  if (!open) return null;
  const rows = [
    { id: 'riwayat', label: 'Riwayat Transaksi', icon: Clock, desc: 'Lihat seluruh aktivitas' },
    { id: 'sync', label: 'Sinkronisasi', icon: RefreshCw, desc: 'Review dan kirim antrian' },
    { id: 'settings', label: 'Atur', icon: Settings, desc: 'Koneksi, akun dan sistem' },
  ];
  return (
    <div className="more-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="more-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-base font-extrabold text-slate-900">Menu GudangAI</p>
            <p className="text-[11px] text-slate-500">Fungsi lengkap tetap tersedia</p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600">×</button>
        </div>
        <div className="space-y-2">
          {rows.map((row) => {
            const Icon = row.icon;
            const active = tab === row.id;
            return (
              <button key={row.id} type="button" className={`more-row ${active ? 'is-active' : ''}`}
                onClick={() => { onNavigate(row.id); onClose(); }}>
                <span className="more-row-icon"><Icon className="w-5 h-5" /></span>
                <span className="flex-1 text-left">
                  <span className="block text-sm font-bold text-slate-900">{row.label}</span>
                  <span className="block text-[11px] text-slate-500">{row.desc}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AppShell() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [pageKey, setPageKey] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const { online, hasUrl, status, message, syncing } = useConnection({ pollMs: 90000 });

  const goTab = (id) => {
    if (id === 'more') {
      setMoreOpen(true);
      return;
    }
    setTab(id);
    setMoreOpen(false);
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
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 text-teal-600 animate-spin" /></div>;
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
    <div className="min-h-screen text-slate-900 relative overflow-x-hidden">
      <div className="app-bg" aria-hidden="true" />
      <div className="app-shell relative z-10">
        <AppHeader tab={tab} user={user} onMore={() => setMoreOpen(true)} />
        <ConnBanner online={online} hasUrl={hasUrl} status={status} message={message} syncing={syncing} />
        <main className="app-content max-w-lg mx-auto min-h-screen pb-28 px-3 overflow-x-hidden w-full">
          <div key={pageKey} className="animate-page-in">
            <ErrorBoundary>
              <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-teal-600 animate-spin" /></div>}>
                {page}
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>

        <nav className="nav-bar fixed bottom-0 left-0 right-0 safe-bottom z-40" aria-label="Navigasi utama">
          <div className="max-w-lg mx-auto flex items-end px-1.5">
            {MAIN_TABS.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.id || (t.id === 'more' && ['riwayat', 'settings', 'sync'].includes(tab));
              return (
                <button key={t.id} type="button" onClick={() => goTab(t.id)}
                  className={`nav-btn ${t.fab ? 'nav-fab-item' : ''} flex-1 flex flex-col items-center relative ${isActive ? 'is-active' : ''}`}>
                  <span className={`nav-icon-wrap ${t.fab ? 'nav-fab' : ''}`}><Icon className={t.fab ? 'w-6 h-6' : 'w-[18px] h-[18px]'} /></span>
                  <span className="nav-label">{t.label}</span>
                  {isActive && !t.fab && <span className="nav-active-dot" />}
                </button>
              );
            })}
          </div>
        </nav>

        <MoreSheet open={moreOpen} tab={tab} onNavigate={goTab} onClose={() => setMoreOpen(false)} />
        <SpeedInsights />
      </div>
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
