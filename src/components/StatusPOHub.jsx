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
      kode: it.kode || it.kodeBarang || '',
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
    periodStart: previousRaw.periodStart || '',
    periodEnd: previousRaw.periodEnd || '',
    periodStatus: previousRaw.periodStatus || 'TERTUNDA',
    readOnly: previousRaw.readOnly !== false,
    items: (Array.isArray(previousRaw.items) ? previousRaw.items : []).map(mapItem).filter((it) => it.nama && it.nama !== '—'),
    summary: previousRaw.summary || null,
  } : null;
  // Bila PO pada sheet sudah melewati Minggu penutup tetapi rollover otomatis belum berjalan,
  // tampilkan sebagai arsip tertunda, bukan sebagai PO aktif minggu ini.
  if (raw.periodStatus === 'TERTUNDA' && items.length) {
    previousWeek = {
      weekKey: String(raw.weekKey || ''),
      noPO: raw.noPO || '',
      periodStart: raw.periodStart || '',
      periodEnd: raw.periodEnd || '',
      periodStatus: 'TERTUNDA',
      readOnly: true,
      items: items,
      summary: {
        totalItem: items.length,
        itemMenunggu: menunggu,
        itemSebagian: sebagian,
        itemSelesai: selesai,
      },
    };
    items = [];
    menunggu = 0;
    sebagian = 0;
    selesai = 0;
  }
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
    periodStart: raw.periodStart || '',
    periodEnd: raw.periodEnd || '',
    periodStatus: raw.periodStatus || '',
    isActivePeriod: raw.isActivePeriod === true,
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

function StatusTriple({ status }) {
  const value = String(status || 'Menunggu');
  const active = value === 'Selesai' || value.toLowerCase().includes('datang')
    ? 'Datang'
    : value === 'Sebagian'
      ? 'Sebagian'
      : 'Belum';
  return (
    <div className="po-status-inline" aria-label={`Status: ${active}`}>
      {['Belum', 'Sebagian', 'Datang'].map((label) => (
        <span key={label} className={active === label ? 'is-active' : ''}>{label}</span>
      ))}
    </div>
  );
}

function formatPeriodDate(value) {
  const parts = String(value || '').trim().split('-');
  return parts.length === 3 && parts[0].length === 4 && parts[1].length === 2 && parts[2].length === 2
    ? `${parts[2]}-${parts[1]}-${parts[0]}`
    : String(value || '');
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function StatusPOHubPanel({ mode }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmPeriod, setConfirmPeriod] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [formQty, setFormQty] = useState('');
  const [formTanggal, setFormTanggal] = useState(todayISO());
  const [formEntitas, setFormEntitas] = useState('');

  const load = async () => {
    setLoading(true); setError(''); setMsg('');
    try {
      const raw = await getStatusPO();
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

  useEffect(() => {
    load();
    setConfirmPeriod(null);
    setSelectedItem(null);
    setMsg('');
  }, [mode]);

  const isStatusMode = mode === 'current' || mode === 'previous';
  const isConfirmMode = mode === 'confirm';

  const statusItems = mode === 'previous'
    ? (data?.previousWeek?.items || [])
    : (data?.items || []);
  const statusSummary = mode === 'previous'
    ? (data?.previousWeek?.summary || {})
    : (data?.summary || {});
  const statusTitle = mode === 'current' ? 'Status PO Minggu Ini' : mode === 'previous' ? 'Status PO Minggu Lalu' : 'Konfirmasi PO';

  const periodNoPO = confirmPeriod === 'previous'
    ? (data?.previousWeek?.noPO || '')
    : (data?.noPO || '');
  const getUnfinishedItems = (items) => (items || []).filter((it) => {
    if (it.status === 'Selesai') return false;
    const sisa = Math.max(0, (Number(it.qtyPO) || 0) - (Number(it.qtyDatang) || 0));
    return sisa > 0;
  });
  const unfinishedItems = getUnfinishedItems(confirmPeriod === 'previous' ? data?.previousWeek?.items : data?.items);
  const previousUnfinishedItems = getUnfinishedItems(data?.previousWeek?.items);

  const openItemForm = (it) => {
    const sisa = Math.max(0, (Number(it.qtyPO) || 0) - (Number(it.qtyDatang) || 0));
    const cv = Number(it.poCV) || 0;
    const pt = Number(it.poPT) || 0;
    let inferred = '';
    if (cv > 0 && pt <= 0) inferred = 'CV';
    else if (pt > 0 && cv <= 0) inferred = 'PT';
    else if (cv > 0 && pt > 0) inferred = 'CV';
    else inferred = 'CV';
    setSelectedItem({ ...it, sisa, cv, pt, needEntityPick: cv > 0 && pt > 0 });
    setFormQty(String(sisa));
    setFormTanggal(todayISO());
    setFormEntitas(inferred);
    setMsg('');
  };

  const handleKirim = async () => {
    if (!selectedItem) return;
    const qty = Number(formQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setMsg('Qty kedatangan harus lebih dari 0.');
      return;
    }
    if (qty > selectedItem.sisa) {
      setMsg(`Qty tidak boleh melebihi sisa ${selectedItem.sisa}.`);
      return;
    }
    if (!formEntitas || (formEntitas !== 'CV' && formEntitas !== 'PT')) {
      setMsg('Pilih entitas CV atau PT sebelum kirim.');
      return;
    }
    setSubmitting(true);
    setMsg('Mengirim ke Spreadsheet…');
    try {
      const payload = {
        noPO: periodNoPO || undefined,
        itemNo: selectedItem.itemNo,
        itemId: selectedItem.id,
        nama: selectedItem.nama,
        qtyDatang: qty,
        qtyDatangBaru: qty,
        qtyPO: Number(selectedItem.qtyPO) || 0,
        tglMasuk: formTanggal,
        isPreviousWeek: confirmPeriod === 'previous',
        poCV: selectedItem.cv,
        poPT: selectedItem.pt,
        entitas: formEntitas,
      };
      if (selectedItem.kode) payload.kode = selectedItem.kode;

      const res = await confirmPOStatus(payload);
      if (res?.success || res?.status === 'OK' || res?.status === 'APPLIED') {
        setMsg(res?.message || 'Berhasil dikirim ke Spreadsheet utama.');
        setSelectedItem(null);
        await load();
      } else {
        setMsg(res?.error || res?.message || res?.code || 'Gagal kirim ke Spreadsheet.');
      }
    } catch (e) {
      setMsg(e?.message || 'Gagal mengirim konfirmasi');
    } finally {
      setSubmitting(false);
    }
  };

  if (isStatusMode) {
    return (
      <div className="po-status-panel space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-slate-900">{statusTitle}</p>
              {data?.success && (
                <p className="po-operational-context">
                  {[data.noPO ? `No PO: ${data.noPO}` : '', data.periodStart && data.periodEnd ? `${formatPeriodDate(data.periodStart)} s.d. ${formatPeriodDate(data.periodEnd)}` : ''].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          <button type="button" onClick={load} className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center shrink-0" aria-label="Muat ulang">
            <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {!loading && data?.success && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-2 text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Belum</p>
              <p className="text-lg font-extrabold tabular-nums text-slate-800">{statusSummary.itemMenunggu ?? 0}</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-2 py-2 text-center">
              <p className="text-[10px] font-bold text-amber-700 uppercase">Sebagian</p>
              <p className="text-lg font-extrabold tabular-nums text-amber-800">{statusSummary.itemSebagian ?? 0}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-2 py-2 text-center">
              <p className="text-[10px] font-bold text-emerald-700 uppercase">Datang</p>
              <p className="text-lg font-extrabold tabular-nums text-emerald-800">{statusSummary.itemSelesai ?? 0}</p>
            </div>
          </div>
        )}
        {error && <p className="text-[12px] text-amber-700 font-medium">{error}</p>}
        {loading && <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl skeleton" />)}</div>}
        {!loading && !error && statusItems.length === 0 && (
          <p className="text-[12px] text-slate-500 text-center py-6">
            {mode === 'previous' ? 'Belum ada data PO minggu lalu.' : 'Belum ada item PO aktif.'}
          </p>
        )}
        {!loading && statusItems.length > 0 && (
          <div className="space-y-2">
            {statusItems.map((it, idx) => (
              <div key={`${mode}-${it.id || idx}`} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
                <p className="text-[13px] font-bold text-slate-800 truncate">
                  <span className="text-slate-400 font-semibold mr-1">#{String(it.itemNo || idx + 1).padStart(2, '0')}</span>
                  {it.nama}
                </p>
                {(() => {
                  const sisa = Math.max(0, (Number(it.qtyPO) || 0) - (Number(it.qtyDatang) || 0));
                  return <p className="po-operational-context">Qty PO: {it.qtyPO} · Sudah datang: {it.qtyDatang} · Sisa: {sisa}</p>;
                })()}
                <StatusTriple status={it.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isConfirmMode) {
    if (!confirmPeriod) {
      return (
        <div className="po-status-panel space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-slate-900">Konfirmasi PO</p>
              </div>
            <button type="button" onClick={load} className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center shrink-0" aria-label="Muat ulang">
              <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {error && <p className="text-[12px] text-amber-700 font-medium">{error}</p>}
          {loading ? (
            <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-xl skeleton" />)}</div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              <button type="button" onClick={() => { setConfirmPeriod('current'); setSelectedItem(null); setMsg(''); }} className="rounded-2xl border-2 border-cyan-200 bg-cyan-50 px-4 py-4 text-left active:scale-[0.99]">
                <p className="text-sm font-extrabold text-cyan-900">Konfirmasi PO Minggu Ini</p>
                <p className="po-operational-context">Belum selesai: {unfinishedItems.length} item</p>
              </button>
              <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-left opacity-80">
                <p className="text-sm font-extrabold text-slate-700">Arsip PO Minggu Lalu</p>
                <p className="po-operational-context">Belum selesai: {previousUnfinishedItems.length} item · Arsip</p>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (selectedItem) {
      return (
        <div className="po-status-panel space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-slate-900">Edit kedatangan</p>
              </div>
            <button type="button" onClick={() => { setSelectedItem(null); setMsg(''); }} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600">Kembali</button>
          </div>
          <div className="po-selected-item">
            <p className="text-sm font-extrabold text-slate-900">{selectedItem.nama}</p>
            <p className="po-operational-context">Qty PO: {selectedItem.qtyPO} · Sudah datang: {selectedItem.qtyDatang} · Sisa: {selectedItem.sisa}</p>
            </div>
          <label className="block text-xs font-bold text-slate-700">Tanggal kedatangan
            <input type="date" value={formTanggal} onChange={(e) => setFormTanggal(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900" />
          </label>
          <label className="block text-xs font-bold text-slate-700">Qty kedatangan (boleh diedit)
            <input type="number" min="1" max={selectedItem.sisa} step="any" value={formQty} onChange={(e) => setFormQty(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900" />
          </label>
          <div className="po-entity-choice space-y-2">
            <p className="text-xs font-extrabold text-slate-900">Entitas</p>
            <div className="grid grid-cols-2 gap-2">
              {['CV', 'PT'].map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => { setFormEntitas(e); setMsg(''); }}
                  className={`rounded-xl border-2 px-3 py-3 text-sm font-extrabold ${formEntitas === e ? 'border-cyan-500 bg-cyan-100 text-cyan-900' : 'border-slate-200 bg-white text-slate-700'}`}
                >
                  {e}
                  {e === 'CV' && selectedItem.cv > 0 ? ` · ${selectedItem.cv}` : ''}
                  {e === 'PT' && selectedItem.pt > 0 ? ` · ${selectedItem.pt}` : ''}
                </button>
              ))}
            </div>
            {!formEntitas && (
              <p className="text-[11px] font-bold text-red-600">Ketuk CV atau PT sebelum Kirim.</p>
            )}
          </div>
          {msg && <p className="text-[11px] font-semibold text-center text-cyan-700">{msg}</p>}
          <button type="button" disabled={submitting || !formEntitas} onClick={handleKirim} className="w-full rounded-xl bg-emerald-700 px-3 py-3.5 text-sm font-extrabold text-white disabled:opacity-50 shadow-md">
            {submitting ? 'Mengirim…' : 'Kirim ke Spreadsheet utama'}
          </button>
        </div>
      );
    }

    return (
      <div className="po-status-panel space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-slate-900">
              {confirmPeriod === 'previous' ? 'Konfirmasi PO Minggu Lalu' : 'Konfirmasi PO Minggu Ini'}
            </p>
            </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => { setConfirmPeriod(null); setSelectedItem(null); setMsg(''); }} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600">Ganti periode</button>
            <button type="button" onClick={load} className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center" aria-label="Muat ulang">
              <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        {msg && <p className="text-[11px] font-semibold text-center text-cyan-700">{msg}</p>}
        {error && <p className="text-[12px] text-amber-700 font-medium">{error}</p>}
        {loading && <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl skeleton" />)}</div>}
        {!loading && unfinishedItems.length === 0 && (
          <p className="text-[12px] text-slate-500 text-center py-8">Semua item periode ini sudah datang. Tidak ada yang perlu dikonfirmasi.</p>
        )}
        {!loading && unfinishedItems.length > 0 && (
          <div className="space-y-2">
            {unfinishedItems.map((it, idx) => {
              return (
                <button key={`u-${it.id || idx}`} type="button" onClick={() => openItemForm(it)} className="w-full text-left rounded-xl border border-slate-200 bg-white px-3 py-3 active:bg-slate-50">
                  <p className="text-[13px] font-bold text-slate-800">
                    <span className="text-slate-400 font-semibold mr-1">#{String(it.itemNo || idx + 1).padStart(2, '0')}</span>
                    {it.nama}
                  </p>
                  {(() => {
                    const sisa = Math.max(0, (Number(it.qtyPO) || 0) - (Number(it.qtyDatang) || 0));
                    return <p className="po-operational-context">Sisa {sisa} · PO {it.qtyPO} · Datang {it.qtyDatang}</p>;
                  })()}
                  <StatusTriple status={it.status} />
                  </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
}

export { StatusPOHubPanel, normalizeStatusPO };
