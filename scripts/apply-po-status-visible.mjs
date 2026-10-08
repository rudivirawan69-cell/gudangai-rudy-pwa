/**
 * Surgical Dashboard-only: Status PO harus tampil dari getStatusPO.
 * - parse totalPO/poCV/poPT (string/angka)
 * - jangan kosongkan list lewat week-split
 * - jangan filter ketat qtyPO>0
 * TIDAK menyentuh InputPage / write path.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src/pages/DashboardPage.jsx');
let s = fs.readFileSync(file, 'utf8');

const marker = 'function normalizeStatusPO(raw) {';
const start = s.indexOf(marker);
if (start < 0) throw new Error('normalizeStatusPO not found');

let i = start + marker.length;
let depth = 1;
let inStr = null;
let prev = '';
for (; i < s.length; i++) {
  const c = s[i];
  if (inStr) {
    if (c === inStr && prev !== '\\') inStr = null;
  } else if (c === '"' || c === "'" || c === '`') {
    inStr = c;
  } else if (c === '{') depth++;
  else if (c === '}') {
    depth--;
    if (depth === 0) { i++; break; }
  }
  prev = c;
}
const end = i;

const newFn = `function normalizeStatusPO(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const itemsRaw = raw.items || raw.data?.items || raw.list || [];
  const hasItems = Array.isArray(itemsRaw) && itemsRaw.length > 0;
  const ok = raw.success === true || raw.status === 'OK' || raw.status === 'ok' || raw.status === 'APPLIED' || hasItems;
  if (!ok) return { success: false, error: raw.error || raw.message || 'Gagal memuat Status PO' };

  const toQty = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const s0 = String(v ?? '').trim();
    if (!s0) return 0;
    const normalized = s0.includes(',') && !s0.includes('.')
      ? s0.replace(',', '.')
      : s0.replace(/\\./g, '').replace(',', '.');
    const n = Number(normalized.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  const mapItem = (it, idx) => {
    const statusRaw = String(it.status || it.Status || it.statusPO || it.statusPo || '').trim();
    const qtyPO = toQty(
      it.qtyPO ?? it.totalPO ?? it.total ?? it.qty ?? it.quantity ??
      ((toQty(it.poCV) || 0) + (toQty(it.poPT) || 0))
    );
    const qtyDatang = toQty(it.qtyDatang ?? it.datang ?? it.received ?? it.qtyReceived ?? 0);
    let status = statusRaw || (qtyPO > 0 && qtyDatang >= qtyPO ? 'Selesai' : qtyDatang > 0 ? 'Sebagian' : 'Menunggu');
    const low = status.toLowerCase();
    if (low.includes('sebagian') || low.includes('progress') || low.includes('partial')) status = 'Sebagian';
    else if (low.includes('selesai') || low === 'datang' || low.includes('complete') || low.includes('received')) status = 'Selesai';
    else if (low.includes('belum') || low.includes('menunggu') || low.includes('pending') || low.includes('waiting')) status = 'Menunggu';
    const nama = String(it.nama || it.Nama || it.name || '').trim();
    return {
      itemNo: it.itemNo || it.no || idx + 1,
      nama: nama || '\u2014',
      size: it.size || '',
      satuan: it.satuan || 'Pack',
      tglRencana: it.tglRencana || it.tglKedatangan || it.tanggalPO || '',
      qtyPO,
      qtyDatang,
      status,
      id: it.id || it.itemId || it.clientItemId || ('po-' + idx),
    };
  };

  let items = (Array.isArray(itemsRaw) ? itemsRaw : []).map(mapItem)
    .filter((it) => it.nama && it.nama !== '\u2014');

  const summaryRaw = raw.summary || raw.data?.summary || {};
  let menunggu = toQty(summaryRaw.itemMenunggu ?? summaryRaw.menunggu ?? 0);
  let sebagian = toQty(summaryRaw.itemSebagian ?? summaryRaw.sebagian ?? 0);
  let selesai = toQty(summaryRaw.itemSelesai ?? summaryRaw.selesai ?? 0);
  if (items.length && menunggu + sebagian + selesai === 0) {
    for (const it of items) {
      if (it.status === 'Selesai') selesai += 1;
      else if (it.status === 'Sebagian') sebagian += 1;
      else menunggu += 1;
    }
  }

  const previousRaw = raw.previousWeek || raw.previous || raw.lastWeek || raw.data?.previousWeek || null;
  let previousWeek = previousRaw && typeof previousRaw === 'object' ? {
    weekKey: String(previousRaw.weekKey || previousRaw.week || ''),
    noPO: previousRaw.noPO || '',
    items: (Array.isArray(previousRaw.items) ? previousRaw.items : []).map(mapItem).filter((it) => it.nama && it.nama !== '\u2014'),
    summary: previousRaw.summary || null,
  } : null;
  if (previousWeek && !previousWeek.items.length) previousWeek = null;

  if (!previousWeek && items.length) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7);
    const nextStart = new Date(start); nextStart.setDate(nextStart.getDate() + 7);
    const toDate = (v) => {
      if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
      const str = String(v || '').trim();
      const m = str.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})$/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const t = Date.parse(str);
      return Number.isFinite(t) ? new Date(t) : null;
    };
    const currentItems = [];
    const oldItems = [];
    let dated = 0;
    for (const it of items) {
      const d = toDate(it.tglRencana);
      if (!d) continue;
      dated += 1;
      if (d >= prevStart && d < start) oldItems.push(it);
      else if (d >= start && d < nextStart) currentItems.push(it);
    }
    if (dated > 0 && currentItems.length > 0) {
      items = currentItems;
      menunggu = 0; sebagian = 0; selesai = 0;
      for (const it of items) {
        if (it.status === 'Selesai') selesai += 1;
        else if (it.status === 'Sebagian') sebagian += 1;
        else menunggu += 1;
      }
      if (oldItems.length) {
        previousWeek = {
          weekKey: 'Minggu Lalu',
          items: oldItems,
          summary: oldItems.reduce((acc, it) => {
            if (it.status === 'Selesai') acc.itemSelesai += 1;
            else if (it.status === 'Sebagian') acc.itemSebagian += 1;
            else acc.itemMenunggu += 1;
            acc.totalItem += 1;
            return acc;
          }, { totalItem: 0, itemMenunggu: 0, itemSebagian: 0, itemSelesai: 0 }),
        };
      }
    }
  }

  const finalTotalItem = items.length || toQty(summaryRaw.totalItem) || (menunggu + sebagian + selesai);
  return {
    success: true,
    noPO: raw.noPO || summaryRaw.noPO || '',
    weekKey: raw.weekKey || raw.week || raw.data?.weekKey || '',
    poStartDate: raw.poStartDate || raw.data?.poStartDate || '',
    poEndDate: raw.poEndDate || raw.data?.poEndDate || '',
    tanggalPO: raw.tanggalPO || '',
    previousWeek,
    items,
    summary: {
      totalItem: finalTotalItem,
      itemMenunggu: menunggu,
      itemSebagian: sebagian,
      itemSelesai: selesai,
      totalAktif: menunggu + sebagian,
      totalKonfirmasi: selesai,
      totalPOQty: toQty(summaryRaw.totalPOQty),
      totalKonfirmasiQty: toQty(summaryRaw.totalKonfirmasiQty),
      totalSisaQty: toQty(summaryRaw.totalSisaQty),
    },
  };
}`;

s = s.slice(0, start) + newFn + s.slice(end);
fs.writeFileSync(file, s);
if (!s.includes('toQty')) throw new Error('toQty not applied');
console.log('OK normalizeStatusPO replaced', newFn.length, 'file', s.length);

{
  const old = `    } finally {\n      if (!silent && !poDataRef.current) setPoLoading(false);\n    }\n  }, []);`;
  const neu = `    } finally {\n      if (!silent) setPoLoading(false);\n    }\n  }, []);`;
  let s2 = fs.readFileSync(file, 'utf8');
  if (s2.includes(old)) {
    s2 = s2.replace(old, neu);
    fs.writeFileSync(file, s2);
    console.log('loadPO finally fixed');
  } else {
    console.log('loadPO finally pattern skipped');
  }
}
