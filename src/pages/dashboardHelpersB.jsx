import { useMemo } from 'react';

export function Chart7Day({ history }) {
  const days = useMemo(() => {
    const out = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
      let masuk = 0;
      let keluar = 0;
      (history || []).forEach((entry) => {
        const rawAt = entry?.at ?? entry?.timestamp ?? entry?.time ?? entry?.createdAt ?? entry?.created_at ?? '';
        if (!rawAt) return;
        const rawDate = String(rawAt).trim();
        const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
        const ed = new Date(rawAt);
        if (Number.isNaN(ed.getTime())) return;
        const entryKey = dateOnly || [ed.getFullYear(), String(ed.getMonth() + 1).padStart(2, '0'), String(ed.getDate()).padStart(2, '0')].join('-');
        if (entryKey !== key) return;
        const qty = (entry.items || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0) || (Number(entry.qty) || 0);
        const type = String(entry.type || '').toLowerCase();
        if (type.includes('masuk')) masuk += qty;
        else if (type.includes('keluar')) keluar += qty;
      });
      out.push({
        label: d.toLocaleDateString('id-ID', { weekday: 'short' }).replace('.', ''),
        masuk,
        keluar,
      });
    }
    return out;
  }, [history]);

  const totalMasuk = days.reduce((n, d) => n + d.masuk, 0);
  const totalKeluar = days.reduce((n, d) => n + d.keluar, 0);
  const maxValue = Math.max(1, ...days.flatMap((d) => [d.masuk, d.keluar]));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div><h3 className="text-sm font-bold text-slate-800">Analisis</h3></div>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] font-semibold">
        <span className="inline-flex items-center gap-1.5 text-cyan-700"><i className="h-2 w-2 rounded-sm bg-cyan-500" /> Masuk <b className="tabular-nums">{totalMasuk}</b></span>
        <span className="inline-flex items-center gap-1.5 text-amber-700"><i className="h-2 w-2 rounded-sm bg-amber-500" /> Keluar <b className="tabular-nums">{totalKeluar}</b></span>
      </div>
      <div className="flex h-28 items-end gap-1.5">
        {days.map((day) => (
          <div key={day.label} className="flex flex-1 flex-col items-center justify-end gap-1">
            <div className="flex w-full items-end justify-center gap-0.5" style={{ height: '100%' }}>
              <span className="w-2.5 max-w-[42%] rounded-t-sm bg-cyan-500 transition-all" style={{ height: day.masuk ? Math.max(4, day.masuk / maxValue * 100) + '%' : '2px' }} />
              <span className="w-2.5 max-w-[42%] rounded-t-sm bg-amber-500 transition-all" style={{ height: day.keluar ? Math.max(4, day.keluar / maxValue * 100) + '%' : '2px' }} />
            </div>
            <span className="text-[9px] font-semibold text-slate-500">{day.label}</span>
          </div>
        ))}
      </div>
      {totalMasuk + totalKeluar === 0 && <p className="mt-2 text-center text-[10px] text-slate-400">Belum ada transaksi lokal dalam 7 hari terakhir.</p>}
    </div>
  );
}
