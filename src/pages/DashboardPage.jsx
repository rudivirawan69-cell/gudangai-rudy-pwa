import { useMemo, useState, useEffect, useCallback } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import {
  getPendingQueue, getStatusPO, confirmPOStatus,
} from '../data/api';
import { DIVISIONS } from '../data/master';
import {
  AlertTriangle, RefreshCw, FileText, Package, ShieldAlert, CheckCircle2, AlertCircle,
} from 'lucide-react';

function classifyItem(it) {
  const stok = Number(it.stok ?? it.stockAkhir ?? 0) || 0;
  const aman = Number(it.stockAman ?? it.aman ?? it.min ?? 0) || 0;
  if (aman > 0) {
    if (stok <= 0 || stok <= Math.max(5, Math.floor(aman * 0.25))) return 'kritis';
    if (stok < aman) return 'waspada';
    return 'aman';
  }
  if (stok <= 5) return 'kritis';
  if (stok <= 20) return 'waspada';
  return 'aman';
}

function RingChart({ pct, color = '#ef4444', size = 52, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(100, pct)) / 100 * c;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
      />
    </svg>
  );
}

function DonutPO({ complete, progress, pending, size = 140 }) {
  const total = Math.max(1, complete + progress + pending);
  const cPct = (complete / total) * 100;
  const pPct = (progress / total) * 100;
  const nPct = (pending / total) * 100;
  const center = Math.round((complete + progress * 0.5) / total * 100);
  const r = 52;
  const circ = 2 * Math.PI * r;
  const seg = (pct) => (pct / 100) * circ;
  let offset = 0;
  const parts = [
    { pct: cPct, color: '#10b981' },
    { pct: pPct, color: '#f59e0b' },
    { pct: nPct, color: '#94a3b8' },
  ];
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#f1f5f9" strokeWidth="18" />
        {parts.map((p, i) => {
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
        <p className="text-3xl font-extrabold text-slate-900 tabular-nums leading-none">{center}%</p>
        <p className="text-[11px] text-slate-400 font-medium mt-0.5">Progress</p>
      </div>
    </div>
  );
}

function DivisionStatus3D({ items }) {
  const rows = useMemo(() => {
    const map = {};
    DIVISIONS.forEach((d) => { map[d] = { divisi: d, total: 0, aman: 0, waspada: 0, kritis: 0 }; });
    (items || []).forEach((it) => {
      const d = String(it.divisi || 'CS').trim() || 'CS';
      if (!map[d]) map[d] = { divisi: d, total: 0, aman: 0, waspada: 0, kritis: 0 };
      map[d].total += 1;
      const cls = classifyItem(it);
      map[d][cls] += 1;
    });
    return Object.values(map)
      .filter((r) => r.total > 0)
      .sort((a, b) => (b.kritis / b.total) - (a.kritis / a.total) || b.total - a.total);
  }, [items]);

  if (rows.length === 0) {
    return <p className="text-[12px] text-slate-400 text-center py-4">Belum ada data divisi</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const kritisPct = r.total ? Math.round((r.kritis / r.total) * 100) : 0;
        const aPct = r.total ? (r.aman / r.total) * 100 : 0;
        const wPct = r.total ? (r.waspada / r.total) * 100 : 0;
        const kPct = r.total ? (r.kritis / r.total) * 100 : 0;
        const ringColor = kritisPct >= 50 ? '#ef4444' : kritisPct >= 25 ? '#f59e0b' : '#10b981';
        return (
          <div key={r.divisi} className="flex items-center gap-3">
            <div className="relative shrink-0">
              <RingChart pct={kritisPct || 1} color={ringColor} size={52} stroke={6} />
              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-extrabold text-slate-800 tabular-nums">
                {kritisPct}%
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[13px] font-bold text-slate-800 uppercase tracking-wide truncate">{r.divisi}</span>
                <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{r.total} SKU</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
                <div className="h-full bg-emerald-500" style={{ width: `${aPct}%` }} />
                <div className="h-full bg-amber-400" style={{ width: `${wPct}%` }} />
                <div className="h-full bg-red-500" style={{ width: `${kPct}%` }} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2 text-[10px] tabular-nums">
                  <span className="text-emerald-600">● {r.aman}</span>
                  <span className="text-amber-500">● {r.waspada}</span>
                  <span className="text-red-500">● {r.kritis}</span>
                </div>
                <span className="text-[10px] font-semibold text-red-600 tabular-nums">{kritisPct}% kritis</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function normalizeStatusPO(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ok = raw.success === true || raw.status === 'OK' || raw.status === 'ok' || raw.status === 'APPLIED';
  if (!ok) return { success: false, error: raw.error || 'Gagal memuat Status PO' };
  const itemsRaw = raw.items || raw.data?.items || raw.list || [];
  const items = (Array.isArray(itemsRaw) ? itemsRaw : []).map((it, idx) => {
    const statusRaw = String(it.status || it.Status || '').trim();
    let status = statusRaw || 'Menunggu';
    const low = status.toLowerCase();
    if (low.includes('sebagian') || low.includes('progress')) status = 'Sebagian';
    else if (low.includes('selesai') || low === 'datang' || low.includes('complete')) status = 'Selesai';
    else if (low.includes('belum') || low.includes('menunggu') || low.includes('pending')) status = 'Menunggu';
    return {
      itemNo: it.itemNo || it.no || idx + 1,
      nama: it.nama || it.Nama || it.name || '—',
      size: it.size || '',
      satuan: it.satuan || 'Pack',
      tglRencana: it.tglRencana || it.tglKedatangan || '',
      qtyPO: Number(it.qtyPO ?? it.qty ?? 0) || 0,
      qtyDatang: Number(it.qtyDatang ?? it.datang ?? 0) || 0,
      status,
      id: it.id || it.itemId || it.clientItemId || `po-${idx}`,
    };
  });
  const summaryRaw = raw.summary || raw.data?.summary || {};
  let menunggu = Number(summaryRaw.itemMenunggu ?? summaryRaw.menunggu ?? 0) || 0;
  let sebagian = Number(summaryRaw.itemSebagian ?? summaryRaw.sebagian ?? 0) || 0;
  let selesai = Number(summaryRaw.itemSelesai ?? summaryRaw.selesai ?? 0) || 0;
  if (items.length && menunggu + sebagian + selesai === 0) {
    for (const it of items) {
      if (it.status === 'Selesai') selesai += 1;
      else if (it.status === 'Sebagian') sebagian += 1;
      else menunggu += 1;
    }
  }
  const totalItem = Number(summaryRaw.totalItem ?? 0) || items.length || (menunggu + sebagian + selesai);
  return {
    success: true,
    noPO: raw.noPO || summaryRaw.noPO || '',
    items,
    summary: {
      totalItem,
      itemMenunggu: menunggu,
      itemSebagian: sebagian,
      itemSelesai: selesai,
      totalAktif: menunggu + sebagian,
      totalKonfirmasi: selesai,
    },
  };
}

function StatusPOCard({ data, loading, error, onRefresh, onConfirm, confirmingId }) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center">
            <FileText className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Status PO Aktif 3D</h3>
            <p className="text-[10px] text-slate-400">Memuat…</p>
          </div>
        </div>
        <div className="h-28 rounded-xl bg-slate-50 animate-pulse" />
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center">
              <FileText className="w-4 h-4 text-violet-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">Status PO Aktif 3D</h3>
          </div>
          <button type="button" onClick={onRefresh} className="text-[11px] text-cyan-700 font-semibold">Muat ulang</button>
        </div>
        <p className="text-[12px] text-slate-500">{error || 'Belum ada data PO aktif. Pastikan API Secret di Atur.'}</p>
      </div>
    );
  }

  const summary = data.summary || {};
  const items = data.items || [];
  const totalItem = summary.totalItem || 0;
  const menunggu = summary.itemMenunggu || 0;
  const sebagian = summary.itemSebagian || 0;
  const selesai = summary.itemSelesai || 0;
  const pct = (n) => (totalItem > 0 ? Math.round((n / totalItem) * 1000) / 10 : 0);

  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800">Status PO Aktif 3D</h3>
            <p className="text-[11px] text-slate-400 truncate">
              {data.noPO ? `No. PO ${data.noPO}` : 'Tidak ada No. PO aktif'} · {totalItem} item · Interactive
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500"
          aria-label="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <DonutPO complete={selesai} progress={sebagian} pending={menunggu} />

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-emerald-50 px-2 py-2.5 text-center">
          <p className="text-[11px] font-semibold text-emerald-700">Complete</p>
          <p className="text-lg font-extrabold text-emerald-700 tabular-nums">{pct(selesai)}%</p>
          <p className="text-[10px] text-emerald-600/80 tabular-nums">{selesai} item</p>
        </div>
        <div className="rounded-xl bg-amber-50 px-2 py-2.5 text-center">
          <p className="text-[11px] font-semibold text-amber-700">Progress</p>
          <p className="text-lg font-extrabold text-amber-700 tabular-nums">{pct(sebagian)}%</p>
          <p className="text-[10px] text-amber-600/80 tabular-nums">{sebagian} item</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-2 py-2.5 text-center">
          <p className="text-[11px] font-semibold text-slate-600">Pending</p>
          <p className="text-lg font-extrabold text-slate-700 tabular-nums">{pct(menunggu)}%</p>
          <p className="text-[10px] text-slate-500 tabular-nums">{menunggu} item</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>Konfirmasi <b className="text-slate-800">{selesai}</b></span>
        <span>Sisa aktif <b className="text-slate-800">{menunggu + sebagian}</b></span>
      </div>

      {items.length > 0 && (
        <div className="space-y-0 divide-y divide-slate-100">
          {items.map((it, idx) => {
            const canConfirm = it.status === 'Menunggu' || it.status === 'Sebagian';
            const badge =
              it.status === 'Selesai'
                ? 'bg-emerald-50 text-emerald-700'
                : it.status === 'Sebagian'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-slate-50 text-slate-600';
            const barPct = it.qtyPO > 0 ? Math.min(100, Math.round((it.qtyDatang / it.qtyPO) * 100)) : 0;
            return (
              <div key={it.id || idx} className="py-3 first:pt-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-slate-800 truncate">
                      <span className="text-slate-400 font-semibold mr-1">#{String(it.itemNo || idx + 1).padStart(2, '0')}</span>
                      {it.nama}
                    </p>
                    <p className="text-[11px] text-slate-400">{it.satuan}{it.size ? ` · ${it.size}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge}`}>{it.status}</span>
                    {canConfirm && (
                      <button
                        type="button"
                        disabled={confirmingId === it.id}
                        onClick={() => onConfirm?.(it)}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-cyan-600 text-white active:scale-95 disabled:opacity-50"
                      >
                        {confirmingId === it.id ? '…' : 'Konfirmasi'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${it.status === 'Selesai' ? 'bg-emerald-500' : 'bg-cyan-400'}`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums text-right">
                  {it.qtyDatang}/{it.qtyPO}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { items: allItems, loading, refresh } = useStock('ALL');
  const [poData, setPoData] = useState(null);
  const [poLoading, setPoLoading] = useState(true);
  const [poError, setPoError] = useState('');
  const [confirmingId, setConfirmingId] = useState(null);
  const [confirmMsg, setConfirmMsg] = useState('');

  const stats = useMemo(() => {
    const list = allItems || [];
    let aman = 0; let waspada = 0; let kritis = 0; let totalUnit = 0;
    let cv = { total: 0, unit: 0, aman: 0, waspada: 0, kritis: 0 };
    let pt = { total: 0, unit: 0, aman: 0, waspada: 0, kritis: 0 };
    list.forEach((it) => {
      const cls = classifyItem(it);
      if (cls === 'aman') aman += 1;
      else if (cls === 'waspada') waspada += 1;
      else kritis += 1;
      const unit = Number(it.stok ?? it.stockAkhir ?? 0) || 0;
      totalUnit += unit;
      const ent = String(it.entitas || it.entity || '').toUpperCase();
      const bucket = ent === 'PT' ? pt : cv;
      bucket.total += 1;
      bucket.unit += unit;
      bucket[cls] += 1;
    });
    return {
      total: list.length,
      aman,
      waspada,
      kritis,
      totalUnit,
      cv,
      pt,
    };
  }, [allItems]);

  const loadPO = useCallback(async () => {
    setPoLoading(true);
    setPoError('');
    try {
      const res = await getStatusPO();
      const norm = normalizeStatusPO(res);
      if (norm?.success) setPoData(norm);
      else {
        setPoData(null);
        setPoError(norm?.error || res?.error || 'Gagal memuat Status PO');
      }
    } catch (err) {
      setPoData(null);
      setPoError(err?.message || 'Gagal memuat Status PO');
    } finally {
      setPoLoading(false);
    }
  }, []);

  useEffect(() => { loadPO(); }, [loadPO]);

  const handleConfirm = useCallback(async (item) => {
    if (!item) return;
    setConfirmingId(item.id);
    setConfirmMsg('');
    try {
      const res = await confirmPOStatus({
        itemNo: item.itemNo,
        nama: item.nama,
        noPO: poData?.noPO,
        status: 'Selesai',
        qtyDatang: item.qtyPO || item.qtyDatang,
      });
      if (res?.success || res?.status === 'OK' || res?.status === 'APPLIED') {
        setConfirmMsg(`✓ ${item.nama} dikonfirmasi`);
        await loadPO();
      } else {
        setConfirmMsg(res?.error || 'Gagal konfirmasi');
      }
    } catch (err) {
      setConfirmMsg(err?.message || 'Gagal konfirmasi');
    } finally {
      setConfirmingId(null);
      setTimeout(() => setConfirmMsg(''), 3200);
    }
  }, [loadPO, poData?.noPO]);

  const pending = useMemo(() => {
    try {
      const q = getPendingQueue() || [];
      return q.reduce((n, e) => n + (e.items?.length || 0), 0);
    } catch { return 0; }
  }, [allItems, poData]);

  const hour = new Date().getHours();
  let greeting = 'Halo';
  let reminder = null;
  if (hour >= 4 && hour < 10) { greeting = 'Selamat pagi'; reminder = 'Cek kedatangan barang ya'; }
  else if (hour >= 10 && hour < 15) { greeting = 'Selamat siang'; reminder = 'jangan lupa input barang datang'; }
  else if (hour >= 15 && hour < 18) { greeting = 'Selamat sore'; reminder = 'apakah pengeluaran hari ini sudah di input...'; }
  else { greeting = 'Selamat malam'; reminder = 'Pastikan data hari ini sudah lengkap'; }

  const name = user?.name || user?.nama || 'Rudy';
  const kritisPct = stats.total ? Math.round((stats.kritis / stats.total) * 100) : 0;
  const waspadaPct = stats.total ? Math.round((stats.waspada / stats.total) * 100) : 0;
  const amanPct = stats.total ? Math.round((stats.aman / stats.total) * 100) : 0;

  const barSeg = (bucket) => {
    const t = Math.max(1, bucket.total);
    return {
      a: (bucket.aman / t) * 100,
      w: (bucket.waspada / t) * 100,
      k: (bucket.kritis / t) * 100,
    };
  };
  const cvBar = barSeg(stats.cv);
  const ptBar = barSeg(stats.pt);

  return (
    <div className="px-3 pt-3 pb-24 space-y-3 max-w-lg mx-auto">
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400 font-medium">{greeting}</p>
            <h1 className="text-lg font-extrabold text-slate-900 truncate">{name}</h1>
            {reminder && <p className="text-[13px] font-bold text-pink-500 mt-0.5 leading-snug">{reminder}</p>}
          </div>
          <button
            type="button"
            onClick={() => { refresh?.(); loadPO(); }}
            className="w-9 h-9 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 shrink-0"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-3.5">
          <div className="flex items-start justify-between mb-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Item</p>
            <Package className="w-4 h-4 text-cyan-500" />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 tabular-nums leading-none">{loading ? '…' : stats.total}</p>
          <p className="text-[11px] text-slate-400 mt-1">Semua Entitas CV &amp; PT</p>
        </div>
        <div className="rounded-2xl bg-white border border-red-100 shadow-sm p-3.5">
          <div className="flex items-start justify-between mb-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-500">Kritis</p>
            <ShieldAlert className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-3xl font-extrabold text-red-600 tabular-nums leading-none">
            {loading ? '…' : stats.kritis}
            <span className="text-base font-bold text-red-400 ml-1">({kritisPct}%)</span>
          </p>
          <p className="text-[11px] text-red-400 mt-1">Stok di bawah batas minimal</p>
        </div>
        <div className="rounded-2xl bg-white border border-amber-100 shadow-sm p-3.5">
          <div className="flex items-start justify-between mb-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Waspada</p>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-3xl font-extrabold text-amber-600 tabular-nums leading-none">
            {loading ? '…' : stats.waspada}
            <span className="text-base font-bold text-amber-400 ml-1">({waspadaPct}%)</span>
          </p>
          <p className="text-[11px] text-amber-500/80 mt-1">Mendekati ambang batas</p>
        </div>
        <div className="rounded-2xl bg-white border border-emerald-100 shadow-sm p-3.5">
          <div className="flex items-start justify-between mb-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Aman</p>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-3xl font-extrabold text-emerald-600 tabular-nums leading-none">
            {loading ? '…' : stats.aman}
            <span className="text-base font-bold text-emerald-400 ml-1">({amanPct}%)</span>
          </p>
          <p className="text-[11px] text-emerald-600/70 mt-1">Kapasitas stok tercukupi</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-cyan-50 flex items-center justify-center">
            <Package className="w-4 h-4 text-cyan-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Analisa Stok CV &amp; PT</h3>
            <p className="text-[11px] text-slate-400">Perbandingan status per entitas</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[13px] font-bold text-slate-800">CV</span>
              <span className="text-[11px] text-slate-400 tabular-nums">{stats.cv.total} SKU · {stats.cv.unit.toLocaleString('id-ID')} unit</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
              <div className="h-full bg-emerald-500" style={{ width: `${cvBar.a}%` }} />
              <div className="h-full bg-amber-400" style={{ width: `${cvBar.w}%` }} />
              <div className="h-full bg-red-500" style={{ width: `${cvBar.k}%` }} />
            </div>
            <div className="flex gap-3 mt-1 text-[10px] tabular-nums">
              <span className="text-emerald-600">● Aman {stats.cv.aman}</span>
              <span className="text-amber-500">● Waspada {stats.cv.waspada}</span>
              <span className="text-red-500">● Kritis {stats.cv.kritis}</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[13px] font-bold text-slate-800">PT</span>
              <span className="text-[11px] text-slate-400 tabular-nums">{stats.pt.total} SKU · {stats.pt.unit.toLocaleString('id-ID')} unit</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
              <div className="h-full bg-emerald-500" style={{ width: `${ptBar.a}%` }} />
              <div className="h-full bg-amber-400" style={{ width: `${ptBar.w}%` }} />
              <div className="h-full bg-red-500" style={{ width: `${ptBar.k}%` }} />
            </div>
            <div className="flex gap-3 mt-1 text-[10px] tabular-nums">
              <span className="text-emerald-600">● Aman {stats.pt.aman}</span>
              <span className="text-amber-500">● Waspada {stats.pt.waspada}</span>
              <span className="text-red-500">● Kritis {stats.pt.kritis}</span>
            </div>
          </div>
        </div>
        <div className="flex justify-center gap-4 mt-3 text-[10px] text-slate-500">
          <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />Aman</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />Waspada</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Kritis</span>
        </div>
      </div>

      <StatusPOCard
        data={poData}
        loading={poLoading}
        error={poError}
        onRefresh={loadPO}
        onConfirm={handleConfirm}
        confirmingId={confirmingId}
      />
      {confirmMsg && (
        <p className="text-[12px] text-center font-semibold text-cyan-700">{confirmMsg}</p>
      )}

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-cyan-50 flex items-center justify-center">
            <Package className="w-4 h-4 text-cyan-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Status Stok Per Divisi 3D</h3>
            <p className="text-[11px] text-slate-400">Aman · Waspada · Kritis · Interactive</p>
          </div>
        </div>
        <DivisionStatus3D items={allItems} />
      </div>

      {pending > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-100 px-3 py-2.5 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-[12px] text-amber-800"><b>{pending}</b> transaksi menunggu sync — buka Atur</span>
        </div>
      )}
    </div>
  );
}
