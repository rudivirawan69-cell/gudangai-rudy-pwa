import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Search, Trash2, Send, Loader2, FileText,
  Plus, Minus,
  PackagePlus, PackageMinus, AlertOctagon, Mic, Upload,
  QrCode, Bell, Camera, X, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import {
  extractTextFromPdf, extractTextFromImage, parseLinesFromText, validateItems, applyStockAwareFallback,
  detectEntityFromText, scanBarcodeFromVideo,
} from '../data/pdfValidate';
import {
  submitBarangMasuk, submitBarangKeluar, submitBarangRusak, fetchStock,
  saveToHistory,
  pushNotification, getNotifications, markNotificationsRead, unreadNotificationCount, validateImportedItems,
} from '../data/api';
import { searchMaster } from '../data/master';

const TX_TYPES = [
  { id: 'masuk', label: 'Masuk', icon: PackagePlus, active: 'bg-emerald-50 border-emerald-200 ring-2 ring-emerald-400/40', iconBg: 'bg-emerald-500 text-white', iconIdle: 'bg-emerald-50 text-emerald-600' },
  { id: 'keluar', label: 'Keluar', icon: PackageMinus, active: 'bg-orange-50 border-orange-200 ring-2 ring-orange-400/40', iconBg: 'bg-orange-500 text-white', iconIdle: 'bg-orange-50 text-orange-600' },
  { id: 'rusak', label: 'Rusak', icon: AlertOctagon, active: 'bg-rose-50 border-rose-200 ring-2 ring-rose-400/40', iconBg: 'bg-rose-500 text-white', iconIdle: 'bg-rose-50 text-rose-600' },
];

export default function InputPage() {
  const [entity, setEntity] = useState('CV');
  const [txType, setTxType] = useState('keluar');
  const [mode, setMode] = useState('search');
  const [busy, setBusy] = useState(false);
  const [statusBanner, setStatusBanner] = useState('');
  const [accuracy, setAccuracy] = useState(null);
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [listening, setListening] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [pendingManualIdx, setPendingManualIdx] = useState(null);
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recogRef = useRef(null);

  useEffect(() => {
    const refresh = () => { setNotifs(getNotifications()); setUnread(unreadNotificationCount()); };
    refresh();
    window.addEventListener('gudangai-notif', refresh);
    return () => window.removeEventListener('gudangai-notif', refresh);
  }, []);

  const onSearch = (q) => { setQuery(q); setHits(q.length >= 1 ? searchMaster(entity, q).slice(0, 8) : []); };

  const addToCart = (item, qty = 1) => {
    if (pendingManualIdx != null) {
      setCart((prev) => prev.map((c, i) => i !== pendingManualIdx ? c : { ...c, kode: item.kode, nama: item.nama, satuan: item.satuan, status: 'ok', candidates: [], keterangan: c.keterangan || '' }));
      setPendingManualIdx(null); setQuery(''); setHits([]);
      setStatusBanner('Item ditandai cocok: ' + item.nama);
      return;
    }
    setCart((prev) => {
      const i = prev.findIndex((c) => c.kode === item.kode && c.status === 'ok');
      if (i >= 0) { const next = [...prev]; next[i] = { ...next[i], qty: +(next[i].qty + (qty || 1)).toFixed(2) }; return next; }
      return [...prev, { kode: item.kode, nama: item.nama, satuan: item.satuan, qty: qty || 1, keterangan: '', status: 'ok' }];
    });
    setQuery(''); setHits([]);
  };

  const mergePdfIntoCart = useCallback((matched, amb, un) => {
    setCart((prev) => {
      const byKode = new Map();
      for (const c of prev) { if (c.status === 'ok' && c.kode && !c.fromPdf) byKode.set(c.kode, { ...c }); }
      for (const r of matched) {
        const kode = r.kode; if (!kode) continue;
        const qty = r.qty || 1;
        if (byKode.has(kode)) {
          const cur = byKode.get(kode);
          byKode.set(kode, { ...cur, qty: +(cur.qty + qty).toFixed(2), fromPdf: true, status: r.fallback ? 'fallback' : 'ok', note: r.fallback || '' });
        } else {
          byKode.set(kode, { kode, nama: r.nama, satuan: r.satuan, qty, keterangan: '', status: r.fallback ? 'fallback' : 'ok', fromPdf: true, nameFromPdf: r.nameFromPdf, note: r.fallback || '' });
        }
      }
      const flags = [];
      for (const r of amb) {
        flags.push({ kode: r.kode || '', nama: r.nameFromPdf || r.nama || 'Ambigu', satuan: r.satuan || '', qty: r.qty || 1, keterangan: '', status: 'flag', fromPdf: true, nameFromPdf: r.nameFromPdf, candidates: r.candidates || [], note: r.warning || 'Pilih master yang benar.' });
      }
      return [...byKode.values(), ...flags];
    });
  }, [entity]);

  const updateQty = (idx, delta) => setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, qty: Math.max(0.01, +(c.qty + delta).toFixed(2)) } : c)));
  const setQtyValue = (idx, val) => { const n = parseFloat(String(val).replace(',', '.')); setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, qty: Number.isFinite(n) && n > 0 ? +n.toFixed(2) : c.qty } : c))); };
  const updateKet = (idx, val) => setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, keterangan: val } : c)));
  const removeFromCart = (idx) => setCart((prev) => prev.filter((_, i) => i !== idx));
  const resolveFlag = (idx, item) => { if (!item) return; setCart((prev) => prev.map((c, i) => i !== idx ? c : { ...c, kode: item.kode, nama: item.nama, satuan: item.satuan, status: 'ok', candidates: [], note: '' })); };

  const stopCam = () => { try { streamRef.current?.getTracks()?.forEach((t) => t.stop()); } catch (_) {} streamRef.current = null; setCamOn(false); };
  const startCam = async () => {
    setCamErr(''); setMode('qr');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream; setCamOn(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 50);
    } catch (err) { setCamErr(err.message || 'Kamera tidak tersedia'); setCamOn(false); }
  };
  const scanOnce = async () => {
    if (!videoRef.current) return;
    const res = await scanBarcodeFromVideo(videoRef.current);
    if (res.ok && res.value) {
      const found = searchMaster(entity, res.value);
      if (found.length) { addToCart(found[0], 1); setStatusBanner('QR: ' + found[0].nama + ' masuk keranjang'); stopCam(); }
      else { setQuery(res.value); onSearch(res.value); setMode('search'); stopCam(); }
    } else setCamErr(res.error || 'Tidak terdeteksi');
  };
  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setStatusBanner('Browser ini belum mendukung suara. Gunakan Chrome.'); return; }
    try { recogRef.current?.stop(); } catch (_) {}
    const rec = new SR(); rec.lang = 'id-ID'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (ev) => { const text = ev.results?.[0]?.[0]?.transcript || ''; setListening(false); if (!text) return; setMode('search'); onSearch(text); setStatusBanner('Suara: ' + text); };
    rec.onerror = () => { setListening(false); setStatusBanner('Suara gagal. Coba lagi.'); };
    rec.onend = () => setListening(false);
    recogRef.current = rec; setListening(true); rec.start();
  };

  const processImportedText = useCallback(async (text, sourceLabel = 'Dokumen') => {
    const rawText = String(text || '').trim();
    if (!rawText) { setStatusBanner(sourceLabel + ': teks tidak terbaca.'); return; }
    setBusy(true); setStatusBanner(sourceLabel + ': memvalidasi…'); setAccuracy(null);
    try {
      const detected = detectEntityFromText(rawText);
      const useEntity = detected || entity;
      if (detected && detected !== entity) setEntity(detected);
      const rows = parseLinesFromText(rawText, []);
      if (!rows.length) { setStatusBanner(sourceLabel + ': tidak ada baris barang terdeteksi.'); return; }
      const validation = validateItems(rows, useEntity);
      const stock = await fetchStock(useEntity, { allowDemo: false });
      const matched = applyStockAwareFallback(validation.matched || [], useEntity, stock);
      const amb = validation.ambiguous || [];
      const un = validation.unmatched || [];
      const total = matched.length + amb.length + un.length;
      const acc = total ? Math.round((matched.length / total) * 100) : 0;
      setAccuracy({ pct: acc, matched: matched.length, skipped: un.length, needPick: amb.length, total, source: sourceLabel });
      const ambFiltered = amb.filter((r) => (r.candidates || []).length > 0);
      mergePdfIntoCart(matched, ambFiltered, []);
      const fallbackItems = matched.filter((r) => r.fallback);
      if (fallbackItems.length) pushNotification({ type: 'warn', title: 'Fallback stok', body: fallbackItems.map((f) => f.nameFromPdf + ' → ' + f.nama).join('; ') });
      const parts = [];
      if (matched.length) parts.push(matched.length + ' cocok');
      if (ambFiltered.length) parts.push(ambFiltered.length + ' perlu pilih master');
      if (un.length) parts.push(un.length + ' tidak cocok');
      setStatusBanner(matched.length || ambFiltered.length ? ('Validasi ' + acc + '% · ' + parts.join(' · ')) : 'Tidak ada item yang cocok dengan master.');
    } catch (err) { setStatusBanner(sourceLabel + ': ' + (err.message || 'gagal memvalidasi')); }
    finally { setBusy(false); }
  }, [entity, mergePdfIntoCart]);

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        setBusy(true); setStatusBanner('Membaca PDF…'); setAccuracy(null);
        const result = await extractTextFromPdf(file, (msg) => setStatusBanner(msg));
        await processImportedText(typeof result === 'string' ? result : (result?.text || ''), 'PDF');
      } else if (file.type.startsWith('image/')) {
        const result = await extractTextFromImage(file, (msg) => setStatusBanner(msg));
        await processImportedText(result?.text || '', 'Foto');
      } else { setStatusBanner('Format tidak didukung. Gunakan PDF atau foto.'); }
    } catch (err) { setStatusBanner(err.message || 'Gagal membaca file'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const capturePhotoAndValidate = async () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Kamera tidak dapat diproses.');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) throw new Error('Foto gagal dibuat.');
      const result = await extractTextFromImage(blob, (msg) => setStatusBanner(msg));
      await processImportedText(result?.text || '', 'Kamera');
      stopCam();
    } catch (err) { setCamErr(err.message || 'Gagal mengambil foto'); }
  };

  const validatePastedText = async () => { await processImportedText(pasteText, 'Teks tempel'); };
  const submitCart = async () => {
    if (submitting || submittingRef.current) return;
    const ready = cart.filter((c) => c.kode && (c.status === 'ok' || c.status === 'fallback'));
    const flagged = cart.filter((c) => c.status === 'flag');
    if (!ready.length) { setStatusBanner(flagged.length ? 'Masih ada item yang perlu dipilih master-nya.' : 'Keranjang kosong.'); return; }
    setSubmitting(true); submittingRef.current = true;
    const snapshot = ready.map((c) => ({ kode: c.kode, nama: c.nama, qty: c.qty, keterangan: (c.keterangan || '').slice(0, 200) }));
    try {
      const serverValidation = await validateImportedItems(snapshot, entity);
      if (!serverValidation?.success) {
        setStatusBanner('Validasi server belum lolos: ' + (serverValidation?.error || serverValidation?.code || 'periksa item di keranjang'));
        pushNotification({ type: 'warn', title: 'Validasi server', body: (serverValidation?.error || 'Masih ada item yang perlu diperiksa.') });
        setSubmitting(false); submittingRef.current = false;
        return;
      }
    } catch (validationErr) {
      setStatusBanner('Validasi server gagal: ' + (validationErr?.message || 'coba lagi'));
      setSubmitting(false); submittingRef.current = false;
      return;
    }
    setCart((prev) => prev.filter((c) => c.status === 'flag'));
    setStatusBanner('Validasi 100% · Mengirim ' + snapshot.length + ' item… hasil di lonceng');
    const submitFn = txType === 'masuk' ? submitBarangMasuk : txType === 'rusak' ? submitBarangRusak : submitBarangKeluar;
    const releaseTimer = setTimeout(() => { setSubmitting(false); submittingRef.current = false; }, 4000);
    submitFn(entity, snapshot, { tanggal })
      .then((res) => {
        saveToHistory({ type: txType, entity, tanggal, items: snapshot, ...res });
        if (res.success) {
          pushNotification({ type: 'ok', title: 'Kirim berhasil', body: (res.written || snapshot.length) + ' item ' + (txType === 'masuk' ? 'Masuk' : txType === 'rusak' ? 'Rusak' : 'Keluar') + ' ' + entity + ' tercatat.' });
        } else if (res.queued) {
        } else if (res.offline) {
          pushNotification({ type: 'warn', title: 'Disimpan antrian offline', body: res.error || 'Cek Atur → Offline & Sync' });
        } else {
          pushNotification({ type: 'err', title: 'Kirim bermasalah', body: res.error || 'Cek Atur → Offline & Sync' });
        }
      })
      .catch((err) => pushNotification({ type: 'err', title: 'Kirim gagal', body: err.message || 'Error jaringan' }))
      .finally(() => { clearTimeout(releaseTimer); setSubmitting(false); submittingRef.current = false; });
  };

  const typeLabel = txType === 'masuk' ? 'Masuk' : txType === 'rusak' ? 'Rusak' : 'Keluar';
  const submitGradient = txType === 'masuk' ? 'from-emerald-500 to-teal-600' : txType === 'rusak' ? 'from-rose-500 to-red-600' : 'from-teal-500 to-emerald-600';
  const readyCount = cart.filter((c) => c.kode && (c.status === 'ok' || c.status === 'fallback')).length;
  const flagCount = cart.filter((c) => c.status === 'flag').length;

  return (
    <div className="pb-28 animate-fade-in space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-white drop-shadow-sm">Input Transaksi</p>
        <button type="button" onClick={() => { setShowNotif((v) => !v); markNotificationsRead(); setUnread(0); }} className="relative w-10 h-10 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-600" aria-label="Notifikasi">
          <Bell className="w-5 h-5" />
          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
        </button>
      </div>
      {showNotif && (
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-3 max-h-52 overflow-y-auto">
          {notifs.length === 0 ? <p className="text-[11px] text-slate-400 text-center py-3">Belum ada notifikasi</p> : (
            <ul className="space-y-2">
              {notifs.slice(0, 12).map((n) => (
                <li key={n.id} className="text-[11px] border-b border-slate-50 pb-2 last:border-0">
                  <p className={`font-semibold ${n.type === 'ok' ? 'text-emerald-700' : n.type === 'err' ? 'text-rose-700' : 'text-amber-700'}`}>{n.title}</p>
                  <p className="text-slate-500">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2.5">
        {TX_TYPES.map(({ id, label, icon: Icon, active, iconBg, iconIdle }) => {
          const on = txType === id;
          return (
            <button key={id} type="button" onClick={() => setTxType(id)} className={`relative rounded-2xl border bg-white px-2 py-3.5 flex flex-col items-center gap-2 ${on ? active : 'border-slate-100 shadow-sm'}`}>
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${on ? iconBg : iconIdle}`}><Icon className="w-5 h-5" /></div>
              <span className={`text-[12px] font-semibold ${on ? 'text-slate-800' : 'text-slate-500'}`}>{label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 p-1 bg-white/80 rounded-2xl border border-white/40">
        {['CV', 'PT'].map((e) => (
          <button key={e} type="button" onClick={() => { setEntity(e); setHits([]); setQuery(''); }} className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${entity === e ? 'bg-gradient-to-r from-cyan-500 to-violet-600 text-white border-transparent shadow-md' : 'bg-white/90 text-slate-600 border-white/50'}`}>{e}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={startCam} className={`rounded-2xl border px-2 py-3 flex flex-col items-center gap-1.5 ${mode === 'qr' ? 'border-cyan-200 bg-cyan-50/80' : 'border-slate-100 bg-white'}`}>
          <QrCode className="w-4 h-4 text-cyan-600" /><span className="text-[11px] font-semibold text-slate-600">QR / Kamera</span>
        </button>
        <button type="button" onClick={startVoice} className={`rounded-2xl border px-2 py-3 flex flex-col items-center gap-1.5 ${listening ? 'border-violet-300 bg-violet-50' : 'border-slate-100 bg-white'}`}>
          <Mic className={`w-4 h-4 ${listening ? 'text-violet-600' : 'text-violet-500'}`} /><span className="text-[11px] font-semibold text-slate-600">{listening ? 'Mendengar…' : 'Suara'}</span>
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-2xl border border-slate-100 bg-white px-2 py-3 flex flex-col items-center gap-1.5">
          <Upload className="w-4 h-4 text-cyan-500" /><span className="text-[11px] font-semibold text-slate-600">PDF / Validasi</span>
        </button>
      </div>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={onFile} />
      <button type="button" onClick={() => setMode((m) => m === 'paste' ? 'search' : 'paste')} className="w-full rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-[11px] font-semibold text-violet-700">Tempel teks rekap / order</button>
      {mode === 'paste' && (
        <div className="rounded-2xl bg-white border border-violet-100 p-3 space-y-2 shadow-sm">
          <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Tempel teks rekap/order di sini…" rows={6} className="w-full resize-none text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-xl p-3 focus:outline-none" />
          <button type="button" onClick={validatePastedText} disabled={busy || !pasteText.trim()} className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-40">Validasi Teks</button>
        </div>
      )}
      {camOn && (
        <div className="rounded-2xl overflow-hidden bg-black relative">
          <video ref={videoRef} autoPlay playsInline className="w-full h-48 object-cover" />
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
            <button type="button" onClick={scanOnce} className="px-3 py-1.5 rounded-full bg-white text-xs font-bold flex items-center gap-1"><QrCode className="w-3.5 h-3.5" /> Scan QR</button>
            <button type="button" onClick={capturePhotoAndValidate} className="px-3 py-1.5 rounded-full bg-cyan-500 text-white text-xs font-bold flex items-center gap-1"><Camera className="w-3.5 h-3.5" /> Foto & Validasi</button>
            <button type="button" onClick={stopCam} className="px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-bold flex items-center gap-1"><X className="w-3.5 h-3.5" /> Tutup</button>
          </div>
        </div>
      )}
      {camErr && <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2">{camErr}</p>}
      <div className="rounded-2xl bg-white border border-slate-100 px-3 py-2.5 flex items-center gap-3 shadow-sm">
        <label className="text-[11px] text-slate-400 shrink-0 font-medium">Tanggal</label>
        <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="flex-1 text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-100 rounded-xl px-2.5 py-1.5 focus:outline-none" />
      </div>
      {busy && (
        <div className="rounded-2xl bg-cyan-50 border border-cyan-100 px-3 py-3 flex items-center gap-2 text-sm text-cyan-800">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" /> Memvalidasi PDF…
        </div>
      )}
      {accuracy && (
        <div className="rounded-2xl bg-gradient-to-r from-violet-50 to-cyan-50 border border-violet-100 px-3 py-2.5 text-[12px] text-slate-700 shadow-sm">
          Akurasi <b className="text-violet-700">{accuracy.pct}%</b>
          <span className="text-slate-500"> · cocok {accuracy.matched}/{accuracy.total}</span>
          {accuracy.skipped ? <span className="text-amber-600 font-medium"> · dilewati {accuracy.skipped}</span> : null}
        </div>
      )}
      {!accuracy && statusBanner && (
        <div className="text-[11px] px-3 py-2.5 rounded-xl bg-white/90 border border-slate-100 text-slate-600">{statusBanner}</div>
      )}
      <div className="rounded-2xl bg-white border border-slate-100 p-3 space-y-2 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={query} onChange={(e) => onSearch(e.target.value)} placeholder="Cari nama barang" className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/40" />
        </div>
        {hits.length > 0 && (
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {hits.map((h) => (
              <li key={h.kode}>
                <button type="button" onClick={() => addToCart(h, 1)} className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-cyan-50 text-[12px] font-medium text-slate-700 flex items-center justify-between gap-2">
                  <span className="truncate">{h.nama}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">{h.kode}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {cart.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-cyan-100/90 px-1">Keranjang ({cart.length}) · siap {readyCount}{flagCount ? ` · perlu pilih ${flagCount}` : ''}</p>
          {cart.map((c, idx) => (
            <div key={idx} className={`rounded-2xl border p-3 ${c.status === 'flag' ? 'bg-amber-50/80 border-amber-200' : c.status === 'fallback' ? 'bg-violet-50/60 border-violet-100' : 'bg-white border-slate-100'} shadow-sm`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{c.nama || c.nameFromPdf || 'Item'}</p>
                  <p className="text-[10px] text-slate-400">{c.kode || '—'} · {c.satuan || ''}</p>
                  {c.note && <p className="text-[10px] text-amber-700 mt-0.5">{c.note}</p>}
                </div>
                <button type="button" onClick={() => removeFromCart(idx)} className="text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
              </div>
              {c.status === 'flag' && c.candidates?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {c.candidates.slice(0, 4).map((cand) => (
                    <button key={cand.kode} type="button" onClick={() => resolveFlag(idx, cand)} className="w-full text-left text-[11px] px-2 py-1.5 rounded-lg bg-white border border-amber-100 hover:bg-amber-50">{cand.nama} <span className="text-slate-400">{cand.kode}</span></button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 mt-2">
                <button type="button" onClick={() => updateQty(idx, -1)} className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></button>
                <input type="number" value={c.qty} onChange={(e) => setQtyValue(idx, e.target.value)} className="w-16 text-center text-sm font-bold border border-slate-200 rounded-lg py-1" />
                <button type="button" onClick={() => updateQty(idx, 1)} className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
                <input type="text" value={c.keterangan || ''} onChange={(e) => updateKet(idx, e.target.value)} placeholder="Keterangan" className="flex-1 text-[11px] border border-slate-100 rounded-lg px-2 py-1.5" />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="fixed bottom-16 left-0 right-0 px-3 z-20">
        <button type="button" onClick={submitCart} disabled={submitting || readyCount === 0} className={`w-full py-3.5 rounded-2xl bg-gradient-to-r ${submitGradient} text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-40`}>
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Mengirim…</> : <><Send className="w-4 h-4" /> Kirim {typeLabel} ({readyCount})</>}
        </button>
      </div>
    </div>
  );
}
