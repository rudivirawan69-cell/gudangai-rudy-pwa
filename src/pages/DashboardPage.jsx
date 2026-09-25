import { LayoutDashboard, RefreshCw } from 'lucide-react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';

export default function DashboardPage({ onNavigate }) {
  const { stock, loading, refresh } = useStock();
  const { user } = useAuth();
  const total = (stock?.cv?.length || 0) + (stock?.pt?.length || 0);

  return (
    <div className="p-4 text-white space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-cyan-300" /> Beranda
        </h1>
        <button
          type="button"
          onClick={() => refresh?.()}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/15"
          aria-label="Muat ulang"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <p className="text-sm opacity-70">
        Halo, {user?.name || user?.username || 'User'}. Dashboard stabil — fitur penuh menyusul.
      </p>

      <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2">
        <p className="text-xs uppercase tracking-wide opacity-50">Ringkasan stok</p>
        <p className="text-2xl font-bold tabular-nums">{loading ? '…' : total}</p>
        <p className="text-xs opacity-50">item (CV + PT)</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onNavigate?.('input')}
          className="rounded-xl bg-cyan-600/80 py-3 text-sm font-semibold"
        >
          Ke Input
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.('stok')}
          className="rounded-xl bg-white/10 py-3 text-sm font-semibold"
        >
          Ke Stok
        </button>
      </div>
    </div>
  );
}
