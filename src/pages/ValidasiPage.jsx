import { useState, useRef, useCallback } from 'react';
import {
  FileText, Camera, Upload, CheckCircle2, XCircle, AlertTriangle,
  Loader2, QrCode, Trash2, Send, Image as ImageIcon, X
} from 'lucide-react';
import {
  extractTextFromPdf, extractTextFromImage, parseLinesFromText, validateItems,
  summarizeValidation, scanBarcodeFromVideo,
} from '../data/pdfValidate';
import { submitBarangKeluar, saveToHistory } from '../data/api';
import { searchMaster } from '../data/master';

export default function ValidasiPage() {
  const [entity, setEntity] = useState('CV');
  const [mode, setMode] = useState('pdf');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rawText, setRawText] = useState('');
  const [results, setResults] = useState([]);
  const [previewUrl, setPreviewUrl] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState(null);
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const runValidation = useCallback((text) => {
    const rows = parseLinesFromText(text);
    if (!rows.length) {
      setError('Tidak ada baris barang terdeteksi. Periksa isi PDF/teks.');
      setResults([]);
      return;
    }
    const result = validateItems(rows, entity);
    const flat = [
      ...(result.matched || []).map((r) => ({
        ...r,
        status: 'matched',
        nama: r.nameFromPdf,
        namaMaster: r.nama,
        item: r,
      })),
      ...(result.ambiguous || []).map((r) => ({
        ...r,
        status: 'ambiguous',
        nama: r.nameFromPdf,
      })),
      ...(result.unmatched || []).map((r) => ({
        ...r,
        status: 'unmatched',
        nama: r.nameFromPdf,
      })),
    ];
    setResults(flat);
    setError('');
  }, [entity]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(''); setResults([]); setSubmitMsg(null);
    const onProgress = (msg) => setError(msg);
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setPreviewUrl('');
        const result = await extractTextFromPdf(file, onProgress);
        const text = typeof result === 'string' ? result : (result?.text || '');
        const method = typeof result === 'object' && result?.method ? result.method : 'text';
        setRawText(text);
        if (text.trim().length >= 3) {
          runValidation(text);
          setError(method === 'ocr' || method === 'mixed' ? `PDF dibaca via OCR (${method})` : '');
        } else {
          setError('PDF kosong / OCR gagal membaca teks. Ketik manual.');
        }
      } else if (file.type.startsWith('image/')) {
        setPreviewUrl(URL.createObjectURL(file));
        const result = await extractTextFromImage(file, onProgress);
        const text = result?.text || '';
        setRawText(text);
        if (text.trim().length >= 3) {
          runValidation(text);
          setError('Foto dibaca via OCR');
        } else {
          setError('OCR tidak membaca teks. Ketik/salin baris dari nota.');
        }
      } else setError('Format tidak didukung. Unggah PDF atau foto.');
    } catch (err) {
      setError(err.message || 'Gagal membaca file');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const startCamera = async () => {
    setError('');
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
      }, 100);
    } catch (err) {
      setError('Kamera tidak tersedia: ' + (err.message || err));
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks()?.forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setPreviewUrl(URL.createObjectURL(blob));
      stopCamera();
      setBusy(true);
      try {
        const result = await extractTextFromImage(blob, (m) => setError(m));
        const text = result?.text || '';
        setRawText(text);
        if (text.trim().length >= 3) {
          runValidation(text);
          setError('Foto kamera dibaca via OCR');
        } else {
          setError('OCR tidak membaca teks. Ketik manual dari foto.');
        }
      } catch (err) {
        setError(err.message || 'OCR gagal');
      } finally {
        setBusy(false);
      }
    }, 'image/jpeg', 0.85);
  };

  const scanQr = async () => {
    if (!videoRef.current) return;
    setBusy(true);
    try {
      const res = await scanBarcodeFromVideo(videoRef.current);
      if (!res.ok) setError(res.error);
      else {
        const next = (rawText ? rawText + '\n' : '') + res.value;
        setRawText(next);
        setError('');
        runValidation(next);
      }
    } catch (err) {
      setError(err.message || 'Scan gagal');
    } finally {
      setBusy(false);
    }
  };

  const pickCandidate = (idx, item) => {
    setResults((prev) => prev.map((r, i) => i === idx ? {
      ...r, status: 'matched', matchType: 'manual', item,
      kode: item.kode, namaMaster: item.nama, satuan: item.satuan, candidates: undefined,
    } : r));
  };

  const removeRow = (idx) => setResults((prev) => prev.filter((_, i) => i !== idx));
  const summary = summarizeValidation(results);

  const sendAsKeluar = async () => {
    if (!summary.matchedItems.length) return;
    setSubmitting(true); setSubmitMsg(null);
    try {
      const payload = summary.matchedItems.map((i) => ({
        kode: i.kode, qty: i.qty,
        keterangan: (i.keterangan || 'Validasi PDF/Nota').slice(0, 200),
      }));
      const res = await submitBarangKeluar(entity, payload);
      saveToHistory({
        type: 'keluar', entity,
        items: summary.matchedItems.map((i) => ({ kode: i.kode, nama: i.nama, qty: i.qty, keterangan: i.keterangan })),
        ...res,
      });
      setSubmitMsg(res);
      if (res.success) { setResults([]); setRawText(''); setPreviewUrl(''); }
    } catch (err) {
      setSubmitMsg({ success: false, error: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-4 animate-fade-in space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Validasi PDF Barang Keluar</h2>
        <p className="text-xs text-gray-500 mt-0.5">PDF digital / scan / foto nota — OCR otomatis (ind+eng), cocokkan master + alias.</p>
      </div>

      <div className="flex gap-2">
        {['CV', 'PT'].map((e) => (
          <button key={e} onClick={() => { setEntity(e); if (rawText) runValidation(rawText); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${entity === e ? 'bg-[#0b2a55] text-white shadow' : 'bg-white border border-gray-200 text-gray-600'}`}>{e}</button>
        ))}
      </div>

      <div className="flex gap-2">
        {[ { id: 'pdf', label: 'PDF', icon: FileText }, { id: 'camera', label: 'Kamera', icon: Camera }, { id: 'text', label: 'Teks', icon: Upload } ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setMode(id); if (id !== 'camera') stopCamera(); }}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${mode === id ? 'bg-cyan-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {(mode === 'pdf' || mode === 'camera') && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-4">
          <input ref={fileRef} type="file" accept={mode === 'pdf' ? 'application/pdf,image/*' : 'image/*'} capture={mode === 'camera' ? 'environment' : undefined} className="hidden" onChange={onFile} />
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="w-full py-8 flex flex-col items-center gap-2 text-gray-500 rounded-xl">
            {busy ? <Loader2 className="w-8 h-8 animate-spin text-cyan-600" /> : mode === 'pdf' ? <FileText className="w-8 h-8 text-cyan-600" /> : <ImageIcon className="w-8 h-8 text-cyan-600" />}
            <span className="text-sm font-semibold text-gray-700">{mode === 'pdf' ? 'Pilih PDF (teks / scan OCR)' : 'Ambil / Pilih Foto Nota'}</span>
            <span className="text-[11px] text-gray-400">{busy ? (error || 'OCR berjalan…') : 'Tesseract.js ind+eng · offline-capable'}</span>
          </button>
          {mode === 'camera' && (
            <div className="mt-3 space-y-2">
              {!cameraOn ? (
                <button onClick={startCamera} className="w-full py-2.5 rounded-xl bg-[#0b2a55] text-white text-sm font-semibold flex items-center justify-center gap-2">
                  <Camera className="w-4 h-4" /> Buka Kamera
                </button>
              ) : (
                <div className="space-y-2">
                  <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black aspect-[3/4] object-cover" />
                  <div className="flex gap-2">
                    <button onClick={capturePhoto} className="flex-1 py-2.5 rounded-xl bg-cyan-600 text-white text-sm font-semibold">Ambil + OCR</button>
                    <button onClick={scanQr} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold flex items-center justify-center gap-1"><QrCode className="w-4 h-4" /> Scan QR</button>
                    <button onClick={stopCamera} className="px-3 py-2.5 rounded-xl bg-gray-100 text-gray-600"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {previewUrl && (
        <div className="relative rounded-xl overflow-hidden border border-gray-200">
          <img src={previewUrl} alt="Nota" className="w-full max-h-56 object-contain bg-gray-50" />
          <button onClick={() => setPreviewUrl('')} className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-3">
        <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Teks baris barang (OCR / ketik)</label>
        <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} rows={5}
          placeholder={'Contoh:\n2x Ayam Fillet Dada\nUdang 5\nBakso Sapi Halus x3'}
          className="mt-1.5 w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-cyan-400" />
        <button onClick={() => runValidation(rawText)} disabled={!rawText.trim() || busy}
          className="mt-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-[#0b2a55] to-[#164e8a] text-white text-sm font-semibold disabled:opacity-50">
          Validasi ke Master {entity}
        </button>
      </div>

      {error && <div className="text-xs px-3 py-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-100">{error}</div>}

      {results.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center"><p className="text-lg font-bold text-emerald-600">{summary.matched}</p><p className="text-[10px] text-emerald-600">Cocok</p></div>
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center"><p className="text-lg font-bold text-amber-600">{summary.ambiguous}</p><p className="text-[10px] text-amber-600">Ambigu</p></div>
          <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-center"><p className="text-lg font-bold text-red-600">{summary.unmatched}</p><p className="text-[10px] text-red-600">Tidak cocok</p></div>
        </div>
      )}

      <div className="space-y-2">
        {results.map((r, idx) => (
          <div key={idx} className={`bg-white rounded-xl border p-3 ${r.status === 'matched' ? 'border-emerald-100' : r.status === 'ambiguous' ? 'border-amber-200' : 'border-red-100'}`}>
            <div className="flex items-start gap-2">
              {r.status === 'matched' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> : r.status === 'ambiguous' ? <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{r.nama}</p>
                <p className="text-[11px] text-gray-400">Qty {r.qty} · {r.raw || r.line || ''}</p>
                {r.status === 'matched' && <p className="text-[11px] text-emerald-700 mt-0.5">→ {r.kode} · {r.namaMaster} ({r.satuan}) · {r.matchType}</p>}
                {r.status === 'ambiguous' && (
                  <div className="mt-1.5 space-y-1">
                    <p className="text-[10px] text-amber-700">Pilih yang benar (tidak menebak):</p>
                    {(r.candidates || []).map((c) => (
                      <button key={c.kode} onClick={() => pickCandidate(idx, c)} className="block w-full text-left text-xs px-2 py-1.5 rounded-lg bg-amber-50 text-gray-700">{c.kode} — {c.nama}</button>
                    ))}
                  </div>
                )}
                {r.status === 'unmatched' && <ManualPick entity={entity} query={r.nama} onPick={(item) => pickCandidate(idx, item)} />}
              </div>
              <button onClick={() => removeRow(idx)} className="p-1 text-gray-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>

      {summary.matched > 0 && summary.ambiguous === 0 && (
        <button onClick={sendAsKeluar} disabled={submitting}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-60">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Kirim {summary.matched} item sebagai Barang Keluar ({entity})
        </button>
      )}
      {summary.matched > 0 && summary.ambiguous > 0 && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Selesaikan item Ambigu terlebih dahulu sebelum kirim.</p>
      )}

      {submitMsg && (
        <div className={`text-xs px-3 py-2 rounded-lg ${submitMsg.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {submitMsg.success ? (submitMsg.offline ? 'Disimpan offline — akan sync saat online' : `${submitMsg.written || summary.matched} item terkirim ke server`) : (submitMsg.error || 'Gagal mengirim')}
        </div>
      )}
    </div>
  );
}

function ManualPick({ entity, query, onPick }) {
  const [q, setQ] = useState(query || '');
  const hits = q.length >= 1 ? searchMaster(entity, q).slice(0, 6) : [];
  return (
    <div className="mt-1.5">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari master / alias..."
        className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-gray-50" />
      <div className="mt-1 space-y-0.5">
        {hits.map((c) => (
          <button key={c.kode} onClick={() => onPick(c)} className="block w-full text-left text-xs px-2 py-1.5 rounded-lg bg-gray-50 text-gray-700">{c.kode} — {c.nama}</button>
        ))}
      </div>
    </div>
  );
}
