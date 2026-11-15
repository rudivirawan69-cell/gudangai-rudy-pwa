import { useState, useEffect, useRef, Component, lazy, Suspense } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import {
  LayoutDashboard, Package, History, ClipboardList, Settings,
  RefreshCw, WifiOff, CheckCircle2, AlertTriangle, X, Plus,
} from 'lucide-react';
import { ThemeProvider } from './theme/ThemeContext';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { getConnectionStatus, syncNow, getPendingCount, formatSpreadsheetTimestamp } from './data/api';
import { DEFAULT_PROFILE_PHOTO } from './data/defaultPhoto';
import './index.css';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const StokPage = lazy(() => import('./pages/StokPage'));
const InputPage = lazy(() => import('./pages/InputPage'));
const RiwayatPage = lazy(() => import('./pages/RiwayatPage'));
const POPage = lazy(() => import('./pages/POPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SyncQueuePage = lazy(() => import('./pages/SyncQueuePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AIAssistantPage = lazy(() => import('./pages/AIAssistantPage'));
const ValidasiPage = lazy(() => import('./pages/ValidasiPage'));

const TABS = [
  { id: 'dashboard', label: 'Beranda', icon: LayoutDashboard, chip: 'bg-cyan-500/25' },
  { id: 'stok', label: 'Stok', icon: Package, chip: 'bg-emerald-500/25' },
  { id: 'riwayat', label: 'Riwayat', icon: History, chip: 'bg-amber-500/25' },
  { id: 'po', label: 'PO', icon: ClipboardList, chip: 'bg-violet-500/25' },
  { id: 'atur', label: 'Atur', icon: Settings, chip: 'bg-slate-500/25' },
];

const TAB_SUBTITLE = {
  dashboard: 'STATUS UPDATE REAL TIME',
  stok: 'MONITORING PERSEDIAAN',
  riwayat: 'LOG AUDIT TRANSAKSI',
  po: 'RENCANA PEMBELIAN',
  atur: 'PENGATURAN APLIKASI',
  input: 'CATAT TRANSAKSI',
  sync: 'ANTRIAN SINKRONISASI',
  ai: 'ASISTEN GUDANG',
  validasi: 'VALIDASI DATA',
};

function ErrorBoundary({ children }) {
  return <ErrorBoundaryInner>{children}</ErrorBoundaryInner>;
}
class ErrorBoundaryInner extends Component {
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
        <div className="p-6 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <p className="text-sm font-semibold text-[var(--text-main)]">Halaman gagal dimuat</p>
          <p className="text-xs text-[var(--text-muted)]">{this.state.message}</p>
          <button type="button" className="text-sm font-bold text-cyan-600" onClick={() => this.setState({ hasError: false, message: '' })}>
            Coba lagi
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppHeader({ user, tab, onOpenSettings, online, status, sheetLabel, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);
  const photo = (user?.photo && String(user.photo).length > 40) ? user.photo : DEFAULT_PROFILE_PHOTO;
  const connected = online && status !== 'offline' && status !== 'error';

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
            <h1 className="text-[13px] font-black tracking-wide text-[var(--text-main,#0f172a)] uppercase truncate leading-tight">
              GUDANG-69 RUDI
            </h1>
            <p
              className="mt-0.5 text-[10px] font-semibold text-[var(--text-muted,#475569)] truncate leading-tight"
              title={sheetLabel || undefined}
              aria-live="polite"
            >
              {sheetLabel
                ? `Update ${formatSpreadsheetTimestamp(sheetLabel)}`
                : connected
                  ? 'Update — menunggu data spreadsheet'
                  : 'Update — belum terhubung'}
            </p>
          </div>
          <button type="button" onClick={handleRefresh} disabled={refreshing} className="shrink-0 w-10 h-10 rounded-xl bg-[var(--bg-muted,#f8fafc)] border border-[var(--border,#e2e8f0)] flex items-center justify-center active:scale-95 disabled:opacity-60" aria-label="Cek koneksi ke spreadsheet" title="Cek koneksi">
            <RefreshCw className={`w-3.5 h-3.5 text-[var(--text-muted,#475569)] ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
