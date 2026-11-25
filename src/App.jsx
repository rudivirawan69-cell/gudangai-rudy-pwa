import { useState, useEffect, useRef, Component, lazy, Suspense } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth, DEFAULT_PROFILE_PHOTO } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import LoginPage from './pages/LoginPage';
import { useConnection } from './hooks/useConnection';
import { useSheetUpdate } from './hooks/useSheetUpdate';
import { formatSpreadsheetTimestamp } from './utils/sheetTimestamp';
import { useBootstrap } from './hooks/useBootstrap';
import { startRealtimeSync, syncNow } from './data/realTimeSync';
import { getPendingQueue, getDashboardData } from './data/api';
import {
  LayoutDashboard, Package, PackagePlus, Clock, Settings, ClipboardList,
  AlertTriangle, Loader2, RefreshCw, BrainCircuit, MoreHorizontal, X,
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
  { id: 'po', label: 'PO', icon: ClipboardList, chip: 'bg-violet-500/25' },
  { id: 'more', label: 'Lainnya', icon: MoreHorizontal, chip: 'bg-slate-500/25' },
];

const MORE_TABS = [
  { id: 'ai', label: 'Agent Rubee AI', icon: BrainCircuit, chip: 'bg-orange-500/25' },
  { id: 'riwayat', label: 'Riwayat Transaksi', icon: Clock, chip: 'bg-amber-500/25' },
  { id: 'sync', label: 'Antrean Sinkronisasi', icon: RefreshCw, chip: 'bg-teal-500/25' },
  { id: 'settings', label: 'Pengaturan', icon: Settings, chip: 'bg-slate-500/25' },
];

const MORE_IDS = new Set(MORE_TABS.map((t) => t.id));

function ConnBanner({ hasUrl, status, message }) {
  if (!hasUrl || status !== 'error') return null;
  return (
    <div className="px-3 py-1.5 bg-rose-700 text-white text-[11px] font-semibold flex items-center gap-2">
      <AlertTriangle className="w-3.5 h-3.5" /> {message || 'Backend tidak merespons'}
    </div>
  );
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
              </span>
              {t.id === 'sync' && pendingCount > 0 && <span className="more-row-badge">{pendingCount}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
