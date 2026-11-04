import { useMemo } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export function Movement7Days({ history = [] }) {
  const days = useMemo(() => {
    const pad = (v) => String(v).padStart(2, '0');
    const map = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      map[key] = { date: key, label: d.toLocaleDateString('id-ID', { weekday: 'short' }).replace('.', '').slice(0, 3).toUpperCase(), masuk: 0, keluar: 0 };
    }
    for (const entry of history || []) {
      const raw = String(entry?.tanggal || entry?.date || entry?.createdAt || '').slice(0, 10);
      const key = /^\\d{4}-\\d{2}-\\d{2}$/.test(raw) ? raw : '';
      if (!map[key]) continue;
      const type = String(entry?.type || entry?.jenis || '').toLowerCase();
      const qty = Math.max(0, Number(entry?.qty || entry?.totalQty || 0) || 0);
      if (type.includes('masuk')) map[key].masuk += qty;
      else if (type.includes('keluar')) map[key].keluar += qty;
    }
    return Object.values(map);
  }, [history]);
  const maxValue = Math.max(1, ...days.flatMap((d) => [d.masuk, d.keluar]));
  const totalMasuk = days.reduce((n, d) => n + d.masuk, 0);
  const totalKeluar = days.reduce((n, d) => n + d.keluar, 0);
  return (
    <div className="movement-seven-days">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div><h3 className="text-sm font-bold text-slate-800">Analisa</h3><p className="text-[11px] text-slate-400">Pergerakan barang 7 hari terakhir</p></div>
        <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-700">7 Hari</span>
      </div>
      <div className="mb-2 flex items-center gap-4 text-[10px] font-semibold">
        <span className="inline-flex items-center gap-1.5 text-cyan-700"><i className="h-2 w-2 rounded-sm bg-cyan-500" /> Masuk <b className="tabular-nums">{totalMasuk}</b></span>
        <span className="inline-flex items-center gap-1.5 text-amber-700"><i className="h-2 w-2 rounded-sm bg-amber-500" /> Keluar <b className="tabular-nums">{totalKeluar}</b></span>
      </div>
      <div className="relative h-36 border-b border-slate-100">
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true"><span className="border-t border-slate-100" /><span className="border-t border-slate-100" /><span className="border-t border-slate-100" /><span className="border-t border-slate-100" /></div>
        <div className="relative z-10 grid h-full grid-cols-7 gap-1 px-1">
          {days.map((day) => <div key={day.date} className="flex min-w-0 flex-col items-center justify-end gap-1">
            <div className="flex h-28 w-full items-end justify-center gap-1" title={day.date + ': masuk ' + day.masuk + ', keluar ' + day.keluar}>
              <span className="w-2.5 max-w-[42%] rounded-t-sm bg-cyan-500 transition-all" style={{ height: day.masuk ? Math.max(4, day.masuk / maxValue * 100) + '%' : '2px' }} />
              <span className="w-2.5 max-w-[42%] rounded-t-sm bg-amber-500 transition-all" style={{ height: day.keluar ? Math.max(4, day.keluar / maxValue * 100) + '%' : '2px' }} />
            </div><span className="text-[9px] font-bold uppercase text-slate-400">{day.label}</span>
          </div>)}
        </div>
      </div>
      {totalMasuk + totalKeluar === 0 && <p className="mt-2 text-center text-[10px] text-slate-400">Belum ada transaksi lokal dalam 7 hari terakhir.</p>}
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
