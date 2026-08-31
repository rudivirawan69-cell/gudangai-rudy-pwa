import { useState, useMemo, useRef } from 'react';
import { searchMaster, ENTITIES, matchByAlias } from '../data/master';
import { submitBarangMasuk, submitBarangKeluar, submitBarangRusak, saveToHistory } from '../data/api';
import {
  extractTextFromPdf, parseLinesFromText, validateItems, scanBarcodeFromVideo, detectEntityFromText,
} from '../data/pdfValidate';
import {
  PackagePlus, PackageMinus, Search, Trash2, Send,
  CheckCircle, AlertCircle, Loader2, X, AlertTriangle,
  FileText, Camera, QrCode, ScanLine, Mic, MicOff
} from 'lucide-react';
import {
  isSpeechSupported, createRecognizer, parseVoiceCommand, resolveVoiceItem,
} from '../data/voiceInput';

function ItemRow({ item, onRemove, onUpdate }) {
  return (
    <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-blue-600 font-mono font-semibold">{item.kode}</p>
          <p className="text-sm font-medium text-gray-800 truncate">{item.nama}</p>
          <p className="text-[11px] text-gray-400">{item.divisi} · {item.satuan}</p>
        </div>
        <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Qty</label>
          <input type="number" min="0" step="1" inputMode="decimal" value={item.qty}
            onChange={e => onUpdate({ qty: parseFloat(e.target.value) || 0 })}
            className="w-full mt-0.5 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-sm font-semibold focus:outline-none focus:border-blue-400" />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Keterangan</label>
          <input type="text" placeholder="Opsional" value={item.keterangan}
            onChange={e => onUpdate({ keterangan: e.target.value })}
            className="w-full mt-0.5 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400" />
        </div>
      </div>
    </div>
  );
}

function ManualPick({ entity, query, onPick }) {
  const [q, setQ] = useState(query || '');
  const hits = q.length >= 1 ? searchMaster(entity, q).slice(0, 5) : [];
  return (
    <div className="mt-1">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari master..."
        className="w-full text-[10px] px-2 py-1 rounded border border-gray-200 bg-white" />
      {hits.map(c => (
        <button key={c.kode} type="button" onClick={() => onPick(c)}
          className="block w-full text-left mt-0.5 px-2 py-1 rounded bg-white text-[10px] border border-gray-100">
          {c.kode} — {c.nama}
        </button>
      ))}
    </div>
  );
}

export default function InputPage() {
  const [entity, setEntity] = useState('CV');
  const [type, setType] = useState('keluar');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanText, setScanText] = useState('');
  const [preview, setPreview] = useState([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceMsg, setVoiceMsg] = useState('');
  const [voiceCandidates, setVoiceCandidates] = useState([]);
  const [pendingVoice, setPendingVoice] = useState(null);
  const recogRef = useRef(null);
  const searchRef = useRef(null);
  const fileRef = useRef(null);
  const pdfRef = useRef(null);
  const imageRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const results = useMemo(() => searchMaster(entity, search), [entity, search]);
  const previewStats = useMemo(() => {
    const matched = preview.filter(r => r.status === 'matched').length;
    const ambiguous = preview.filter(r => r.status === 'ambiguous').length;
    const unmatched = preview.filter(r => r.status === 'unmatched').length;
    const total = preview.length;
    const pct = total ? Math.round((matched / total) * 100) : 0;
    return { matched, ambiguous, unmatched, total, pct };
  }, [preview]);

  const addItem = (item) => {
    if (items.find(i => i.kode === item.kode)) return;
    setItems(prev => [...prev, { ...item, qty: 1, keterangan: '' }]);
    setShowSearch(false);
    setSearch('');
  };

  const runValidatePreview = (text, ent) => {
    const useEnt = ent || entity;
    const rows = parseLinesFromText(text);
    if (!rows.length) {
      setScanError('Tidak ada baris rekap. Pastikan kolom TOTAL terbaca (nama + angka).');
      setPreview([]);
      return;
    }
    setPreview(validateItems(useEnt, rows));
    setScanError('');
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    const resetInputs = () => {
      if (fileRef.current) fileRef.current.value = '';
      if (pdfRef.current) pdfRef.current.value = '';
      if (imageRef.current) imageRef.current.value = '';
    };
    if (!file) { resetInputs(); return; }
    setShowScan(true);
    setScanBusy(true);
    setScanError('');
    setPreview([]);
    setScanText('');
    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/x-pdf';
      if (isPdf) {
        const text = await extractTextFromPdf(file);
        if (!text || !String(text).trim()) {
          setScanError('PDF terbaca kosong (mungkin scan). Ketik baris manual lalu Validasi.');
        } else {
          setScanText(text);
          const detected = detectEntityFromText(text);
          if (detected && detected !== entity) setEntity(detected);
          runValidatePreview(text, detected || entity);
        }
      } else if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
        setScanError('Foto dipilih: "' + file.name + '". Ketik/salin isi nota ke kotak teks (satu baris: nama + qty), lalu Validasi.');
      } else {
        setScanError('Format tidak didukung. Unggah PDF rekap atau foto JPG/PNG.');
      }
    } catch (err) {
      setScanError(err.message || 'Gagal baca file');
    } finally {
      setScanBusy(false);
      resetInputs();
    }
  };

  const openPdfPicker = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setShowScan(true);
    setScanError('');
    setTimeout(() => { (pdfRef.current || fileRef.current)?.click(); }, 80);
  };

  const openImagePicker = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setShowScan(true);
    setScanError('');
    setTimeout(() => { (imageRef.current || fileRef.current)?.click(); }, 80);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      setCameraOn(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (err) {
      setScanError('Kamera: ' + (err.message || err));
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks()?.forEach(t => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const scanQr = async () => {
    if (!videoRef.current) return;
    setScanBusy(true);
    try {
      const res = await scanBarcodeFromVideo(videoRef.current);
      if (!res.ok) setScanError(res.error);
      else {
        const next = (scanText ? scanText + '\n' : '') + res.value;
        setScanText(next);
        runValidatePreview(next);
      }
    } catch (err) {
      setScanError(err.message || 'Scan gagal');
    } finally {
      setScanBusy(false);
    }
  };

  const pickCandidate = (idx, item) => {
    setPreview(prev => prev.map((r, i) => i === idx ? {
      ...r, status: 'matched', matchType: 'manual', item,
      kode: item.kode, namaMaster: item.nama, satuan: item.satuan, candidates: undefined,
    } : r));
  };
  const removePreviewRow = (idx) => setPreview(prev => prev.filter((_, i) => i !== idx));
  const updatePreviewQty = (idx, qty) => {
    setPreview(prev => prev.map((r, i) => i === idx ? { ...r, qty: parseFloat(qty) || 0 } : r));
  };

  const acceptMatchedToCart = () => {
    const matched = preview.filter(r => r.status === 'matched' && r.item);
    if (!matched.length) {
      setScanError('Belum ada item cocok. Perbaiki FLAG/ambigu dulu.');
      return;
    }
    setItems(prev => {
      const map = new Map(prev.map(i => [i.kode, { ...i }]));
      matched.forEach(m => {
        if (map.has(m.kode)) {
          const cur = map.get(m.kode);
          cur.qty = (Number(cur.qty) || 0) + (Number(m.qty) || 0);
        } else {
          map.set(m.kode, { ...m.item, qty: m.qty || 1, keterangan: m.raw || '' });
        }
      });
      return Array.from(map.values());
    });
    setPreview([]);
    setScanText('');
    setShowScan(false);
    stopCamera();
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (items.length === 0) {
      setResult({ success: false, error: 'Belum ada item. Tambah lewat Cari Master, Suara, atau PDF.' });
      return;
    }
    const bad = items.filter((i) => !i.kode || !(Number(i.qty) > 0));
    if (bad.length) {
      setResult({ success: false, error: 'Qty harus > 0 untuk semua item.' });
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const payload = items.map((i) => ({
        kode: String(i.kode).trim(),
        qty: Math.round(Number(i.qty) * 1000) / 1000,
        keterangan: String(i.keterangan || '').trim().slice(0, 200),
      }));
      const submitFn = type === 'masuk' ? submitBarangMasuk : type === 'keluar' ? submitBarangKeluar : submitBarangRusak;
      const res = await submitFn(entity, payload);
      saveToHistory({
        type, entity,
        items: items.map((i) => ({ kode: i.kode, nama: i.nama, qty: i.qty, keterangan: i.keterangan })),
        ...res,
      });
      setResult(res);
      if (res.success) setItems([]);
      setTimeout(() => setResult(null), 8000);
    } catch (err) {
      setResult({ success: false, error: err.message || 'Gagal mengirim' });
    } finally {
      setSubmitting(false);
    }
  };

  const applyVoiceParsed = (parsed) => {
    if (!parsed || parsed.empty) {
      setVoiceMsg('Tidak terdengar. Coba: "keluar 10 ice cream"');
      return;
    }
    if (parsed.type) setType(parsed.type);
    const useEntity = parsed.entity || entity;
    if (parsed.entity && parsed.entity !== entity) { setEntity(parsed.entity); setItems([]); }
    if (!parsed.query) {
      setVoiceMsg(`Mode ${parsed.type || type} · qty ${parsed.qty}. Sebutkan nama barang.`);
      setPendingVoice(parsed);
      return;
    }
    const res = resolveVoiceItem(useEntity, parsed.query, searchMaster, matchByAlias);
    if (res.status === 'matched' && res.item) {
      setItems((prev) => {
        const map = new Map(prev.map((i) => [i.kode, { ...i }]));
        if (map.has(res.item.kode)) {
          const cur = map.get(res.item.kode);
          cur.qty = (Number(cur.qty) || 0) + (Number(parsed.qty) || 1);
        } else {
          map.set(res.item.kode, { ...res.item, qty: parsed.qty || 1, keterangan: `voice: ${parsed.raw}` });
        }
        return Array.from(map.values());
      });
      setVoiceMsg(`✓ ${parsed.type || type} ${parsed.qty} × ${res.item.nama}`);
      setVoiceCandidates([]);
      setPendingVoice(null);
    } else if (res.status === 'ambiguous') {
      setPendingVoice(parsed);
      setVoiceCandidates(res.candidates || []);
      setVoiceMsg('Beberapa kemungkinan — pilih di bawah');
    } else {
      setPendingVoice(parsed);
      setVoiceCandidates([]);
      setVoiceMsg(`Tidak ketemu: "${parsed.query}". Coba Cari Master.`);
    }
  };

  const stopVoice = () => {
    try { recogRef.current?.stop?.(); } catch (_) {}
    try { recogRef.current?.abort?.(); } catch (_) {}
    recogRef.current = null;
    setListening(false);
  };

  const startVoice = () => {
    if (!isSpeechSupported()) { setVoiceMsg('Browser tidak support suara. Pakai Chrome Android.'); return; }
    if (listening) { stopVoice(); return; }
    const rec = createRecognizer({ lang: 'id-ID', continuous: false, interimResults: true });
    if (!rec) { setVoiceMsg('SpeechRecognition tidak tersedia'); return; }
    recogRef.current = rec;
    setVoiceText('');
    setVoiceMsg('Mendengarkan… masuk/keluar/rusak + jumlah + nama');
    setVoiceCandidates([]);
    setListening(true);
    rec.onresult = (ev) => {
      let interim = '', finalText = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) setVoiceText(interim);
      if (finalText) { setVoiceText(finalText); applyVoiceParsed(parseVoiceCommand(finalText)); }
    };
    rec.onerror = (ev) => {
      const err = ev.error || 'error';
      if (err === 'not-allowed') setVoiceMsg('Izin mikrofon ditolak.');
      else if (err === 'no-speech') setVoiceMsg('Tidak ada suara. Coba lagi.');
      else setVoiceMsg('Error suara: ' + err);
      setListening(false);
    };
    rec.onend = () => { setListening(false); recogRef.current = null; };
    try { rec.start(); } catch (e) { setVoiceMsg(e.message || 'Gagal mikrofon'); setListening(false); }
  };

  const pickVoiceCandidate = (item) => {
    const parsed = pendingVoice || { qty: 1, type, raw: voiceText };
    if (parsed.type) setType(parsed.type);
    setItems((prev) => {
      const map = new Map(prev.map((i) => [i.kode, { ...i }]));
      if (map.has(item.kode)) {
        const cur = map.get(item.kode);
        cur.qty = (Number(cur.qty) || 0) + (Number(parsed.qty) || 1);
      } else {
        map.set(item.kode, { ...item, qty: parsed.qty || 1, keterangan: `voice: ${parsed.raw || ''}` });
      }
      return Array.from(map.values());
    });
    setVoiceMsg(`✓ ${parsed.type || type} ${parsed.qty || 1} × ${item.nama}`);
    setVoiceCandidates([]);
    setPendingVoice(null);
  };

  const typeConfig = {
    masuk: { icon: PackagePlus, label: 'Masuk', gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-200' },
    keluar: { icon: PackageMinus, label: 'Keluar', gradient: 'from-orange-500 to-red-500', shadow: 'shadow-orange-200' },
    rusak: { icon: AlertTriangle, label: 'Rusak', gradient: 'from-red-600 to-rose-700', shadow: 'shadow-red-200' },
  };
  const tc = typeConfig[type];

  const quickActions = [
    {
      id: 'masuk', label: 'Barang Masuk', sub: type === 'masuk' ? '● AKTIF' : 'Tambah stok',
      icon: PackagePlus,
      color: type === 'masuk' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-emerald-50 text-emerald-600',
      active: type === 'masuk', mode: 'masuk',
    },
    {
      id: 'keluar', label: 'Barang Keluar', sub: type === 'keluar' ? '● AKTIF' : 'Kurangi stok',
      icon: PackageMinus,
      color: type === 'keluar' ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-orange-50 text-orange-600',
      active: type === 'keluar', mode: 'keluar',
    },
    {
      id: 'rusak', label: 'Barang Rusak', sub: type === 'rusak' ? '● AKTIF' : 'Catat rusak',
      icon: AlertTriangle,
      color: type === 'rusak' ? 'bg-red-500 text-white shadow-lg shadow-red-200' : 'bg-red-50 text-red-600',
      active: type === 'rusak', mode: 'rusak',
    },
    {
      id: 'voice', label: 'Suara', sub: listening ? '● Mendengar…' : 'Ucapkan item',
      icon: listening ? MicOff : Mic,
      color: listening ? 'bg-rose-500 text-white shadow-lg shadow-rose-200' : 'bg-rose-50 text-rose-600',
      active: listening, mode: null,
    },
    { id: 'scan', label: 'PDF / QR', sub: 'Validasi nota', icon: ScanLine, color: 'bg-cyan-50 text-cyan-700', active: false, mode: null },
    { id: 'cari', label: 'Cari Master', sub: 'Pilih item', icon: Search, color: 'bg-blue-50 text-blue-600', active: false, mode: null },
  ];

  const onQuick = (id) => {
    if (id === 'masuk' || id === 'keluar' || id === 'rusak') { setType(id); return; }
    if (id === 'voice') { startVoice(); return; }
    if (id === 'scan') { setShowScan(true); setScanError(''); return; }
    if (id === 'cari') { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 80); }
  };

  return (
    <div className="pb-4 animate-fade-in">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-800 mb-2">Quick Action</h2>
        <div className="grid grid-cols-3 gap-2.5">
          {quickActions.map((a) => {
            const Icon = a.icon;
            const isMode = a.mode === 'masuk' || a.mode === 'keluar' || a.mode === 'rusak';
            const dimOther = isMode && !a.active;
            const modeClass = a.active && a.mode === 'masuk'
              ? 'mode-active-masuk'
              : a.active && a.mode === 'keluar'
                ? 'mode-active-keluar'
                : a.active && a.mode === 'rusak'
                  ? 'mode-active-rusak'
                  : a.active && a.id === 'voice'
                    ? 'ring-2 ring-rose-400 border-rose-300'
                    : '';
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onQuick(a.id)}
                className={`card card-interactive relative p-3 flex flex-col items-center text-center gap-1.5 min-h-[92px] justify-center transition-all duration-300 ${modeClass} ${
                  dimOther ? 'mode-dim' : ''
                }`}
              >
                {a.active && isMode && (
                  <span className={`mode-badge absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${
                    a.mode === 'masuk' ? 'bg-emerald-500' : a.mode === 'keluar' ? 'bg-orange-500' : 'bg-red-500'
                  }`} />
                )}
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ${a.color} ${
                  a.active ? 'scale-110' : ''
                }`}>
                  <Icon className={`w-5 h-5 ${a.active ? 'animate-soft-pulse' : ''}`} />
                </div>
                <p className={`text-[11px] font-semibold leading-tight ${
                  a.active && isMode ? 'text-slate-900' : 'text-slate-800'
                }`}>{a.label}</p>
                <p className={`text-[9px] leading-tight font-medium ${
                  a.active ? (
                    a.mode === 'masuk' ? 'text-emerald-700' :
                    a.mode === 'keluar' ? 'text-orange-700' :
                    a.mode === 'rusak' ? 'text-red-700' :
                    'text-rose-600'
                  ) : 'text-slate-400'
                }`}>{a.sub}</p>
              </button>
            );
          })}
        </div>
      </div>

      {(listening || voiceText || voiceMsg) && (
        <div className={`mb-3 rounded-xl border px-3 py-2.5 ${listening ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
          <div className="flex items-center gap-2 mb-1">
            {listening ? <Mic className="w-4 h-4 text-rose-600 animate-pulse" /> : <MicOff className="w-4 h-4 text-slate-400" />}
            <p className="text-[11px] font-semibold text-slate-700">{listening ? 'Mendengarkan…' : 'Hasil suara'}</p>
            {listening && <button type="button" onClick={stopVoice} className="ml-auto text-[10px] font-medium text-rose-600">Stop</button>}
          </div>
          {voiceText && <p className="text-sm text-slate-800 font-medium">“{voiceText}”</p>}
          {voiceMsg && <p className="text-[11px] text-slate-500 mt-0.5">{voiceMsg}</p>}
          {voiceCandidates.length > 0 && (
            <div className="mt-2 space-y-1">
              {voiceCandidates.map((c) => (
                <button key={c.kode} type="button" onClick={() => pickVoiceCandidate(c)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white border border-slate-100 text-[11px]">
                  <span className="font-mono text-blue-600">{c.kode}</span> — {c.nama}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mb-3">
        {ENTITIES.map(e => (
          <button key={e} type="button" onClick={() => { setEntity(e); setItems([]); setPreview([]); }}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold ${
              entity === e ? 'bg-[#0b2a55] text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}>{e}</button>
        ))}
      </div>

      <div className={`mb-3 rounded-xl px-3 py-2 flex items-center gap-2 border transition-all duration-300 ${
        type === 'masuk' ? 'bg-emerald-50 border-emerald-200' :
        type === 'keluar' ? 'bg-orange-50 border-orange-200' :
        'bg-red-50 border-red-200'
      }`}>
        <span className={`w-2.5 h-2.5 rounded-full mode-badge ${
          type === 'masuk' ? 'bg-emerald-500' : type === 'keluar' ? 'bg-orange-500' : 'bg-red-500'
        }`} />
        <p className="text-[12px] font-semibold text-slate-800">
          Mode aktif: <span className={
            type === 'masuk' ? 'text-emerald-700' : type === 'keluar' ? 'text-orange-700' : 'text-red-700'
          }>{typeConfig[type].label}</span>
          <span className="text-slate-400 font-normal"> · {entity}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <button type="button" onClick={openPdfPicker} disabled={scanBusy}
          className="py-3 rounded-xl border-2 border-dashed border-cyan-300 bg-cyan-50/60 text-cyan-800 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          <FileText className="w-4 h-4" /> Unggah PDF
        </button>
        <button type="button" onClick={openImagePicker} disabled={scanBusy}
          className="py-3 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 text-amber-800 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          <Camera className="w-4 h-4" /> Foto / Galeri
        </button>
      </div>

      <div className="space-y-2 mb-4">
        {items.map((item, idx) => (
          <ItemRow key={item.kode + idx} item={item}
            onRemove={() => setItems(prev => prev.filter((_, i) => i !== idx))}
            onUpdate={(u) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...u } : it))}
          />
        ))}
        {items.length === 0 && (
          <p className="text-center text-gray-400 text-xs py-6">Belum ada item — Cari Master / PDF / Suara</p>
        )}
      </div>

      {items.length > 0 && (
        <button type="button" onClick={handleSubmit} disabled={submitting}
          className={`w-full py-3.5 rounded-xl bg-gradient-to-r ${tc.gradient} text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-60`}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Kirim {items.length} item · {typeConfig[type].label} ({entity}) → Server
        </button>
      )}

      {result && (
        <div className={`mt-3 text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${
          result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {result.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {result.success
            ? (result.offline ? 'Offline — antri sync' : `${result.written ?? items.length} terkirim ke server`)
            : (result.error || 'Gagal')}
        </div>
      )}

      {showSearch && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center" onClick={() => setShowSearch(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b">
              <div className="flex justify-between mb-2">
                <h3 className="text-sm font-semibold">Cari Barang ({entity})</h3>
                <button type="button" onClick={() => setShowSearch(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input ref={searchRef} type="text" autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Kode, nama, alias..." className="w-full pl-10 pr-4 py-2.5 bg-gray-50 rounded-xl border text-sm" />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {results.slice(0, 40).map(item => (
                <button key={item.kode} type="button" onClick={() => addItem(item)} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-blue-50">
                  <p className="text-xs font-mono text-blue-600">{item.kode}</p>
                  <p className="text-sm text-gray-800">{item.nama}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showScan && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center" onClick={() => { stopCamera(); setShowScan(false); }}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between">
              <h3 className="text-sm font-bold">PDF / QR / Nota → {typeConfig[type].label}</h3>
              <button type="button" onClick={() => { stopCamera(); setShowScan(false); }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-[11px] text-gray-500">1) Unggah PDF · 2) Validasi · 3) Review · 4) Ke daftar · 5) Kirim</p>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={onFile} />
            <input ref={pdfRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFile} />
            <input ref={imageRef} type="file" accept="image/*,.jpg,.jpeg,.png,.webp" className="hidden" onChange={onFile} />
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={openPdfPicker} disabled={scanBusy}
                className="py-3 rounded-xl bg-cyan-50 text-cyan-800 text-xs font-semibold flex flex-col items-center gap-1 border border-cyan-100 disabled:opacity-50">
                <FileText className="w-5 h-5" /> PDF
              </button>
              <button type="button" onClick={startCamera}
                className="py-3 rounded-xl bg-violet-50 text-violet-800 text-xs font-semibold flex flex-col items-center gap-1 border border-violet-100">
                <Camera className="w-5 h-5" /> Kamera
              </button>
              <button type="button" onClick={openImagePicker}
                className="py-3 rounded-xl bg-amber-50 text-amber-800 text-xs font-semibold flex flex-col items-center gap-1 border border-amber-100">
                <QrCode className="w-5 h-5" /> Foto/Galeri
              </button>
            </div>
            {cameraOn && (
              <div className="space-y-2">
                <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black aspect-[3/4] object-cover" />
                <div className="flex gap-2">
                  <button type="button" onClick={scanQr} disabled={scanBusy} className="flex-1 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold">Scan QR</button>
                  <button type="button" onClick={stopCamera} className="px-3 py-2 rounded-xl bg-gray-100 text-xs">Tutup</button>
                </div>
              </div>
            )}
            <textarea value={scanText} onChange={e => setScanText(e.target.value)} rows={4}
              placeholder="Teks dari PDF / ketik manual baris item..." className="w-full px-3 py-2 bg-gray-50 rounded-xl border text-sm" />
            <button type="button" onClick={() => runValidatePreview(scanText)} disabled={scanBusy || !scanText.trim()}
              className="w-full py-2.5 rounded-xl bg-[#0b2a55] text-white text-sm font-semibold disabled:opacity-50">
              {scanBusy ? 'Membaca PDF…' : 'Validasi semua baris'}
            </button>
            {scanError && <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">{scanError}</p>}
            {preview.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div className="rounded-lg bg-gray-50 p-2"><p className="text-sm font-bold">{previewStats.total}</p><p className="text-[9px] text-gray-500">Total</p></div>
                  <div className="rounded-lg bg-emerald-50 p-2"><p className="text-sm font-bold text-emerald-600">{previewStats.matched}</p><p className="text-[9px]">Cocok</p></div>
                  <div className="rounded-lg bg-amber-50 p-2"><p className="text-sm font-bold text-amber-600">{previewStats.ambiguous}</p><p className="text-[9px]">Ambigu</p></div>
                  <div className="rounded-lg bg-red-50 p-2"><p className="text-sm font-bold text-red-600">{previewStats.unmatched}</p><p className="text-[9px]">FLAG</p></div>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1.5 border rounded-xl p-2">
                  {preview.map((r, idx) => (
                    <div key={idx} className={`rounded-lg px-2.5 py-2 text-xs border ${
                      r.status === 'matched' ? 'bg-emerald-50 border-emerald-100' :
                      r.status === 'ambiguous' ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'
                    }`}>
                      <div className="flex gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate">{r.nama}</p>
                          {r.status === 'matched' && <p className="text-[10px] text-emerald-700">→ {r.kode} · {r.namaMaster}</p>}
                          {r.status === 'ambiguous' && (r.candidates || []).map(c => (
                            <button key={c.kode} type="button" onClick={() => pickCandidate(idx, c)}
                              className="block w-full text-left mt-1 px-2 py-1 rounded bg-white text-[10px] border">Pilih: {c.kode}</button>
                          ))}
                          {r.status === 'unmatched' && <ManualPick entity={entity} query={r.nama} onPick={item => pickCandidate(idx, item)} />}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <input type="number" min="0" value={r.qty} onChange={e => updatePreviewQty(idx, e.target.value)}
                            className="w-14 px-1 py-0.5 rounded border text-center text-xs font-semibold" />
                          <button type="button" onClick={() => removePreviewRow(idx)}><Trash2 className="w-3.5 h-3.5 text-gray-400" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={acceptMatchedToCart} disabled={previewStats.matched === 0}
                  className="w-full py-3 rounded-xl bg-cyan-600 text-white text-sm font-bold disabled:opacity-50">
                  Masukkan {previewStats.matched} item ke daftar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
