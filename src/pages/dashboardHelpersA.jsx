import { useMemo } from 'react';
import { DIVISIONS } from '../data/master';
import { classifyStockLevel } from '../data/stockStatus';

export function classifyItem(it) {
  return classifyStockLevel(it.stok ?? it.stockAkhir ?? 0);
}

export function formatSpreadsheetTimestamp(value) {
  if (value === undefined || value === null || value === '') return 'Belum dikirim oleh API spreadsheet';
  let milliseconds;
  if (value instanceof Date) milliseconds = value.getTime();
  else if (typeof value === 'number') {
    if (value >= 1e12) milliseconds = value;
    else if (value >= 1e9) milliseconds = value * 1000;
    else return String(value);
  } else {
    milliseconds = Date.parse(String(value));
  }
  if (!Number.isFinite(milliseconds)) return String(value);
  try {
    return `${new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta',
    }).format(new Date(milliseconds))} WIB`;
  } catch (_) {
    return new Date(milliseconds).toLocaleString('id-ID');
  }
}

export function RingChart({ pct, color = '#ef4444', size = 52, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(100, pct)) / 100 * c;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`} />
    </svg>
  );
}

export function DonutPO({ complete = 0, progress = 0, pending = 0, size = 140 }) {
  const total = Math.max(1, complete + progress + pending);
  const center = Math.round(((complete + progress * 0.5) / total) * 100);
  return (
    <div className="flex flex-col items-center">
      <p className="text-3xl font-extrabold text-slate-900 tabular-nums">{complete + progress + pending > 0 ? center : '—'}</p>
      <p className="text-[11px] text-slate-500 font-semibold">Progress PO</p>
      <div className="flex gap-3 mt-2 text-[10px] font-bold">
        <span className="text-teal-700">Datang {complete}</span>
        <span className="text-amber-700">Sebagian {progress}</span>
        <span className="text-slate-500">Belum {pending}</span>
      </div>
    </div>
  );
}

export function DivisionStatus3D({ items = [], sourceRows = [] }) {
  const rows = useMemo(() => {
    const map = {};
    DIVISIONS.forEach((d) => { map[d] = { divisi: d, total: 0, aman: 0, waspada: 0, kritis: 0 }; });
    (items || []).forEach((it) => {
      const d = String(it.divisi || 'LAINNYA').trim() || 'LAINNYA';
      if (!map[d]) map[d] = { divisi: d, total: 0, aman: 0, waspada: 0, kritis: 0 };
      map[d].total += 1;
      map[d][classifyItem(it)] += 1;
    });
    return Object.values(map).filter((r) => r.total > 0).sort((a, b) => b.kritis - a.kritis);
  }, [items]);
  if (!rows.length) return <p className="text-[12px] text-slate-400 text-center py-4">Belum ada data divisi</p>;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-slate-800">Status per Divisi</h3>
      {rows.map((r) => (
        <div key={r.divisi} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-xs">
          <span className="font-bold uppercase">{r.divisi}</span>
          <span className="tabular-nums text-slate-500">{r.total} SKU · <span className="text-red-600">{r.kritis} kritis</span></span>
        </div>
      ))}
    </div>
  );
}

export function normalizeMatch(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function mergeIncomingWithPO(poData) {
  return poData;
}

export function normalizeStatusPO(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const itemsRaw = raw.items || raw.data?.items || raw.list || [];
  const hasItems = Array.isArray(itemsRaw) && itemsRaw.length > 0;
  const ok = raw.success === true || raw.status === 'OK' || hasItems;
  if (!ok) return { success: false, error: raw.error || raw.message || 'Gagal memuat Status PO' };
  const items = (Array.isArray(itemsRaw) ? itemsRaw : []).map((it, idx) => ({
    itemNo: it.itemNo || idx + 1,
    nama: String(it.nama || it.Nama || it.name || '—'),
    qtyPO: Number(it.qtyPO || it.totalPO || it.qty || 0) || 0,
    qtyDatang: Number(it.qtyDatang || it.datang || 0) || 0,
    status: String(it.status || 'Menunggu'),
    id: it.id || ('po-' + idx),
  }));
  let menunggu = 0, sebagian = 0, selesai = 0;
  for (const it of items) {
    const s = it.status.toLowerCase();
    if (s.includes('selesai') || s === 'datang') selesai += 1;
    else if (s.includes('sebagian')) sebagian += 1;
    else menunggu += 1;
  }
  return {
    success: true,
    items,
    summary: { totalItem: items.length, itemMenunggu: menunggu, itemSebagian: sebagian, itemSelesai: selesai, totalAktif: menunggu + sebagian, totalKonfirmasi: selesai },
  };
}

export function getPODataSignature(data) {
  if (!data) return '';
  return JSON.stringify({ n: data?.items?.length || 0, s: data?.summary || {} });
}
