import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Search, Trash2, Send, Loader2,
  Plus, Minus,
  PackagePlus, PackageMinus, AlertOctagon, Mic, Upload,
  QrCode, Bell, Camera, X, AlertTriangle, CheckCircle2, Clipboard, Image,
} from 'lucide-react';
import {
  extractTextFromPdf, extractTextFromImage, parseLinesFromText, validateItems, applyStockAwareFallback,
  detectEntityFromText, scanBarcodeFromVideo,
} from '../data/pdfValidate';
import {
  submitBarangMasuk, submitBarangKeluar, submitBarangRusak, fetchStock,
  saveToHistory,
  pushNotification, getNotifications, markNotificationsRead, unreadNotificationCount,
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
  const [tanggal, setTanggal] = useState(() => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (_) {
      return new Date().toISOString().slice(0, 10);
    }
  });
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [listening, setListening] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [camOn, setCamOn] = useState(false);
  const fileRef = useRef(null);
  const photoRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recogRef = useRef(null);

  useEffect(() => {
    setNotifs(getNotifications());
  }, [showNotif]);

  useEffect(() => {
    if (!query.trim()) { setHits([]); return; }
    const t = setTimeout(() => setHits(searchMaster(entity, query).slice(0, 12)), 180);
    return () => clearTimeout(t);
  }, [query, entity]);

  const addToCart = useCallback((item, qty = 1) => {
    setCart((prev) => {
      const kode = item.kode;
      const idx = prev.findIndex((c) => c.kode === kode);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: +(next[idx].qty + qty).toFixed(2) };
        return next;
      }
      return [...prev, {
        kode: item.kode,
        nama: item.nama || item.name,
        satuan: item.satuan || 'Pack',
        qty: +qty || 1,
        keterangan: '',
        clientItemId: `${item.kode}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      }];
    });
  }, []);

  const mergePdfIntoCart = useCallback((matched, amb = [], _un = []) => {
    setCart((prev) => {
      const next = [...prev];
      for (const m of matched) {
        if (!m.kode) continue;
        const idx = next.findIndex((c) => c.kode === m.kode);
        const qty = +m.qty || 1;
        if (idx >= 0) next[idx] = { ...next[idx], qty: +(next[idx].qty + qty).toFixed(2) };
        else next.push({
          kode: m.kode,
          nama: m.nama || m.name,
          satuan: m.satuan || 'Pack',
          qty,
          keterangan: '',
          clientItemId: `${m.kode}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        });
      }
      return next;
    });
  }, []);

  const runValidationPipeline = useCallback(async (text, lines = [], sourceLabel = 'Validasi') => {
    if (!text || !String(text).trim()) {
      setStatusBanner('Tidak ada teks untuk divalidasi.');
      return;
    }
    setBusy(true);
    setStatusBanner('');
    setAccuracy(null);
    try {
      const detected = detectEntityFromText(text);
      const useEntity = detected || entity;
      if (detected && detected !== entity) setEntity(detected);
      const rows = parseLinesFromText(text, lines);
      if (!rows.length) {
        setStatusBanner('Tidak ada baris barang terdeteksi dari ' + sourceLabel + '.');
        return;
      }
      const validation = validateItems(rows, useEntity);
      const stock = await fetchStock(useEntity, { allowDemo: false });
      const matched = applyStockAwareFallback(validation.matched || [], useEntity, stock);
      const amb = validation.ambiguous || [];
      const un = validation.unmatched || [];
      const total = matched.length + amb.length + un.length;
      const acc = total ? Math.round((matched.length / total) * 100) : 0;
      setAccuracy({ pct: acc, matched: matched.length, skipped: un.length, needPick: amb.length, total });
      const ambFiltered = (amb || []).filter((r) => (r.candidates || []).length > 0);
      mergePdfIntoCart(matched, ambFiltered, []);
      const parts = [];
      if (matched.length) parts.push(matched.length + ' cocok');
      if (ambFiltered.length) parts.push(ambFiltered.length + ' pilih master');
      if (un.length) parts.push(un.length + ' dilewati');
      setStatusBanner(
        matched.length || ambFiltered.length
          ? (sourceLabel + ' ' + acc + '% · ' + parts.join(' · '))
          : (un.length ? ('Tidak ada yang cocok master · ' + un.length + ' baris dilewati') : 'Tidak ada baris barang terdeteksi.')
      );
    } catch (err) {
      setStatusBanner(err.message || 'Gagal memvalidasi ' + sourceLabel);
    } finally {
      setBusy(false);
    }
  }, [entity, mergePdfIntoCart]);

  const updateQty = (idx, delta) => setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, qty: Math.max(0.01, +(c.qty + delta).toFixed(2)) } : c)));
  const setQtyValue = (idx, val) => {
    const n = parseFloat(String(val).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return;
    setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, qty: +n.toFixed(2) } : c)));
  };
  const removeCart = (idx) => setCart((prev) => prev.filter((_, i) => i !== idx));
  const setKet = (idx, val) => setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, keterangan: val } : c)));

  const stopCam = () => {
    streamRef.current?.getTracks?.().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  };

  const startCam = async () => {
    try {
      stopCam();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      setCamOn(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play?.();
        }
      }, 50);
    } catch (err) {
      setStatusBanner(err.message || 'Kamera tidak tersedia');
    }
  };

  const scanOnce = async () => {
    if (!videoRef.current) return;
    const res = await scanBarcodeFromVideo(videoRef.current);
    if (res.ok && res.value) {
      const found = searchMaster(entity, res.value);
      if (found.length) {
        addToCart(found[0], 1);
        setStatusBanner('QR/Barcode: ' + found[0].nama + ' masuk keranjang');
        stopCam();
      } else {
        setStatusBanner('Barcode tidak cocok master: ' + res.value);
      }
    } else {
      setStatusBanner(res.error || 'Tidak terdeteksi');
    }
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setStatusBanner('Suara tidak didukung di browser ini'); return; }
    try {
      recogRef.current?.stop?.();
      const r = new SR();
      r.lang = 'id-ID';
      r.interimResults = false;
      r.onresult = (e) => {
        const text = e.results?.[0]?.[0]?.transcript || '';
        setListening(false);
        if (!text) return;
        const found = searchMaster(entity, text);
        if (found.length) {
          addToCart(found[0], 1);
          setStatusBanner('Suara: ' + found[0].nama);
        } else {
          setQuery(text);
          setStatusBanner('Suara: "' + text + '" — pilih dari hasil cari');
        }
      };
      r.onerror = () => setListening(false);
      r.onend = () => setListening(false);
      recogRef.current = r;
      setListening(true);
      r.start();
    } catch (err) {
      setListening(false);
      setStatusBanner(err.message || 'Gagal mulai suara');
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatusBanner('Memproses file…');
    try {
      const isPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name);
      const extracted = isPdf
        ? await extractTextFromPdf(file, (m) => setStatusBanner(m))
        : await extractTextFromImage(file, (m) => setStatusBanner(m));
      if (!extracted.ok) {
        setStatusBanner(extracted.error || 'Gagal baca file');
        return;
      }
      await runValidationPipeline(extracted.text, [], isPdf ? 'PDF' : 'Foto');
    } catch (err) {
      setStatusBanner(err.message || 'Gagal proses file');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
      if (photoRef.current) photoRef.current.value = '';
    }
  };

  const onPasteValidate = async () => {
    const text = String(pasteText || '').trim();
    if (!text) { setStatusBanner('Tempel teks rekap order terlebih dahulu.'); return; }
    setShowPaste(false);
    await runValidationPipeline(text, [], 'Tempel Teks');
  };

  const handleSubmit = async () => {
    if (submittingRef.current || !cart.length) return;
    submittingRef.current = true;
    setSubmitting(true);
    setStatusBanner('Mengirim…');
    const items = cart.map((c) => ({
      kodeBarang: c.kode,
      qty: c.qty,
      keterangan: c.keterangan || '',
      tanggal,
      clientItemId: c.clientItemId,
    }));
    try {
      const submitFn = txType === 'masuk' ? submitBarangMasuk : txType === 'rusak' ? submitBarangRusak : submitBarangKeluar;
      const res = await submitFn(entity, items, { tanggal });
      if (res?.success || res?.ok) {
        saveToHistory({ type: txType, entity, items: cart, tanggal, at: Date.now() });
        pushNotification({ type: 'success', title: 'Berhasil', body: cart.length + ' item ' + txType + ' ' + entity });
        setCart([]);
        setStatusBanner('Berhasil dikirim · ' + cart.length + ' item');
        setAccuracy(null);
      } else {
        const msg = res?.error || res?.message || 'Respons tidak jelas';
        pushNotification({ type: 'warn', title: 'Perlu cek antrian', body: msg });
        setStatusBanner(msg + ' — cek Atur → Sinkronisasi');
      }
    } catch (err) {
      pushNotification({ type: 'warn', title: 'Timeout / error', body: err.message || 'Cek antrian' });
      setStatusBanner((err.message || 'Gagal kirim') + ' — cek Atur → Sinkronisasi');
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
      setNotifs(getNotifications());
    }
  };

  const unread = unreadNotificationCount();

  return (
    <div className="pb-28 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <PackagePlus className="w-5 h-5 text-cyan-300" /> Input
        </h1>
        <button type="button" onClick={() => { setShowNotif((v) => !v); markNotificationsRead(); setNotifs(getNotifications()); }}
          className="relative p-2 rounded-xl bg-white/10 text-white">
          <Bell className="w-5 h-5" />
          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-[10px] flex items-center justify-center">{unread}</span>}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)}
          className="rounded-xl bg-white/10 border border-white/15 text-white text-sm px-3 py-2" />
        <div className="flex rounded-xl overflow-hidden border border-white/15">
          {['CV', 'PT'].map((e) => (
            <button key={e} type="button" onClick={() => setEntity(e)}
              className={`px-4 py-2 text-sm font-bold ${entity === e ? 'bg-cyan-600 text-white' : 'bg-white/10 text-white/70'}`}>{e}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {TX_TYPES.map((t) => {
          const Icon = t.icon;
          const on = txType === t.id;
          return (
            <button key={t.id} type="button" onClick={() => setTxType(t.id)}
              className={`rounded-2xl border px-2 py-3 flex flex-col items-center gap-1.5 transition ${
                on ? 'border-cyan-400/50 bg-cyan-500/20 text-white' : 'border-white/10 bg-white/5 text-white/70'
              }`}>
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${on ? 'bg-cyan-500 text-white' : 'bg-white/10'}`}>
                <Icon className="w-5 h-5" />
              </span>
              <span className="text-xs font-semibold">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          className="rounded-2xl border border-white/10 bg-white/5 px-2 py-3 flex flex-col items-center gap-1.5 text-white/80">
          <Upload className="w-5 h-5" /><span className="text-[11px] font-medium">PDF</span>
        </button>
        <button type="button" onClick={() => photoRef.current?.click()} disabled={busy}
          className="rounded-2xl border border-white/10 bg-white/5 px-2 py-3 flex flex-col items-center gap-1.5 text-white/80">
          <Image className="w-5 h-5" /><span className="text-[11px] font-medium">Foto</span>
        </button>
        <button type="button" onClick={() => (camOn ? stopCam() : startCam())}
          className={`rounded-2xl border px-2 py-3 flex flex-col items-center gap-1.5 ${
            camOn ? 'border-cyan-400/50 bg-cyan-500/20 text-white' : 'border-white/10 bg-white/5 text-white/80'
          }`}>
          <QrCode className="w-5 h-5" /><span className="text-[11px] font-medium">QR</span>
        </button>
        <button type="button" onClick={startVoice}
          className={`rounded-2xl border px-2 py-3 flex flex-col items-center gap-1.5 ${
            listening ? 'border-violet-400/50 bg-violet-500/20 text-white' : 'border-white/10 bg-white/5 text-white/80'
          }`}>
          <Mic className="w-5 h-5" /><span className="text-[11px] font-medium">{listening ? '…' : 'Suara'}</span>
        </button>
      </div>

      <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFile} />
      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

      {camOn && (
        <div className="rounded-2xl overflow-hidden border border-white/15 bg-black relative">
          <video ref={videoRef} className="w-full max-h-56 object-cover" playsInline muted />
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
            <button type="button" onClick={scanOnce} className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm font-semibold">Scan</button>
            <button type="button" onClick={stopCam} className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">Tutup</button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama / kode…"
            className="w-full rounded-xl bg-white/10 border border-white/15 text-white text-sm pl-9 pr-3 py-2.5 placeholder:text-white/40" />
        </div>
        <button type="button" onClick={() => setShowPaste(true)}
          className="px-3 rounded-xl bg-white/10 border border-white/15 text-white" title="Tempel teks">
          <Clipboard className="w-4 h-4" />
        </button>
      </div>

      {hits.length > 0 && (
        <div className="rounded-xl bg-slate-900/90 border border-white/10 max-h-40 overflow-y-auto">
          {hits.map((h) => (
            <button key={h.kode} type="button" onClick={() => { addToCart(h, 1); setQuery(''); setHits([]); }}
              className="w-full text-left px-3 py-2 hover:bg-cyan-500/20 text-sm text-white flex justify-between gap-2">
              <span className="truncate">{h.nama}</span>
              <span className="text-white/40 text-xs shrink-0">{h.kode}</span>
            </button>
          ))}
        </div>
      )}

      {(statusBanner || busy) && (
        <div className={`rounded-xl px-3 py-2 text-sm flex items-center gap-2 ${
          busy ? 'bg-cyan-500/20 text-cyan-100' : 'bg-white/10 text-white/80'
        }`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0 opacity-60" />}
          <span>{statusBanner || 'Memproses…'}</span>
        </div>
      )}

      {accuracy && (
        <div className="text-xs text-white/50 px-1">
          Akurasi {accuracy.pct}% · cocok {accuracy.matched} · dilewati {accuracy.skipped}
        </div>
      )}

      {cart.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-white/80">Keranjang ({cart.length})</p>
          {cart.map((c, idx) => (
            <div key={c.clientItemId || idx} className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{c.nama}</p>
                  <p className="text-[11px] text-white/40">{c.kode} · {c.satuan}</p>
                </div>
                <button type="button" onClick={() => removeCart(idx)} className="p-1 text-rose-300"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => updateQty(idx, -1)} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><Minus className="w-4 h-4" /></button>
                <input type="number" step="0.01" value={c.qty} onChange={(e) => setQtyValue(idx, e.target.value)}
                  className="w-16 text-center rounded-lg bg-white/10 border border-white/15 text-white text-sm py-1" />
                <button type="button" onClick={() => updateQty(idx, 1)} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><Plus className="w-4 h-4" /></button>
                <input value={c.keterangan} onChange={(e) => setKet(idx, e.target.value)} placeholder="Keterangan"
                  className="flex-1 rounded-lg bg-white/10 border border-white/15 text-white text-xs px-2 py-1.5 placeholder:text-white/30" />
              </div>
            </div>
          ))}
        </div>
      )}

      {showPaste && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/15 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <p className="font-semibold text-white">Tempel teks rekap</p>
              <button type="button" onClick={() => setShowPaste(false)}><X className="w-5 h-5 text-white/60" /></button>
            </div>
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6}
              className="w-full rounded-xl bg-white/10 border border-white/15 text-white text-sm p-3" placeholder="Tempel isi rekap order di sini…" />
            <button type="button" onClick={onPasteValidate} className="w-full py-3 rounded-xl bg-cyan-600 text-white font-semibold">Validasi & masuk keranjang</button>
          </div>
        </div>
      )}

      {showNotif && (
        <div className="rounded-xl bg-slate-900/95 border border-white/10 p-3 space-y-2 max-h-48 overflow-y-auto">
          <p className="text-xs font-semibold text-white/50 uppercase">Notifikasi</p>
          {notifs.length === 0 && <p className="text-sm text-white/40">Belum ada</p>}
          {notifs.slice(0, 8).map((n, i) => (
            <div key={i} className="text-sm text-white/80 border-b border-white/5 pb-1">
              <span className="font-medium">{n.title}</span>
              {n.body && <p className="text-xs text-white/50">{n.body}</p>}
            </div>
          ))}
        </div>
      )}

      {cart.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-30 px-3.5 max-w-lg mx-auto">
          <button type="button" onClick={handleSubmit} disabled={submitting}
            className="w-full py-3.5 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-60">
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            Kirim {cart.length} item · {txType} {entity}
          </button>
        </div>
      )}
    </div>
  );
}
