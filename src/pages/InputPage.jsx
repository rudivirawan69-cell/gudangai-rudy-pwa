import { useState, useMemo, useRef } from 'react';
import { searchMaster, ENTITIES } from '../data/master';
import { submitBarangMasuk, submitBarangKeluar, submitBarangRusak, saveToHistory } from '../data/api';
import {
  extractTextFromPdf, parseLinesFromText, validateItems, scanBarcodeFromVideo, detectEntityFromText,
} from '../data/pdfValidate';
import {
  PackagePlus, PackageMinus, Search, Plus, Trash2, Send,
  CheckCircle, AlertCircle, Loader2, X, AlertTriangle,
  FileText, Camera, QrCode, ScanLine
} from 'lucide-react';

function ItemRow({ item, onRemove, onUpdate }) {
  return (
    <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-blue-600 font-mono font-semibold">{item.kode}</p>
          <p className="text-sm font-medium text-gray-800 truncate">{item.nama}</p>
          <p className="text-[11px] text-gray-400">{item.divisi} · {item.satuan}</p>
        </div>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
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
        <button key={c.kode} onClick={() => onPick(c)}
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
  const searchRef = useRef(null);
  const fileRef = useRef(null);
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
      setScanError('Tidak ada baris rekap. Pastikan kolom TOTAL terbaca (nama + angka akhir).');
      setPreview([]);
      return;
    }
    setPreview(validateItems(useEnt, rows));
    setScanError('');
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanBusy(true);
    setScanError('');
    setPreview([]);
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const text = await extractTextFromPdf(file);
        setScanText(text);
        const detected = detectEntityFromText(text);
        if (detected && detected !== entity) setEntity(detected);
        runValidatePreview(text, detected || entity);
      } else if (file.type.startsWith('image/')) {
        setScanError('Foto dimuat. Salin semua baris dari nota ke kotak teks, lalu Validasi.');
      } else setScanError('Gunakan PDF atau foto nota.');
    } catch (err) {
      setScanError(err.message || 'Gagal baca file');
    } finally {
      setScanBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false,
      });
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
    if (items.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const payload = items.map(i => ({
        kode: String(i.kode).trim(),
        qty: Math.round(Number(i.qty) * 1000) / 1000,
        keterangan: String(i.keterangan || '').trim().slice(0, 200),
      }));
      const submitFn = type === 'masuk' ? submitBarangMasuk : type === 'keluar' ? submitBarangKeluar : submitBarangRusak;
      const res = await submitFn(entity, payload);
      saveToHistory({ type, entity, items: items.map(i => ({ kode: i.kode, nama: i.nama, qty: i.qty, keterangan: i.keterangan })), ...res });
      setResult(res);
      if (res.success) setItems([]);
      setTimeout(() => setResult(null), 6000);
    } catch (err) {
      setResult({ success: false, error: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const typeConfig = {
    masuk: { icon: PackagePlus, label: 'Masuk', gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-200' },
    keluar: { icon: PackageMinus, label: 'Keluar', gradient: 'from-orange-500 to-red-500', shadow: 'shadow-orange-200' },
    rusak: { icon: AlertTriangle, label: 'Rusak', gradient: 'from-red-600 to-rose-700', shadow: 'shadow-red-200' },
  };
  const tc = typeConfig[type];

  const quickActions = [
    { id: 'masuk', label: 'Barang Masuk', sub: 'Tambah stok', icon: PackagePlus, color: 'bg-emerald-50 text-emerald-600', ring: type === 'masuk' },
    { id: 'keluar', label: 'Barang Keluar', sub: 'Kurangi stok', icon: PackageMinus, color: 'bg-orange-50 text-orange-600', ring: type === 'keluar' },
    { id: 'rusak', label: 'Barang Rusak', sub: 'Catat rusak', icon: AlertTriangle, color: 'bg-red-50 text-red-600', ring: type === 'rusak' },
    { id: 'scan', label: 'PDF / QR', sub: 'Validasi nota', icon: ScanLine, color: 'bg-cyan-50 text-cyan-700', ring: false },
    { id: 'cari', label: 'Cari Master', sub: 'Pilih item', icon: Search, color: 'bg-blue-50 text-blue-600', ring: false },
    { id: 'kamera', label: 'Kamera', sub: 'Scan barcode', icon: Camera, color: 'bg-violet-50 text-violet-600', ring: false },
  ];

  const onQuick = (id) => {
    if (id === 'masuk' || id === 'keluar' || id === 'rusak') { setType(id); return; }
    if (id === 'scan') { setShowScan(true); setScanError(''); return; }
    if (id === 'cari') { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 80); return; }
    if (id === 'kamera') { setShowScan(true); setScanError(''); setTimeout(() => startCamera(), 100); }
  };

  return (
    <div className="pb-4 animate-fade-in">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-800 mb-2">Quick Action</h2>
        <div className="grid grid-cols-3 gap-2.5">
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <button key={a.id} type="button" onClick={() => onQuick(a.id)}
                className={`card card-interactive p-3 flex flex-col items-center text-center gap-1.5 min-h-[88px] justify-center ${
                  a.ring ? 'ring-2 ring-[#0b2a55] border-transparent' : ''
                }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${a.color}`}><Icon className="w-5 h-5" /></div>
                <p className="text-[11px] font-semibold text-slate-800 leading-tight">{a.label}</p>
                <p className="text-[9px] text-slate-400 leading-tight">{a.sub}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        {ENTITIES.map(e => (
          <button key={e} onClick={() => { setEntity(e); setItems([]); setPreview([]); }}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold ${
              entity === e ? 'bg-[#0b2a55] text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}>{e}</button>
        ))}
      </div>

      <p className="text-[11px] text-slate-500 mb-3 px-0.5">
        Mode aktif: <span className="font-semibold text-slate-800">{typeConfig[type].label}</span> · {entity}
        {' · '}ketuk Masuk/Keluar/Rusak di atas untuk ganti
      </p>

      <div className="space-y-2 mb-4">
        {items.map((item, idx) => (
          <ItemRow key={item.kode + idx} item={item}
            onRemove={() => setItems(prev => prev.filter((_, i) => i !== idx))}
            onUpdate={(u) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...u } : it))}
          />
        ))}
        {items.length === 0 && (
          <p className="text-center text-gray-400 text-xs py-6">Belum ada item — pakai Quick Action di atas</p>
        )}
      </div>

      {items.length > 0 && (
        <button onClick={handleSubmit} disabled={submitting}
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
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => setShowSearch(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b">
              <div className="flex justify-between mb-2">
                <h3 className="text-sm font-semibold">Cari Barang ({entity})</h3>
                <button onClick={() => setShowSearch(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input ref={searchRef} type="text" autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Kode, nama, alias..." className="w-full pl-10 pr-4 py-2.5 bg-gray-50 rounded-xl border text-sm" />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {results.slice(0, 40).map(item => (
                <button key={item.kode} onClick={() => addItem(item)} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-blue-50">
                  <p className="text-xs font-mono text-blue-600">{item.kode}</p>
                  <p className="text-sm text-gray-800">{item.nama}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showScan && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => { stopCamera(); setShowScan(false); }}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between">
              <h3 className="text-sm font-bold">PDF / QR / Nota → {typeConfig[type].label}</h3>
              <button onClick={() => { stopCamera(); setShowScan(false); }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-[11px] text-gray-500">1) Baca semua baris · 2) Validasi · 3) Review akurasi · 4) Ke daftar · 5) Kirim server</p>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" capture="environment" className="hidden" onChange={onFile} />
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => fileRef.current?.click()} disabled={scanBusy}
                className="py-3 rounded-xl bg-cyan-50 text-cyan-800 text-xs font-semibold flex flex-col items-center gap-1 border border-cyan-100">
                <FileText className="w-5 h-5" /> PDF
              </button>
              <button onClick={startCamera} className="py-3 rounded-xl bg-violet-50 text-violet-800 text-xs font-semibold flex flex-col items-center gap-1 border border-violet-100">
                <Camera className="w-5 h-5" /> Kamera
              </button>
              <button onClick={() => fileRef.current?.click()} className="py-3 rounded-xl bg-amber-50 text-amber-800 text-xs font-semibold flex flex-col items-center gap-1 border border-amber-100">
                <QrCode className="w-5 h-5" /> Foto Nota
              </button>
            </div>
            {cameraOn && (
              <div className="space-y-2">
                <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black aspect-[3/4] object-cover" />
                <div className="flex gap-2">
                  <button onClick={scanQr} disabled={scanBusy} className="flex-1 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold">Scan QR</button>
                  <button onClick={stopCamera} className="px-3 py-2 rounded-xl bg-gray-100 text-xs">Tutup</button>
                </div>
              </div>
            )}
            <textarea value={scanText} onChange={e => setScanText(e.target.value)} rows={4}
              placeholder="Semua baris dari PDF muncul di sini..." className="w-full px-3 py-2 bg-gray-50 rounded-xl border text-sm" />
            <button onClick={() => runValidatePreview(scanText)} disabled={scanBusy || !scanText.trim()}
              className="w-full py-2.5 rounded-xl bg-[#0b2a55] text-white text-sm font-semibold disabled:opacity-50">
              {scanBusy ? 'Membaca PDF…' : 'Validasi semua baris'}
            </button>
            {scanError && <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">{scanError}</p>}
            {preview.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div className="rounded-lg bg-gray-50 p-2"><p className="text-sm font-bold">{previewStats.total}</p><p className="text-[9px] text-gray-500">Total</p></div>
                  <div className="rounded-lg bg-emerald-50 p-2"><p className="text-sm font-bold text-emerald-600">{previewStats.matched}</p><p className="text-[9px] text-emerald-600">Cocok</p></div>
                  <div className="rounded-lg bg-amber-50 p-2"><p className="text-sm font-bold text-amber-600">{previewStats.ambiguous}</p><p className="text-[9px] text-amber-600">Ambigu</p></div>
                  <div className="rounded-lg bg-red-50 p-2"><p className="text-sm font-bold text-red-600">{previewStats.unmatched}</p><p className="text-[9px] text-red-600">FLAG</p></div>
                </div>
                <p className={`text-center text-xs font-semibold ${
                  previewStats.pct === 100 ? 'text-emerald-600' : previewStats.pct >= 70 ? 'text-amber-600' : 'text-red-600'
                }`}>Akurasi match: {previewStats.pct}%{previewStats.pct === 100 ? ' — siap' : ' — perbaiki dulu'}</p>
                <div className="max-h-56 overflow-y-auto space-y-1.5 border rounded-xl p-2">
                  {preview.map((r, idx) => (
                    <div key={idx} className={`rounded-lg px-2.5 py-2 text-xs border ${
                      r.status === 'matched' ? 'bg-emerald-50 border-emerald-100' :
                      r.status === 'ambiguous' ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'
                    }`}>
                      <div className="flex gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate">{r.nama}</p>
                          <p className="text-[10px] text-gray-400 truncate">{r.raw}</p>
                          {r.status === 'matched' && <p className="text-[10px] text-emerald-700">→ {r.kode} · {r.namaMaster}</p>}
                          {r.status === 'ambiguous' && (r.candidates || []).map(c => (
                            <button key={c.kode} onClick={() => pickCandidate(idx, c)}
                              className="block w-full text-left mt-1 px-2 py-1 rounded bg-white text-[10px] border">Pilih: {c.kode} — {c.nama}</button>
                          ))}
                          {r.status === 'unmatched' && <ManualPick entity={entity} query={r.nama} onPick={item => pickCandidate(idx, item)} />}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <input type="number" min="0" value={r.qty} onChange={e => updatePreviewQty(idx, e.target.value)}
                            className="w-14 px-1 py-0.5 rounded border text-center text-xs font-semibold" />
                          <button onClick={() => removePreviewRow(idx)}><Trash2 className="w-3.5 h-3.5 text-gray-400" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={acceptMatchedToCart} disabled={previewStats.matched === 0}
                  className="w-full py-3 rounded-xl bg-cyan-600 text-white text-sm font-bold disabled:opacity-50">
                  Masukkan {previewStats.matched} item cocok ke daftar (belum ke server)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
