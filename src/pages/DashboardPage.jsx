import { useMemo, useState, useEffect, useCallback } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import {
  getPendingQueue, getStatusPO, getDashboardData, confirmPOStatus, getTransactionHistory, fetchRemoteTransactionHistory,
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

function DivisionStatus3D({ items, sourceRows }) {
  const rows = useMemo(() => {
    if (Array.isArray(sourceRows) && sourceRows.length > 0) {
      return sourceRows.map((r) => ({
        divisi: r.divisi || r.division || 'LAINNYA',
        total: Number(r.total || r.totalItem || 0) || 0,
        aman: Number(r.aman || 0) || 0,
        waspada: Number(r.waspada || 0) || 0,
        kritis: Number(r.kritis || 0) || 0,
      })).filter((r) => r.total > 0);
    }
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
  }, [items, sourceRows]);

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

function normalizeMatch(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function mergeIncomingWithPO(poData, history) {
  if (!poData?.items?.length || !history?.length) return poData;
  const arrivals = new Map();
  for (const entry of history) {
    const type = String(entry?.type || entry?.jenis || entry?.action || '').toLowerCase();
    if (!type.includes('masuk')) continue;
    const rows = Array.isArray(entry?.items) ? entry.items : [entry];
    for (const row of rows) {
      const key = normalizeMatch(row?.kode || row?.kodeBarang || row?.itemNo || row?.nama || row?.name);
      if (!key) continue;
      const qty = Number(row?.qty ?? row?.quantity ?? row?.jumlah ?? 0) || 0;
      arrivals.set(key, (arrivals.get(key) || 0) + qty);
    }
  }
  if (!arrivals.size) return poData;
  const items = poData.items.map((item) => {
    const key = normalizeMatch(item.kode || item.kodeBarang || item.itemNo || item.nama);
    const extra = arrivals.get(key) || 0;
    if (!extra) return item;
    const qtyDatang = Math.max(Number(item.qtyDatang) || 0, extra);
    const qtyPO = Number(item.qtyPO) || 0;
    const status = qtyPO > 0 && qtyDatang >= qtyPO ? 'Selesai' : 'Sebagian';
    return { ...item, qtyDatang, status };
  });
  const summary = items.reduce((acc, item) => {
    if (item.status === 'Selesai') acc.itemSelesai += 1;
    else if (item.status === 'Sebagian') acc.itemSebagian += 1;
    else acc.itemMenunggu += 1;
    return acc;
  }, { itemMenunggu: 0, itemSebagian: 0, itemSelesai: 0 });
  return { ...poData, items, summary: { ...poData.summary, ...summary, totalAktif: summary.itemMenunggu + summary.itemSebagian, totalKonfirmasi: summary.itemSelesai } };
}

function normalizeStatusPO(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ok = raw.success === true || raw.status === 'OK' || raw.status === 'ok' || raw.status === 'APPLIED';
  if (!ok) return { success: false, error: raw.error || 'Gagal memuat Status PO' };
  const itemsRaw = raw.items || raw.data?.items || raw.list || [];
  const items = (Array.isArray(itemsRaw) ? itemsRaw : []).map((it, idx) => {
    const statusRaw = String(it.status || it.Status || it.statusPO || it.statusPo || '').trim();
    const qtyPO = Number(it.qtyPO ?? it.qty ?? it.quantity ?? 0) || 0;
    const qtyDatang = Number(it.qtyDatang ?? it.datang ?? it.received ?? it.qtyReceived ?? 0) || 0;
    let status = statusRaw || (qtyPO > 0 && qtyDatang >= qtyPO ? 'Selesai' : qtyDatang > 0 ? 'Sebagian' : 'Menunggu');
    const low = status.toLowerCase();
    if (low.includes('sebagian') || low.includes('progress') || low.includes('partial')) status = 'Sebagian';
    else if (low.includes('selesai') || low === 'datang' || low.includes('complete') || low.includes('received')) status = 'Selesai';
    else if (low.includes('belum') || low.includes('menunggu') || low.includes('pending') || low.includes('waiting')) status = 'Menunggu';
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
    weekKey: raw.weekKey || raw.week || raw.data?.weekKey || '',
    poStartDate: raw.poStartDate || raw.data?.poStartDate || '',
    poEndDate: raw.poEndDate || raw.data?.poEndDate || '',
    previousWeek: raw.previousWeek || raw.previous || raw.lastWeek || raw.data?.previousWeek || null,
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

function Movement7Days({ history }) {
  const days = useMemo(() => {
    const now = new Date();
    const out = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
      let masuk = 0; let keluar = 0;
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

  return (
    <div className="dashboard-chart-wrap">
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <p className="text-sm font-extrabold text-slate-900">Analisa</p>
          <p className="text-[11px] text-slate-500">Pergerakan barang 7 hari terakhir</p>
        </div>
        <span className="text-[10px] font-bold text-cyan-700 bg-cyan-50 border border-cyan-100 rounded-full px-2 py-1">7 HARI</span>
      </div>
      <div className="relative h-36 rounded-xl bg-slate-50/80 border border-slate-100 px-2 pt-3 pb-1 overflow-hidden">
        <div className="absolute inset-x-2 top-8 border-t border-slate-200/80" />
        <div className="absolute inset-x-2 top-16 border-t border-slate-200/80" />
        <div className="absolute inset-x-2 top-24 border-t border-slate-200/80" />
        <div className="relative h-full flex items-end gap-1.5">
          {days.map((d) => {
            const max = Math.max(1, ...days.flatMap((x) => [x.masuk, x.keluar]));
            const hIn = Math.max(3, (d.masuk / max) * 92);
            const hOut = Math.max(3, (d.keluar / max) * 92);
            return (
              <div key={d.label} className="flex-1 h-full flex flex-col justify-end items-center gap-1">
                <div className="w-full flex items-end justify-center gap-0.5 h-24">
                  <div className="w-2.5 max-w-[38%] rounded-t-md bg-cyan-500/85" style={{ height: hIn }} title={`Masuk ${d.masuk}`} />
                  <div className="w-2.5 max-w-[38%] rounded-t-md bg-orange-400/90" style={{ height: hOut }} title={`Keluar ${d.keluar}`} />
                </div>
                <span className="text-[9px] font-semibold text-slate-500 uppercase">{d.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-center gap-4 mt-2">
        <span className="text-[10px] font-semibold text-cyan-700"><i className="inline-block w-2 h-2 rounded-sm bg-cyan-500 mr-1" />Masuk</span>
        <span className="text-[10px] font-semibold text-orange-600"><i className="inline-block w-2 h-2 rounded-sm bg-orange-400 mr-1" />Keluar</span>
      </div>
    </div>
  );
}

function StockComparison({ cv, pt }) {
  const total = Math.max(1, (cv?.unit || 0) + (pt?.unit || 0));
  const cvPct = Math.round(((cv?.unit || 0) / total) * 100);
  const ptPct = 100 - cvPct;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-extrabold text-slate-900">Perbandingan Stock</p>
          <p className="text-[11px] text-slate-500">Komposisi stock CV dan PT</p>
        </div>
        <Package className="w-4 h-4 text-cyan-600" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3 text-center">
          <div className="mx-auto w-16 h-16 rounded-full p-[6px]" style={{ background: `conic-gradient(#06b6d4 ${cvPct * 3.6}deg, #dbeafe 0deg)` }}>
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
              <span className="text-base font-extrabold text-cyan-700 tabular-nums">{cvPct}%</span>
            </div>
          </div>
          <p className="text-xs font-extrabold text-slate-800 mt-2">CV</p>
          <p className="text-[10px] text-slate-500 tabular-nums">{(cv?.unit || 0).toLocaleString('id-ID')} unit</p>
        </div>
        <div className="rounded-xl bg-orange-50 border border-orange-100 p-3 text-center">
          <div className="mx-auto w-16 h-16 rounded-full p-[6px]" style={{ background: `conic-gradient(#f59e0b ${ptPct * 3.6}deg, #ffedd5 0deg)` }}>
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
              <span className="text-base font-extrabold text-orange-700 tabular-nums">{ptPct}%</span>
            </div>
          </div>
          <p className="text-xs font-extrabold text-slate-800 mt-2">PT</p>
          <p className="text-[10px] text-slate-500 tabular-nums">{(pt?.unit || 0).toLocaleString('id-ID')} unit</p>
        </div>
      </div>
    </div>
  );
}

function DashboardTotals({ totalItem }) {
  const itemCount = totalItem || 191;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="dashboard-total-card border-cyan-100">
        <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">Total Item</p>
        <p className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1">{itemCount}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">SKU aktif</p>
      </div>
      <div className="dashboard-total-card border-orange-100">
        <p className="text-[10px] font-bold uppercase tracking-wider text-orange-700">Total Outlet</p>
        <p className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1">45</p>
        <p className="text-[10px] text-slate-500 mt-0.5">Outlet terlayani</p>
      </div>
    </div>
  );
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
            <h3 className="text-sm font-bold text-slate-800">Status PO Aktif</h3>
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
            <h3 className="text-sm font-bold text-slate-800">Status PO Aktif</h3>
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
    <div className="dashboard-po-card rounded-2xl bg-white border border-slate-100 shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800">Status PO Minggu Ini</h3>
            <p className="text-[11px] text-slate-500 truncate">
              {data.weekKey ? `${data.weekKey} · ` : ''}{data.noPO ? `No. PO ${data.noPO}` : 'PO aktif'} · {totalItem} item
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
          <p className="text-[11px] font-semibold text-emerald-700">Datang</p>
          <p className="text-lg font-extrabold text-emerald-700 tabular-nums">{pct(selesai)}%</p>
          <p className="text-[10px] text-emerald-600/80 tabular-nums">{selesai} item</p>
        </div>
        <div className="rounded-xl bg-amber-50 px-2 py-2.5 text-center">
          <p className="text-[11px] font-semibold text-amber-700">Sebagian</p>
          <p className="text-lg font-extrabold text-amber-700 tabular-nums">{pct(sebagian)}%</p>
          <p className="text-[10px] text-amber-600/80 tabular-nums">{sebagian} item</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-2 py-2.5 text-center">
          <p className="text-[11px] font-semibold text-slate-600">Belum</p>
          <p className="text-lg font-extrabold text-slate-700 tabular-nums">{pct(menunggu)}%</p>
          <p className="text-[10px] text-slate-500 tabular-nums">{menunggu} item</p>
        </div>
      </div>

      {items.length > 0 && (
        <div className="space-y-0 divide-y divide-slate-100">
          {items.map((it, idx) => {
            const badge =
              it.status === 'Selesai'
                ? 'bg-emerald-50 text-emerald-700'
                : it.status === 'Sebagian'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-slate-50 text-slate-600';
            const barPct = it.qtyPO > 0 ? Math.min(100, Math.round((it.qtyDatang / it.qtyPO) * 100)) : 0;
            const isBusy = confirmingId === it.id;
            return (
              <div key={it.id || idx} className="py-3 first:pt-0">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-slate-800 truncate">
                      <span className="text-slate-400 font-semibold mr-1">#{String(it.itemNo || idx + 1).padStart(2, '0')}</span>
                      {it.nama}
                    </p>
                    <p className="text-[11px] text-slate-500">{it.satuan}{it.size ? ` · ${it.size}` : ''} · {it.qtyDatang}/{it.qtyPO}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badge}`}>{it.status}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full ${it.status === 'Selesai' ? 'bg-emerald-500' : it.status === 'Sebagian' ? 'bg-amber-400' : 'bg-slate-300'}`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onConfirm?.(it, 'Selesai', it.qtyPO || it.qtyDatang)}
                    className="flex-1 text-[10px] font-bold py-1.5 rounded-lg bg-emerald-600 text-white active:scale-95 disabled:opacity-50"
                  >
                    {isBusy ? '…' : 'Datang'}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onConfirm?.(it, 'Sebagian', Math.max(1, Math.floor((it.qtyPO || 1) / 2)))}
                    className="flex-1 text-[10px] font-bold py-1.5 rounded-lg bg-amber-500 text-white active:scale-95 disabled:opacity-50"
                  >
                    Sebagian
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onConfirm?.(it, 'Menunggu', 0)}
                    className="flex-1 text-[10px] font-bold py-1.5 rounded-lg bg-slate-200 text-slate-700 active:scale-95 disabled:opacity-50"
                  >
                    Belum
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {(() => {
        const previous = data.previousWeek || data.previous || data.lastWeek;
        const previousItems = Array.isArray(previous?.items) ? previous.items : [];
        if (!previous || previousItems.length === 0) return null;
        return (
          <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700">Status PO Minggu Lalu</p>
                <p className="text-[10px] text-slate-500">{previous.weekKey || 'Snapshot sebelumnya'} · belum selesai</p>
              </div>
              <span className="status-pill status-pill-neutral">{previousItems.length} item</span>
            </div>
            <div className="space-y-1.5">
              {previousItems.slice(0, 6).map((it, idx) => (
                <div key={`${it.itemNo || idx}-${it.nama || ''}`} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate text-slate-700">#{it.itemNo || idx + 1} {it.nama || '—'}</span>
                  <span className="shrink-0 font-bold tabular-nums text-slate-600">{Number(it.qtyDatang || 0)}/{Number(it.qtyPO || 0)}</span>
                </div>
              ))}
            </div>
            {previousItems.length > 6 && <p className="mt-2 text-[10px] text-slate-500">+{previousItems.length - 6} item lainnya</p>}
          </div>
        );
      })()}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  // HARD SAFETY: backend menerima getAllStock untuk CV/PT secara terpisah.
  // Dashboard tidak pernah meminta entitas "ALL" dan tidak pernah menulis ke
  // Stock CV / Stock PT. Kedua sheet hanya menjadi sumber data baca.
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const allItems = useMemo(() => [...(stockCV.items || []), ...(stockPT.items || [])], [stockCV.items, stockPT.items]);
  const loading = stockCV.loading || stockPT.loading;
  const refresh = useCallback(() => {
    void stockCV.refresh({ force: true });
    void stockPT.refresh({ force: true });
  }, [stockCV.refresh, stockPT.refresh]);

  const [poData, setPoData] = useState(null);
  const [poLoading, setPoLoading] = useState(true);
  const [poError, setPoError] = useState('');
  const [dashboardData, setDashboardData] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [confirmMsg, setConfirmMsg] = useState('');
  const [history, setHistory] = useState(() => getTransactionHistory());
  const loadMovementHistory = useCallback(async () => {
    const local = getTransactionHistory();
    setHistory(local);
    if (!navigator.onLine) return;
    try {
      const remote = await fetchRemoteTransactionHistory(7);
      const merged = [...remote, ...local];
      const seen = new Set();
      const unique = merged.filter((entry) => {
        const itemsQty = Array.isArray(entry?.items)
          ? entry.items.reduce((sum, it) => sum + (Number(it?.qty ?? it?.quantity ?? it?.jumlah ?? 0) || 0), 0)
          : (Number(entry?.qty ?? entry?.quantity ?? entry?.jumlah ?? 0) || 0);
        const id = entry?.transactionId || entry?.requestId;
        const time = entry?.at || entry?.timestamp || entry?.time || entry?.createdAt || '';
        const type = String(entry?.type || entry?.jenis || entry?.action || '').toLowerCase();
        const key = id ? String(id) : String(time) + '|' + type + '|' + itemsQty;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setHistory(unique);
    } catch (_) {
      // Backend analytics is read-only; keep local history if it is unavailable.
    }
  }, []);

  useEffect(() => {
    const refreshHistory = () => { setHistory(getTransactionHistory()); void loadMovementHistory(); };
    window.addEventListener('gudangai-history-changed', refreshHistory);
    void loadMovementHistory();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void loadMovementHistory();
    }, 60000);
    const onOnline = () => { void loadMovementHistory(); };
    document.addEventListener('visibilitychange', refreshHistory);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('gudangai-history-changed', refreshHistory);
      document.removeEventListener('visibilitychange', refreshHistory);
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
  }, [loadMovementHistory]);

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
      const [res, remoteHistory] = await Promise.all([
        getStatusPO(),
        fetchRemoteTransactionHistory(31).catch(() => []),
      ]);
      const norm = normalizeStatusPO(res);
      const synced = norm?.success ? mergeIncomingWithPO(norm, remoteHistory) : norm;
      if (synced?.success) setPoData(synced);
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

  const loadDashboardData = useCallback(async () => {
    try {
      const res = await getDashboardData();
      if (res?.success) setDashboardData(res);
    } catch (_) {
      // The local stock view remains available if the read-only aggregate is unavailable.
    }
  }, []);

  useEffect(() => {
    void loadPO();
    void loadDashboardData();
    const refreshPO = () => { if (document.visibilityState === 'visible' && navigator.onLine) void loadPO(); };
    const timer = setInterval(refreshPO, 15000);
    const dashboardTimer = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) void loadDashboardData(); }, 15000);
    window.addEventListener('online', refreshPO);
    window.addEventListener('gudangai-po-changed', refreshPO);
    document.addEventListener('visibilitychange', refreshPO);
    return () => {
      clearInterval(timer);
      clearInterval(dashboardTimer);
      window.removeEventListener('online', refreshPO);
      window.removeEventListener('gudangai-po-changed', refreshPO);
      document.removeEventListener('visibilitychange', refreshPO);
    };
  }, [loadPO, loadDashboardData]);

  const handleConfirm = useCallback(async (item, status = 'Selesai', qtyDatang) => {
    if (!item) return;
    setConfirmingId(item.id);
    setConfirmMsg('');
    const finalQty = qtyDatang != null ? qtyDatang : (status === 'Selesai' ? (item.qtyPO || item.qtyDatang) : status === 'Menunggu' ? 0 : item.qtyDatang);
    try {
      const res = await confirmPOStatus({
        itemNo: item.itemNo,
        nama: item.nama,
        noPO: poData?.noPO,
        status,
        qtyDatang: finalQty,
      });
      if (res?.success || res?.status === 'OK' || res?.status === 'APPLIED') {
        const label = status === 'Selesai' ? 'Datang' : status === 'Sebagian' ? 'Sebagian' : 'Belum';
        setConfirmMsg(`✓ ${item.nama} → ${label}`);
        try { window.dispatchEvent(new CustomEvent('gudangai-po-changed', { detail: { item, status, qtyDatang: finalQty } })); } catch (_) {}
        await Promise.all([loadPO(), stockCV.refresh({ force: true }), stockPT.refresh({ force: true })]);
      } else {
        setConfirmMsg(res?.error || 'Gagal update status');
      }
    } catch (err) {
      setConfirmMsg(err?.message || 'Gagal update status');
    } finally {
      setConfirmingId(null);
      setTimeout(() => setConfirmMsg(''), 3200);
    }
  }, [loadPO, poData?.noPO, stockCV.refresh, stockPT.refresh]);

  const pending = useMemo(() => {
    try {
      const q = getPendingQueue() || [];
      return q.reduce((n, e) => n + (e.items?.length || 0), 0);
    } catch { return 0; }
  }, [allItems, poData]);

  const hour = new Date().getHours();
  let greeting = 'Halo';
  let reminder = 'Siap bekerja.';
  if (hour >= 4 && hour < 10) { greeting = 'Selamat pagi'; reminder = 'Cek kedatangan barang hari ini.'; }
  else if (hour >= 10 && hour < 15) { greeting = 'Selamat siang'; reminder = 'Jangan lupa input barang datang.'; }
  else if (hour >= 15 && hour < 18) { greeting = 'Selamat sore'; reminder = 'Pastikan pengeluaran sudah diinput.'; }
  else { greeting = 'Selamat malam'; reminder = 'Pastikan data hari ini sudah lengkap.'; }

  const name = user?.name || user?.nama || 'Rudi';

  return (
    <div className="px-3 pt-3 pb-24 space-y-3 max-w-lg mx-auto">
      <div className="rounded-2xl bg-gradient-to-br from-cyan-50 via-white to-violet-50 border border-cyan-100 shadow-sm px-4 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold text-cyan-700 tracking-wide flex items-center gap-1.5">
              <span className="text-base leading-none">{hour >= 4 && hour < 10 ? '🌅' : hour >= 10 && hour < 15 ? '☀️' : hour >= 15 && hour < 18 ? '🌤️' : '🌙'}</span>
              {greeting}
            </p>
            <h1 className="text-2xl font-extrabold text-slate-900 truncate mt-1 leading-tight">{name} 👋</h1>
            <p className="text-[13px] text-slate-700 mt-2 leading-snug font-medium">✨ {reminder}</p>
          </div>
          <button
            type="button"
            onClick={() => { refresh?.(); loadPO(); loadDashboardData(); }}
            className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0 active:scale-95"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {confirmMsg && (
          <p className="mt-2.5 text-[12px] font-semibold text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5">{confirmMsg}</p>
        )}
      </div>

      <section className="space-y-3" aria-label="Analisa beranda">
        <div className="dashboard-panel rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
          <Movement7Days history={history} />
        </div>
        <div className="dashboard-panel rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
          <StockComparison cv={stats.cv} pt={stats.pt} />
        </div>
        <DashboardTotals totalItem={stats.total} />
      </section>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Status Stok per Divisi</p>
        <DivisionStatus3D items={allItems} sourceRows={dashboardData?.statusPerDivisi} />
      </div>

      <StatusPOCard
        data={poData}
        loading={poLoading}
        error={poError}
        onRefresh={loadPO}
        onConfirm={handleConfirm}
        confirmingId={confirmingId}
      />

      {pending > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-[12px] text-amber-800 font-medium">
          {pending} item menunggu sinkronisasi di Antrian.
        </div>
      )}
    </div>
  );
}
