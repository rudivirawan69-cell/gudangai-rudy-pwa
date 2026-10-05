import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Search, Trash2, Send, Loader2,
  Plus, Minus,
  PackagePlus, PackageMinus, AlertOctagon, Mic, Upload,
  QrCode, Bell, X, CheckCircle2, Clipboard, Image,
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
import { useBootstrapRevision } from '../hooks/useBootstrapRevision';
import { searchLiveStock } from '../data/liveSearch';

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
  const [stockCatalog, setStockCatalog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [statusBanner, setStatusBanner] = useState('');
  const [accuracy, setAccuracy] = useState(null);
  const [cart, setCart] = useState([]);
  const [pdfReview, setPdfReview] = useState([]);
  const [showPhotoSource, setShowPhotoSource] = useState(false);
  const [photoCameraOpen, setPhotoCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [showNotif, setShowNotif] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const filePdfRef = useRef(null);
  const fileImgRef = useRef(null);
  const videoRef = useRef(null);
  const photoVideoRef = useRef(null);
  const photoStreamRef = useRef(null);
  const photoCanvasRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [dense, setDense] = useState(() => (localStorage.getItem('gudangai_density') || 'comfortable') === 'compact');
  const submittingRef = useRef(false);
  const cartRef = useRef(null);
  const scanAbortRef = useRef(false);
  const bootstrapRevision = useBootstrapRevision();

  useEffect(() => {
    const refreshUnread = () => setUnread(unreadNotificationCount());
    refreshUnread();
    window.addEventListener('gudangai-notification', refreshUnread);
    return () => window.removeEventListener('gudangai-notification', refreshUnread);
  }, [showNotif]);
  useEffect(() => {
    const handler = (e) => {
      const d = e.detail || {};
      setSubmitProgress({ sent: d.sent || 0, total: d.total || 0, success: d.success || 0, failed: d.failed || 0 });
    };
    window.addEventListener('gudangai-submit-progress', handler);
    return () => window.removeEventListener('gudangai-submit-progress', handler);
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchStock(entity, { allowDemo: true });
        if (!cancelled && Array.isArray(list)) setStockCatalog(list);
      } catch (_) {
        if (!cancelled) setStockCatalog([]);
      }
    })();
    return () => { cancelled = true; };
  }, [entity]);
  useEffect(() => {
    if (!query.trim()) { setHits([]); return; }
    const t = setTimeout(() => {
      const q = query.trim();
      const live = searchLiveStock(stockCatalog, q);
      const staticHits = searchMaster(entity, q);
      const seen = new Set();
      const merged = [];
      for (const it of [...live, ...staticHits]) {
        const kode = String(it.kode || it.kodeBarang || '').trim();
        if (!kode || seen.has(kode)) continue;
        seen.add(kode);
        merged.push({ kode, nama: it.nama || '', satuan: it.satuan || 'Pack', divisi: it.divisi || '', stok: it.stok ?? it.stockAkhir });
      }
      setHits(merged.slice(0, 80));
    }, 180);
    return () => clearTimeout(t);
  }, [query, entity, stockCatalog, bootstrapRevision]);

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
        kode: item.kode, nama: item.nama || item.name, satuan: item.satuan || 'Pack',
        qty: +qty || 1, keterangan: '',
        clientItemId: 'CI-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2, 9)),
      }];
    });
  }, []);

  const mergePdfIntoCart = useCallback((matched, review = []) => {
    const rows = [];
    for (const m of matched || []) {
      const kode = m.kode || m.match?.kode || m.match?.item?.kode || m.item?.kode || null;
      if (!kode) continue;
      const nama = m.nama || m.match?.nama || m.match?.item?.nama || m.name || m.nameFromPdf || kode;
      const satuan = m.satuan || m.match?.satuan || m.match?.item?.satuan || 'Pack';
      const qty = Number(m.qty) > 0 ? Number(m.qty) : 1;
      const existing = rows.find((c) => c.kode === kode);
      if (existing) existing.qty = +(existing.qty + qty).toFixed(2);
      else rows.push({ kode, nama, satuan, qty, pdfSourceIndex: Number(m.sourceIndex) || 0, keterangan: '', clientItemId: 'CI-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2, 9)) });
    }
    const unresolvedRows = (review || []).map((r, idx) => ({
      kode: '',
      nama: r.namaPdf || r.nameFromPdf || r.rawName || 'Item PDF tidak terbaca',
      satuan: '—',
      qty: Number(r.qty) || 0,
      keterangan: '',
      unmatched: true,
      pdfReviewIndex: idx,
      pdfSourceIndex: Number(r.sourceIndex) || 0,
      clientItemId: 'CI-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2, 9)),
    }));
    setCart((prev) => {
      const next = [...prev];
      for (const r of rows) {
        const idx = next.findIndex((c) => c.kode === r.kode && c.kode);
        if (idx >= 0) next[idx] = { ...next[idx], qty: +(Number(next[idx].qty) + r.qty).toFixed(2) };
        else next.push(r);
      }
      for (const r of unresolvedRows) next.push(r);
      return next;
    });
    setTimeout(() => { try { cartRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); } catch (_) {} }, 150);
  }, []);

  const runValidationPipeline = useCallback(async (text, lines = [], sourceLabel = 'Validasi') => {
    if (!text || !String(text).trim()) { setStatusBanner('Tidak ada teks untuk divalidasi.'); return; }
    setBusy(true); setStatusBanner(''); setAccuracy(null);
    try {
      const detected = detectEntityFromText(text);
      const useEntity = detected || entity;
      if (detected && detected !== entity) setEntity(detected);
      const rows = parseLinesFromText(text, lines);
      if (!rows.length) { setStatusBanner('Tidak ada baris barang terdeteksi dari ' + sourceLabel + '.'); return; }
      const validation = validateItems(rows, useEntity);
      let stock = null;
      try { stock = await fetchStock(useEntity, { allowDemo: false }); } catch (_) { stock = null; }
      const matched = applyStockAwareFallback(validation.matched || [], useEntity, stock)
        .filter((m) => !/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/.test(String(m?.nameFromPdf || m?.rawName || '')))
        .filter((m) => !/\b(?:periode|period|minggu)\b.*\d{4}/i.test(String(m?.nameFromPdf || m?.rawName || '')));
      const amb = validation.ambiguous || [];
      const un = validation.unmatched || [];
      const review = [...amb, ...un].map((r, idx) => ({
        ...r,
        reviewNo: idx + 1,
        namaPdf: r.nameFromPdf || r.rawName || r.name || '',
        qty: Number(r.qty) || 0,
      }));
      const total = matched.length + amb.length + un.length;
      const acc = total ? Math.round((matched.length / total) * 100) : 0;
      setAccuracy({ pct: acc, matched: matched.length, skipped: 0, needPick: review.length, total });
      // Only confirmed master matches enter the transaction cart.
      // Unmatched/ambiguous rows are retained for manual mapping; nothing is silently dropped.
      mergePdfIntoCart(matched, review);
      setPdfReview(review);
      const parts = [];
      if (matched.length) parts.push(matched.length + ' cocok');
      if (review.length) parts.push(review.length + ' perlu validasi');
      setStatusBanner(sourceLabel + ' ' + total + ' baris · ' + parts.join(' · '));
    } catch (err) {
      setStatusBanner(err.message || 'Gagal memvalidasi ' + sourceLabel);
    } finally { setBusy(false); }
  }, [entity, mergePdfIntoCart]);

  const updateQty = (idx, delta) => setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, qty: Math.max(0.01, +(c.qty + delta).toFixed(2)) } : c)));
  const setQtyValue = (idx, val) => {
    if (val === '') { setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, qty: '' } : c))); return; }
    const n = parseFloat(val); if (Number.isNaN(n)) return;
    setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, qty: +n.toFixed(2) } : c)));
  };
  const removeCart = (idx) => setCart((prev) => prev.filter((_, i) => i !== idx));
  const setKet = (idx, val) => setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, keterangan: val } : c)));

  const onPdfPick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setBusy(true); setStatusBanner('Membaca PDF…');
    try {
      const res = await extractTextFromPdf(f, (msg) => setStatusBanner(String(msg || 'Membaca PDF…')));
      if (res && res.ok === false) { setStatusBanner(res.error || 'Gagal baca PDF'); setBusy(false); return; }
      const text = res?.text || ''; const lines = res?.lines || [];
      if (!text.trim()) { setStatusBanner('PDF tidak berisi teks terbaca.'); setBusy(false); return; }
      await runValidationPipeline(text, lines, 'PDF');
    } catch (err) { setStatusBanner(err.message || 'Gagal baca PDF'); setBusy(false); }
  };

  const onImgPick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setBusy(true); setStatusBanner('OCR foto…');
    try {
      const res = await extractTextFromImage(f, (msg) => setStatusBanner(String(msg || 'OCR foto…')));
      if (res && res.ok === false) { setStatusBanner(res.error || 'Gagal OCR foto'); setBusy(false); return; }
      const text = res?.text || ''; const lines = res?.lines || [];
      if (!text.trim()) { setStatusBanner('Foto tidak berisi teks terbaca. Coba foto lebih jelas.'); setBusy(false); return; }
      await runValidationPipeline(text, lines, 'Foto');
    } catch (err) { setStatusBanner(err.message || 'Gagal OCR foto'); setBusy(false); }
  };

  const openPhotoCamera = async () => {
    setShowPhotoSource(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatusBanner('Kamera tidak didukung di perangkat ini. Gunakan Galeri.');
      return;
    }
    try {
      setBusy(true);
      setStatusBanner('Menyiapkan tampilan kamera…');
      setPhotoCameraOpen(true);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      setStatusBanner('Menyalakan kamera…');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      photoStreamRef.current = stream;
      const video = photoVideoRef.current;
      if (!video) throw new Error('Tampilan kamera belum siap');
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      await video.play();
      await new Promise((resolve) => {
        if (video.readyState >= 2) resolve();
        else {
          const done = () => { video.removeEventListener('loadeddata', done); resolve(); };
          video.addEventListener('loadeddata', done, { once: true });
          setTimeout(resolve, 1500);
        }
      });
      setBusy(false);
      setStatusBanner('Kamera siap — arahkan ke daftar barang lalu tekan Ambil Foto.');
    } catch (err) {
      try { photoStreamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch (_) {}
      photoStreamRef.current = null;
      setPhotoCameraOpen(false);
      setBusy(false);
      setStatusBanner(err?.name === 'NotAllowedError'
        ? 'Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser/HP.'
        : (err?.message || 'Gagal membuka kamera.'));
    }
  };

  const closePhotoCamera = () => {
    try { photoStreamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch (_) {}
    photoStreamRef.current = null;
    if (photoVideoRef.current) photoVideoRef.current.srcObject = null;
    setPhotoCameraOpen(false);
  };

  const capturePhotoAndValidate = async () => {
    const video = photoVideoRef.current;
    if (!video || video.readyState < 2) {
      setStatusBanner('Kamera belum siap. Tunggu beberapa saat.');
      return;
    }
    try {
      setBusy(true);
      setStatusBanner('Mengambil foto…');
      const canvas = photoCanvasRef.current || document.createElement('canvas');
      photoCanvasRef.current = canvas;
      const maxWidth = 2200;
      const scale = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
      canvas.width = Math.max(1, Math.round((video.videoWidth || maxWidth) * scale));
      canvas.height = Math.max(1, Math.round((video.videoHeight || 1200) * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Gagal membuat foto')), 'image/jpeg', 0.92);
      });
      closePhotoCamera();
      const file = new File([blob], 'gudangai-camera-' + Date.now() + '.jpg', { type: 'image/jpeg' });
      const res = await extractTextFromImage(file, (msg) => setStatusBanner(String(msg || 'OCR foto…')));
      if (res && res.ok === false) { setStatusBanner(res.error || 'Gagal OCR foto'); return; }
      const text = res?.text || '';
      const lines = res?.lines || [];
      if (!text.trim()) {
        setStatusBanner('Foto tidak berisi teks terbaca. Ambil foto ulang dengan pencahayaan dan fokus lebih baik.');
        return;
      }
      await runValidationPipeline(text, lines, 'Foto');
    } catch (err) {
      closePhotoCamera();
      setBusy(false);
      setStatusBanner(err?.message || 'Gagal mengambil / membaca foto');
    }
  };

  const openPhotoGallery = () => {
    setShowPhotoSource(false);
    fileImgRef.current?.click();
  };

  const onPasteValidate = async () => { setShowPaste(false); await runValidationPipeline(pasteText, [], 'Tempel'); setPasteText(''); };

  const startScan = async () => {
    if (scanning) return;
    if (!navigator.mediaDevices?.getUserMedia) { setStatusBanner('Kamera tidak didukung di perangkat ini.'); return; }
    scanAbortRef.current = false; setScanning(true); setStatusBanner('Menyalakan kamera… arahkan ke barcode/QR');
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      const video = videoRef.current;
      if (!video) throw new Error('Video belum siap');
      video.srcObject = stream; video.setAttribute('playsinline', 'true'); video.muted = true; await video.play();
      await new Promise((r) => { if (video.readyState >= 2) r(); else video.onloadeddata = () => r(); });
      await new Promise((r) => setTimeout(r, 400));
      const deadline = Date.now() + 15000; let value = null; let lastErr = '';
      while (Date.now() < deadline && !scanAbortRef.current) {
        const res = await scanBarcodeFromVideo(video);
        if (res && res.ok && res.value) { value = res.value; break; }
        if (res && res.error && !/tidak ada barcode/i.test(res.error)) lastErr = res.error;
        await new Promise((r) => setTimeout(r, 350));
      }
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
      setScanning(false);
      if (value) {
        const live = searchLiveStock(stockCatalog, String(value));
        const st = searchMaster(entity, String(value));
        const s = new Set(); const found = [];
        for (const it of [...live, ...st]) { const k = String(it.kode || '').trim(); if (!k || s.has(k)) continue; s.add(k); found.push({ kode: k, nama: it.nama || '', satuan: it.satuan || 'Pack', divisi: it.divisi || '', stok: it.stok ?? it.stockAkhir }); }
        if (found[0]) { addToCart(found[0], 1); setStatusBanner('Barcode cocok: ' + found[0].nama); }
        else { setQuery(String(value)); setStatusBanner('Barcode tidak cocok master: ' + value); }
      } else if (!scanAbortRef.current) {
        setStatusBanner(lastErr || 'Tidak ada barcode terdeteksi (15 dtk). Coba lagi / pastikan cahaya cukup.');
      }
    } catch (err) {
      if (stream) try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      if (videoRef.current) videoRef.current.srcObject = null;
      setScanning(false);
      setStatusBanner(err?.name === 'NotAllowedError' ? 'Izin kamera ditolak. Aktifkan kamera di pengaturan browser/HP.' : (err?.message || 'Gagal scan QR'));
    }
  };

  const stopScan = () => {
    scanAbortRef.current = true;
    try { const v = videoRef.current; const stream = v?.srcObject; if (stream?.getTracks) stream.getTracks().forEach((t) => t.stop()); if (v) v.srcObject = null; } catch (_) {}
    setScanning(false); setStatusBanner('Scan dibatalkan');
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setStatusBanner('Suara tidak didukung. Pakai Chrome Android / Safari terbaru.'); return; }
    try {
      const rec = new SR(); rec.lang = 'id-ID'; rec.interimResults = false; rec.maxAlternatives = 5; rec.continuous = false;
      setStatusBanner('Mendengarkan… sebutkan nama barang'); setBusy(true);
      rec.onresult = (ev) => {
        const t = (ev.results?.[0]?.[0]?.transcript || '').trim(); setBusy(false);
        if (!t) { setStatusBanner('Tidak ada suara terdeteksi. Coba lagi.'); return; }
        setQuery(t);
        const live = searchLiveStock(stockCatalog, t);
        const st = searchMaster(entity, t);
        const s = new Set(); const found = [];
        for (const it of [...live, ...st]) { const k = String(it.kode || '').trim(); if (!k || s.has(k)) continue; s.add(k); found.push({ kode: k, nama: it.nama || '', satuan: it.satuan || 'Pack', divisi: it.divisi || '', stok: it.stok ?? it.stockAkhir }); }
        if (found[0]) { addToCart(found[0], 1); setStatusBanner('Suara cocok: ' + found[0].nama); }
        else if (found.length > 1) { setHits(found.slice(0, 80)); setStatusBanner('Suara: ' + t + ' — pilih dari daftar'); }
        else setStatusBanner('Suara: "' + t + '" — tidak cocok master. Ketik manual.');
      };
      rec.onerror = (ev) => {
        setBusy(false);
        const code = ev?.error || '';
        if (code === 'not-allowed') setStatusBanner('Izin mikrofon ditolak. Aktifkan di pengaturan.');
        else if (code === 'no-speech') setStatusBanner('Tidak ada suara. Coba lagi.');
        else setStatusBanner('Gagal rekam suara: ' + (code || 'error'));
      };
      rec.onend = () => { setBusy(false); };
      rec.start();
    } catch (err) { setBusy(false); setStatusBanner(err?.message || 'Gagal memulai rekaman suara'); }
  };

  const resolvePdfReview = useCallback((reviewIndex, item) => {
    if (!item?.kode) return;
    const review = pdfReview[reviewIndex];
    setPdfReview((prev) => prev.filter((_, i) => i !== reviewIndex));
    setCart((prev) => {
      const cleaned = prev.filter((x) => !(x.unmatched && Number(x.pdfSourceIndex) === Number(review?.sourceIndex) && String(x.nama || '') === String(review?.namaPdf || review?.rawName || '')));
      const add = Number(review?.qty) || 0;
      const idx = cleaned.findIndex((x) => x.kode === item.kode);
      if (idx >= 0) {
        const next = [...cleaned];
        next[idx] = { ...next[idx], qty: +(Number(next[idx].qty) + add).toFixed(2) };
        return next;
      }
      return [...cleaned, {
        kode: item.kode,
        nama: item.nama || review?.namaPdf,
        satuan: item.satuan || 'Pack',
        qty: add,
        keterangan: '',
        pdfSourceIndex: Number(review?.sourceIndex) || 0,
        clientItemId: 'CI-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2, 9)),
      }];
    });
  }, [pdfReview]);

  const ignorePdfReview = useCallback((reviewIndex) => {
    const review = pdfReview[reviewIndex];
    setPdfReview((prev) => prev.filter((_, i) => i !== reviewIndex));
    if (review) {
      setCart((prev) => prev.filter((c) => !(c.unmatched && Number(c.pdfSourceIndex) === Number(review.sourceIndex) && String(c.nama || '') === String(review.namaPdf || review.rawName || ''))));
    }
  }, [pdfReview]);


  const handleSubmit = async () => {
    const unresolved = cart.filter((c) => c.unmatched || !c.kode);
    if (unresolved.length > 0) {
      setStatusBanner('Masih ada ' + unresolved.length + ' item PDF yang belum dipetakan. Pilih master atau abaikan sebelum Kirim.');
      return;
    }
    if (pdfReview.length > 0) {
      setStatusBanner('Masih ada ' + pdfReview.length + ' baris PDF/Foto yang perlu divalidasi sebelum dikirim. Tidak ada item yang boleh terlewat.');
      return;
    }
    if (submittingRef.current || !cart.length) return;
    submittingRef.current = true; setSubmitting(true); setSubmitProgress({ sent: 0, total: cart.length, success: 0, failed: 0 });
    try {
      const orderedCart = [...cart].sort((a, b) => {
          const ao = Number(a.pdfSourceIndex) || 999999;
          const bo = Number(b.pdfSourceIndex) || 999999;
          return ao - bo;
        });
        const items = orderedCart.map((c) => ({ ...c, qty: Number(c.qty) || 0 })).filter((c) => c.qty > 0)
          .map((c) => ({ kode: c.kode, qty: c.qty, keterangan: c.keterangan || '', clientItemId: c.clientItemId }));
        if (!items.length) { setStatusBanner('Isi minimal 1 jumlah barang sebelum dikirim.'); return; }
      const fn = txType === 'masuk' ? submitBarangMasuk : txType === 'rusak' ? submitBarangRusak : submitBarangKeluar;
      const res = await fn({ entity, tanggal, items });
      if (res?.success !== false) {
        const okCount = Number(res.count || 0);
        const queuedCount = Number(res.queuedCount || 0);
        const failCount = Number(res.failed || 0);
        const resultMap = new Map((res.results || [])
          .filter(r => r?.clientItemId)
          .map(r => [r.clientItemId, r]));
        const confirmedItems = cart.filter((item) => {
          const r = resultMap.get(item.clientItemId);
          return r?.success === true || r?.skipped === true;
        });

        // Riwayat hanya boleh dibuat dari konfirmasi per-item backend.
        // Item yang hanya masuk antrian tidak boleh tampil sebagai "berhasil".
        if (confirmedItems.length > 0) {
          saveToHistory({
            type: txType,
            entity,
            items: confirmedItems,
            tanggal,
            at: Date.now(),
            status: 'sukses',
            source: 'backend-confirmed',
            syncSummary: {
              total: cart.length,
              success: confirmedItems.length,
              queued: queuedCount,
              failed: Math.max(0, cart.length - confirmedItems.length - queuedCount)
            }
          });
        }

        if (queuedCount > 0) {
          pushNotification({
            type: 'warning',
            title: confirmedItems.length > 0 ? 'Sebagian transaksi masuk Antrian Sinkronisasi' : 'Transaksi masuk Antrian Sinkronisasi',
            body: confirmedItems.length + ' terkonfirmasi · ' + queuedCount + ' masuk antrian · ' +
              Math.max(0, cart.length - confirmedItems.length - queuedCount) + ' belum teridentifikasi. Tidak ada item dibuang.'
          });
          setStatusBanner(
            (confirmedItems.length > 0 ? 'TERKONFIRMASI ' + confirmedItems.length + ' · ' : '') +
            'ANTRIAN ' + queuedCount +
            (failCount ? ' · BELUM TERKONFIRMASI ' + failCount : '') +
            ' — belum ditulis dianggap pending.'
          );
        } else if (confirmedItems.length === cart.length) {
          pushNotification({ type: 'success', title: 'Transaksi selesai', body: confirmedItems.length + ' item ' + txType + ' ' + entity + ' terkonfirmasi ditulis backend.' });
          setStatusBanner('Berhasil dikonfirmasi · ' + confirmedItems.length + ' item');
        } else {
          pushNotification({ type: 'error', title: 'Belum ada konfirmasi penulisan', body: 'Tidak ada item yang dinyatakan tertulis per-item oleh backend.' });
          setStatusBanner('Belum terkonfirmasi — item tetap diamankan di antrian');
        }

        setCart([]); setAccuracy(null); setPdfReview([]);
        window.dispatchEvent(new Event('gudangai-stock-refresh'));
      } else {
        pushNotification({ type: 'error', title: 'Transaksi belum dikirim', body: res?.error || 'Tidak ada data yang dinyatakan berhasil.' });
        setStatusBanner(res?.error || 'Gagal kirim');
      }
    } catch (err) { setStatusBanner(err.message || 'Gagal kirim'); }
    finally { setSubmitting(false); submittingRef.current = false; setSubmitProgress(null); }
  };

  const openNotif = () => { setNotifs(getNotifications()); markNotificationsRead(); setUnread(0); setShowNotif((v) => !v); };

  return (
    <div className="pb-28 space-y-4 overflow-x-hidden w-full max-w-full box-border">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold flex items-center gap-2 text-slate-900">
          <PackagePlus className="w-6 h-6 text-cyan-300" /> Input
        </h1>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => {
            const next = !dense;
            setDense(next);
            try { localStorage.setItem('gudangai_density', next ? 'compact' : 'comfortable'); } catch (_) {}
          }} className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 shadow-sm">
            {dense ? 'Grid padat' : 'Grid longgar'}
          </button>
          <button type="button" onClick={openNotif} className="relative p-2 rounded-xl bg-white border border-slate-200 shadow-sm text-slate-700">
            <Bell className="w-5 h-5" />
            {unread > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-[10px] text-white flex items-center justify-center">{unread}</span>}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        <input type="text" value={tanggal} onChange={(e) => setTanggal(e.target.value)}
          className="rounded-xl bg-white border border-slate-200 text-slate-900 px-3 py-2 text-sm w-32 shadow-sm font-semibold" />
        <div className="flex rounded-xl overflow-hidden border border-slate-200 shadow-sm">
          {['CV', 'PT'].map((e) => (
            <button key={e} type="button" onClick={() => setEntity(e)}
              className={`px-4 py-2 text-sm font-semibold ${entity === e ? 'bg-cyan-600 text-white' : 'bg-white text-slate-600'}`}>{e}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {TX.map((t) => {
          const Icon = t.icon;
          const on = txType === t.id;
          const accent = t.id === 'masuk' ? { active: 'bg-emerald-600 border-emerald-600', icon: 'text-emerald-600', soft: 'bg-emerald-50 border-emerald-100' }
            : t.id === 'rusak' ? { active: 'bg-rose-600 border-rose-600', icon: 'text-rose-600', soft: 'bg-rose-50 border-rose-100' }
            : { active: 'bg-cyan-600 border-cyan-600', icon: 'text-cyan-600', soft: 'bg-cyan-50 border-cyan-100' };
          return (
            <button key={t.id} type="button" onClick={() => setTxType(t.id)}
              className={`rounded-2xl py-3.5 flex flex-col items-center gap-1.5 border shadow-sm transition ${on ? accent.active + ' text-white' : 'bg-white border-slate-100 text-slate-700'}`}>
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${on ? 'bg-white/20' : accent.soft}`}>
                <Icon className={`w-5 h-5 ${on ? 'text-white' : accent.icon}`} />
              </span>
              <span className="text-xs font-semibold">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        <button type="button" onClick={() => filePdfRef.current?.click()} disabled={busy}
          className="rounded-2xl bg-white border border-slate-200 shadow-sm py-3 flex flex-col items-center gap-1.5 disabled:opacity-50">
          <span className="w-9 h-9 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center">
            <Upload className="w-5 h-5 text-violet-600" />
          </span>
          <span className="text-[11px] font-semibold text-slate-700">PDF</span>
        </button>
        <button type="button" onClick={() => setShowPhotoSource(true)} disabled={busy}
          className="rounded-2xl bg-white border border-slate-200 shadow-sm py-3 flex flex-col items-center gap-1.5 disabled:opacity-50">
          <span className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
            <Image className="w-5 h-5 text-amber-600" />
          </span>
          <span className="text-[11px] font-semibold text-slate-700">Foto</span>
        </button>
        <button type="button" onClick={startScan} disabled={busy || scanning}
          className="rounded-2xl bg-white border border-slate-200 shadow-sm py-3 flex flex-col items-center gap-1.5 disabled:opacity-50">
          <span className="w-9 h-9 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center">
            <QrCode className="w-5 h-5 text-cyan-600" />
          </span>
          <span className="text-[11px] font-semibold text-slate-700">QR</span>
        </button>
        <button type="button" onClick={startVoice} disabled={busy}
          className="rounded-2xl bg-white border border-slate-200 shadow-sm py-3 flex flex-col items-center gap-1.5 disabled:opacity-50">
          <span className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center">
            <Mic className="w-5 h-5 text-rose-600" />
          </span>
          <span className="text-[11px] font-semibold text-slate-700">Suara</span>
        </button>
      </div>
      <input ref={filePdfRef} type="file" accept="application/pdf" className="hidden" onChange={onPdfPick} />
      <input ref={fileImgRef} type="file" accept="image/*" className="hidden" onChange={onImgPick} />

      {showPhotoSource && (
        <div className="fixed inset-0 z-40 bg-black/45 flex items-end justify-center p-0">
          <div className="w-full max-w-lg rounded-t-3xl bg-white p-4 pb-6 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-extrabold text-slate-900">Input Foto</p>
                <p className="text-xs text-slate-500">Pilih sumber foto untuk membaca daftar barang.</p>
              </div>
              <button type="button" onClick={() => setShowPhotoSource(false)} className="p-2 rounded-xl bg-slate-100 text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={openPhotoCamera}
                className="rounded-2xl border border-cyan-200 bg-cyan-50 py-4 flex flex-col items-center gap-2 text-cyan-800 font-bold">
                <span className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shadow-sm">
                  <Image className="w-5 h-5 text-cyan-600" />
                </span>
                <span className="text-sm">Kamera</span>
                <span className="text-[10px] font-medium text-cyan-700">Foto langsung</span>
              </button>
              <button type="button" onClick={openPhotoGallery}
                className="rounded-2xl border border-amber-200 bg-amber-50 py-4 flex flex-col items-center gap-2 text-amber-800 font-bold">
                <span className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shadow-sm">
                  <Upload className="w-5 h-5 text-amber-600" />
                </span>
                <span className="text-sm">Galeri</span>
                <span className="text-[10px] font-medium text-amber-700">Pilih foto</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama / kode barang…"
          className="w-full rounded-xl bg-white border border-slate-200 text-slate-900 pl-9 pr-3 py-2.5 text-sm shadow-sm" />
      </div>

      <button type="button" onClick={onIgnore} className="mt-2 w-full rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs font-semibold text-rose-600">Abaikan item ini (tidak akan dikirim)</button>
      {hits.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm max-h-64 overflow-y-auto divide-y divide-slate-100">
          {hits.map((h) => (
            <button key={h.kode} type="button" onClick={() => { addToCart(h, 1); setQuery(''); setHits([]); }}
              className="w-full text-left px-3 py-2.5 hover:bg-cyan-50 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">{h.nama}</p>
                <p className="text-[11px] text-slate-500">{h.kode} · {h.satuan}{h.stok != null ? ` · stok ${h.stok}` : ''}</p>
              </div>
              <Plus className="w-4 h-4 text-cyan-600" />
            </button>
          ))}
        </div>
      )}

      {(statusBanner || busy) && (
        <div className={`rounded-xl px-3 py-2 text-sm flex items-center gap-2 shadow-sm ${
          busy ? 'bg-cyan-50 text-cyan-800 border border-cyan-200' : 'bg-white text-slate-700 border border-slate-200'
        }`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          <span>{statusBanner || 'Memproses…'}</span>
        </div>
      )}

      {pdfReview.length > 0 && (
        <div className="rounded-2xl bg-white border border-amber-200 shadow-sm p-3 space-y-3">
          <div>
            <p className="text-sm font-bold text-slate-900">Validasi PDF — {pdfReview.length} baris perlu dicocokkan</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Nomor di PDF diabaikan. Urutan mengikuti PDF dan nomor di aplikasi dibuat ulang mulai 1.</p>
          </div>
          {pdfReview.map((r, idx) => (
            <PdfReviewRow key={(r.sourceIndex || idx) + '-' + idx} row={r} entity={entity} onPick={(item) => resolvePdfReview(idx, item)} onIgnore={() => ignorePdfReview(idx)} />
          ))}
        </div>
      )}

      {cart.length > 0 && (
        <div ref={cartRef} className={`${dense ? 'space-y-2' : 'space-y-3'} pb-20`}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-900">Keranjang ({cart.length})</p>
            <button type="button" onClick={() => setCart([])} className="text-xs text-rose-300 font-semibold">Kosongkan</button>
          </div>
          {cart.map((c, idx) => (
            <div key={c.clientItemId || idx} className={`rounded-xl bg-white border shadow-sm p-3 space-y-2 ${c.unmatched ? 'border-orange-300 bg-orange-50/60' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{c.nama}</p>
                  {c.unmatched ? <p className="text-[11px] font-bold text-orange-700">Tidak cocok master — pilih master atau abaikan</p> : <p className="text-[11px] text-slate-500">{c.kode} · {c.satuan}</p>}
                </div>
                <button type="button" onClick={() => removeCart(idx)} className="text-rose-500"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => updateQty(idx, -1)} className="w-8 h-8 rounded-lg bg-slate-200 text-slate-800 flex items-center justify-center shrink-0"><Minus className="w-4 h-4" /></button>
                <input
                  type="number"
                  inputMode="decimal"
                  value={c.qty}
                  onChange={(e) => setQtyValue(idx, e.target.value)}
                  className="w-[4.5rem] text-center rounded-lg border border-slate-300 bg-white py-1.5 text-sm font-extrabold text-slate-900 tabular-nums shadow-sm"
                />
                <button type="button" onClick={() => updateQty(idx, 1)} className="w-8 h-8 rounded-lg bg-slate-200 text-slate-800 flex items-center justify-center shrink-0"><Plus className="w-4 h-4" /></button>
                <input
                  value={c.keterangan || ''}
                  onChange={(e) => setKet(idx, e.target.value)}
                  placeholder="Keterangan"
                  className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>
          ))}
          <div className="fixed bottom-16 left-0 right-0 px-4 z-20">
            {submitProgress && (
              <p className="text-center text-xs text-cyan-700 mb-1 font-semibold">
                Mengirim {submitProgress.sent}/{submitProgress.total} · ok {submitProgress.success} · antri {submitProgress.failed}
              </p>
            )}
            <button type="button" onClick={handleSubmit} disabled={submitting || !cart.length}
              className="w-full py-3 rounded-2xl bg-cyan-600 text-white font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              {submitting ? 'Mengirim…' : `Kirim ${cart.length} item`}
            </button>
          </div>
        </div>
      )}

      {photoCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-black/80 text-white">
            <div>
              <p className="text-sm font-bold">Kamera Foto</p>
              <p className="text-[10px] text-slate-300">Pastikan seluruh tabel barang masuk frame.</p>
            </div>
            <button type="button" onClick={closePhotoCamera} className="p-2 rounded-xl bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center bg-black overflow-hidden">
            <video ref={photoVideoRef} className="w-full max-h-full object-contain" playsInline muted />
          </div>
          <div className="p-5 pb-8 bg-black/90">
            <button type="button" onClick={capturePhotoAndValidate} disabled={busy}
              className="w-full py-3.5 rounded-2xl bg-white text-slate-900 font-extrabold shadow-lg disabled:opacity-50">
              {busy ? 'Memproses…' : 'Ambil Foto & Validasi'}
            </button>
          </div>
        </div>
      )}

      {scanning && (
        <div className="rounded-xl overflow-hidden border border-slate-700">
          <video ref={videoRef} className="w-full aspect-video bg-black" playsInline muted />
          <div className="flex items-center justify-between px-3 py-2 bg-slate-900">
            <span className="text-xs text-cyan-200 font-medium">Arahkan ke barcode / QR</span>
            <button type="button" onClick={stopScan} className="text-xs font-bold text-rose-300 px-2 py-1 rounded-lg bg-slate-800">Stop</button>
          </div>
        </div>
      )}

      {showNotif && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm max-h-60 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="text-sm font-semibold">Notifikasi</span>
            <button type="button" onClick={() => setShowNotif(false)}><X className="w-4 h-4" /></button>
          </div>
          {notifs.length === 0 ? <p className="p-3 text-sm text-slate-500">Kosong</p> : notifs.slice(0, 20).map((n) => (
            <div key={n.id} className="px-3 py-2 border-b border-slate-50">
              <p className="text-sm font-semibold text-slate-800">{n.title}</p>
              <p className="text-xs text-slate-500">{n.body}</p>
            </div>
          ))}
        </div>
      )}

      {showPaste && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Tempel teks order</span>
              <button type="button" onClick={() => setShowPaste(false)}><X className="w-5 h-5" /></button>
            </div>
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6}
              className="w-full border border-slate-200 rounded-xl p-2 text-sm" placeholder="Tempel di sini…" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowPaste(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold">Batal</button>
              <button type="button" onClick={onPasteValidate} className="flex-1 py-2.5 rounded-xl bg-cyan-600 text-white text-sm font-semibold">Validasi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  }



function PdfReviewRow({ row, entity, onPick, onIgnore }) {
  const [q, setQ] = useState(row.namaPdf || '');
  const hits = q.trim().length >= 1 ? searchMaster(entity, q.trim()).slice(0, 5) : [];
  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-orange-700">TIDAK COCOK MASTER — REVIEW MANUAL · NO {row.reviewNo}</p>
          <p className="text-sm font-semibold text-slate-800">{row.namaPdf}</p>
          <p className="text-[11px] text-slate-500">TOTAL {row.qty} · PDF NO {row.pdfNo || '—'}</p>
        </div>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Cari nama barang master..."
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900" />
      {hits.length > 0 && (
        <div className="mt-1 space-y-1">
          {hits.map((h) => (
            <button key={h.kode} type="button" onClick={() => onPick(h)}
              className="w-full text-left rounded-lg bg-white border border-slate-200 px-2 py-1.5 text-xs text-slate-700">
              {h.kode} · {h.nama}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
