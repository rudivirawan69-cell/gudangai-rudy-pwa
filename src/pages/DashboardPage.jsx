import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import { getPendingQueue, getStatusPO, getDashboardData, getLocalHistory } from '../data/api';
import OpsCategoryCards from '../components/OpsCategoryCards';
import { RefreshCw, Loader2 } from 'lucide-react';

/**
 * Dashboard shell sementara.
 * Isi penuh (chart, Status PO, dll) ada di artifacts/DashboardPage.jsx
 * dan harus di-paste ulang ke file ini lewat GitHub web editor.
 * Bagian atas: 4 kartu kategori ops sudah aktif.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const { loading, refresh } = useStock();
  const [poLoading, setPoLoading] = useState(false);

  const loadPO = useCallback(async () => {
    setPoLoading(true);
    try { await getStatusPO(); } catch (_) {}
    setPoLoading(false);
  }, []);

  const loadDashboardData = useCallback(async () => {
    try { await getDashboardData(); } catch (_) {}
  }, []);

  useEffect(() => {
    loadPO();
    loadDashboardData();
  }, [loadPO, loadDashboardData]);

  return (
    <div className="dashboard-shell w-full max-w-6xl mx-auto px-3 sm:px-5 lg:px-7 pt-4 pb-24 space-y-4">
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <OpsCategoryCards />
        </div>
        <button
          type="button"
          onClick={() => { refresh?.(); loadPO(); loadDashboardData(); }}
          className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm flex items-center justify-center active:scale-95 mt-8"
          aria-label="Refresh data"
          title="Muat ulang data Beranda"
        >
          <RefreshCw className={`h-4 w-4 ${(loading || poLoading) ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p className="font-bold mb-1">Perhatian — Dashboard ringkas sementara</p>
        <p>
          File lengkap <code className="font-mono">DashboardPage.jsx</code> (chart stok, Status PO, dll)
          tersedia di artifacts. Silakan paste isi penuh lewat GitHub web editor agar semua fitur Beranda kembali.
        </p>
      </div>
    </div>
  );
}
