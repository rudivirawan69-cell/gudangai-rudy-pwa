import { useState, useMemo, useRef, useCallback } from 'react';
import { searchMaster, ENTITIES, findByKode } from '../data/master';
import { submitBarangMasuk, submitBarangKeluar, submitBarangRusak, saveToHistory } from '../data/api';
import {
  PackagePlus, PackageMinus, Search, Plus, Trash2, Send,
  CheckCircle, AlertCircle, Loader2, X, AlertTriangle,
  Upload, FileText, Mic, MicOff
} from 'lucide-react';

function ItemRow({ item, onRemove, onUpdate }) {
  return (
    <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm animate-slide-up">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-blue-600 font-mono font-semibold">{item.kode}</p>
          <p className="text-sm font-medium text-gray-800 truncate">{item.nama}</p>
          <p className="text-[11px] text-gray-400">{item.divisi} \u00b7 {item.satuan}</p>
        </div>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Qty</label>
          <input type="number" min="0" step="0.5" value={item.qty}
            onChange={e => onUpdate({ qty: parseFloat(e.target.value) || 0 })}
            className="w-full mt-0.5 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-sm font-semibold focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Keterangan</label>
          <input type="text" placeholder="Opsional" value={item.keterangan}
            onChange={e => onUpdate({ keterangan: e.target.value })}
            className="w-full mt-0.5 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
        </div>
      </div>
    </div>
  );
}

export default function InputPage() {
  const [entity, setEntity] = useState('CV');
  const [type, setType] = useState('masuk');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const searchRef = useRef(null);
  const fileInputRef = useRef(null);

  // PDF Upload state
  const [uploadedFiles, setUploadedFiles] = useState([]);

  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const speechSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    const pdfFiles = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) return;
    setUploadedFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size));
      const newFiles = pdfFiles.filter(f => !existing.has(f.name + f.size));
      return [...prev, ...newFiles];
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (idx) => setUploadedFiles(prev => prev.filter((_, i) => i !== idx));

  const toggleVoice = useCallback(() => {
    if (!speechSupported) return;
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'id-ID';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setSearch(transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, speechSupported]);

  const suggestions = useMemo(() => {
    if (!search || search.length < 1) return [];
    return searchMaster(entity, search).slice(0, 10);
  }, [entity, search]);

  const addItem = (masterItem) => {
    if (items.find(i => i.kode === masterItem.kode)) {
      setItems(prev => prev.map(i => i.kode === masterItem.kode ? { ...i, qty: i.qty + 1 } : i));
    } else {
      setItems(prev => [...prev, { ...masterItem, qty: 1, keterangan: '' }]);
    }
    setSearch(''); setShowSearch(false);
  };

  const removeItem = (kode) => setItems(prev => prev.filter(i => i.kode !== kode));
  const updateItem = (kode, updates) => setItems(prev => prev.map(i => i.kode === kode ? { ...i, ...updates } : i));

  const handleSubmit = async () => {
    if (items.length === 0) return;
    setSubmitting(true);
    try {
      const payload = items.map(i => ({ kode: i.kode, qty: i.qty, keterangan: i.keterangan || '' }));
      const submitFn = type === 'masuk' ? submitBarangMasuk : type === 'keluar' ? submitBarangKeluar : submitBarangRusak;
      const res = await submitFn(entity, payload);
      saveToHistory({ type, entity, items: items.map(i => ({ kode: i.kode, nama: i.nama, qty: i.qty, keterangan: i.keterangan })), ...res });
      setResult(res); setItems([]);
      setTimeout(() => setResult(null), 5000);
    } catch (err) { setResult({ success: false, error: err.message }); }
    finally { setSubmitting(false); }
  };

  const totalItems = items.length;
  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  const typeConfig = {
    masuk: { icon: PackagePlus, label: 'Barang Masuk', gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-200', color: 'emerald' },
    keluar: { icon: PackageMinus, label: 'Barang Keluar', gradient: 'from-orange-500 to-red-500', shadow: 'shadow-orange-200', color: 'orange' },
    rusak: { icon: AlertTriangle, label: 'Barang Rusak', gradient: 'from-red-600 to-rose-700', shadow: 'shadow-red-200', color: 'red' },
  };
  const tc = typeConfig[type];

  return (
    <div className="pb-4 animate-fade-in">
      <div className="flex gap-2 mb-4">
        {Object.entries(typeConfig).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button key={key} onClick={() => setType(key)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                type === key ? `bg-gradient-to-r ${cfg.gradient} text-white shadow-lg ${cfg.shadow}` : 'bg-white text-gray-600 border border-gray-200'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {cfg.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 mb-4">
        {ENTITIES.map(e => (
          <button key={e} onClick={() => { setEntity(e); setItems([]); }}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
              entity === e ? 'bg-[#0b2a55] text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}>
            {e === 'CV' ? 'CV. Selera Bogatama' : 'PT. Rasyuka Inti Pratama'}
          </button>
        ))}
      </div>

      {/* PDF Upload Section */}
      <div className="mb-4">
        <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" multiple
          onChange={handleFileUpload} className="hidden" id="pdf-upload" />
        <button onClick={() => fileInputRef.current?.click()}
          className="w-full py-3 rounded-xl border-2 border-dashed border-cyan-300 text-cyan-600 text-sm font-medium flex items-center justify-center gap-2 hover:bg-cyan-50 transition-colors">
          <Upload className="w-4 h-4" /> Upload PDF Surat Jalan
        </button>
        {uploadedFiles.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {uploadedFiles.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-cyan-50 rounded-lg px-3 py-2 border border-cyan-100">
                <FileText className="w-4 h-4 text-cyan-600 shrink-0" />
                <span className="text-xs text-gray-700 truncate flex-1">{file.name}</span>
                <span className="text-[10px] text-gray-400 shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                <button onClick={() => removeFile(idx)} className="text-gray-400 hover:text-red-500 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={() => { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 100); }}
        className="w-full py-3 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 text-sm font-medium flex items-center justify-center gap-2 hover:bg-blue-50 transition-colors mb-4">
        <Plus className="w-4 h-4" /> Tambah Barang
      </button>

      {showSearch && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
             onClick={() => setShowSearch(false)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[80vh] flex flex-col animate-slide-up"
               onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800">Cari Barang ({entity}) \u2014 Alias Aktif</h3>
                <button onClick={() => setShowSearch(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="relative flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input ref={searchRef} type="text" autoFocus placeholder='Ketik kode, nama, atau alias...'
                    value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
                {speechSupported && (
                  <button onClick={toggleVoice}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                      isListening
                        ? 'bg-red-500 text-white shadow-lg shadow-red-200 animate-pulse'
                        : 'bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-600'
                    }`}
                    title={isListening ? 'Stop' : 'Cari dengan suara'}>
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {suggestions.length === 0 && search && (
                <p className="text-center text-gray-400 text-sm py-8">Tidak ditemukan &quot;{search}&quot;</p>
              )}
              {suggestions.map(item => (
                <button key={item.kode} onClick={() => addItem(item)}
                  className="w-full text-left px-3 py-3 rounded-xl hover:bg-blue-50 transition-colors flex items-center gap-3 group">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-blue-600">{item.kode.split('-')[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.nama}</p>
                    <p className="text-[11px] text-gray-400">{item.kode} \u00b7 {item.divisi} \u00b7 {item.satuan}</p>
                  </div>
                  <Plus className="w-5 h-5 text-gray-300 group-hover:text-blue-500" />
                </button>
              ))}
              {!search && <p className="text-center text-gray-400 text-xs py-4">Ketik untuk mencari</p>}
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">Belum ada barang ditambahkan</p>
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {items.map(item => (
            <ItemRow key={item.kode} item={item}
              onRemove={() => removeItem(item.kode)}
              onUpdate={updates => updateItem(item.kode, updates)} />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="sticky bottom-20 bg-white/90 backdrop-blur-lg rounded-2xl p-4 shadow-xl border border-gray-200 animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-gray-500">{totalItems} item \u00b7 {totalQty} total qty</p>
              <p className="text-xs text-gray-400">{entity} \u00b7 {tc.label}</p>
            </div>
          </div>
          <button onClick={handleSubmit} disabled={submitting || totalQty === 0}
            className={`w-full py-3.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 bg-gradient-to-r ${tc.gradient} shadow-lg ${tc.shadow}`}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitting ? 'Mengirim...' : `Kirim ${tc.label}`}
          </button>
        </div>
      )}

      {result && (
        <div className={`fixed top-4 left-4 right-4 z-50 p-4 rounded-xl shadow-xl animate-slide-up flex items-start gap-3 ${
          result.success ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {result.success ? <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
          <div>
            <p className="text-sm font-semibold">{result.success ? 'Berhasil!' : 'Gagal'}</p>
            <p className="text-xs opacity-90">
              {result.success
                ? result.offline ? 'Disimpan offline \u2014 akan sync saat online' : `${result.written || 0} item terkirim ke server`
                : result.error || 'Terjadi kesalahan'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
