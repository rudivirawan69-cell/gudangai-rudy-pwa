import { useMemo } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export function Movement7Days({ history = [] }) {
  const days = useMemo(() => {
    const map = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      map[key] = { date: key, masuk: 0, keluar: 0 };
    }
    for (const entry of history || []) {
      const t = String(entry?.tanggal || entry?.date || entry?.createdAt || '').slice(0, 10);
      if (!map[t]) continue;
      const type = String(entry?.type || entry?.jenis || '').toLowerCase();
      const qty = Number(entry?.qty || entry?.totalQty || 0) || 0;
      if (type.includes('masuk')) map[t].masuk += qty;
      else if (type.includes('keluar')) map[t].keluar += qty;
    }
    return Object.values(map);
  }, [history]);

  return (
    <div>
      <h3 className="text-sm font-bold text-slate-800 mb-3">Pergerakan 7 Hari</h3>
      <div className="space-y-1.5">
        {days.map((d) => (
          <div key={d.date} className="flex items-center justify-between text-[11px] tabular-nums">
            <span className="text-slate-500 font-medium">{d.date.slice(5)}</span>
            <span className="text-emerald-600 font-semibold">+{d.masuk}</span>
            <span className="text-rose-600 font-semibold">-{d.keluar}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StockComparison({ cv = {}, pt = {} }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-slate-800 mb-3">Perbandingan CV / PT</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-100 p-3">
          <p className="text-[10px] font-bold uppercase text-slate-400">CV</p>
          <p className="text-lg font-extrabold text-slate-900 tabular-nums">{cv.total || 0}</p>
          <p className="text-[10px] text-slate-500">Aman {cv.aman || 0} · Waspada {cv.waspada || 0} · Kritis {cv.kritis || 0}</p>
        </div>
        <div className="rounded-xl border border-slate-100 p-3">
          <p className="text-[10px] font-bold uppercase text-slate-400">PT</p>
          <p className="text-lg font-extrabold text-slate-900 tabular-nums">{pt.total || 0}</p>
          <p className="text-[10px] text-slate-500">Aman {pt.aman || 0} · Waspada {pt.waspada || 0} · Kritis {pt.kritis || 0}</p>
        </div>
      </div>
    </div>
  );
}

export function DashboardTotals({ totalItem = 0 }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Item Dashboard</p>
        <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{totalItem}</p>
      </div>
    </div>
  );
}

export function POQuickActions() {
  return null;
}

export function StatusPOCard({ poData, onConfirm }) {
  const summary = poData?.summary || {};
  const items = poData?.items || [];
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-800">Status PO</h3>
        <span className="text-[10px] font-semibold text-slate-400">{summary.totalItem || items.length} item</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="rounded-xl bg-teal-50 border border-teal-100 p-2">
          <p className="text-lg font-extrabold text-teal-700 tabular-nums">{summary.itemSelesai || 0}</p>
          <p className="text-[9px] font-bold text-teal-600 uppercase">Datang</p>
        </div>
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-2">
          <p className="text-lg font-extrabold text-amber-700 tabular-nums">{summary.itemSebagian || 0}</p>
          <p className="text-[9px] font-bold text-amber-600 uppercase">Sebagian</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
          <p className="text-lg font-extrabold text-slate-700 tabular-nums">{summary.itemMenunggu || 0}</p>
          <p className="text-[9px] font-bold text-slate-500 uppercase">Belum</p>
        </div>
      </div>
      <ul className="space-y-1.5 max-h-48 overflow-y-auto">
        {items.slice(0, 12).map((it) => (
          <li key={it.id || it.itemNo} className="flex items-center justify-between rounded-lg border border-slate-100 px-2.5 py-1.5 text-[11px]">
            <span className="font-semibold text-slate-800 truncate">{it.nama}</span>
            <span className="text-slate-500 tabular-nums shrink-0 ml-2">{it.qtyDatang}/{it.qtyPO}</span>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-center text-slate-400 py-4 text-[11px]">Belum ada data PO aktif</li>
        )}
      </ul>
    </div>
  );
}
