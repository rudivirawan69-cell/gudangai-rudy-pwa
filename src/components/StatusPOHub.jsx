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

function StatusTriple({ status }) {
  const s = String(status || 'Menunggu');
  const isBelum = s === 'Menunggu' || s.toLowerCase().includes('belum');
  const isSebagian = s === 'Sebagian';
  const isDatang = s === 'Selesai' || s.toLowerCase().includes('datang');
  const box = (active, label, activeCls, idleCls) => (
    <div className={`rounded-lg px-1.5 py-1.5 text-center border ${active ? activeCls : idleCls}`}>
      <p className={`text-[9px] font-bold uppercase leading-tight ${active ? '' : 'opacity-50'}`}>{label}</p>
    </div>
  );
  return (
    <div className="grid grid-cols-3 gap-1.5 mt-1.5">
      {box(isBelum, 'Belum', 'bg-slate-100 border-slate-300 text-slate-800', 'bg-white border-slate-100 text-slate-400')}
      {box(isSebagian, 'Sebagian', 'bg-amber-50 border-amber-300 text-amber-800', 'bg-white border-slate-100 text-slate-400')}
      {box(isDatang, 'Datang', 'bg-emerald-50 border-emerald-300 text-emerald-800', 'bg-white border-slate-100 text-slate-400')}
    </div>
  );
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
  const statusNoPO = mode === 'previous'
    ? (data?.previousWeek?.noPO || '')
    : (data?.noPO || '');
  const statusTitle = mode === 'current' ? 'Status PO Minggu Ini' : mode === 'previous' ? 'Status PO Minggu Lalu' : 'Konfirmasi PO';

  const periodNoPO = confirmPeriod === 'previous'
    ? (data?.previousWeek?.noPO || '')
    : (data?.noPO || '');
  const unfinishedItems = ((confirmPeriod === 'previous' ? data?.previousWeek?.items : data?.items) || []).filter((it) => {
    if (it.status === 'Selesai') return false;
    const sisa = Math.max(0, (Number(it.qtyPO) || 0) - (Number(it.qtyDatang) || 0));
    return sisa > 0;
  });

  const openItemForm = (it) => {
    const sisa = Math.max(0, (Number(it.qtyPO) || 0) - (Number(it.qtyDatang) || 0));
    const cv = Number(it.poCV) || 0;
    const pt = Number(it.poPT) || 0;
    const inferred = cv > 0 && pt <= 0 ? 'CV' : pt > 0 && cv <= 0 ? 'PT' : '';
    setSelectedItem({ ...it, sisa, cv, pt });
    setFormQty(String(sisa));
    setFormTanggal(todayISO());
    setFormEntitas(inferred);
    setMsg('');
  };

  const handleKirim = async () => {
    if (!selectedItem) return;
    if (!periodNoPO) {
      setMsg('No PO tidak terbaca dari spreadsheet.');
      return;
    }
    const qty = Number(formQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setMsg('Qty kedatangan harus lebih dari 0.');
      return;
    }
    if (qty > selectedItem.sisa) {
      setMsg(`Qty tidak boleh melebihi sisa ${selectedItem.sisa}.`);
      return;
    }
    if (selectedItem.cv > 0 && selectedItem.pt > 0 && !formEntitas) {
      setMsg('Pilih entitas CV atau PT.');
      return;
    }
    setSubmitting(true);
    setMsg('Mengirim ke Spreadsheet…');
    try {
      const payload = {
        noPO: periodNoPO,
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
      };
      if (formEntitas === 'CV' || formEntitas === 'PT') payload.entitas = formEntitas;
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
      <div className="card section-card rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-slate-900">{statusTitle}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {statusNoPO ? `No PO: ${statusNoPO}` : (data?.weekKey || 'Data dari Spreadsheet utama')}
            </p>
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
        <div className="card section-card rounded-2xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-slate-900">Konfirmasi PO</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Pilih periode yang akan dikonfirmasi</p>
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
                <p className="text-[11px] text-cyan-700 mt-1">
                  Periode berjalan · Belum selesai: {(data?.items || []).filter((it) => it.status !== 'Selesai' && ((Number(it.qtyPO) || 0) - (Number(it.qtyDatang) || 0)) > 0).length} item
                </p>
              </button>
              <button type="button" onClick={() => { setConfirmPeriod('previous'); setSelectedItem(null); setMsg(''); }} className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-left active:scale-[0.99]">
                <p className="text-sm font-extrabold text-slate-900">Konfirmasi PO Minggu Lalu</p>
                <p className="text-[11px] text-slate-600 mt-1">
                  Periode sebelumnya · Belum selesai: {(data?.previousWeek?.items || []).filter((it) => it.status !== 'Selesai' && ((Number(it.qtyPO) || 0) - (Number(it.qtyDatang) || 0)) > 0).length} item
                </p>
              </button>
            </div>
          )}
        </div>
      );
    }

    if (selectedItem) {
      return (
        <div className="card section-card rounded-2xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-slate-900">Edit kedatangan</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {confirmPeriod === 'previous' ? 'PO Minggu Lalu' : 'PO Minggu Ini'}
                {periodNoPO ? ` · ${periodNoPO}` : ''}
              </p>
            </div>
            <button type="button" onClick={() => { setSelectedItem(null); setMsg(''); }} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600">Kembali</button>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
            <p className="text-sm font-extrabold text-slate-900">{selectedItem.nama}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Qty PO: {selectedItem.qtyPO} · Sudah datang: {selectedItem.qtyDatang} · Sisa: {selectedItem.sisa}
            </p>
          </div>
          <label className="block text-xs font-bold text-slate-700">Tanggal kedatangan
            <input type="date" value={formTanggal} onChange={(e) => setFormTanggal(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900" />
          </label>
          <label className="block text-xs font-bold text-slate-700">Qty kedatangan (boleh diedit)
            <input type="number" min="1" max={selectedItem.sisa} step="any" value={formQty} onChange={(e) => setFormQty(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900" />
          </label>
          <p className="text-[11px] text-slate-500">Maksimal sisa {selectedItem.sisa}. Item yang qty-nya terpenuhi akan hilang dari daftar konfirmasi.</p>
          {(selectedItem.cv > 0 && selectedItem.pt > 0) && (
            <div>
              <p className="text-xs font-bold text-slate-700 mb-1.5">Entitas CV / PT</p>
              <div className="grid grid-cols-2 gap-2">
                {['CV', 'PT'].map((e) => (
                  <button key={e} type="button" onClick={() => setFormEntitas(e)} className={`rounded-lg border px-3 py-2.5 text-xs font-extrabold ${formEntitas === e ? 'border-cyan-400 bg-cyan-50 text-cyan-900' : 'border-slate-200 bg-white text-slate-700'}`}>{e}</button>
                ))}
              </div>
            </div>
          )}
          {msg && <p className="text-[11px] font-semibold text-center text-cyan-700">{msg}</p>}
          <button type="button" disabled={submitting} onClick={handleKirim} className="w-full rounded-xl bg-emerald-700 px-3 py-3.5 text-sm font-extrabold text-white disabled:opacity-50 shadow-md">
            {submitting ? 'Mengirim…' : 'Kirim ke Spreadsheet utama'}
          </button>
        </div>
      );
    }

    return (
      <div className="card section-card rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-slate-900">
              {confirmPeriod === 'previous' ? 'Konfirmasi PO Minggu Lalu' : 'Konfirmasi PO Minggu Ini'}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {periodNoPO ? `No PO: ${periodNoPO}` : 'Hanya item yang belum datang'}
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
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Keranjang belum datang · {unfinishedItems.length} item</p>
            {unfinishedItems.map((it, idx) => {
              const sisa = Math.max(0, (Number(it.qtyPO) || 0) - (Number(it.qtyDatang) || 0));
              return (
                <button key={`u-${it.id || idx}`} type="button" onClick={() => openItemForm(it)} className="w-full text-left rounded-xl border border-slate-200 bg-white px-3 py-3 active:bg-slate-50">
                  <p className="text-[13px] font-bold text-slate-800">
                    <span className="text-slate-400 font-semibold mr-1">#{String(it.itemNo || idx + 1).padStart(2, '0')}</span>
                    {it.nama}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Sisa {sisa} · PO {it.qtyPO} · Datang {it.qtyDatang}</p>
                  <StatusTriple status={it.status} />
                  <p className="text-[10px] font-bold text-cyan-700 mt-2">Ketuk untuk edit qty & kirim →</p>
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
