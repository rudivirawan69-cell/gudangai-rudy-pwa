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

const TX = [
  { id: 'masuk', label: 'Masuk', icon: PackagePlus },
  { id: 'keluar', label: 'Keluar', icon: PackageMinus },
  { id: 'rusak', label: 'Rusak', icon: AlertOctagon },
];

function todayStr() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export default function InputPage() {
  const [entity, setEntity] = useState('CV');
  const [txType, setTxType] = useState('keluar');
  const [tanggal, setTanggal] = useState(todayStr());
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [busy, setBusy] = useState(false);
  const [statusBanner, setStatusBanner] = useState('');
  const [accuracy, setAccuracy] = useState(null);
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [showNotif, setShowNotif] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const filePdfRef = useRef(null);
  const fileImgRef = useRef(null);
  const videoRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const submittingRef = useRef(false);
  const cartRef = useRef(null);

  useEffect(() => {
    setUnread(unreadNotificationCount());
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
    const rows = [];
    for (const m of matched || []) {
      const kode = m.kode || m.match?.kode || null;
      if (!kode) continue;
      const nama = m.nama || m.match?.nama || m.name || m.nameFromPdf || kode;
      const satuan = m.satuan || m.match?.satuan || 'Pack';
      const qty = Number(m.qty) > 0 ? Number(m.qty) : 1;
      const existing = rows.find((c) => c.kode === kode);
      if (existing) existing.qty = +(existing.qty + qty).toFixed(2);
      else rows.push({
        kode,
        nama,
        satuan,
        qty,
        keterangan: '',
        clientItemId: `${kode}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      });
    }
    setCart((prev) => {
      const next = [...prev];
      for (const r of rows) {
        const idx = next.findIndex((c) => c.kode === r.kode);
        if (idx >= 0) next[idx] = { ...next[idx], qty: +(next[idx].qty + r.qty).toFixed(2) };
        else next.push(r);
      }
      return next;
    });
    setTimeout(() => {
      try { cartRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}
    }, 150);
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
      let stock = null;
      try { stock = await fetchStock(useEntity, { allowDemo: false }); } catch (_) { stock = null; }
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
    const n = parseFloat(val);
    if (Number.isNaN(n)) return;
    setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, qty: +n.toFixed(2) } : c)));
  };
  const removeCart = (idx) => setCart((prev) => prev.filter((_, i) => i !== idx));
  const setKet = (idx, val) => setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, keterangan: val } : c)));

  const onPdfPick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    setStatusBanner('Membaca PDF…');
    try {
      const { text, lines } = await extractTextFromPdf(f);
      await runValidationPipeline(text, lines, 'PDF');
    } catch (err) {
      setStatusBanner(err.message || 'Gagal baca PDF');
      setBusy(false);
    }
  };

  const onImgPick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    setStatusBanner('OCR foto…');
    try {
      const { text, lines } = await extractTextFromImage(f);
      await runValidationPipeline(text, lines, 'Foto');
    } catch (err) {
      setStatusBanner(err.message || 'Gagal OCR');
      setBusy(false);
    }
  };

  const onPasteValidate = async () => {
    setShowPaste(false);
    await runValidationPipeline(pasteText, [], 'Tempel');
    setPasteText('');
  };

  const startScan = async () => {
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const code = await scanBarcodeFromVideo(videoRef.current);
      stream.getTracks().forEach((t) => t.stop());
      setScanning(false);
      if (code) {
        const found = searchMaster(entity, code);
        if (found[0]) addToCart(found[0], 1);
        else setStatusBanner('Barcode tidak cocok master: ' + code);
      }
    } catch (err) {
      setScanning(false);
      setStatusBanner(err.message || 'Gagal scan QR');
    }
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setStatusBanner('Suara tidak didukung di perangkat ini'); return; }
    const rec = new SR();
    rec.lang = 'id-ID';
    rec.onresult = (ev) => {
      const t = ev.results[0][0].transcript;
      setQuery(t);
      const found = searchMaster(entity, t);
      if (found[0]) addToCart(found[0], 1);
      else setStatusBanner('Suara: ' + t);
    };
    rec.onerror = () => setStatusBanner('Gagal rekam suara');
    rec.start();
  };

  const handleSubmit = async () => {
    if (submittingRef.current || !cart.length) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const items = cart.map((c) => ({
        kode: c.kode,
        nama: c.nama,
        qty: c.qty,
        satuan: c.satuan,
        keterangan: c.keterangan || '',
        clientItemId: c.clientItemId,
      }));
      const fn = txType === 'masuk' ? submitBarangMasuk : txType === 'rusak' ? submitBarangRusak : submitBarangKeluar;
      const res = await fn({ entity, tanggal, items });
      if (res?.success !== false) {
        saveToHistory({ type: txType, entity, items: cart, tanggal, at: Date.now() });
        pushNotification({ type: 'success', title: 'Berhasil', body: cart.length + ' item ' + txType + ' ' + entity });
        setCart([]);
        setStatusBanner('Berhasil dikirim · ' + cart.length + ' item');
        setAccuracy(null);
        window.dispatchEvent(new Event('gudangai-stock-refresh'));
      } else {
        setStatusBanner(res?.error || 'Gagal kirim');
      }
    } catch (err) {
      setStatusBanner(err.message || 'Gagal kirim');
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const openNotif = () => {
    setNotifs(getNotifications());
    markNotificationsRead();
    setUnread(0);
    setShowNotif((v) => !v);
  };

  return (
    <div className="pb-24 space-y-3 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <PackagePlus className="w-6 h-6 text-cyan-300" /> Input
        </h1>
        <button type="button" onClick={openNotif} className="relative p-2 rounded-xl bg-white/10">
          <Bell className="w-5 h-5" />
          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-[10px] flex items-center justify-center">{unread}</span>}
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input type="text" value={tanggal} onChange={(e) => setTanggal(e.target.value)}
          className="rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-sm w-32" />
        <div className="flex rounded-xl overflow-hidden border border-white/15">
          {['CV', 'PT'].map((e) => (
            <button key={e} type="button" onClick={() => setEntity(e)}
              className={`px-4 py-2 text-sm font-semibold ${entity === e ? 'bg-cyan-600 text-white' : 'bg-white/5 text-white/60'}`}>{e}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {TX.map((t) => {
          const Icon = t.icon;
          const on = txType === t.id;
          return (
            <button key={t.id} type="button" onClick={() => setTxType(t.id)}
              className={`rounded-2xl py-3 flex flex-col items-center gap-1 border ${on ? 'bg-cyan-600/90 border-cyan-400/50' : 'bg-white/5 border-white/10'}`}>
              <Icon className={`w-6 h-6 ${on ? 'text-white' : 'text-white/40'}`} />
              <span className="text-xs font-semibold">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button type="button" onClick={() => filePdfRef.current?.click()} disabled={busy}
          className="rounded-2xl bg-white/5 border border-white/10 py-3 flex flex-col items-center gap-1 disabled:opacity-50">
          <Upload className="w-5 h-5 text-white/70" /><span className="text-[11px] font-medium">PDF</span>
        </button>
        <button type="button" onClick={() => fileImgRef.current?.click()} disabled={busy}
          className="rounded-2xl bg-white/5 border border-white/10 py-3 flex flex-col items-center gap-1 disabled:opacity-50">
          <Image className="w-5 h-5 text-white/70" /><span className="text-[11px] font-medium">Foto</span>
        </button>
        <button type="button" onClick={startScan} disabled={busy || scanning}
          className="rounded-2xl bg-white/5 border border-white/10 py-3 flex flex-col items-center gap-1 disabled:opacity-50">
          <QrCode className="w-5 h-5 text-white/70" /><span className="text-[11px] font-medium">QR</span>
        </button>
        <button type="button" onClick={startVoice} disabled={busy}
          className="rounded-2xl bg-white/5 border border-white/10 py-3 flex flex-col items-center gap-1 disabled:opacity-50">
          <Mic className="w-5 h-5 text-white/70" /><span className="text-[11px] font-medium">Suara</span>
        </button>
      </div>
      <input ref={filePdfRef} type="file" accept="application/pdf" className="hidden" onChange={onPdfPick} />
      <input ref={fileImgRef} type="file" accept="image/*" className="hidden" onChange={onImgPick} />

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama / kode…"
            className="w-full rounded-xl bg-white/10 border border-white/15 pl-9 pr-3 py-2.5 text-sm placeholder:text-white/30" />
        </div>
        <button type="button" onClick={() => setShowPaste(true)} className="p-2.5 rounded-xl bg-white/10 border border-white/15">
          <Clipboard className="w-5 h-5 text-white/70" />
        </button>
      </div>

      {hits.length > 0 && (
        <div className="rounded-xl bg-slate-900/90 border border-white/10 max-h-40 overflow-y-auto">
          {hits.map((h) => (
            <button key={h.kode} type="button" onClick={() => { addToCart(h); setQuery(''); setHits([]); }}
              className="w-full text-left px-3 py-2 border-b border-white/5 hover:bg-white/5">
              <p className="text-sm font-medium truncate">{h.nama}</p>
              <p className="text-[11px] text-white/40">{h.kode} · {h.satuan}</p>
            </button>
          ))}
        </div>
      )}

      {scanning && (
        <div className="rounded-xl overflow-hidden border border-white/15">
          <video ref={videoRef} className="w-full h-48 object-cover bg-black" muted playsInline />
          <p className="text-xs text-center py-1 text-white/50">Arahkan ke barcode…</p>
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
        <div ref={cartRef} className="space-y-2 pb-16">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-white">Keranjang ({cart.length})</p>
            <button type="button" onClick={() => setCart([])} className="text-[11px] text-rose-300 font-semibold">Kosongkan</button>
          </div>
          {cart.map((c, idx) => (
            <div key={c.clientItemId || idx} className="rounded-2xl bg-white border border-slate-200 shadow-sm p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{c.nama}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{c.kode} · {c.satuan}</p>
                </div>
                <button type="button" onClick={() => removeCart(idx)} className="p-1 text-rose-500"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => updateQty(idx, -1)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center"><Minus className="w-4 h-4" /></button>
                <input type="number" step="0.01" value={c.qty} onChange={(e) => setQtyValue(idx, e.target.value)}
                  className="w-16 text-center rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold py-1 tabular-nums" />
                <button type="button" onClick={() => updateQty(idx, 1)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center"><Plus className="w-4 h-4" /></button>
                <input value={c.keterangan} onChange={(e) => setKet(idx, e.target.value)} placeholder="Keterangan"
                  className="flex-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-xs px-2 py-1.5 placeholder:text-slate-400" />
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
