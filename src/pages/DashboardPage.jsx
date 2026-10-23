import OperatorTasks from '../components/OperatorTasks';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function DashboardPage({ onNavigate }) {
  const { user } = useAuth();
  const name = user?.name || 'Rudi';
  const hour = new Date().getHours();
  let greeting = 'Halo';
  if (hour >= 4 && hour < 10) greeting = 'Selamat pagi';
  else if (hour >= 10 && hour < 15) greeting = 'Selamat siang';
  else if (hour >= 15 && hour < 18) greeting = 'Selamat sore';
  else greeting = 'Selamat malam';

  return (
    <div className="w-full max-w-lg mx-auto px-1 pt-2 pb-24 space-y-3">
      <div className="dashboard-header-card rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-700">
              {greeting} · GUDANG PUSAT
            </p>
            <h1 className="text-xl font-extrabold text-slate-900 mt-1 leading-tight">
              Dashboard Operasional
            </h1>
            <p className="text-[13px] text-slate-600 mt-1">
              Operator · {name}
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 shrink-0"
            aria-label="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Prioritas 6: catatan tugas PO / kedatangan / kirim luar kota */}
        <OperatorTasks />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => onNavigate?.('stok')}
          className="rounded-2xl bg-white border border-slate-200 shadow-sm px-3 py-3 text-left"
        >
          <p className="text-[10px] font-bold text-slate-500 uppercase">Stok</p>
          <p className="text-sm font-extrabold text-slate-900 mt-1">Buka halaman Stok</p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.('po')}
          className="rounded-2xl bg-white border border-slate-200 shadow-sm px-3 py-3 text-left"
        >
          <p className="text-[10px] font-bold text-slate-500 uppercase">PO</p>
          <p className="text-sm font-extrabold text-slate-900 mt-1">Status & konfirmasi</p>
        </button>
      </div>

      <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 text-[11px] text-slate-600 font-medium leading-relaxed">
        Update Sheet & email operator ada di <strong>header atas</strong> (sticky).
        Grafik analisa 7 hari dan status per divisi akan dikembalikan ke Beranda pada update berikutnya.
      </div>
    </div>
  );
}
