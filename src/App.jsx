import { useState, useEffect, useRef, Component, lazy, Suspense } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth, DEFAULT_PROFILE_PHOTO } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import LoginPage from './pages/LoginPage';
import { useConnection } from './hooks/useConnection';
import { useSheetUpdate } from './hooks/useSheetUpdate';
import { useBootstrap } from './hooks/useBootstrap';
import { startRealtimeSync, syncNow } from './data/realTimeSync';
import { getPendingQueue } from './data/api';
import {
  LayoutDashboard, Package, PackagePlus, Clock, Settings, ClipboardList,
  WifiOff, AlertTriangle, Loader2, RefreshCw, BrainCircuit, MoreHorizontal, X,
} from 'lucide-react';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const StokPage = lazy(() => import('./pages/StokPage'));
const InputPage = lazy(() => import('./pages/InputPage'));
const POPage = lazy(() => import('./pages/POPage'));
const RiwayatPage = lazy(() => import('./pages/RiwayatPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SyncQueuePage = lazy(() => import('./pages/SyncQueuePage'));
const AIAssistantPage = lazy(() => import('./pages/AIAssistantPage'));

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
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-sm w-full rounded-2xl border border-[var(--border,#e2e8f0)] bg-[var(--bg-elevated,#fff)] p-5 space-y-3 shadow-sm">
            <p className="font-bold text-[var(--text-main,#0f172a)]">Halaman gagal dimuat</p>
            <p className="text-xs text-[var(--text-muted,#475569)] break-words">{this.state.message}</p>
            <button type="button" onClick={() => window.location.reload()} className="w-full py-2.5 rounded-xl bg-[#0e7490] text-white text-sm font-semibold">Muat ulang</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const MAIN_TABS = [
  { id: 'dashboard', label: 'Beranda', icon: LayoutDashboard, chip: 'bg-cyan-500/25' },
  { id: 'stok', label: 'Stok', icon: Package, chip: 'bg-blue-500/25' },
  { id: 'input', label: 'Input', icon: PackagePlus, chip: 'bg-emerald-500/25', fab: true },
  { id: 'ai', label: 'Agent', icon: BrainCircuit, chip: 'bg-orange-500/25' },
  { id: 'more', label: 'Lainnya', icon: MoreHorizontal, chip: 'bg-slate-500/25' },
];

const MORE_TABS = [
  { id: 'riwayat', label: 'Riwayat', icon: Clock, chip: 'bg-amber-500/25' },
  { id: 'sync', label: 'Antrian Sinkronisasi', icon: RefreshCw, chip: 'bg-teal-500/25' },
  { id: 'settings', label: 'Pengaturan', icon: Settings, chip: 'bg-slate-500/25' },
];

const MORE_IDS = new Set([...MORE_TABS.map((t) => t.id), 'po']);

const TAB_ACCENT = {
  dashboard: 'from-cyan-400 to-cyan-600',
  stok: 'from-blue-400 to-blue-600',
  input: 'from-emerald-400 to-emerald-600',
  ai: 'from-orange-400 to-amber-600',
  po: 'from-violet-400 to-violet-600',
  riwayat: 'from-amber-400 to-amber-600',
  settings: 'from-slate-400 to-slate-600',
};

const TAB_SUBTITLE = {
  dashboard: 'STATUS UPDATE REAL TIME',
  stok: 'MONITORING STOK RAK',
  input: 'PENERIMAAN & PENGELUARAN',
  po: 'PURCHASE ORDER SYSTEM',
  ai: 'AGENT RUBEE INTELLIGENCE · WORKER AI',
  riwayat: 'LOG AUDIT TRANSAKSI',
  settings: 'PENGATURAN SYSTEM',
  sync: 'ANTRIAN SINKRONISASI',
};

function ConnBanner({ online, hasUrl, status, message, syncing }) {
  if (!hasUrl) return null;
  if (syncing || status === 'syncing') {
    return (
      <div className="px-3 py-1.5 bg-cyan-700 text-white text-[11px] font-semibold flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Menyinkronkan...
      </div>
    );
  }
  if (!online || status === 'offline') {
    return (
      <div className="px-3 py-1.5 bg-amber-600 text-white text-[11px] font-semibold flex items-center gap-2">
        <WifiOff className="w-3.5 h-3.5" /> Offline — data antrian aman di perangkat
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="px-3 py-1.5 bg-rose-700 text-white text-[11px] font-semibold flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5" /> {message || 'Backend tidak merespons'}
      </div>
    );
  }
  return null;
}

function MoreSheet({ open, onClose, onNavigate, activeId, pendingCount }) {
  if (!open) return null;
  return (
    <div className="more-sheet-backdrop" onClick={onClose}>
      <div className="more-sheet" role="dialog" aria-label="Menu lainnya" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        {MORE_TABS.map((t) => {
          const Icon = t.icon;
          const isActive = activeId === t.id;
          return (
            <button key={t.id} type="button" onClick={() => { onNavigate(t.id); onClose(); }} className={`more-row${isActive ? ' is-active' : ''}`}>
              <span className={`more-row-icon ${t.chip}`}><Icon className="w-5 h-5" strokeWidth={2.25} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[var(--text-main,#0f172a)]">{t.label}</span>
                <span className="block text-[11px] text-[var(--text-muted,#475569)]">{TAB_SUBTITLE[t.id]}</span>
              </span>
              {t.id === 'sync' && pendingCount > 0 && <span className="more-row-badge">{pendingCount}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatSheetLabel(label, now) {
  if (!label) return 'Belum ada data dari spreadsheet';
  const m = String(label).match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return label;
  const [h, min] = [Number(m[1]), Number(m[2])];
  const labelMin = h * 60 + min;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const diff = nowMin - labelMin;
  if (diff < 0) return `Hari ini ${m[1]}:${m[2]}`;
  if (diff === 0) return 'Baru saja diperbarui';
  if (diff < 60) return `${diff} mnt lalu`;
  return `${Math.floor(diff / 60)} j ${diff % 60} mnt lalu`;
}

function AppHeader({ user, tab, onOpenSettings, online, status, sheetLabel, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const photo = (user?.photo && String(user.photo).length > 40) ? user.photo : DEFAULT_PROFILE_PHOTO;
  const connected = online && status !== 'offline' && status !== 'error';

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await onRefresh?.(); } finally { setRefreshing(false); }
  };

  return (
    <header className="app-top-header sticky top-0 z-50 px-0 pt-0 pb-2 bg-transparent">
      <div className="app-header-card w-full max-w-none mx-0 rounded-none border px-3 py-2 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <button type="button" onClick={onOpenSettings} className="shrink-0 relative rounded-xl overflow-hidden ring-2 ring-cyan-500/30 active:scale-95 transition" aria-label="Profil — ganti foto di Atur" title="Ganti foto di Pengaturan">
            <img src={photo} alt={user?.name || 'Profil'} className="w-10 h-10 object-cover block" onError={(e) => { e.currentTarget.src = DEFAULT_PROFILE_PHOTO; }} />
            <span className={`absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--bg-elevated,#fff)] ${connected ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-[13px] font-black tracking-wide text-[var(--text-main,#0f172a)] uppercase truncate leading-none">GUDANG-69 RUDI</h1>
              <span aria-live="polite" className={`shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${connected ? 'bg-emerald-500/15 text-[color-mix(in_srgb,#047857_62%,var(--text-main,#0f172a))]' : 'bg-amber-500/15 text-[color-mix(in_srgb,#b45309_62%,var(--text-main,#0f172a))]'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {connected ? 'Terhubung' : 'Cek koneksi'}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 min-w-0 text-[10px] font-medium text-[var(--text-muted,#475569)]">
              <span className="truncate font-bold">{TAB_SUBTITLE[tab] || 'STATUS UPDATE REAL TIME'}</span>
              <span aria-hidden="true" className="opacity-40">·</span>
              <span className="flex items-center gap-1 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sheetLabel ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                <span className="truncate" title={sheetLabel || undefined}>Update: <strong className="text-[var(--text-main,#0f172a)] font-bold">{formatSheetLabel(sheetLabel, now)}</strong></span>
              </span>
            </div>
          </div>
          <button type="button" onClick={handleRefresh} disabled={refreshing} className="shrink-0 w-10 h-10 rounded-xl bg-[var(--bg-muted,#f8fafc)] border border-[var(--border,#e2e8f0)] flex items-center justify-center active:scale-95 disabled:opacity-60" aria-label="Cek koneksi ke spreadsheet" title="Cek koneksi">
            <RefreshCw className={`w-3.5 h-3.5 text-[var(--text-muted,#475569)] ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
}

function InstallBanner({ installPrompt, onInstall, onDismiss }) {
  if (!installPrompt) return null;
  return (
    <div className="mx-3 mt-2 rounded-xl border border-cyan-600/30 bg-cyan-600/10 px-3 py-2 flex items-center gap-2">
      <p className="flex-1 min-w-0 text-[11px] font-semibold text-[var(--text-main,#0f172a)] truncate">Pasang GudangAI di perangkat ini untuk akses lebih cepat</p>
      <button type="button" onClick={onInstall} className="shrink-0 rounded-lg bg-[#0f9f9a] px-3 py-1.5 text-[11px] font-extrabold text-white active:scale-95">Pasang</button>
      <button type="button" onClick={onDismiss} aria-label="Tutup banner pasang aplikasi" className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted,#475569)] active:scale-95"><X className="w-4 h-4" /></button>
    </div>
  );
}

function DeltaToast() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    let timer;
    const onRefresh = (e) => {
      const { items, mode } = e.detail || {};
      if (mode !== 'DELTA' || !items?.length) return;
      const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      setToast(`${items.length} stok diperbarui · ${time}`);
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), 4000);
    };
    window.addEventListener('gudangai-stock-refresh', onRefresh);
    return () => { window.removeEventListener('gudangai-stock-refresh', onRefresh); clearTimeout(timer); };
  }, []);
  if (!toast) return null;
  return (
    <div role="status" className="delta-toast">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
      {toast}
    </div>
  );
}

function AppShell() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installDismissed, setInstallDismissed] = useState(() => localStorage.getItem('gudangai_install_dismissed') === '1');
  const [pendingCount, setPendingCount] = useState(() => getPendingQueue().length);

  useEffect(() => {
    if (installDismissed) return;
    const onBeforeInstall = (event) => { event.preventDefault(); setInstallPrompt(event); };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [installDismissed]);

  const installApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
  };

  const dismissInstall = () => {
    localStorage.setItem('gudangai_install_dismissed', '1');
    setInstallDismissed(true);
    setInstallPrompt(null);
  };

  const { user, loading } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [pageKey, setPageKey] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const tabRef = useRef('dashboard');
  const { online, hasUrl, status, message, syncing, checkHealth } = useConnection({ pollMs: 90000 });
  const sheetLabel = useSheetUpdate();
  useBootstrap();

  useEffect(() => {
    const onQueue = () => setPendingCount(getPendingQueue().length);
    window.addEventListener('gudangai-queue-changed', onQueue);
    return () => window.removeEventListener('gudangai-queue-changed', onQueue);
  }, []);

  useEffect(() => {
    const stop = startRealtimeSync({
      onStockUpdate: (items, meta) => {
        window.dispatchEvent(new CustomEvent('gudangai-stock-refresh', {
          detail: { items, mode: meta?.mode || 'DELTA', meta },
        }));
      },
      onStatus: (s) => {
        if (s?.state === 'error' || s?.state === 'circuit_open') console.warn('[realTimeSync]', s);
      },
    });
    window.__gudangai_syncNow = syncNow;
    return () => { stop(); delete window.__gudangai_syncNow; };
  }, []);

  const goTab = (id) => {
    if (tabRef.current === id) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    tabRef.current = id;
    setTab(id);
    setPageKey((k) => k + 1);
  };

  useEffect(() => {
    const onNav = (e) => { const id = e?.detail?.tab; if (id) goTab(id); };
    window.addEventListener('gudangai-navigate', onNav);
    return () => window.removeEventListener('gudangai-navigate', onNav);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-muted,#eef3f8)]">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
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
    case 'ai': page = <AIAssistantPage onNavigate={goTab} />; break;
    case 'riwayat': page = <RiwayatPage onNavigate={goTab} />; break;
    case 'settings': page = <SettingsPage onNavigate={goTab} />; break;
    case 'sync': page = <SyncQueuePage onBack={() => goTab('settings')} />; break;
    default: page = <DashboardPage onNavigate={goTab} />;
  }

  const navTab = MORE_IDS.has(tab) ? 'more' : tab;
  const navIndex = Math.max(0, MAIN_TABS.findIndex((t) => t.id === navTab));

  return (
    <div className="app-shell min-h-screen text-[var(--text-main,#10232b)]">
      <div className="app-bg" aria-hidden="true" />
      <ConnBanner online={online} hasUrl={hasUrl} status={status} message={message} syncing={syncing} />
      <AppHeader user={user} tab={tab} onOpenSettings={() => goTab('settings')} online={online} status={status} sheetLabel={sheetLabel} onRefresh={() => checkHealth({ quiet: false })} />
      <InstallBanner installPrompt={installPrompt} onInstall={installApp} onDismiss={dismissInstall} />
      <main className="page-content app-content w-full max-w-none mx-0 min-h-0 px-3 pb-32 pt-1">
        <div key={pageKey} className="animate-page-in">
          <ErrorBoundary>
            <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-cyan-500 animate-spin" /></div>}>
              {page}
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      <nav className="nav-bar fixed bottom-0 left-0 right-0 safe-bottom z-40" aria-label="Navigasi utama">
        <div className="w-full max-w-none mx-0 flex relative items-end" style={{ '--nav-index': navIndex, '--nav-count': MAIN_TABS.length }}>
          {MAIN_TABS.map((t) => {
            const Icon = t.icon;
            const isActive = navTab === t.id;
            if (t.fab) {
              return (
                <button key={t.id} type="button" onClick={() => goTab(t.id)} aria-current={isActive ? 'page' : undefined} aria-label="Input barang masuk atau keluar" className="nav-fab flex-1 flex flex-col items-center relative min-w-0">
                  <span className={`nav-fab-btn ${isActive ? 'is-active' : ''}`}><Icon className="w-6 h-6" strokeWidth={2.4} /></span>
                  <span className={`nav-label text-[9px] sm:text-[10px] mt-1 truncate max-w-full px-0.5 ${isActive ? 'font-bold opacity-100' : 'font-semibold opacity-80'}`}>{t.label}</span>
                </button>
              );
            }
            const onClick = t.id === 'more' ? () => setMoreOpen(true) : () => goTab(t.id);
            return (
              <button key={t.id} type="button" onClick={onClick} aria-current={isActive ? 'page' : undefined} aria-haspopup={t.id === 'more' ? 'dialog' : undefined} aria-expanded={t.id === 'more' ? moreOpen : undefined} className={`nav-btn flex-1 flex flex-col items-center pt-2 pb-2 relative min-w-0 ${isActive ? 'is-active' : 'is-inactive'}`}>
                <div className={`nav-icon-wrap p-1 rounded-xl ${isActive ? t.chip : ''}`}><Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.5 : 2.15} /></div>
                <span className={`nav-label text-[9px] sm:text-[10px] mt-0.5 truncate max-w-full px-0.5 ${isActive ? 'font-bold opacity-100' : 'font-semibold opacity-80'}`}>{t.label}</span>
                {t.id === 'more' && pendingCount > 0 && <span className="nav-badge" aria-label={`${pendingCount} item antrian sinkronisasi`}>{pendingCount > 99 ? '99+' : pendingCount}</span>}
                {isActive && t.id !== 'more' && <span className={`nav-underline absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-[3px] rounded-full bg-gradient-to-r ${TAB_ACCENT[t.id] || 'from-slate-400 to-slate-600'}`} />}
              </button>
            );
          })}
        </div>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} onNavigate={goTab} activeId={tab} pendingCount={pendingCount} />
      <DeltaToast />
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
