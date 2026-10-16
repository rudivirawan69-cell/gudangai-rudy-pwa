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

/** 3 kotak status per item: Belum | Sebagian | Datang */
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

function StatusPOHubPanel({ mode }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmingId, setConfirmingId] = useState(null);
  const [msg, setMsg] = useState('');
  const [confirmStep, setConfirmStep] = useState(0);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [arrivalQty, setArrivalQty] = useState('');
  const [arrivalStatus, setArrivalStatus] = useState('penuh');
  const [arrivalEntitas, setArrivalEntitas] = useState('');

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

  useEffect(() => { load(); }, [mode]);

  const items = mode === 'previous'
    ? (data?.previousWeek?.items || [])
    : mode === 'confirm'
      ? (data?.items || []).filter((it) => it.status !== 'Selesai')
      : (data?.items || []);
  const title = mode === 'current' ? 'Status PO Minggu Ini' : mode === 'previous' ? 'Status PO Minggu Lalu' : 'Konfirmasi PO';
  const summary = mode === 'previous'
    ? (data?.previousWeek?.summary || {})
    : (data?.summary || {});
  const noPO = mode === 'previous' ? (data?.previousWeek?.noPO || '') : (data?.noPO || '');
  const canConfirm = mode === 'confirm';
  const isStatusMode = mode === 'current' || mode === 'previous';

  const handleConfirm = (it) => {
    if (!canConfirm) {
      setMsg(mode === 'previous' ? 'Mode minggu lalu hanya arsip (tidak bisa dikonfirmasi).' : 'Mode ini tidak mendukung konfirmasi.');
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
    const cv = Number(it.poCV) || 0;
    const pt = Number(it.poPT) || 0;
    const inferredEntity = cv > 0 && pt <= 0 ? 'CV' : pt > 0 && cv <= 0 ? 'PT' : '';
    setPendingConfirm({ ...it, sisa, cv, pt });
    setArrivalQty(String(sisa));
    setArrivalStatus('penuh');
    setArrivalEntitas(inferredEntity);
    setConfirmStep(1);
    setMsg('');
  };

  const executeConfirm = async () => {
    const it = pendingConfirm;
    if (!it) return;
    const qty = Number(arrivalQty);
    if (!Number.isFinite(qty) || qty <= 0 || qty > it.sisa) {
      setMsg(`Qty datang harus lebih dari 0 dan tidak melebihi sisa ${it.sisa}.`);
      return;
    }
    if ((it.cv > 0 && it.pt > 0) && !arrivalEntitas) {
      setMsg('Pilih entitas CV atau PT sebelum menyimpan.');
      setConfirmStep(2);
      return;
    }
    setConfirmingId(it.id);
    setMsg('Mengonfirmasi kedatangan…');
    try {
      const payload = {
        noPO,
        itemNo: it.itemNo,
        itemId: it.id,
        nama: it.nama,
        qtyDatang: qty,
        qtyDatangBaru: qty,
        qtyPO: Number(it.qtyPO) || 0,
        poCV: it.cv,
        poPT: it.pt,
      };
      if (arrivalEntitas) payload.entitas = arrivalEntitas;
      const res = await confirmPOStatus(payload);
      if (res?.success || res?.status === 'OK' || res?.status === 'APPLIED') {
        setMsg(res?.message || 'Konfirmasi tersimpan. Status PO diperbarui.');
        setConfirmStep(0);
        setPendingConfirm(null);
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

  if (isStatusMode) {
    return (
      <div className="card section-card rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-slate-900">{title}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {noPO ? `No PO: ${noPO}` : (data?.weekKey || 'Data dari Spreadsheet utama')}
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
              <p className="text-lg font-extrabold tabular-nums text-slate-800">{summary.itemMenunggu ?? 0}</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-2 py-2 text-center">
              <p className="text-[10px] font-bold text-amber-700 uppercase">Sebagian</p>
              <p className="text-lg font-extrabold tabular-nums text-amber-800">{summary.itemSebagian ?? 0}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-2 py-2 text-center">
              <p className="text-[10px] font-bold text-emerald-700 uppercase">Datang</p>
              <p className="text-lg font-extrabold tabular-nums text-emerald-800">{summary.itemSelesai ?? 0}</p>
            </div>
          </div>
        )}
        {error && <p className="text-[12px] text-amber-700 font-medium">{error}</p>}
        {loading && <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl skeleton" />)}</div>}
        {!loading && !error && items.length === 0 && (
          <p className="text-[12px] text-slate-500 text-center py-6">
            {mode === 'previous' ? 'Belum ada data PO minggu lalu.' : 'Belum ada item PO aktif.'}
          </p>
        )}
        {!loading && items.length > 0 && (
          <div className="space-y-2">
            {items.map((it, idx) => (
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

  return (
    <div className="card section-card rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-slate-900">{title}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {noPO ? `No PO: ${noPO}` : 'Data dari Spreadsheet utama'}
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
            <p className="text-lg font-extrabold tabular-nums text-slate-800">{summary.itemMenunggu ?? 0}</p>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-2 py-2 text-center">
            <p className="text-[10px] font-bold text-amber-700 uppercase">Sebagian</p>
            <p className="text-lg font-extrabold tabular-nums text-amber-800">{summary.itemSebagian ?? 0}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-2 py-2 text-center">
            <p className="text-[10px] font-bold text-emerald-700 uppercase">Datang</p>
            <p className="text-lg font-extrabold tabular-nums text-emerald-800">{summary.itemSelesai ?? 0}</p>
          </div>
        </div>
      )}
      {msg && <p className="text-[11px] font-semibold text-center text-cyan-700">{msg}</p>}
      {error && <p className="text-[12px] text-amber-700 font-medium">{error}</p>}
      {loading && <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl skeleton" />)}</div>}
      {!loading && !error && items.length === 0 && (
        <p className="text-[12px] text-slate-500 text-center py-6">Semua item sudah dikonfirmasi datang.</p>
      )}
      {confirmStep > 0 && pendingConfirm && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3" role="dialog" aria-modal="true" aria-label="Konfirmasi kedatangan PO">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-extrabold text-slate-900">Konfirmasi Kedatangan PO</p>
            <button type="button" onClick={() => { setConfirmStep(0); setPendingConfirm(null); setMsg(''); }} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600">Batal</button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[1, 2, 3].map((step) => (
              <div key={step} className={`rounded-lg px-2 py-2 text-center text-[10px] font-bold ${confirmStep === step ? 'bg-cyan-100 text-cyan-800 border border-cyan-200' : confirmStep > step ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-50 text-slate-500 border border-slate-100'}`}>
                {step === 1 ? '1. Status' : step === 2 ? '2. Qty & entitas' : '3. Periksa'}
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-extrabold text-slate-800">{pendingConfirm.nama}</p>
            <p className="mt-1 text-[11px] text-slate-500">PO: {pendingConfirm.qtyPO} · Sudah datang: {pendingConfirm.qtyDatang} · Sisa: {pendingConfirm.sisa}</p>
          </div>
          {confirmStep === 1 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700">Pilih status kedatangan</p>
              <div className="grid grid-cols-3 gap-2">
                {[{ id: 'belum', label: 'Belum', desc: '0 datang' }, { id: 'sebagian', label: 'Sebagian', desc: 'Qty parsial' }, { id: 'penuh', label: 'Datang penuh', desc: 'Sisa terpenuhi' }].map((opt) => (
                  <button key={opt.id} type="button" onClick={() => { setArrivalStatus(opt.id); setArrivalQty(opt.id === 'belum' ? '0' : String(opt.id === 'penuh' ? pendingConfirm.sisa : Math.max(1, Math.floor(pendingConfirm.sisa / 2)))); }} className={`rounded-lg border px-2 py-3 text-center ${arrivalStatus === opt.id ? 'border-cyan-400 bg-cyan-50 text-cyan-900' : 'border-slate-200 bg-white text-slate-700'}`}>
                    <span className="block text-[11px] font-extrabold">{opt.label}</span>
                    <span className="mt-1 block text-[9px]">{opt.desc}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => { if (arrivalStatus === 'belum') { setArrivalQty('0'); setMsg('Status Belum tidak mencatat kedatangan. Pilih Sebagian atau Datang penuh untuk menyimpan.'); } else { setConfirmStep(2); setMsg(''); } }} className="w-full rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-bold text-white">Lanjut ke qty</button>
            </div>
          )}
          {confirmStep === 2 && (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700">Qty datang
                <input type="number" min="1" max={pendingConfirm.sisa} step="any" value={arrivalQty} onChange={(e) => { setArrivalQty(e.target.value); setArrivalStatus(Number(e.target.value) >= pendingConfirm.sisa ? 'penuh' : 'sebagian'); }} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900" />
              </label>
              <p className="text-[11px] text-slate-500">Maksimal {pendingConfirm.sisa}. Untuk PO gabungan CV dan PT, pilih entitas penerima.</p>
              {(pendingConfirm.cv > 0 && pendingConfirm.pt > 0) && (
                <div className="grid grid-cols-2 gap-2">
                  {['CV', 'PT'].map((entitas) => (
                    <button key={entitas} type="button" onClick={() => setArrivalEntitas(entitas)} className={`rounded-lg border px-3 py-2 text-xs font-extrabold ${arrivalEntitas === entitas ? 'border-cyan-400 bg-cyan-50 text-cyan-900' : 'border-slate-200 bg-white text-slate-700'}`}>{entitas}</button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmStep(1)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700">Kembali</button>
                <button type="button" onClick={() => { const qty = Number(arrivalQty); if (!Number.isFinite(qty) || qty <= 0 || qty > pendingConfirm.sisa) setMsg(`Qty harus 1 sampai ${pendingConfirm.sisa}.`); else if (pendingConfirm.cv > 0 && pendingConfirm.pt > 0 && !arrivalEntitas) setMsg('Pilih entitas CV atau PT.'); else { setConfirmStep(3); setMsg(''); } }} className="flex-1 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-bold text-white">Periksa konfirmasi</button>
              </div>
            </div>
          )}
          {confirmStep === 3 && (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-1">
                <p><strong>Barang:</strong> {pendingConfirm.nama}</p>
                <p><strong>Status:</strong> {Number(arrivalQty) >= pendingConfirm.sisa ? 'Datang penuh' : 'Datang sebagian'}</p>
                <p><strong>Qty akan dicatat:</strong> {arrivalQty}</p>
                <p><strong>Entitas:</strong> {arrivalEntitas || (pendingConfirm.cv > 0 ? 'CV' : pendingConfirm.pt > 0 ? 'PT' : 'Mengikuti PO')}</p>
                <p><strong>No PO:</strong> {noPO}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmStep(2)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700">Ubah</button>
                <button type="button" disabled={!!confirmingId} onClick={executeConfirm} className="flex-1 rounded-lg bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50">{confirmingId ? 'Menyimpan…' : 'Konfirmasi & simpan'}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {!loading && items.length > 0 && confirmStep === 0 && (
        <div className="space-y-2">
          {items.map((it, idx) => {
            const sisa = Math.max(0, (Number(it.qtyPO) || 0) - (Number(it.qtyDatang) || 0));
            return (
              <div key={`confirm-${it.id || idx}`} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
                <p className="text-[13px] font-bold text-slate-800 truncate">
                  <span className="text-slate-400 font-semibold mr-1">#{String(it.itemNo || idx + 1).padStart(2, '0')}</span>
                  {it.nama}
                </p>
                <StatusTriple status={it.status} />
                {sisa > 0 && (
                  <button type="button" onClick={() => handleConfirm(it)} className="mt-2 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-[11px] font-bold text-emerald-800">
                    Konfirmasi kedatangan (sisa {sisa})
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
