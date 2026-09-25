import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import { getStatusPO, getPendingQueue } from '../data/api';
import { LayoutDashboard, Package, AlertTriangle, RefreshCw } from 'lucide-react';

export default function DashboardPage() {
  const { stock, loading, refresh } = useStock();
  const { user } = useAuth();
  return (
    <div className="p-4 text-white space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <LayoutDashboard className="w-6 h-6" /> Beranda
      </h1>
      <p className="text-sm opacity-70">Dashboard sedang dipulihkan dari placeholder. Silakan hard-refresh setelah deploy selesai.</p>
      <button
        type="button"
        onClick={() => refresh?.()}
        className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm flex items-center gap-2"
      >
        <RefreshCw className="w-4 h-4" /> Muat ulang stok
      </button>
      {loading && <p className="text-sm">Memuat...</p>}
      {!loading && stock && (
        <p className="text-sm">Item stok: {(stock.cv?.length || 0) + (stock.pt?.length || 0)}</p>
      )}
    </div>
  );
}
