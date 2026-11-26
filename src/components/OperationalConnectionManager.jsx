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
  healthy: 'ops-status-healthy',
  warning: 'ops-status-warning',
  error: 'ops-status-error',
  checking: 'ops-status-checking',
};

function countPendingItems() {
  return getPendingQueue().reduce((count, entry) => count + (entry.items?.length || 0), 0);
}

function StatusRow({ Icon, name, status, detail }) {
  const label = STATUS_LABELS[status] || STATUS_LABELS.checking;
  const showDetail = status !== 'healthy' && Boolean(detail);
  return (
    <li className="ops-status-card">
      <Icon className="ops-status-icon" aria-hidden="true" />
      <span className="ops-status-name">{name}</span>
      <span className={`ops-status-badge ${STATUS_CLASSES[status] || STATUS_CLASSES.checking}`}>
        {label}
      </span>
      {showDetail && <span className="ops-status-detail" role={status === 'error' ? 'alert' : 'status'}>{detail}</span>}
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
    <ul className="ops-status-grid" aria-label="Status layanan operasional">
      <StatusRow Icon={ShieldCheck} name="Supabase Auth" {...auth} />
      <StatusRow Icon={Bot} name="Agent / Cloudflare Worker" {...workerStatus} />
      <StatusRow Icon={FileSpreadsheet} name="Spreadsheet API" {...sheet} />
      <StatusRow Icon={Wifi} name="Realtime / Delta" {...realtime} />
      <StatusRow Icon={ListChecks} name="Sinkronisasi / Outbox" {...queue} />
    </ul>
  );
}
