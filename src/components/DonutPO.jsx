/** Donut Status PO — label Menunggu/Sebagian/Selesai, pusat = % Qty datang */
export default function DonutPO({ complete = 0, progress = 0, pending = 0, qtyDatang = 0, qtyPO = 0, size = 140 }) {
  const rawTotal = complete + progress + pending;
  const total = Math.max(1, rawTotal);
  const raw = [complete, progress, pending].map((v) => (v / total) * 100);
  const floors = raw.map((v) => Math.floor(v * 10) / 10);
  let used = floors.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, r: v - floors[i] })).sort((a, b) => b.r - a.r);
  const pcts = floors.slice();
  let guard = 0;
  while (Math.round((100 - used) * 10) > 0 && guard < 20) {
    const t = order[guard % order.length];
    pcts[t.i] = Math.round((pcts[t.i] + 0.1) * 10) / 10;
    used = Math.round((used + 0.1) * 10) / 10;
    guard += 1;
  }
  const [cPct, pPct, nPct] = pcts;
  const qtyPct = qtyPO > 0 ? Math.round((qtyDatang / qtyPO) * 1000) / 10 : 0;
  const r = 52;
  const circ = 2 * Math.PI * r;
  const seg = (pct) => (pct / 100) * circ;
  let offset = 0;
  const parts = [
    { pct: cPct, color: '#0f9f9a' },
    { pct: pPct, color: '#f0a23a' },
    { pct: nPct, color: '#94a3b8' },
  ];
  return (
    <div>
      <div className="flex items-center justify-center gap-4 mb-3 text-[10px] font-bold">
        <span className="text-teal-700"><i className="inline-block w-2 h-2 rounded-full bg-teal-600 mr-1" />Selesai {complete}</span>
        <span className="text-amber-700"><i className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />Sebagian {progress}</span>
        <span className="text-slate-500"><i className="inline-block w-2 h-2 rounded-full bg-slate-400 mr-1" />Menunggu {pending}</span>
      </div>
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r={r} fill="none" stroke="#e8eff0" strokeWidth="18" />
          {rawTotal > 0 && parts.map((p, i) => {
            const len = seg(p.pct);
            const el = (
              <circle
                key={i}
                cx="70" cy="70" r={r} fill="none"
                stroke={p.color} strokeWidth="18" strokeLinecap="butt"
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-3xl font-extrabold text-slate-900 tabular-nums leading-none">{rawTotal > 0 ? `${qtyPct}%` : '—'}</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-1">{rawTotal > 0 ? 'Qty datang' : 'Belum ada PO'}</p>
        </div>
      </div>
      {rawTotal === 0 && (
        <p className="text-center text-[10px] text-slate-400 mt-2">Belum ada data PO aktif pada sumber Status PO.</p>
      )}
      {rawTotal > 0 && (
        <p className="text-center text-[10px] text-slate-400 mt-2 tabular-nums">
          {complete}/{progress}/{pending} item · {cPct}% / {pPct}% / {nPct}%
        </p>
      )}
    </div>
  );
}
