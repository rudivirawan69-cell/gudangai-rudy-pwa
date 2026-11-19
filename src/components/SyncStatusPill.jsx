import { CheckCircle2, AlertCircle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';

const STATUS = {
  idle: { label: 'Menunggu sinkronisasi', className: 'text-slate-600 bg-slate-100' },
  loading: { label: 'Membaca data…', className: 'text-cyan-800 bg-cyan-50' },
  success: { label: 'Data tersinkron', className: 'text-emerald-800 bg-emerald-50' },
  partial: { label: 'Data sebagian', className: 'text-amber-800 bg-amber-50' },
  error: { label: 'Sinkronisasi gagal', className: 'text-rose-800 bg-rose-50' },
  unauthorized: { label: 'Login diperlukan', className: 'text-amber-800 bg-amber-50' },
};

export default function SyncStatusPill({ status = 'idle', summary, error, onRefresh }) {
  const current = STATUS[status] || STATUS.idle;
  const Icon = status === 'loading' ? Loader2
    : status === 'success' ? CheckCircle2
      : status === 'partial' || status === 'error' || status === 'unauthorized' ? AlertCircle
        : ShieldCheck;

  return (
    <div className="flex min-w-0 items-center gap-2" aria-live="polite">
      <span className={"inline-flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold " + current.className}>
        <Icon className={"h-3.5 w-3.5 shrink-0 " + (status === 'loading' ? 'animate-spin' : '')} />
        <span className="truncate">{current.label}</span>
        {summary && status !== 'loading' && <span className="tabular-nums opacity-75">{summary.successfulActions}/{summary.totalActions}</span>}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={status === 'loading'}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border,#e2e8f0)] bg-[var(--bg-muted,#f8fafc)] text-[var(--text-muted,#475569)] disabled:opacity-50"
        aria-label="Perbarui data sinkronisasi"
        title={error || 'Perbarui data read-only'}
      >
        <RefreshCw className={"h-3.5 w-3.5 " + (status === 'loading' ? 'animate-spin' : '')} />
      </button>
    </div>
  );
}
