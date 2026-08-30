import { useState, useMemo, useRef } from 'react';
import { searchMaster, ENTITIES } from '../data/master';
import { submitBarangMasuk, submitBarangKeluar, submitBarangRusak, saveToHistory } from '../data/api';
import {
  extractTextFromPdf, parseLinesFromText, validateItems, scanBarcodeFromVideo,
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
  const [flags, setFlags] = useState([]);
  const [cameraOn, setCameraOn] = useState(false);
  const searchRef = useRef(null);
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const results = useMemo(() => searchMaster(entity, search), [entity, search]);

  const addItem = (item) => {
    if (items.find(i => i.kode === item.kode)) return;
    setItems(prev => [...prev, { ...item, qty: 1, keterangan: '' }]);
    setShowSearch(false);
    setSearch('');
  };

  const applyValidated = (validated) => {
    const matched = [];
    const unmatched = [];
    validated.forEach(r => {
      if (r.status === 'matched' && r.item) {
        matched.push({ ...r.item, qty: r.qty || 1, keterangan: r.raw || '' });
      } else unmatched.push(r);
    });
    setItems(prev => {
      const map = new Map(prev.map(i => [i.kode, { ...i }]));
      matched.forEach(m => {
        if (map.has(m.kode)) {
          const cur = map.get(m.kode);
          cur.qty = (Number(cur.qty) || 0) + (Number(m.qty) || 0);
        } else map.set(m.kode, m);
      });
      return Array.from(map.values());
    });
    setFlags(unmatched);
    if (matched.length) { setShowScan(false); setScanText(''); }
  };

  const runTextValidate = () => {
    const rows = parseLinesFromText(scanText);
    if (!rows.length) {
      setScanError('Tidak ada baris barang. Format: "2x Nama" atau "Nama 5"');
      return;
    }
    applyValidated(validateItems(entity, rows));
    setScanError('');
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanBusy(true);
    setScanError('');
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const text = await extractTextFromPdf(file);
        setScanText(text);
        applyValidated(validateItems(entity, parseLinesFromText(text)));
      } else if (file.type.startsWith('image/')) {
        setScanError('Foto dimuat — ketik/salin nama barang dari nota ke kotak teks, lalu Validasi.');
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
        applyValidated(validateItems(entity, parseLinesFromText(next)));
      }
    } catch (err) {
      setScanError(err.message || 'Scan gagal');
    } finally {
      setScanBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (items.length === 0 || submitting) return;
    const invalid = items.find(i => {
      const q = Number(i.qty);
      return !i.kode || Number.isNaN(q) || q < 0 || (type === 'masuk' && q === 0);
    });
    if (invalid) {
      setResult({ success: false, error: 'Qty tidak valid.' });
      return;
    }
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
      if (res.success) { setItems([]); setFlags([]); }
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

  return (
    <div className="pb-4 animate-fade-in">
      <div className="flex gap-2 mb-3">
        {Object.entries(typeConfig).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button key={key} onClick={() => setType(key)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
                type === key ? `bg-gradient-to-r ${cfg.gradient} text-white shadow-lg ${cfg.shadow}` : 'bg-white text-gray-600 border border-gray-200'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {cfg.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 mb-3">
        {ENTITIES.map(e => (
          <button key={e} onClick={() => { setEntity(e); setItems([]); setFlags([]); }}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold ${
              entity === e ? 'bg-[#0b2a55] text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}>{e}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <button onClick={() => { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 80); }}
          className="py-3 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 text-sm font-medium flex items-center justify-center gap-2 hover:bg-blue-50">
          <Plus className="w-4 h-4" /> Cari Master
        </button>
        <button onClick={() => { setShowScan(true); setScanError(''); }}
          className="py-3 rounded-xl border-2 border-dashed border-cyan-300 text-cyan-700 text-sm font-medium flex items-center justify-center gap-2 hover:bg-cyan-50">
          <ScanLine className="w-4 h-4" /> PDF / QR / Nota
        </button>
      </div>

      {flags.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-800 mb-1">FLAG — tidak match (review manual)</p>
          {flags.map((f, i) => (
            <p key={i} className="text-[11px] text-amber-700">• {f.nama || f.raw} (qty {f.qty})</p>
          ))}
        </div>
      )}

      <div className="space-y-2 mb-4">
        {items.map((item, idx) => (
          <ItemRow key={item.kode + idx} item={item}
            onRemove={() => setItems(prev => prev.filter((_, i) => i !== idx))}
            onUpdate={(u) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...u } : it))}
          />
        ))}
        {items.length === 0 && (
          <p className="text-center text-gray-400 text-xs py-6">Belum ada item — cari master atau unggah PDF/nota</p>
        )}
      </div>

      {items.length > 0 && (
        <button onClick={handleSubmit} disabled={submitting}
          className={`w-full py-3.5 rounded-xl bg-gradient-to-r ${tc.gradient} text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-60`}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Kirim {items.length} item · {typeConfig[type].label} ({entity})
        </button>
      )}

      {result && (
        <div className={`mt-3 text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${
          result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {result.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {result.success
            ? (result.offline ? 'Offline — antri sync' : `${result.written ?? items.length} terkirim`)
            : (result.error || 'Gagal')}
        </div>
      )}

      {showSearch && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setShowSearch(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Cari Barang ({entity}) — Alias Aktif</h3>
                <button onClick={() => setShowSearch(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input ref={searchRef} type="text" autoFocus placeholder="Kode, nama, atau alias..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400" />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Mapping by NAMA + alias · bukan nomor urut PDF</p>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {results.slice(0, 40).map(item => (
                <button key={item.kode} onClick={() => addItem(item)}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-blue-50 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-mono text-blue-600">{item.kode}</p>
                    <p className="text-sm text-gray-800">{item.nama}</p>
                  </div>
                  <span className="text-[10px] text-gray-400">{item.satuan}</span>
                </button>
              ))}
              {!search && <p className="text-center text-gray-400 text-xs py-4">Ketik untuk mencari</p>}
            </div>
          </div>
        </div>
      )}

      {showScan && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => { stopCamera(); setShowScan(false); }}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800">PDF / QR / Nota → {typeConfig[type].label}</h3>
              <button onClick={() => { stopCamera(); setShowScan(false); }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-[11px] text-gray-500">Validasi alias · LOWFAT≠YAKINIKU · CIDEA · PROMO · tidak match = FLAG</p>

            <input ref={fileRef} type="file" accept="application/pdf,image/*" capture="environment" className="hidden" onChange={onFile} />
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => fileRef.current?.click()} disabled={scanBusy}
                className="py-3 rounded-xl bg-cyan-50 text-cyan-800 text-xs font-semibold flex flex-col items-center gap-1 border border-cyan-100">
                <FileText className="w-5 h-5" /> PDF
              </button>
              <button onClick={startCamera}
                className="py-3 rounded-xl bg-violet-50 text-violet-800 text-xs font-semibold flex flex-col items-center gap-1 border border-violet-100">
                <Camera className="w-5 h-5" /> Kamera
              </button>
              <button onClick={() => fileRef.current?.click()}
                className="py-3 rounded-xl bg-amber-50 text-amber-800 text-xs font-semibold flex flex-col items-center gap-1 border border-amber-100">
                <QrCode className="w-5 h-5" /> Foto Nota
              </button>
            </div>

            {cameraOn && (
              <div className="space-y-2">
                <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black aspect-[3/4] object-cover" />
                <div className="flex gap-2">
                  <button onClick={scanQr} disabled={scanBusy} className="flex-1 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold">Scan QR</button>
                  <button onClick={stopCamera} className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs">Tutup</button>
                </div>
              </div>
            )}

            <textarea value={scanText} onChange={e => setScanText(e.target.value)} rows={4}
              placeholder={'Tempel / hasil PDF:\n2x Ayam Fillet Dada\nUdang 5'}
              className="w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm" />
            <button onClick={runTextValidate} disabled={scanBusy || !scanText.trim()}
              className="w-full py-2.5 rounded-xl bg-[#0b2a55] text-white text-sm font-semibold disabled:opacity-50">
              {scanBusy ? 'Memproses…' : `Validasi & masukkan ke ${typeConfig[type].label}`}
            </button>
            {scanError && <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">{scanError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
