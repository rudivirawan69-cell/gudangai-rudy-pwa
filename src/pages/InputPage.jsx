import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Search, Trash2, Send, Loader2,
  Plus, Minus,
  PackagePlus, PackageMinus, AlertOctagon, Mic, Upload,
  QrCode, Bell, Camera, X, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import {
  extractTextFromPdf, parseLinesFromText, validateItems, applyStockAwareFallback,
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

/**
 * Alur sesuai Acuan Ketat D:
 * Upload PDF → langsung keranjang (1 langkah).
 * MATCH → status ok. TIDAK match / ambigu → status flag di keranjang.
 * Tidak ada panel validasi terpisah.
 */
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
  const [pendingManualIdx, setPendingManualIdx] = useState(null);
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recogRef = useRef(null);

  useEffect(() => {
    const refresh = () => {
      setNotifs(getNotifications());
      setUnread(unreadNotificationCount());
    };
    refresh();
    window.addEventListener('gudangai-notif', refresh);
    return () => window.removeEventListener('gudangai-notif', refresh);
  }, []);

  const onSearch = (q) => {
    setQuery(q);
    setHits(q.length >= 1 ? searchMaster(entity, q).slice(0, 8) : []);
  };

  const addToCart = (item, qty = 1) => {
    if (pendingManualIdx != null) {
      setCart((prev) => prev.map((c, i) => {
        if (i !== pendingManualIdx) return c;
        return {
          ...c,
          kode: item.kode,
          nama: item.nama,
          satuan: item.satuan,
          status: 'ok',
          candidates: [],
          keterangan: c.keterangan || '',
        };
      }));
      setPendingManualIdx(null);
      setQuery('');
      setHits([]);
      setStatusBanner('Item ditandai cocok: ' + item.nama);
      return;
    }
    setCart((prev) => {
      const i = prev.findIndex((c) => c.kode === item.kode && c.status === 'ok');
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: +(next[i].qty + (qty || 1)).toFixed(2) };
        return next;
      }
      return [...prev, {
        kode: item.kode,
        nama: item.nama,
        satuan: item.satuan,
        qty: qty || 1,
        keterangan: '',
        status: 'ok',
      }];
    });
    setQuery('');
    setHits([]);
  };

  const mergePdfIntoCart = useCallback((matched, amb, un) => {
    setCart((prev) => {
      const byKode = new Map();
      for (const c of prev) {
        if (c.status === 'ok' && c.kode && !c.fromPdf) {
          byKode.set(c.kode, { ...c });
        }
      }
      for (const r of matched) {
        const kode = r.kode;
        if (!kode) continue;
        const qty = r.qty || 1;
        if (byKode.has(kode)) {
          const cur = byKode.get(kode);
          byKode.set(kode, {
            ...cur,
            qty: +(cur.qty + qty).toFixed(2),
            fromPdf: true,
            status: r.fallback ? 'fallback' : 'ok',
            note: r.fallback || '',
          });
        } else {
          byKode.set(kode, {
            kode,
            nama: r.nama,
            satuan: r.satuan,
            qty,
            keterangan: '',
            status: r.fallback ? 'fallback' : 'ok',
            fromPdf: true,
            nameFromPdf: r.nameFromPdf,
            note: r.fallback || '',
          });
        }
      }
      const flags = [];
      for (const r of amb) {
        flags.push({
          kode: r.kode || '',
          nama: r.nameFromPdf || r.nama || 'Ambigu',
          satuan: r.satuan || '',
          qty: r.qty || 1,
          keterangan: '',
          status: 'flag',
          fromPdf: true,
          nameFromPdf: r.nameFromPdf,
          candidates: r.candidates || [],
          note: r.warning || 'Pilih master yang benar.',
        });
      }
      for (const r of un) {
        flags.push({
          kode: '',
          nama: r.nameFromPdf || 'Tidak dikenali',
          satuan: '',
          qty: r.qty || 1,
          keterangan: '',
          status: 'flag',
          fromPdf: true,
          nameFromPdf: r.nameFromPdf,
          candidates: searchMaster(entity, r.nameFromPdf || '').slice(0, 4),
          note: 'Validasi manual diperlukan.',
        });
      }
      return [...byKode.values(), ...flags];
    });
  }, [entity]);

  const updateQty = (idx, delta) => {
    setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, qty: Math.max(0.01, +(c.qty + delta).toFixed(2)) } : c)));
  };
  const setQtyValue = (idx, val) => {
    const n = parseFloat(String(val).replace(',', '.'));
    setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, qty: Number.isFinite(n) && n > 0 ? +n.toFixed(2) : c.qty } : c)));
  };
  const updateKet = (idx, val) => {
    setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, keterangan: val } : c)));
  };
  const removeFromCart = (idx) => setCart((prev) => prev.filter((_, i) => i !== idx));

  const resolveFlag = (idx, item) => {
    if (!item) return;
    setCart((prev) => prev.map((c, i) => {
      if (i !== idx) return c;
      return {
        ...c,
        kode: item.kode,
        nama: item.nama,
        satuan: item.satuan,
        status: 'ok',
        candidates: [],
        note: '',
      };
    }));
  };

  const stopCam = () => {
    try { streamRef.current?.getTracks()?.forEach((t) => t.stop()); } catch (_) {}
    streamRef.current = null;
    setCamOn(false);
  };

  const startCam = async () => {
    setCamErr('');
    setMode('qr');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCamOn(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 50);
    } catch (err) {
      setCamErr(err.message || 'Kamera tidak tersedia');
      setCamOn(false);
    }
  };

  const scanOnce = async () => {
    if (!videoRef.current) return;
    const res = await scanBarcodeFromVideo(videoRef.current);
    if (res.ok && res.value) {
      const found = searchMaster(entity, res.value);
      if (found.length) {
        addToCart(found[0], 1);
        setStatusBanner('QR: ' + found[0].nama + ' masuk keranjang');
        stopCam();
      } else {
        setQuery(res.value);
        onSearch(res.value);
        setMode('search');
        stopCam();
      }
    } else {
      setCamErr(res.error || 'Tidak terdeteksi');
    }
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setStatusBanner('Browser ini belum mendukung suara. Gunakan Chrome.');
      return;
    }
    try { recogRef.current?.stop(); } catch (_) {}
    const rec = new SR();
    rec.lang = 'id-ID';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      const text = ev.results?.[0]?.[0]?.transcript || '';
      setListening(false);
      if (!text) return;
      setMode('search');
      onSearch(text);
      setStatusBanner('Suara: ' + text);
    };
    rec.onerror = () => { setListening(false); setStatusBanner('Suara gagal. Coba lagi.'); };
    rec.onend = () => setListening(false);
    recogRef.current = rec;
    setListening(true);
    rec.start();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatusBanner('');
    setAccuracy(null);
    try {
      const result = await extractTextFromPdf(file, () => {});
      const text = typeof result === 'string' ? result : (result?.text || '');
      const lines = result?.lines || [];
      const detected = detectEntityFromText(text);
      const useEntity = detected || entity;
      if (detected && detected !== entity) setEntity(detected);
      const rows = parseLinesFromText(text, lines);
      if (!rows.length) {
        setStatusBanner('Tidak ada baris barang terdeteksi.');
        return;
      }
      const validation = validateItems(rows, useEntity);
      const stock = await fetchStock(useEntity, { allowDemo: false });
      const matched = applyStockAwareFallback(validation.matched || [], useEntity, stock);
      const amb = validation.ambiguous || [];
      const un = validation.unmatched || [];
      const total = matched.length + amb.length + un.length;
      const acc = total ? Math.round((matched.length / total) * 100) : 0;
      setAccuracy({ pct: acc, matched: matched.length, skipped: un.length + amb.length, total });

      mergePdfIntoCart(matched, amb, un);

      const fallbackItems = matched.filter((r) => r.fallback);
      if (fallbackItems.length) {
        pushNotification({
          type: 'warn',
          title: 'Fallback stok',
          body: fallbackItems.map((f) => `${f.nameFromPdf} → ${f.nama}`).join('; '),
        });
      }

      setStatusBanner(
        matched.length
          ? ('Validasi ' + acc + '% · ' + matched.length + ' cocok masuk keranjang'
            + ((un.length || amb.length) ? (' · ' + (un.length + amb.length) + ' perlu cek') : ''))
          : 'Tidak ada nama yang cocok di master/alias.'
      );
    } catch (err) {
      setStatusBanner(err.message || 'Gagal membaca PDF');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submitCart = () => {
    if (submitting || submittingRef.current) return;
    const ready = cart.filter((c) => c.kode && (c.status === 'ok' || c.status === 'fallback'));
    const flagged = cart.filter((c) => c.status === 'flag');
    if (!ready.length) {
      setStatusBanner(flagged.length
        ? 'Masih ada item yang perlu dipilih master-nya.'
        : 'Keranjang kosong.');
      return;
    }
    setSubmitting(true);
    submittingRef.current = true;
    const snapshot = ready.map((c) => ({
      kode: c.kode,
      nama: c.nama,
      qty: c.qty,
      keterangan: (c.keterangan || '').slice(0, 200),
    }));
    setCart((prev) => prev.filter((c) => c.status === 'flag'));
    setStatusBanner('Mengirim ' + snapshot.length + ' item… hasil di lonceng');

    const submitFn = txType === 'masuk' ? submitBarangMasuk : txType === 'rusak' ? submitBarangRusak : submitBarangKeluar;

    const releaseTimer = setTimeout(() => {
      setSubmitting(false);
      submittingRef.current = false;
    }, 4000);

    submitFn(entity, snapshot, { tanggal })
      .then((res) => {
        saveToHistory({ type: txType, entity, tanggal, items: snapshot, ...res });
        if (res.success) {
          pushNotification({
            type: 'ok',
            title: 'Kirim berhasil',
            body: (res.written || snapshot.length) + ' item ' + (txType === 'masuk' ? 'Masuk' : txType === 'rusak' ? 'Rusak' : 'Keluar') + ' ' + entity + ' tercatat.',
          });
        } else {
          pushNotification({
            type: res.offline ? 'warn' : 'err',
            title: res.offline ? 'Disimpan antrian offline' : 'Kirim bermasalah',
            body: res.error || 'Cek Atur → Offline & Sync',
          });
        }
      })
      .catch((err) => {
        pushNotification({ type: 'err', title: 'Kirim gagal', body: err.message || 'Error jaringan' });
      })
      .finally(() => {
        clearTimeout(releaseTimer);
        setSubmitting(false);
        submittingRef.current = false;
      });
  };

  const typeLabel = txType === 'masuk' ? 'Masuk' : txType === 'rusak' ? 'Rusak' : 'Keluar';
  const submitGradient = txType === 'masuk' ? 'from-emerald-500 to-teal-600' : txType === 'rusak' ? 'from-rose-500 to-red-600' : 'from-teal-500 to-emerald-600';
  const readyCount = cart.filter((c) => c.kode && (c.status === 'ok' || c.status === 'fallback')).length;
  const flagCount = cart.filter((c) => c.status === 'flag').length;

  return (
    <div className="pb-28 animate-fade-in space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">Input Transaksi</p>
        <button type="button" onClick={() => { setShowNotif((v) => !v); markNotificationsRead(); setUnread(0); }}
          className="relative w-10 h-10 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-600" aria-label="Notifikasi">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>
          )}
        </button>
      </div>

      {showNotif && (
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-3 max-h-52 overflow-y-auto">
          {notifs.length === 0 ? (
            <p className="text-[11px] text-slate-400 text-center py-3">Belum ada notifikasi</p>
          ) : (
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
            <button key={id} type="button" onClick={() => setTxType(id)}
              className={`relative rounded-2xl border bg-white px-2 py-3.5 flex flex-col items-center gap-2 ${on ? active : 'border-slate-100 shadow-sm'}`}>
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${on ? iconBg : iconIdle}`}><Icon className="w-5 h-5" /></div>
              <span className={`text-[12px] font-semibold ${on ? 'text-slate-800' : 'text-slate-500'}`}>{label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 p-1 bg-slate-100/80 rounded-2xl">
        {['CV', 'PT'].map((e) => (
          <button key={e} type="button" onClick={() => { setEntity(e); setHits([]); setQuery(''); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${entity === e ? 'bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-md' : 'text-slate-500'}`}>{e}</button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={startCam} className={`rounded-2xl border px-2 py-3 flex flex-col items-center gap-1.5 ${mode === 'qr' ? 'border-cyan-200 bg-cyan-50/80' : 'border-slate-100 bg-white'}`}>
          <QrCode className="w-4 h-4 text-cyan-600" />
          <span className="text-[11px] font-semibold text-slate-600">QR / Kamera</span>
        </button>
        <button type="button" onClick={startVoice} className={`rounded-2xl border px-2 py-3 flex flex-col items-center gap-1.5 ${listening ? 'border-violet-300 bg-violet-50' : 'border-slate-100 bg-white'}`}>
          <Mic className={`w-4 h-4 ${listening ? 'text-violet-600' : 'text-violet-500'}`} />
          <span className="text-[11px] font-semibold text-slate-600">{listening ? 'Mendengar…' : 'Suara'}</span>
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-2xl border border-slate-100 bg-white px-2 py-3 flex flex-col items-center gap-1.5">
          <Upload className="w-4 h-4 text-cyan-500" />
          <span className="text-[11px] font-semibold text-slate-600">PDF / Validasi</span>
        </button>
      </div>

      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={onFile} />

      {camOn && (
        <div className="rounded-2xl overflow-hidden bg-black relative">
          <video ref={videoRef} autoPlay playsInline className="w-full h-48 object-cover" />
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
            <button type="button" onClick={scanOnce} className="px-3 py-1.5 rounded-full bg-white text-xs font-bold flex items-center gap-1"><Camera className="w-3.5 h-3.5" /> Scan</button>
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
        <div className="rounded-2xl bg-white border border-slate-100 px-3 py-2.5 text-[12px] text-slate-600">
          Akurasi <b className="text-violet-700">{accuracy.pct}%</b> · cocok {accuracy.matched}/{accuracy.total}
          {accuracy.skipped ? ' · perlu cek ' + accuracy.skipped : ''}
        </div>
      )}
      {statusBanner && <div className="text-[11px] px-3 py-2.5 rounded-xl bg-white/90 border border-slate-100 text-slate-600">{statusBanner}</div>}

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
        <div className="rounded-2xl bg-white border border-slate-100 p-3 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-slate-600">
              Keranjang ({cart.length})
              {readyCount > 0 && <span className="ml-1 text-emerald-600">· {readyCount} siap</span>}
              {flagCount > 0 && <span className="ml-1 text-amber-600">· {flagCount} perlu cek</span>}
            </p>
          </div>
          <div className="space-y-2.5 max-h-96 overflow-y-auto">
            {cart.map((c, idx) => (
              <div key={(c.kode || c.nameFromPdf || 'x') + '-' + idx} className={`rounded-xl border p-2.5 ${c.status === 'flag' ? 'bg-amber-50/80 border-amber-200' : c.status === 'fallback' ? 'bg-amber-50/50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {c.status === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                      {(c.status === 'flag' || c.status === 'fallback') && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      <p className="text-[12px] font-semibold text-slate-800 truncate">{c.nama}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {c.kode ? `${c.kode} · ${c.satuan || ''}` : 'Belum ada kode'}
                      {c.status === 'flag' && ' · perlu pilih master'}
                      {c.status === 'fallback' && ' · fallback stok'}
                    </p>
                    {c.note && <p className="text-[10px] text-amber-700 mt-1">{c.note}</p>}
                  </div>
                  <button type="button" onClick={() => removeFromCart(idx)} className="p-1 text-slate-400 hover:text-rose-500" aria-label="Hapus">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {c.status === 'flag' && c.candidates?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {c.candidates.map((cand) => (
                      <button key={cand.kode} type="button" onClick={() => resolveFlag(idx, cand)}
                        className="text-[10px] px-2 py-1 rounded-lg bg-white border border-teal-200 text-teal-700 font-semibold">
                        Pilih {cand.kode} · {cand.nama}
                      </button>
                    ))}
                  </div>
                )}
                {c.status === 'flag' && (
                  <button type="button"
                    onClick={() => { setPendingManualIdx(idx); setQuery(c.nameFromPdf || c.nama); setHits(searchMaster(entity, c.nameFromPdf || c.nama).slice(0, 8)); }}
                    className="mt-2 text-[10px] px-2 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 font-semibold">
                    Cari & pilih master
                  </button>
                )}

                <div className="mt-2.5 grid grid-cols-[1fr_1.4fr] gap-2">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Qty</p>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => updateQty(idx, -1)} className="w-8 h-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center"><Minus className="w-3.5 h-3.5 text-slate-500" /></button>
                      <input type="number" step="0.01" value={c.qty} onChange={(e) => setQtyValue(idx, e.target.value)} className="flex-1 min-w-0 text-center text-sm font-bold border border-slate-100 rounded-xl py-1.5 bg-white" />
                      <button type="button" onClick={() => updateQty(idx, 1)} className="w-8 h-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center"><Plus className="w-3.5 h-3.5 text-slate-500" /></button>
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Keterangan</p>
                    <input value={c.keterangan} onChange={(e) => updateKet(idx, e.target.value)} placeholder="Isi manual" className="w-full text-[12px] px-2.5 py-2 bg-white border border-slate-100 rounded-xl" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {cart.length === 0 && !busy && (
        <p className="text-center text-[12px] text-slate-400 py-4">Unggah PDF, scan QR, suara, atau cari nama barang.</p>
      )}

      {cart.length > 0 && (
        <div className="fixed bottom-[4.25rem] left-0 right-0 z-40 px-3 pointer-events-none">
          <div className="max-w-lg mx-auto pointer-events-auto">
            <button type="button" onClick={submitCart} disabled={submitting || readyCount === 0}
              className={`w-full py-3.5 rounded-2xl bg-gradient-to-r ${submitGradient} text-white text-sm font-bold flex items-center justify-center gap-2 shadow-xl disabled:opacity-70`}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {submitting
                ? 'Mengirim…'
                : readyCount === 0
                  ? `Selesaikan ${flagCount} item dulu`
                  : `Kirim ${readyCount} item · ${typeLabel} (${entity})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
