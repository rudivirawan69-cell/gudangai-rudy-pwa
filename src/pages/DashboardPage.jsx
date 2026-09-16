import { useMemo, useState, useEffect, useCallback } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import {
  getPendingQueue, getStatusPO,
} from '../data/api';
import { DIVISIONS } from '../data/master';
import { AVATAR_DATA_URL } from '../assets/imageAssets';
import {
  AlertTriangle, RefreshCw, FileText, Package, CheckCircle2, AlertCircle, ShieldAlert,
} from 'lucide-react';

const EMAIL = 'rudivirawan69@gmail.com';

function Avatar({ name, size = 'md' }) {
  const [err, setErr] = useState(false);
  const dim = size === 'lg' ? 'w-12 h-12' : 'w-10 h-10';
  if (err) {
    return (
      <div className={`${dim} rounded-2xl bg-gradient-to-br from-cyan-600 to-teal-700 flex items-center justify-center text-white text-sm font-bold shadow-md shrink-0`}>
        {(name || 'R').charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={AVATAR_DATA_URL}
      alt={name || 'Avatar'}
      className={`${dim} rounded-2xl object-cover shadow-md border-2 border-white/90 shrink-0`}
      onError={() => setErr(true)}
    />
  );
}

function DivisionStatusBars({ items }) {
  const rows = useMemo(() => {
    const map = {};
    DIVISIONS.forEach((d) => { map[d] = { divisi: d, total: 0, aman: 0, waspada: 0, kritis: 0 }; });
    (items || []).forEach((it) => {
      const d = String(it.divisi || 'CS').trim() || 'CS';
      if (!map[d]) map[d] = { divisi: d, total: 0, aman: 0, waspada: 0, kritis: 0 };
      map[d].total += 1;
      const stok = Number(it.stok) || 0;
      const aman = Number(it.stockAman ?? it.aman ?? 0);
      if (aman > 0) {
        if (stok <= 0 || stok <= Math.max(5, Math.floor(aman * 0.25))) map[d].kritis += 1;
        else if (stok < aman) map[d].waspada += 1;
        else map[d].aman += 1;
      } else {
        if (stok <= 5) map[d].kritis += 1;
        else if (stok <= 20) map[d].waspada += 1;
        else map[d].aman += 1;
      }
    });
    return Object.values(map).filter((r) => r.total > 0).sort((a, b) => b.kritis - a.kritis || b.total - a.total);
  }, [items]);
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  if (rows.length === 0) {
    return <p className="text-[11px] text-slate-400 text-center py-3">Belum ada data divisi</p>;
  }
  return (
    <div className="space-y-2.5">
      {rows.map((r, idx) => {
        const pct = (n) => Math.max(n > 0 ? 3 : 0, Math.round((n / maxTotal) * 100));
        const kritisPct = r.total ? Math.round((r.kritis / r.total) * 100) : 0;
        return (
          <div key={r.divisi} className="animate-slide-up" style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'both' }}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-semibold text-slate-700 truncate">{r.divisi}</span>
              <span className="text-[10px] text-slate-400 tabular-nums shrink-0">{r.total} SKU · <span className="text-red-600 font-medium">{kritisPct}%</span> kritis</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
              <div className="h-full bg-emerald-500 transition-all duration-500 ease-out" style={{ width: `${pct(r.aman)}%` }} />
              <div className="h-full bg-amber-400 transition-all duration-500 ease-out" style={{ width: `${pct(r.waspada)}%` }} />
              <div className="h-full bg-red-500 transition-all duration-500 ease-out" style={{ width: `${pct(r.kritis)}%` }} />
            </div>
            <div className="flex gap-3 mt-0.5 text-[9px] text-slate-400">
              <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{r.aman}</span>
              <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{r.waspada}</span>
              <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{r.kritis}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EntityStockChart({ cvItems, ptItems }) {
  const calc = (items) => {
    let aman = 0, waspada = 0, kritis = 0, total = 0, units = 0;
    (items || []).forEach((it) => {
      total += 1;
      const s = Number(it.stok) || 0;
      units += s;
      const a = Number(it.stockAman ?? it.aman ?? 0);
      if (a > 0) {
        if (s <= 0 || s <= Math.max(5, Math.floor(a * 0.25))) kritis += 1;
        else if (s < a) waspada += 1;
        else aman += 1;
      } else {
        if (s <= 5) kritis += 1;
        else if (s <= 20) waspada += 1;
        else aman += 1;
      }
    });
    return { total, aman, waspada, kritis, units };
  };
  const cv = useMemo(() => calc(cvItems), [cvItems]);
  const pt = useMemo(() => calc(ptItems), [ptItems]);
  const maxSku = Math.max(1, cv.total, pt.total);
  const Row = ({ label, data, accent }) => {
    const pct = (n) => Math.max(n > 0 ? 4 : 0, Math.round((n / maxSku) * 100));
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className={`text-[12px] font-bold ${accent}`}>{label}</span>
          <span className="text-[10px] text-slate-400 tabular-nums">{data.total} SKU · {data.units.toLocaleString('id-ID')} unit</span>
        </div>
        <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct(data.aman)}%` }} />
          <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${pct(data.waspada)}%` }} />
          <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${pct(data.kritis)}%` }} />
        </div>
        <div className="flex gap-3 text-[9px] text-slate-500">
          <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Aman {data.aman}</span>
          <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Waspada {data.waspada}</span>
          <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Kritis {data.kritis}</span>
        </div>
      </div>
    );
  };
  return (
    <div className="space-y-4">
      <Row label="CV" data={cv} accent="text-cyan-700" />
      <Row label="PT" data={pt} accent="text-violet-700" />
      <div className="flex items-center justify-center gap-4 pt-1 text-[9px] text-slate-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Aman</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />Waspada</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Kritis</span>
      </div>
    </div>
  );
}

function normalizeStatusPO(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ok = raw.success === true || raw.status === 'OK' || raw.status === 'ok' || raw.status === 'APPLIED';
  if (!ok && raw.code === 'UNAUTHORIZED') return { success: false, error: raw.error || 'Unauthorized — isi API Secret di Atur' };
  if (!ok) return { success: false, error: raw.error || 'Gagal memuat Status PO' };
  const itemsRaw = raw.items || raw.data?.items || raw.list || raw.poItems || [];
  const items = (Array.isArray(itemsRaw) ? itemsRaw : []).map((it, idx) => {
    const statusRaw = String(it.status || it.Status || it.statusPO || it.keteranganStatus || '').trim();
    let status = statusRaw || 'Menunggu';
    const low = status.toLowerCase();
    if (low.includes('sebagian')) status = 'Sebagian';
    else if (low.includes('selesai') || low === 'datang' || (low.includes('datang') && !low.includes('belum'))) status = 'Selesai';
    else if (low.includes('belum') || low.includes('menunggu') || low.includes('aktif')) status = 'Menunggu';
    return {
      itemNo: it.itemNo || it.no || it.No || idx + 1,
      nama: it.nama || it.Nama || it.name || it.barang || '—',
      size: it.size || it.ukuran || it.Size || '',
      satuan: it.satuan || it.Satuan || 'Pack',
      tglRencana: it.tglRencana || it.tglKedatangan || it.tanggal || it.Tgl || '',
      qtyPO: Number(it.qtyPO ?? it.qty ?? it.Qty ?? it.jumlah ?? 0) || 0,
      qtyDatang: Number(it.qtyDatang ?? it.datang ?? it.qtyMasuk ?? 0) || 0,
      status,
    };
  });
  const summaryRaw = raw.summary || raw.data?.summary || raw.rekap || {};
  let menunggu = Number(summaryRaw.itemMenunggu ?? summaryRaw.menunggu ?? summaryRaw.pending ?? summaryRaw.belum ?? 0) || 0;
  let sebagian = Number(summaryRaw.itemSebagian ?? summaryRaw.sebagian ?? summaryRaw.partial ?? 0) || 0;
  let selesai = Number(summaryRaw.itemSelesai ?? summaryRaw.selesai ?? summaryRaw.done ?? summaryRaw.datang ?? 0) || 0;
  if (items.length && menunggu + sebagian + selesai === 0) {
    for (const it of items) {
      if (it.status === 'Selesai') selesai += 1;
      else if (it.status === 'Sebagian') sebagian += 1;
      else menunggu += 1;
    }
  }
  const totalItem = Number(summaryRaw.totalItem ?? summaryRaw.total ?? 0) || items.length || (menunggu + sebagian + selesai);
  const totalAktif = Number(summaryRaw.totalAktif ?? summaryRaw.aktif ?? 0) || (menunggu + sebagian);
  const totalKonfirmasi = Number(summaryRaw.totalKonfirmasi ?? summaryRaw.konfirmasi ?? 0) || selesai;
  return {
    success: true,
    noPO: raw.noPO || raw.no_po || raw.nomorPO || raw.poNumber || summaryRaw.noPO || '',
    weekLabel: raw.weekLabel || raw.minggu || summaryRaw.weekLabel || '',
    items,
    summary: { totalItem, itemMenunggu: menunggu, itemSebagian: sebagian, itemSelesai: selesai, totalAktif, totalKonfirmasi },
  };
}

function statusPOColor(status) {
  if (status === 'Selesai') return { bg: 'bg-emerald-50/80', text: 'text-emerald-700', bar: 'bg-emerald-500' };
  if (status === 'Sebagian') return { bg: 'bg-amber-50/80', text: 'text-amber-700', bar: 'bg-amber-400' };
  return { bg: 'bg-slate-50/80', text: 'text-slate-600', bar: 'bg-slate-300' };
}

function StatusPOCard({ data, loading, error, onRefresh }) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 animate-slide-up">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center"><FileText className="w-4 h-4 text-violet-600" /></div>
          <div><h3 className="text-sm font-semibold text-slate-800">Status Purchase Order</h3><p className="text-[10px] text-slate-400">Memuat data PO…</p></div>
        </div>
        <div className="space-y-2"><div className="skeleton h-3 rounded-full" /><div className="skeleton h-14 rounded-xl" /></div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl bg-white border border-amber-100 shadow-sm p-4 animate-slide-up">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center"><FileText className="w-4 h-4 text-violet-600" /></div>
            <h3 className="text-sm font-semibold text-slate-800">Status Purchase Order</h3>
          </div>
          <button type="button" onClick={onRefresh} className="text-[11px] text-cyan-700 font-medium">Muat ulang</button>
        </div>
        <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">{error}</p>
      </div>
    );
  }
  if (!data || !data.success) {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 animate-slide-up">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center"><FileText className="w-4 h-4 text-violet-600" /></div>
            <div><h3 className="text-sm font-semibold text-slate-800">Status Purchase Order</h3><p className="text-[10px] text-slate-400">Belum ada data PO aktif</p></div>
          </div>
          <button type="button" onClick={onRefresh} className="text-[11px] text-cyan-700 font-medium">Muat ulang</button>
        </div>
        <p className="text-[11px] text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">Pastikan sheet <b>purchase order</b> terisi & API Secret benar di Atur.</p>
      </div>
    );
  }
  const summary = data.summary || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const noPO = data.noPO;
  const totalItem = summary.totalItem || items.length || 0;
  const menunggu = summary.itemMenunggu || 0;
  const sebagian = summary.itemSebagian || 0;
  const selesai = summary.itemSelesai || 0;
  const totalAktif = summary.totalAktif || 0;
  const totalKonfirmasi = summary.totalKonfirmasi || 0;
  const progressPct = totalItem > 0 ? Math.round(((selesai + sebagian * 0.5) / totalItem) * 100) : 0;
  const size = 132;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const totalSeg = Math.max(1, menunggu + sebagian + selesai);
  const segMenunggu = (menunggu / totalSeg) * c;
  const segSebagian = (sebagian / totalSeg) * c;
  const segSelesai = (selesai / totalSeg) * c;
  const offsetSebagian = segMenunggu;
  const offsetSelesai = segMenunggu + segSebagian;
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm"><FileText className="w-4 h-4 text-white" /></div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-800 leading-tight">Status Purchase Order</h3>
            <p className="text-[10px] text-slate-400 truncate">{noPO ? `No. PO ${noPO}` : 'Tidak ada No. PO aktif'} · {totalItem} item</p>
          </div>
        </div>
        <button type="button" onClick={onRefresh} className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500 active:scale-95 shrink-0" aria-label="Refresh PO"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>
      <div className="flex items-center justify-center gap-4 mb-4">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
            {menunggu > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#94a3b8" strokeWidth={stroke} strokeDasharray={`${segMenunggu} ${c - segMenunggu}`} strokeDashoffset={0} strokeLinecap="butt" />}
            {sebagian > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fbbf24" strokeWidth={stroke} strokeDasharray={`${segSebagian} ${c - segSebagian}`} strokeDashoffset={-offsetSebagian} strokeLinecap="butt" />}
            {selesai > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#10b981" strokeWidth={stroke} strokeDasharray={`${segSelesai} ${c - segSelesai}`} strokeDashoffset={-offsetSelesai} strokeLinecap="butt" />}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold text-slate-800 tabular-nums leading-none">{progressPct}%</span>
            <span className="text-[10px] text-slate-400 mt-0.5 font-medium">Progress</span>
          </div>
        </div>
        <div className="flex flex-col gap-2.5 min-w-0">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-slate-400 shrink-0" /><div className="min-w-0"><p className="text-[11px] text-slate-500 leading-none">Menunggu</p><p className="text-sm font-bold text-slate-800 tabular-nums">{menunggu}</p></div></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-400 shrink-0" /><div className="min-w-0"><p className="text-[11px] text-slate-500 leading-none">Sebagian</p><p className="text-sm font-bold text-amber-700 tabular-nums">{sebagian}</p></div></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" /><div className="min-w-0"><p className="text-[11px] text-slate-500 leading-none">Selesai</p><p className="text-sm font-bold text-emerald-700 tabular-nums">{selesai}</p></div></div>
        </div>
      </div>
      {totalItem === 0 && <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 mb-3">Belum ada baris Status PO minggu ini. Cek sheet <b>purchase order</b> / jalankan refresh dashboard di Apps Script.</p>}
      <div className="flex justify-between mb-3 px-0.5 text-[10px] text-slate-400">
        <span>Konfirmasi <b className="text-slate-600">{Number(totalKonfirmasi).toLocaleString('id-ID')}</b></span>
        <span>Sisa aktif <b className="text-slate-600">{Number(totalAktif).toLocaleString('id-ID')}</b></span>
      </div>
      {items.length > 0 && (
        <div className="space-y-0 divide-y divide-slate-100 max-h-56 overflow-y-auto -mx-1 px-1">
          {items.slice(0, 8).map((it, idx) => {
            const st = it.status || 'Menunggu';
            const col = statusPOColor(st);
            const qtyPO = Number(it.qtyPO) || 0;
            const qtyDatang = Number(it.qtyDatang) || 0;
            const pct = qtyPO > 0 ? Math.min(100, Math.round((qtyDatang / qtyPO) * 100)) : 0;
            return (
              <div key={it.itemNo || idx} className="py-2.5 first:pt-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-slate-800 truncate"><span className="text-slate-400 font-medium mr-1.5">#{String(it.itemNo || idx + 1).padStart(2, '0')}</span>{it.nama}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{it.size ? `${it.size} · ` : ''}{it.satuan || 'Pack'}{it.tglRencana ? ` · Rencana ${it.tglRencana}` : ''}</p>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${col.text} ${col.bg}`}>{st}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full transition-all duration-500 ${col.bar}`} style={{ width: `${pct}%` }} /></div>
                  <span className="text-[10px] text-slate-500 tabular-nums shrink-0">{qtyDatang}/{qtyPO}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function reminderWithEmoji(hour) {
  if (hour >= 4 && hour < 10) return { text: 'Cek kedatangan barang ya ☀️📦', sub: 'Semangat pagi! Pastikan stok masuk tercatat.' };
  if (hour >= 10 && hour < 15) return { text: 'Jangan lupa input barang datang 📝✨', sub: 'Data real-time bikin operasional lebih lancar.' };
  if (hour >= 15 && hour < 18) return { text: 'Pengeluaran hari ini sudah diinput? 🧾💪', sub: 'Satu langkah kecil, stok tetap akurat.' };
  return { text: 'Jangan lupa input data real-time ya 🌙✨', sub: 'Istirahat cukup, data tetap rapi.' };
}

export default function DashboardPage() {
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const { user } = useAuth();
  const [poData, setPoData] = useState(null);
  const [poLoading, setPoLoading] = useState(true);
  const [poError, setPoError] = useState(null);
  const allItems = useMemo(() => [...(stockCV.items || []), ...(stockPT.items || [])], [stockCV.items, stockPT.items]);
  const stats = useMemo(() => {
    const total = allItems.length;
    let aman = 0, waspada = 0, kritis = 0, totalUnit = 0;
    allItems.forEach((it) => {
      const s = Number(it.stok) || 0;
      totalUnit += s;
      const a = Number(it.stockAman ?? it.aman ?? 0);
      if (a > 0) {
        if (s <= 0 || s <= Math.max(5, Math.floor(a * 0.25))) kritis += 1;
        else if (s < a) waspada += 1;
        else aman += 1;
      } else {
        if (s <= 5) kritis += 1;
        else if (s <= 20) waspada += 1;
        else aman += 1;
      }
    });
    return { total, aman, waspada, kritis, totalUnit };
  }, [allItems]);
  const loadPO = useCallback(async () => {
    setPoLoading(true); setPoError(null);
    try {
      const res = await getStatusPO();
      const norm = normalizeStatusPO(res);
      if (norm && norm.success) { setPoData(norm); setPoError(null); }
      else { setPoData(null); setPoError(norm?.error || res?.error || 'Gagal memuat Status PO'); }
    } catch (err) {
      setPoError(err?.message || 'Gagal memuat Status PO'); setPoData(null);
    } finally { setPoLoading(false); }
  }, []);
  useEffect(() => { loadPO(); const t = setInterval(loadPO, 60000); return () => clearInterval(t); }, [loadPO]);
  const pending = getPendingQueue().length;
  const hour = new Date().getHours();
  const firstName = (user?.name || 'Rudi').split(' ')[0];
  let greeting = 'Selamat malam';
  if (hour >= 4 && hour < 10) greeting = 'Selamat pagi';
  else if (hour >= 10 && hour < 15) greeting = 'Selamat siang';
  else if (hour >= 15 && hour < 18) greeting = 'Selamat sore';
  const { text: reminderText, sub: reminderSub } = reminderWithEmoji(hour);
  const pct = (n) => (stats.total ? Math.round((n / stats.total) * 100) : 0);

  return (
    <div className="pb-6 animate-fade-in space-y-3">
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-3.5">
        <div className="flex items-center gap-3">
          <Avatar name={user?.name || 'Rudi Virawan'} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-800 truncate leading-tight">{user?.name || 'Rudi Virawan'}</p>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">{EMAIL}</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-base font-bold text-slate-800">{greeting}, {firstName} 👋</p>
          <p className="text-[13px] font-semibold text-cyan-700 mt-1 leading-snug">{reminderText}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{reminderSub}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-3.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Total Item</p>
            <div className="w-8 h-8 rounded-xl bg-cyan-50 flex items-center justify-center"><Package className="w-4 h-4 text-cyan-600" /></div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-slate-800 leading-none">{stats.total}</p>
          <p className="text-[10px] text-slate-400 mt-1.5">Semua Entitas CV & PT</p>
        </div>
        <div className="rounded-2xl bg-white border border-red-100 shadow-sm p-3.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide">Kritis</p>
            <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center"><ShieldAlert className="w-4 h-4 text-red-500" /></div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-red-600 leading-none">{stats.kritis}<span className="text-sm font-semibold text-red-500/80 ml-1">({pct(stats.kritis)}%)</span></p>
          <p className="text-[10px] text-red-500/80 mt-1.5">Stok di bawah batas minimal</p>
        </div>
        <div className="rounded-2xl bg-white border border-amber-100 shadow-sm p-3.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Waspada</p>
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center"><AlertCircle className="w-4 h-4 text-amber-500" /></div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-amber-600 leading-none">{stats.waspada}<span className="text-sm font-semibold text-amber-500/80 ml-1">({pct(stats.waspada)}%)</span></p>
          <p className="text-[10px] text-amber-600/80 mt-1.5">Mendekati ambang batas</p>
        </div>
        <div className="rounded-2xl bg-white border border-emerald-100 shadow-sm p-3.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">Aman</p>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-emerald-500" /></div>
          </div>
          <p className="text-2xl font-bold tabular-nums text-emerald-600 leading-none">{stats.aman}<span className="text-sm font-semibold text-emerald-500/80 ml-1">({pct(stats.aman)}%)</span></p>
          <p className="text-[10px] text-emerald-600/80 mt-1.5">Kapasitas stok tercukupi</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-cyan-50 flex items-center justify-center"><Package className="w-4 h-4 text-cyan-600" /></div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Analisa Stok CV & PT</h3>
            <p className="text-[10px] text-slate-400">Perbandingan status per entitas</p>
          </div>
        </div>
        <EntityStockChart cvItems={stockCV.items} ptItems={stockPT.items} />
      </div>

      <StatusPOCard data={poData} loading={poLoading} error={poError} onRefresh={loadPO} />

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-cyan-50 flex items-center justify-center"><Package className="w-4 h-4 text-cyan-600" /></div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Status Stok Per Divisi</h3>
            <p className="text-[10px] text-slate-400">Aman · Waspada · Kritis</p>
          </div>
        </div>
        <DivisionStatusBars items={allItems} />
      </div>

      {pending > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-[11px] text-amber-800"><b>{pending}</b> transaksi menunggu sync — buka Atur</span>
        </div>
      )}
    </div>
  );
}
