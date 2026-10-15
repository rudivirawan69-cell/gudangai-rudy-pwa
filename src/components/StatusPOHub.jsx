import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { getStatusPO, confirmPOStatus } from '../data/api';

function normalizeStatusPO(raw) {
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
      : s0.replace(/\./g, '').replace(',', '.');
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
      nama: nama || '—',
      size: it.size || '',
      satuan: it.satuan || 'Pack',
      tglRencana: it.tglRencana || it.tglKedatangan || it.tanggalPO || '',
      qtyPO,
      qtyDatang,
      status,
      id: it.id || it.itemId || it.clientItemId || ('po-' + idx),
      poCV: toQty(it.poCV),
      poPT: toQty(it.poPT),
    };
  };
  let items = (Array.isArray(itemsRaw) ? itemsRaw : []).map(mapItem).filter((it) => it.nama && it.nama !== '—');
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
    items: (Array.isArray(previousRaw.items) ? previousRaw.items : []).map(mapItem).filter((it) => it.nama && it.nama !== '—'),
    summary: previousRaw.summary || null,
  } : null;
  if (previousWeek && previousWeek.items.length) {
    const ps = previousWeek.summary || {};
    let pMenunggu = toQty(ps.itemMenunggu ?? ps.menunggu ?? 0);
    let pSebagian = toQty(ps.itemSebagian ?? ps.sebagian ?? 0);
    let pSelesai = toQty(ps.itemSelesai ?? ps.selesai ?? 0);
    if (pMenunggu + pSebagian + pSelesai === 0) {
      for (const it of previousWeek.items) {
        if (it.status === 'Selesai') pSelesai += 1;
        else if (it.status === 'Sebagian') pSebagian += 1;
        else pMenunggu += 1;
      }
    }
    previousWeek.summary = {
      totalItem: previousWeek.items.length,
      itemMenunggu: pMenunggu,
      itemSebagian: pSebagian,
      itemSelesai: pSelesai,
    };
  } else if (previousWeek && !previousWeek.items.length) {
    previousWeek = null;
  }
  if (items.length && menunggu + sebagian + selesai === 0) {
    menunggu = 0; sebagian = 0; selesai = 0;
    for (const it of items) {
      if (it.status === 'Selesai') selesai += 1;
      else if (it.status === 'Sebagian') sebagian += 1;
      else menunggu += 1;
    }
  }
  return {
    success: true,
    noPO: raw.noPO || summaryRaw.noPO || '',
    weekKey: raw.weekKey || raw.week || '',
    items,
    previousWeek,
    summary: {
      totalItem: items.length || toQty(summaryRaw.totalItem) || (menunggu + sebagian + selesai),
      itemMenunggu: menunggu,
      itemSebagian: sebagian,
      itemSelesai: selesai,
    },
  };
}

function StatusPOHubPanel({ mode }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmingId, setConfirmingId] = useState(null);
  const [msg, setMsg] = useState('');
  const [confirmPeriod, setConfirmPeriod] = useState('current');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = async () => {
    setLoading(true); setError(''); setMsg('');
    try {
      const raw = await getStatusPO(mode, mode === 'confirm' ? confirmPeriod : '');
      const norm = normalizeStatusPO(raw);
      if (!norm || norm.success === false) {
        setError(norm?.error || 'Belum ada data Status PO. Cek API Secret di Atur.');
        setData(null);
      } else {
        setData(norm);
      }
    } catch (e) {
      setError(e?.message || 'Gagal memuat Status PO');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [mode, confirmPeriod]);

  const baseItems = mode === 'previous'
    ? (data?.items || data?.previousWeek?.items || [])
    : (data?.items || []);
  const items = mode === 'confirm' || mode === 'current'
    ? baseItems.filter((it) => statusFilter === 'all' || (statusFilter === 'wait' && it.status === 'Menunggu') || (statusFilter === 'part' && it.status === 'Sebagian') || (statusFilter === 'done' && it.status === 'Selesai'))
    : baseItems;
  const title = mode === 'current' ? 'Status PO Aktif' : mode === 'previous' ? 'Status PO Minggu Lalu' : 'Konfirmasi PO';
  const summary = mode === 'previous'
    ? (data?.summary || data?.previousWeek?.summary || {})
    : (data?.summary || {});
  const noPO = mode === 'previous' ? (data?.noPO || data?.previousWeek?.noPO || '') : (data?.noPO || '');
  const canConfirm = (mode === 'confirm' && confirmPeriod === 'current') || mode === 'current';

  const handleConfirm = async (it) => {
    if (!canConfirm) {
      setMsg((mode === 'previous' || confirmPeriod === 'previous') ? 'Arsip PO minggu lalu bersifat baca-saja; backend menolak konfirmasi agar tidak salah mencatat ke PO aktif.' : 'Mode ini tidak mendukung konfirmasi.');
      return;
    }
    if (!noPO) {
      setMsg('No PO tidak terbaca dari spreadsheet. Periksa header sheet purchase order, lalu muat ulang.');
      return;
    }
    const sisa = Math.max(0, (Number(it.qtyPO) || 0) - (Number(it.qtyDatang) || 0));
    if (sisa <= 0) {
      setMsg('Item sudah terpenuhi (tidak ada sisa qty).');
      return;
    }
    let entitas = '';
    const cv = Number(it.poCV) || 0;
    const pt = Number(it.poPT) || 0;
    if (cv > 0 && pt <= 0) entitas = 'CV';
    else if (pt > 0 && cv <= 0) entitas = 'PT';

    setConfirmingId(it.id);
    setMsg('Mengonfirmasi kedatangan…');
    try {
      const payload = {
        noPO,
        itemNo: it.itemNo,
        itemId: it.id,
        nama: it.nama,
        namaItem: it.nama,
        tglMasuk: new Date().toISOString().slice(0, 10),
        isPreviousWeek: mode === 'confirm' && confirmPeriod === 'previous',
        qtyDatang: sisa,
        qtyDatangBaru: sisa,
        qtyPO: Number(it.qtyPO) || 0,
        poCV: cv,
        poPT: pt,
      };
      if (entitas) payload.entitas = entitas;
      const res = await confirmPOStatus(payload);
      if (res?.success || res?.status === 'OK' || res?.status === 'APPLIED') {
        setMsg(res?.message || 'Konfirmasi tersimpan. Status PO diperbarui.');
        await load();
      } else {
        setMsg(res?.error || res?.message || res?.code || 'Konfirmasi belum terkonfirmasi backend.');
      }
    } catch (e) {
      setMsg(e?.message || 'Gagal konfirmasi');
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <div className="card section-card rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-slate-900">{title}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {noPO ? `No PO: ${noPO}` : 'Data dari Status PO spreadsheet'}
          </p>
        </div>
        <button type="button" onClick={load} className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center shrink-0" aria-label="Muat ulang">
          <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {!loading && data?.success && (
        <div className="space-y-3">
        {mode === 'confirm' && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setConfirmPeriod('current'); setStatusFilter('all'); }} className={`rounded-xl border px-3 py-2 text-[11px] font-extrabold ${confirmPeriod === 'current' ? 'border-cyan-300 bg-cyan-50 text-cyan-800 shadow-sm' : 'border-slate-200 bg-white text-slate-600'}`}>Konfirmasi PO Minggu Ini</button>
          <button type="button" onClick={() => { setConfirmPeriod('previous'); setStatusFilter('all'); }} className={`rounded-xl border px-3 py-2 text-[11px] font-extrabold ${confirmPeriod === 'previous' ? 'border-cyan-300 bg-cyan-50 text-cyan-800 shadow-sm' : 'border-slate-200 bg-white text-slate-600'}`}>Konfirmasi PO Minggu Lalu</button>
        </div>
      )}
      {(mode === 'current' || mode === 'confirm') && (
        <div className="grid grid-cols-4 gap-1.5">
          {[['all','Semua'],['wait','Menunggu'],['part','Sebagian'],['done','Datang']].map(([key,label]) => <button key={key} type="button" onClick={() => setStatusFilter(key)} className={`rounded-lg border px-1.5 py-2 text-[10px] font-bold ${statusFilter === key ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-2 text-center po-stat-box">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Menunggu</p>
            <p className="text-lg font-extrabold tabular-nums text-slate-800">{summary.itemMenunggu ?? 0}</p>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-2 py-2 text-center po-stat-box">
            <p className="text-[10px] font-bold text-amber-700 uppercase">Sebagian</p>
            <p className="text-lg font-extrabold tabular-nums text-amber-800">{summary.itemSebagian ?? 0}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-2 py-2 text-center po-stat-box">
            <p className="text-[10px] font-bold text-emerald-700 uppercase">Datang</p>
            <p className="text-lg font-extrabold tabular-nums text-emerald-800">{summary.itemSelesai ?? 0}</p>
          </div>
        </div>
        </div>
      )}

      {msg && <p className="text-[11px] font-semibold text-center text-cyan-700">{msg}</p>}
      {error && <p className="text-[12px] text-amber-700 font-medium">{error}</p>}
      {loading && (
        <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-14 rounded-xl skeleton" />)}</div>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-[12px] text-slate-500 text-center py-6">
          {mode === 'previous' ? 'Belum ada data PO minggu lalu.' : mode === 'confirm' ? 'Semua item sudah dikonfirmasi datang.' : 'Belum ada item PO aktif.'}
        </p>
      )}
      {!loading && items.length > 0 && (
        <div className="space-y-0 divide-y divide-slate-100">
          {items.map((it, idx) => {
            const badge =
              it.status === 'Selesai' ? 'bg-emerald-50 text-emerald-700'
              : it.status === 'Sebagian' ? 'bg-amber-50 text-amber-700'
              : 'bg-slate-50 text-slate-600';
            const barPct = it.qtyPO > 0 ? Math.min(100, Math.round((it.qtyDatang / it.qtyPO) * 100)) : 0;
            const isBusy = confirmingId === it.id;
            const sisa = Math.max(0, (Number(it.qtyPO) || 0) - (Number(it.qtyDatang) || 0));
            return (
              <div key={`${mode}-${it.id || idx}`} className="py-3 first:pt-0">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-slate-800">
                      <span className="text-slate-400 font-semibold mr-1">#{String(it.itemNo || idx + 1).padStart(2, '0')}</span>
                      {it.nama}
                    </p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      {it.satuan}{it.size ? ` · ${it.size}` : ''} · {it.qtyDatang}/{it.qtyPO}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badge}`}>{it.status}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full ${it.status === 'Selesai' ? 'bg-emerald-500' : it.status === 'Sebagian' ? 'bg-amber-400' : 'bg-slate-300'}`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                {canConfirm && sisa > 0 && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleConfirm(it)}
                    className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-[11px] font-bold text-emerald-800 disabled:opacity-40"
                  >
                    {isBusy ? 'Menyimpan…' : `Konfirmasi datang penuh (${sisa} sisa)`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { StatusPOHubPanel, normalizeStatusPO };
