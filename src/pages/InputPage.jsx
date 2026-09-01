import { useState, useMemo, useRef } from 'react';
import { searchMaster, ENTITIES, matchByAlias } from '../data/master';
import { useStock } from '../hooks/useStock';
import { searchLiveStock } from '../data/liveSearch';
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

export default function InputPage() {
  const [entity, setEntity] = useState('CV');
  const stock = useStock(entity);
  const [type, setType] = useState('keluar');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const searchRef = useRef(null);

  const results = useMemo(() => {
    const live = stock.items || [];
    if (live.length > 0) return searchLiveStock(live, search);
    return searchMaster(entity, search);
  }, [entity, search, stock.items]);

  const addItem = (item) => {
    if (items.find(i => i.kode === item.kode)) return;
    setItems(prev => [...prev, { ...item, qty: 1, keterangan: '' }]);
    setShowSearch(false);
    setSearch('');
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (items.length === 0) {
      setResult({ success: false, error: 'Belum ada item.' });
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

  const typeConfig = {
    masuk: { icon: PackagePlus, label: 'Masuk', gradient: 'from-emerald-500 to-emerald-600' },
    keluar: { icon: PackageMinus, label: 'Keluar', gradient: 'from-orange-500 to-red-500' },
    rusak: { icon: AlertTriangle, label: 'Rusak', gradient: 'from-red-600 to-rose-700' },
  };
  const tc = typeConfig[type];

  return (
    <div className="pb-4 animate-fade-in">
      <div className="grid grid-cols-3 gap-2 mb-3">
        {(['masuk', 'keluar', 'rusak']).map((m) => {
          const Icon = typeConfig[m].icon;
          const active = type === m;
          return (
            <button key={m} type="button" onClick={() => setType(m)}
              className={`card p-3 flex flex-col items-center gap-1.5 min-h-[84px] justify-center ${
                active ? 'ring-2 ring-offset-1 ring-cyan-500' : ''
              }`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                m === 'masuk' ? 'bg-emerald-50 text-emerald-600' : m === 'keluar' ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'
              }`}><Icon className="w-5 h-5" /></div>
              <p className="text-[11px] font-semibold">{typeConfig[m].label}</p>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 mb-3">
        {ENTITIES.map(e => (
          <button key={e} type="button" onClick={() => { setEntity(e); setItems([]); }}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold ${
              entity === e ? 'bg-[#0b2a55] text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}>{e}</button>
        ))}
      </div>

      <button type="button" onClick={() => { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 80); }}
        className="w-full mb-3 py-3 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/60 text-blue-800 text-xs font-semibold flex items-center justify-center gap-2">
        <Search className="w-4 h-4" /> Cari Barang ({entity}){stock.items?.length ? ` · Live ${stock.items.length}` : ''}
      </button>

      <div className="space-y-2 mb-4">
        {items.map((item, idx) => (
          <ItemRow key={item.kode + idx} item={item}
            onRemove={() => setItems(prev => prev.filter((_, i) => i !== idx))}
            onUpdate={(u) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...u } : it))}
          />
        ))}
        {items.length === 0 && (
          <p className="text-center text-gray-400 text-xs py-6">Belum ada item — ketuk Cari Barang (data dari spreadsheet September)</p>
        )}
      </div>

      {items.length > 0 && (
        <button type="button" onClick={handleSubmit} disabled={submitting}
          className={`w-full py-3.5 rounded-xl bg-gradient-to-r ${tc.gradient} text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-60`}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Kirim {items.length} item · {tc.label} ({entity}) → Server
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
                <h3 className="text-sm font-semibold">Cari Barang ({entity}){stock.items?.length ? ` · Live ${stock.items.length}` : ' · Master lokal'}</h3>
                <button type="button" onClick={() => setShowSearch(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input ref={searchRef} type="text" autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Kode, nama..." className="w-full pl-10 pr-4 py-2.5 bg-gray-50 rounded-xl border text-sm" />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {stock.loading && results.length === 0 && (
                <p className="text-center text-gray-400 text-xs py-6">Memuat stok September…</p>
              )}
              {!stock.loading && results.length === 0 && (
                <p className="text-center text-gray-400 text-xs py-6">Tidak ada item. Isi URL API + Secret di Atur.</p>
              )}
              {results.slice(0, 50).map(item => (
                <button key={item.kode} type="button" onClick={() => addItem(item)} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-blue-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-blue-600">{item.kode}</p>
                      <p className="text-sm text-gray-800 truncate">{item.nama}</p>
                      <p className="text-[10px] text-gray-400">{item.divisi} · {item.satuan}</p>
                    </div>
                    {item.stok != null && (
                      <span className={`text-[11px] font-semibold tabular-nums shrink-0 ${
                        item.stok <= 5 ? 'text-red-600' : item.stok <= 20 ? 'text-amber-600' : 'text-emerald-600'
                      }`}>{item.stok}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
