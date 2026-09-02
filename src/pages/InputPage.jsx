import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { searchMaster, ENTITIES } from '../data/master';
import { useStock } from '../hooks/useStock';
import { searchLiveStock } from '../data/liveSearch';
import { submitBarangMasuk, submitBarangKeluar, submitBarangRusak, saveToHistory } from '../data/api';
import { validateItems } from '../data/pdfValidate';
import {
  isSpeechSupported,
  createRecognizer,
  parseVoiceCommand,
  resolveVoiceItem,
} from '../data/voiceInput';
import {
  PackagePlus, PackageMinus, Search, Trash2, Send,
  CheckCircle, AlertCircle, Loader2, X, AlertTriangle,
  Upload, Eye, Mic, MicOff, FileText,
} from 'lucide-react';

function ItemRow({ item, onRemove, onUpdate, showMatch }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm animate-slide-up">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-blue-600 font-mono font-bold">{item.kode}</p>
          <p className="text-[15px] font-semibold text-gray-800 leading-tight mt-0.5">{item.nama}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-[12px] text-gray-400">{item.divisi} &middot; {item.satuan}</p>
            {showMatch && item.matchType && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 font-medium">{item.matchType}</span>
            )}
            {item.source === 'voice' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">Suara</span>
            )}
            {item.source === 'pdf' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">PDF</span>
            )}
          </div>
          {item.nameFromPdf && (
            <p className="text-[10px] text-gray-400 mt-0.5 truncate" title={item.nameFromPdf}>PDF: {item.nameFromPdf}</p>
          )}
          {item.voiceRaw && (
            <p className="text-[10px] text-violet-500 mt-0.5 truncate" title={item.voiceRaw}>voice: {item.voiceRaw}</p>
          )}
        </div>
        <button type="button" onClick={onRemove} className="text-gray-400 active:text-red-500 p-2 -mr-1 min-w-[44px] min-h-[44px] flex items-center justify-center">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-3">
        <div className="w-28">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Qty</label>
          <input type="number" min="0" step="1" inputMode="decimal" value={item.qty}
            onChange={(e) => onUpdate({ qty: parseFloat(e.target.value) || 0 })}
            className="w-full mt-1 px-3 py-3 bg-gray-50 rounded-xl border border-gray-200 text-base font-bold text-center focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Keterangan</label>
          <input type="text" placeholder="Opsional" value={item.keterangan}
            onChange={(e) => onUpdate({ keterangan: e.target.value })}
            className="w-full mt-1 px-3 py-3 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        </div>
      </div>
    </div>
  );
}

export default function InputPage() {
  const [entity, setEntity] = useState('CV');
  const stock = useStock(entity);
  const [type, setType] = useState('keluar');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadText, setUploadText] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [confirmedFromUpload, setConfirmedFromUpload] = useState(false);

  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [voiceHint, setVoiceHint] = useState('');
  const [voiceCandidates, setVoiceCandidates] = useState(null);
  const recognizerRef = useRef(null);

  const searchRef = useRef(null);
  const fileRef = useRef(null);
  const submitLock = useRef(false);

  const speechOk = isSpeechSupported();

  const results = useMemo(() => {
    const live = stock.items || [];
    if (live.length > 0) return searchLiveStock(live, search);
    return searchMaster(entity, search);
  }, [entity, search, stock.items]);

  const addItem = (item, extras = {}) => {
    if (items.find((i) => i.kode === item.kode)) {
      setShowSearch(false);
      setSearch('');
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        ...item,
        qty: extras.qty != null ? extras.qty : (item.qty || 1),
        keterangan: extras.keterangan || item.keterangan || '',
        source: extras.source || item.source || 'manual',
        nameFromPdf: extras.nameFromPdf || item.nameFromPdf,
        matchType: extras.matchType || item.matchType,
        voiceRaw: extras.voiceRaw,
      },
    ]);
    setShowSearch(false);
    setSearch('');
  };

  const stopListening = useCallback(() => {
    try {
      recognizerRef.current?.stop?.();
    } catch (_) {}
    recognizerRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => stopListening(), [stopListening]);

  const startListening = () => {
    setVoiceError('');
    setVoiceHint('');
    setVoiceCandidates(null);
    if (!speechOk) {
      setVoiceError('Browser tidak support suara. Pakai Chrome Android.');
      return;
    }
    const r = createRecognizer();
    if (!r) {
      setVoiceError('SpeechRecognition tidak tersedia');
      return;
    }
    recognizerRef.current = r;
    r.onstart = () => {
      setListening(true);
      setVoiceHint('Mendengarkan\u2026 sebutkan masuk/keluar/rusak + jumlah + nama');
    };
    r.onerror = (ev) => {
      setListening(false);
      const code = ev?.error || '';
      if (code === 'not-allowed') setVoiceError('Izin mikrofon ditolak.');
      else if (code === 'no-speech') setVoiceError('Tidak ada suara. Coba lagi.');
      else setVoiceError('Error suara: ' + (code || 'gagal'));
    };
    r.onend = () => setListening(false);
    r.onresult = (ev) => {
      const transcript = ev?.results?.[0]?.[0]?.transcript || '';
      if (!transcript) {
        setVoiceError('Tidak ada suara. Coba lagi.');
        return;
      }
      const cmd = parseVoiceCommand(transcript);
      if (!cmd) return;
      if (cmd.type) setType(cmd.type);
      const resolved = resolveVoiceItem(cmd.nameQuery, entity, searchMaster);
      if (!resolved) {
        setVoiceError(`Tidak ketemu: "${cmd.nameQuery || transcript}"`);
        setVoiceHint(`Hasil suara: ${transcript}`);
        return;
      }
      if (!resolved.exact && resolved.candidates?.length > 1) {
        setVoiceCandidates({
          candidates: resolved.candidates,
          qty: cmd.qty || 1,
          raw: transcript,
          type: cmd.type,
        });
        setVoiceHint(`Mode ${cmd.type || type} \u00b7 qty ${cmd.qty || 1}. Pilih barang yang benar.`);
        return;
      }
      addItem(resolved.item, {
        qty: cmd.qty || 1,
        source: 'voice',
        voiceRaw: transcript,
        keterangan: 'voice: ' + transcript,
      });
      setVoiceHint(`Ditambah: ${resolved.item.nama} \u00d7 ${cmd.qty || 1}`);
    };
    try {
      r.start();
    } catch (err) {
      setVoiceError('Gagal mikrofon: ' + (err.message || err));
      setListening(false);
    }
  };

  const pickVoiceCandidate = (item) => {
    if (!voiceCandidates) return;
    addItem(item, {
      qty: voiceCandidates.qty || 1,
      source: 'voice',
      voiceRaw: voiceCandidates.raw,
      keterangan: 'voice: ' + (voiceCandidates.raw || ''),
    });
    if (voiceCandidates.type) setType(voiceCandidates.type);
    setVoiceCandidates(null);
    setVoiceHint(`Ditambah: ${item.nama}`);
  };

  const handleUploadClick = () => {
    setShowUpload(true);
    setUploadText('');
    setValidationResult(null);
  };

  const handleFileText = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setUploadText('');
        setValidationResult(null);
        setVoiceHint('PDF terdeteksi. Salin teks dari PDF ke kotak di bawah, lalu Validasi.');
      } else if (file.type.startsWith('text/') || file.name.match(/\.(txt|csv)$/i)) {
        const text = await file.text();
        setUploadText(text);
        setValidationResult(null);
      } else if (file.type.startsWith('image/')) {
        setVoiceHint('Foto dimuat. Ketik/salin baris barang dari nota ke kotak teks.');
      } else {
        setVoiceHint('Format tidak didukung. Unggah teks, atau salin isi PDF manual.');
      }
    } catch (err) {
      setVoiceHint(err.message || 'Gagal membaca file');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleValidateText = useCallback(() => {
    if (!uploadText.trim()) return;
    const lines = uploadText.split('\n').map((l) => l.trim()).filter(Boolean);
    const result = validateItems(lines, entity);
    setValidationResult(result);
  }, [uploadText, entity]);

  const handleApplyValidated = (applyItems) => {
    const merged = [...items];
    for (const ni of applyItems) {
      const existing = merged.find((m) => m.kode === ni.kode);
      if (existing) {
        existing.qty += ni.qty;
      } else {
        merged.push({
          ...ni,
          keterangan: '',
          source: 'pdf',
          nameFromPdf: ni.nameFromPdf,
          matchType: ni.matchType,
        });
      }
    }
    setItems(merged);
    setConfirmedFromUpload(true);
    setShowUpload(false);
    setUploadText('');
    setValidationResult(null);
  };

  const handleSubmit = async () => {
    if (submitLock.current || submitting) return;
    if (items.length === 0) {
      setResult({ success: false, error: 'Belum ada item.' });
      return;
    }
    const bad = items.filter((i) => !i.kode || !(Number(i.qty) > 0));
    if (bad.length) {
      setResult({ success: false, error: 'Qty harus > 0 untuk semua item.' });
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setResult(null);
    const snapshot = items.map((i) => ({ kode: i.kode, nama: i.nama, qty: i.qty, keterangan: i.keterangan }));
    try {
      const payload = items.map((i) => ({
        kode: String(i.kode).trim(),
        qty: Math.round(Number(i.qty) * 1000) / 1000,
        keterangan: String(i.keterangan || '').trim().slice(0, 200),
      }));
      const submitFn =
        type === 'masuk' ? submitBarangMasuk : type === 'keluar' ? submitBarangKeluar : submitBarangRusak;
      const res = await submitFn(entity, payload);
      saveToHistory({ type, entity, items: snapshot, ...res });
      setResult(res);
      if (res.success) {
        setItems([]);
        setConfirmedFromUpload(false);
        try {
          stock.refresh?.({ force: true });
        } catch (_) {}
      }
      setTimeout(() => setResult(null), 8000);
    } catch (err) {
      setResult({ success: false, error: err.message || 'Gagal mengirim' });
    } finally {
      setSubmitting(false);
      setTimeout(() => {
        submitLock.current = false;
      }, 600);
    }
  };

  const typeConfig = {
    masuk: {
      icon: PackagePlus,
      label: 'Masuk',
      gradient: 'from-emerald-500 to-emerald-600',
      color: 'bg-emerald-50 text-emerald-600',
      activeColor: 'bg-emerald-500 text-white shadow-lg shadow-emerald-200',
      modeClass: 'mode-active-masuk',
    },
    keluar: {
      icon: PackageMinus,
      label: 'Keluar',
      gradient: 'from-orange-500 to-red-500',
      color: 'bg-orange-50 text-orange-600',
      activeColor: 'bg-orange-500 text-white shadow-lg shadow-orange-200',
      modeClass: 'mode-active-keluar',
    },
    rusak: {
      icon: AlertTriangle,
      label: 'Rusak',
      gradient: 'from-red-600 to-rose-700',
      color: 'bg-red-50 text-red-600',
      activeColor: 'bg-red-500 text-white shadow-lg shadow-red-200',
      modeClass: 'mode-active-rusak',
    },
  };
  const tc = typeConfig[type];

  return (
    <div className="pb-28">
      <div className="grid grid-cols-3 gap-2.5 mb-3">
        {(['masuk', 'keluar', 'rusak']).map((m) => {
          const cfg = typeConfig[m];
          const Icon = cfg.icon;
          const active = type === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setType(m)}
              className={`card card-interactive relative p-3 flex flex-col items-center text-center gap-1.5 min-h-[92px] justify-center transition-all duration-300 ${active ? cfg.modeClass : 'mode-dim'}`}
            >
              {active && (
                <span
                  className={`mode-badge absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ${
                    m === 'masuk' ? 'bg-emerald-500' : m === 'keluar' ? 'bg-orange-500' : 'bg-red-500'
                  }`}
                />
              )}
              <div
                className={`mode-icon-wrap w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  active ? cfg.activeColor : cfg.color
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <p className={`text-[11px] font-semibold ${active ? 'text-slate-900' : 'text-slate-600'}`}>{cfg.label}</p>
            </button>
          );
        })}
      </div>

      <div
        className={`mb-3 rounded-xl px-3 py-2.5 flex items-center gap-2 border-2 ${
          type === 'masuk'
            ? 'bg-emerald-50 border-emerald-400'
            : type === 'keluar'
              ? 'bg-orange-50 border-orange-400'
              : 'bg-red-50 border-red-400'
        }`}
      >
        <span
          className={`w-3 h-3 rounded-full mode-badge ${
            type === 'masuk' ? 'bg-emerald-500' : type === 'keluar' ? 'bg-orange-500' : 'bg-red-500'
          }`}
        />
        <p className="text-[13px] font-bold text-slate-800">
          Mode:{' '}
          <span className={type === 'masuk' ? 'text-emerald-700' : type === 'keluar' ? 'text-orange-700' : 'text-red-700'}>
            {tc.label}
          </span>
          <span className="text-slate-400 font-normal"> &middot; {entity}</span>
        </p>
      </div>

      <div className="flex gap-2 mb-3">
        {ENTITIES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              setEntity(e);
              setItems([]);
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold min-h-[44px] ${
              entity === e ? 'bg-[#0b2a55] text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <button
          type="button"
          onClick={() => {
            setShowSearch(true);
            setTimeout(() => searchRef.current?.focus(), 80);
          }}
          className="py-3 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/60 text-blue-800 text-[11px] font-semibold flex flex-col items-center justify-center gap-1 active:scale-[0.98] min-h-[64px]"
        >
          <Search className="w-4 h-4" />
          Cari Master
        </button>
        <button
          type="button"
          onClick={() => (listening ? stopListening() : startListening())}
          className={`py-3 rounded-xl border-2 border-dashed text-[11px] font-semibold flex flex-col items-center justify-center gap-1 active:scale-[0.98] min-h-[64px] ${
            listening
              ? 'border-violet-500 bg-violet-100 text-violet-800'
              : 'border-violet-300 bg-violet-50/60 text-violet-800'
          }`}
        >
          {listening ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
          {listening ? 'Stop' : 'Suara'}
        </button>
        <button
          type="button"
          onClick={handleUploadClick}
          className="py-3 rounded-xl border-2 border-dashed border-cyan-300 bg-cyan-50/60 text-cyan-700 text-[11px] font-semibold flex flex-col items-center justify-center gap-1 active:scale-[0.98] min-h-[64px]"
        >
          <Upload className="w-4 h-4" />
          PDF / Validasi
        </button>
      </div>

      {(voiceError || voiceHint) && (
        <div
          className={`mb-2 text-[11px] px-2.5 py-2 rounded-lg ${
            voiceError ? 'bg-red-50 text-red-700' : 'bg-violet-50 text-violet-700'
          }`}
        >
          {voiceError || voiceHint}
        </div>
      )}

      {voiceCandidates && (
        <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-violet-800">Hasil suara \u2014 pilih barang:</p>
          {voiceCandidates.candidates.map((c) => (
            <button
              key={c.kode}
              type="button"
              onClick={() => pickVoiceCandidate(c)}
              className="w-full text-left px-3 py-2 rounded-lg bg-white border border-violet-100 text-xs active:bg-violet-100"
            >
              <span className="font-mono text-violet-700 font-bold">{c.kode}</span> \u2014 {c.nama}
            </button>
          ))}
          <button type="button" onClick={() => setVoiceCandidates(null)} className="text-[11px] text-violet-600 underline">
            Batal
          </button>
        </div>
      )}

      {stock.error && (
        <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2 mb-2">Stok live gagal: {stock.error}</p>
      )}

      <div className="space-y-3 mb-4">
        {items.map((item, idx) => (
          <ItemRow
            key={item.kode + idx}
            item={item}
            showMatch={confirmedFromUpload || item.source === 'pdf'}
            onRemove={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
            onUpdate={(u) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...u } : it)))}
          />
        ))}
        {items.length === 0 && (
          <p className="text-center text-gray-400 text-xs py-8">
            Belum ada item \u2014 Cari Master, Suara, atau PDF / Validasi
          </p>
        )}
      </div>

      {result && (
        <div
          className={`mb-3 text-xs px-3 py-2.5 rounded-lg flex items-center gap-2 ${
            result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {result.success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>
            {result.success
              ? result.offline
                ? 'Offline \u2014 antri sync'
                : `${result.written ?? 'OK'} terkirim`
              : result.error || 'Gagal'}
          </span>
        </div>
      )}

      {items.length > 0 && (
        <div className="fixed bottom-[4.25rem] left-0 right-0 z-40 px-3 pointer-events-none">
          <div className="max-w-lg mx-auto pointer-events-auto">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className={`w-full py-3.5 rounded-xl bg-gradient-to-r ${tc.gradient} text-white text-sm font-bold flex items-center justify-center gap-2 shadow-xl disabled:opacity-60 active:scale-[0.98] min-h-[52px]`}
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
              {submitting ? 'Mengirim...' : `Kirim ${items.length} item \u00b7 ${tc.label} (${entity})`}
            </button>
          </div>
        </div>
      )}

      {showSearch && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center" onClick={() => setShowSearch(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b">
              <div className="flex justify-between mb-2">
                <h3 className="text-sm font-semibold">
                  Cari Master ({entity}) {stock.items?.length ? `\u00b7 Live ${stock.items.length}` : ''}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowSearch(false)}
                  className="p-2 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={searchRef}
                  type="text"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Kode, nama, atau alias..."
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl border text-sm"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {results.slice(0, 60).map((item) => (
                <button
                  key={item.kode}
                  type="button"
                  onClick={() => addItem(item, { source: 'manual' })}
                  className="w-full text-left px-3 py-3 rounded-xl active:bg-blue-50 min-h-[56px]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-blue-600 font-bold">{item.kode}</p>
                      <p className="text-sm text-gray-800 truncate">{item.nama}</p>
                      <p className="text-[10px] text-gray-400">
                        {item.divisi} \u00b7 {item.satuan}
                      </p>
                    </div>
                    {item.stok != null && (
                      <span
                        className={`text-sm font-bold tabular-nums shrink-0 ${
                          item.stok <= 5 ? 'text-red-600' : item.stok <= 20 ? 'text-amber-600' : 'text-emerald-600'
                        }`}
                      >
                        {item.stok}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {results.length === 0 && <p className="text-center text-gray-400 text-xs py-6">Tidak ditemukan</p>}
            </div>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center" onClick={() => setShowUpload(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b">
              <div className="flex justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-800">Validasi Data \u2014 Alias Mapping ({entity})</h3>
                <button type="button" onClick={() => setShowUpload(false)} className="p-2 -mr-2">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mb-3">
                Unggah teks/foto atau salin dari PDF surat jalan. Satu baris per item.
                <br />
                Format: <b>nama barang [spasi] qty</b>
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="text/plain,text/csv,application/pdf,image/*"
                className="hidden"
                onChange={handleFileText}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full mb-3 py-2.5 rounded-xl border-2 border-dashed border-cyan-300 bg-cyan-50/50 text-cyan-700 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <FileText className="w-4 h-4" /> Pilih file teks / PDF / foto
              </button>
              <textarea
                value={uploadText}
                onChange={(e) => {
                  setUploadText(e.target.value);
                  setValidationResult(null);
                }}
                placeholder={
                  'Ayam Fillet Dada 50\nNugget Katsu 30\nMie Goreng 100\nIce Cream INDOLAKTO 5\nBakso Ikan CIDEA 20\nSaos Lada Hitam PROMO 15'
                }
                rows={8}
                className="w-full px-4 py-3 bg-gray-50 rounded-xl border text-sm font-mono resize-none focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 leading-relaxed"
              />
              <button
                type="button"
                onClick={handleValidateText}
                disabled={!uploadText.trim()}
                className="w-full mt-3 py-3 rounded-xl bg-[#0b2a55] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] min-h-[48px]"
              >
                <Eye className="w-4 h-4" /> Validasi &amp; Match Alias (189 item, 396 alias)
              </button>
            </div>

            {validationResult && (
              <div className="overflow-y-auto flex-1 p-4">
                {validationResult.matched.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-bold text-emerald-700 mb-2 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Match: {validationResult.matched.length} item
                    </p>
                    {validationResult.matched.map((m, i) => (
                      <div key={i} className="bg-emerald-50 rounded-xl px-4 py-3 mb-2 border border-emerald-200">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-mono text-emerald-700 font-bold">{m.kode}</p>
                            <p className="text-[14px] font-semibold text-gray-800">{m.nama}</p>
                            <p className="text-[11px] text-gray-400">
                              PDF: &ldquo;{m.nameFromPdf}&rdquo; \u00b7 {m.matchType}
                            </p>
                          </div>
                          <span className="text-lg font-bold text-emerald-700 shrink-0 ml-3 tabular-nums">{m.qty}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {validationResult.ambiguous && validationResult.ambiguous.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Ambigu: {validationResult.ambiguous.length} item \u2014 perlu konfirmasi
                    </p>
                    {validationResult.ambiguous.map((a, i) => (
                      <div key={i} className="bg-amber-50 rounded-xl px-4 py-3 mb-2 border border-amber-200">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-mono text-amber-700 font-bold">{a.kode}</p>
                            <p className="text-[14px] font-semibold text-gray-800">{a.nama}</p>
                            <p className="text-[11px] text-amber-700 font-medium mt-0.5">{a.warning}</p>
                            <p className="text-[10px] text-gray-400">PDF: &ldquo;{a.nameFromPdf}&rdquo;</p>
                          </div>
                          <span className="text-lg font-bold text-amber-700 shrink-0 ml-3 tabular-nums">{a.qty}</span>
                        </div>
                        {a.candidates && (
                          <div className="mt-2 space-y-1">
                            <p className="text-[10px] text-gray-500 font-medium">Pilih yang benar:</p>
                            {a.candidates.map((c, ci) => (
                              <button
                                key={ci}
                                type="button"
                                onClick={() => {
                                  const fixed = {
                                    ...a,
                                    kode: c.kode,
                                    nama: c.nama,
                                    satuan: c.satuan,
                                    divisi: c.divisi,
                                    matchType: 'manual',
                                    warning: undefined,
                                    candidates: undefined,
                                  };
                                  setValidationResult((prev) => ({
                                    ...prev,
                                    matched: [...prev.matched, fixed],
                                    ambiguous: prev.ambiguous.filter((_, idx) => idx !== i),
                                  }));
                                }}
                                className="w-full text-left px-2 py-1.5 bg-white rounded-lg border border-amber-200 text-xs active:bg-amber-100"
                              >
                                <span className="font-mono text-amber-700">{c.kode}</span> \u2014 {c.nama}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {validationResult.unmatched.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Tidak match: {validationResult.unmatched.length} item
                    </p>
                    {validationResult.unmatched.map((u, i) => (
                      <div key={i} className="bg-red-50 rounded-xl px-4 py-3 mb-2 border border-red-200">
                        <p className="text-[14px] font-medium text-red-800">&ldquo;{u.nameFromPdf}&rdquo;</p>
                        <p className="text-[11px] text-gray-400">Tidak ditemukan di master {entity}. Review manual.</p>
                      </div>
                    ))}
                  </div>
                )}

                {validationResult.matched.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleApplyValidated(validationResult.matched)}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] min-h-[52px]"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Terapkan {validationResult.matched.length} item yang terverifikasi
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
