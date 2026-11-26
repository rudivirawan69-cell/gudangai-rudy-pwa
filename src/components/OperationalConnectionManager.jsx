import React, { useEffect } from 'react';
import useSWR from 'swr';
import {
  Activity, Bot, FileSpreadsheet, ListChecks, RefreshCw, ShieldCheck, Wifi,
} from 'lucide-react';
import { getPendingQueue } from '../data/api';
import { getAgentHealth } from '../data/claude';

const STATUS_LABELS = {
  healthy: 'Terhubung',
  warning: 'Perlu perhatian',
  error: 'Tidak terhubung',
  checking: 'Memeriksa',
};

const STATUS_CLASSES = {
  healthy: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  error: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200',
  checking: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function countPendingItems() {
  return getPendingQueue().reduce((count, entry) => count + (entry.items?.length || 0), 0);
}

function StatusRow({ Icon, name, status, detail }) {
  const label = STATUS_LABELS[status] || STATUS_LABELS.checking;
  return (
    <li className="flex min-w-0 items-start gap-2.5 rounded-xl border border-[var(--border,#e2e8f0)] bg-[var(--bg-card,#fff)] p-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-muted,#f1f5f9)] text-[var(--text-main,#334155)]" aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-[var(--text-main,#0f172a)]">{name}</span>
        <span className="mt-0.5 block break-words text-[10px] leading-relaxed text-[var(--text-muted,#64748b)]">{detail}</span>
      </span>
      <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-bold ${STATUS_CLASSES[status] || STATUS_CLASSES.checking}`}>
        {label}
      </span>
    </li>
  );
}

function authStatusInfo(authStatus) {
  if (authStatus === 'authenticated') return { status: 'healthy', detail: 'Sesi Supabase aktif dan tervalidasi.' };
  if (authStatus === 'offline') return { status: 'warning', detail: 'Sesi lokal aktif sementara; validasi server menunggu koneksi.' };
  if (authStatus === 'loading') return { status: 'checking', detail: 'Memeriksa sesi operator.' };
  if (authStatus === 'legacy_local') return { status: 'warning', detail: 'Profil perangkat lama; bukan sesi Supabase.' };
  return { status: 'warning', detail: 'Sesi operator belum aktif.' };
}

function spreadsheetStatusInfo(connection = {}) {
  if (connection.status === 'connected' && connection.apiOk) {
    const checked = connection.lastCheck instanceof Date
      ? `Pemeriksaan ${connection.lastCheck.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB.`
      : 'Pemeriksaan koneksi berhasil.';
    return { status: 'healthy', detail: checked };
  }
  if (connection.status === 'demo' || !connection.hasUrl) {
    return { status: 'warning', detail: 'Endpoint spreadsheet belum diatur di Pengaturan.' };
  }
  if (connection.status === 'offline') return { status: 'warning', detail: 'Perangkat offline; antrean lokal tetap tersimpan.' };
  if (connection.status === 'error') return { status: 'error', detail: connection.message || 'Health check spreadsheet gagal.' };
  return { status: 'checking', detail: 'Menunggu hasil health check spreadsheet.' };
}

function realtimeStatusInfo(realtimeStatus = {}) {
  if (realtimeStatus.state === 'online') {
    return { status: 'healthy', detail: `Delta ${realtimeStatus.mode || 'aktif'} · ${realtimeStatus.failures || 0} kegagalan beruntun.` };
  }
  if (realtimeStatus.state === 'offline') return { status: 'warning', detail: 'Sinkronisasi baca menunggu perangkat online.' };
  if (realtimeStatus.state === 'circuit_open') return { status: 'warning', detail: `Pengaman baca terbuka · coba lagi ${realtimeStatus.retryAfterSec || 0} detik.` };
  if (realtimeStatus.state === 'error') return { status: 'error', detail: realtimeStatus.error || 'Pembaruan realtime gagal.' };
  return { status: 'checking', detail: 'Menunggu heartbeat dan delta spreadsheet.' };
}

export default function OperationalConnectionManager({
  authStatus,
  connection,
  realtimeStatus,
  onCheckSpreadsheet,
  onNavigate,
}) {
  const {
    data: agentHealth,
    error: agentError,
    isLoading: agentLoading,
    mutate: refreshAgent,
  } = useSWR('operational-agent-health', getAgentHealth, {
    refreshInterval: 45_000,
    revalidateOnFocus: true,
    dedupingInterval: 15_000,
    errorRetryInterval: 20_000,
  });
  const {
    data: pendingCount = 0,
    mutate: refreshQueue,
  } = useSWR('operational-pending-item-count', countPendingItems, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
  });

  useEffect(() => {
    const onQueueChanged = () => { void refreshQueue(); };
    window.addEventListener('gudangai-queue-changed', onQueueChanged);
    return () => window.removeEventListener('gudangai-queue-changed', onQueueChanged);
  }, [refreshQueue]);

  const auth = authStatusInfo(authStatus);
  const sheet = spreadsheetStatusInfo(connection);
  const realtime = realtimeStatusInfo(realtimeStatus);
  const workerStatus = agentLoading
    ? { status: 'checking', detail: 'Memeriksa health Worker AI.' }
    : agentError
      ? { status: 'error', detail: agentError.message || 'Health Worker AI gagal.' }
      : agentHealth?.success === true && agentHealth?.authConfigured === true
        ? {
            status: agentHealth.dataToolsConfigured ? 'healthy' : 'warning',
            detail: `${agentHealth.mode || 'Worker'} · ${agentHealth.agentStage || 'health aktif'}.`,
          }
        : { status: 'warning', detail: 'Worker aktif, tetapi konfigurasi Auth atau health belum terverifikasi.' };
  const queue = pendingCount > 0
    ? { status: 'warning', detail: `${pendingCount} item menunggu konfirmasi atau verifikasi.` }
    : { status: 'healthy', detail: 'Tidak ada item transaksi yang tertunda.' };

  const refreshAll = async () => {
    const checks = [
      Promise.resolve().then(() => refreshAgent()),
      Promise.resolve().then(() => refreshQueue()),
    ];
    if (onCheckSpreadsheet) checks.push(Promise.resolve().then(() => onCheckSpreadsheet({ quiet: false })));
    await Promise.allSettled(checks);
  };

  return (
    <section className="dashboard-panel min-w-0 rounded-2xl border border-[var(--border,#e2e8f0)] bg-[var(--bg-card,#fff)] p-4 shadow-sm" aria-labelledby="operational-connection-title">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-muted,#64748b)]">Operational Connection Manager</p>
          <h2 id="operational-connection-title" className="mt-1 text-sm font-extrabold text-[var(--text-main,#0f172a)]">Status sistem operasional</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted,#64748b)]">Status nyata dari sesi, Worker, spreadsheet, realtime, dan antrean perangkat.</p>
        </div>
        <button type="button" onClick={refreshAll} disabled={agentLoading}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border,#e2e8f0)] text-[var(--text-main,#334155)] disabled:opacity-50"
          aria-label="Periksa ulang koneksi operasional" title="Periksa ulang">
          <RefreshCw className={`h-4 w-4 ${agentLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </header>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Status layanan">
        <StatusRow Icon={ShieldCheck} name="Supabase Auth" {...auth} />
        <StatusRow Icon={Bot} name="Agent / Cloudflare Worker" {...workerStatus} />
        <StatusRow Icon={FileSpreadsheet} name="Spreadsheet API" {...sheet} />
        <StatusRow Icon={Wifi} name="Realtime / Delta" {...realtime} />
        <StatusRow Icon={ListChecks} name="Sinkronisasi / Outbox" {...queue} />
      </ul>

      {pendingCount > 0 && (
        <button type="button" onClick={() => onNavigate?.('sync')}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Tinjau antrean ({pendingCount}) <Activity className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
