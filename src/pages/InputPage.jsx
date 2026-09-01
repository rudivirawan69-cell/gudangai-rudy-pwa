import { useState, useMemo, useRef } from 'react';
import { searchMaster, ENTITIES } from '../data/master';
import { useStock } from '../hooks/useStock';
import { searchLiveStock } from '../data/liveSearch';
import { submitBarangMasuk, submitBarangKeluar, submitBarangRusak, saveToHistory } from '../data/api';
import {
  PackagePlus, PackageMinus, Search, Trash2, Send,
  CheckCircle, AlertCircle, Loader2, X, AlertTriangle,
} from 'lucide-react';

function ItemRow({ item, onRemove, onUpdate }) {
  return (
    <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm animate-slide-up">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-blue-600 font-mono font-semibold">{item.kode}</p>
          <p className="text-sm font-medium text-gray-800 truncate">{item.nama}</p>
          <p className="text-[11px] text-gray-400">{item.divisi} · {item.satuan}</p>
        </div>
        <button type="button" onClick={onRemove} className="text-gray-400 active:text-red-500 p-2 -mr-1 min-w-[40px] min-h-[40px] flex items-center justify-center">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Qty</label>
          <input type="number" min="0" step="1" inputMode="decimal" value={item.qty}
            onChange={(e) => onUpdate({ qty: parseFloat(e.target.value) || 0 })}
            className="w-full mt-0.5 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-200 text-sm font-semibold focus:outline-none focus:border-blue-400" />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Keterangan</label>
          <input type="text" placeholder="Opsional" value={item.keterangan}
            onChange={(e) => onUpdate({ keterangan: e.target.value })}
            className="w-full mt-0.5 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400" />
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
  const submitLock = useRef(false);

  const results = useMemo(() => {
    const live = stock.items || [];
    if (live.length > 0) return searchLiveStock(live, search);
    return searchMaster(entity, search);
  }, [entity, search, stock.items]);

  const addItem = (item) => {
    if (items.find((i) => i.kode === item.kode)) {
      setShowSearch(false);
      setSearch('');
      return;
    }
    setItems((prev) => [...prev, { ...item, qty: 1, keterangan: '' }]);
    setShowSearch(false);
    setSearch('');
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
    const snapshot = items.map((i) => ({
      kode: i.kode,
      nama: i.nama,
      qty: i.qty,
      keterangan: i.keterangan,
    }));
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
        // Refresh stok di background setelah kirim berhasil
        try { stock.refresh?.({ force: true }); } catch (_) {}
      }
      setTimeout(() => setResult(null), 8000);
    } catch (err) {
      setResult({ success: false, error: err.message || 'Gagal mengirim' });
    } finally {
      setSubmitting(false);
      // Lepas lock sedikit delay agar double-tap tidak dobel kirim
      setTimeout(() => { submitLock.current = false; }, 600);
    }
  };

  const typeConfig = {
    masuk: {
      icon: PackagePlus,
      label: 'Masuk',
      gradient: 'from-emerald-500 to-emerald-600',
      modeClass: 'mode-active-masuk',
      color: 'bg-emerald-50 text-emerald-600',
      activeColor: 'bg-emerald-500 text-white shadow-lg shadow-emerald-200',
    },
    keluar: {
      icon: PackageMinus,
      label: 'Keluar',
      gradient: 'from-orange-500 to-red-500',
      modeClass: 'mode-active-keluar',
      color: 'bg-orange-50 text-orange-600',
      activeColor: 'bg-orange-500 text-white shadow-lg shadow-orange-200',
    },
    rusak: {
      icon: AlertTriangle,
      label: 'Rusak',
      gradient: 'from-red-600 to-rose-700',
      modeClass: 'mode-active-rusak',
      color: 'bg-red-50 text-red-600',
      activeColor: 'bg-red-500 text-white shadow-lg shadow-red-200',
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
              className={`card card-interactive relative p-3 flex flex-col items-center text-center gap-1.5 min-h-[92px] justify-center transition-all duration-300 ${
                active ? cfg.modeClass : 'mode-dim'
              }`}
            >
              {active && (
                <span className={`mode-badge absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ${
                  m === 'masuk' ? 'bg-emerald-500' : m === 'keluar' ? 'bg-orange-500' : 'bg-red-500'
                }`} />
              )}
              <div className={`mode-icon-wrap w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ${
                active ? cfg.activeColor : cfg.color
              }`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className={`text-[11px] font-semibold ${active ? 'text-slate-900' : 'text-slate-600'}`}>
                {cfg.label}
              </p>
              <p className={`text-[9px] font-medium ${
                active
                  ? m === 'masuk' ? 'text-emerald-800' : m === 'keluar' ? 'text-orange-800' : 'text-red-800'
                  : 'text-slate-400'
              }`}>
                {active ? '● AKTIF' : m === 'masuk' ? 'Tambah stok' : m === 'keluar' ? 'Kurangi stok' : 'Catat rusak'}
              </p>
            </button>
          );
        })}
      </div>

      <div className={`mb-3 rounded-xl px-3 py-2.5 flex items-center gap-2 border-2 transition-all duration-300 ${
        type === 'masuk' ? 'bg-emerald-50 border-emerald-400' :
        type === 'keluar' ? 'bg-orange-50 border-orange-400' :
        'bg-red-50 border-red-400'
      }`}>
        <span className={`w-3 h-3 rounded-full mode-badge ${
          type === 'masuk' ? 'bg-emerald-500' : type === 'keluar' ? 'bg-orange-500' : 'bg-red-500'
        }`} />
        <p className="text-[13px] font-bold text-slate-800">
          Mode: <span className={
            type === 'masuk' ? 'text-emerald-700' : type === 'keluar' ? 'text-orange-700' : 'text-red-700'
          }>{tc.label}</span>
          <span className="text-slate-400 font-normal"> · {entity}</span>
        </p>
      </div>

      <div className="flex gap-2 mb-3">
        {ENTITIES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => { setEntity(e); setItems([]); }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all duration-250 min-h-[44px] ${
              entity === e ? 'bg-[#0b2a55] text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 80); }}
        className="w-full mb-3 py-3.5 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/60 text-blue-800 text-xs font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform min-h-[48px]"
      >
        <Search className="w-4 h-4" />
        Cari Barang ({entity})
        {stock.items?.length ? ` · Live ${stock.items.length}` : stock.loading ? ' · Memuat…' : ' · Master'}
      </button>

      {stock.error && (
        <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2 mb-2">
          Stok live gagal dimuat: {stock.error}. Pakai master lokal / cek Secret di Atur.
        </p>
      )}

      <div className="space-y-2 mb-4">
        {items.map((item, idx) => (
          <ItemRow
            key={item.kode + idx}
            item={item}
            onRemove={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
            onUpdate={(u) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...u } : it)))}
          />
        ))}
        {items.length === 0 && (
          <p className="text-center text-gray-400 text-xs py-8">
            Belum ada item — ketuk Cari Barang (data spreadsheet September)
          </p>
        )}
      </div>

      {result && (
        <div className={`mb-3 text-xs px-3 py-2.5 rounded-lg flex items-center gap-2 ${
          result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {result.success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>
            {result.success
              ? (result.offline ? 'Offline — antri sync (bisa dilanjutkan di Atur)' : `${result.written ?? items.length || 'OK'} terkirim ke server`)
              : (result.error || 'Gagal')}
          </span>
        </div>
      )}

      {/* Sticky kirim — selalu terlihat */}
      {items.length > 0 && (
        <div className="fixed bottom-[4.25rem] left-0 right-0 z-40 px-3 pointer-events-none">
          <div className="max-w-lg mx-auto pointer-events-auto">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className={`w-full py-3.5 rounded-xl bg-gradient-to-r ${tc.gradient} text-white text-sm font-bold flex items-center justify-center gap-2 shadow-xl disabled:opacity-60 active:scale-[0.98] transition-transform min-h-[52px]`}
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
              {submitting ? 'Mengirim…' : `Kirim ${items.length} item · ${tc.label} (${entity})`}
            </button>
          </div>
        </div>
      )}

      {showSearch && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center" onClick={() => setShowSearch(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[80vh] flex flex-col sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b">
              <div className="flex justify-between mb-2">
                <h3 className="text-sm font-semibold">
                  Cari Barang ({entity})
                  {stock.items?.length ? ` · Live ${stock.items.length}` : ' · Master lokal'}
                </h3>
                <button type="button" onClick={() => setShowSearch(false)} className="p-2 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
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
                  placeholder="Kode, nama..."
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl border text-sm"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {stock.loading && results.length === 0 && (
                <p className="text-center text-gray-400 text-xs py-6">Memuat stok September…</p>
              )}
              {!stock.loading && results.length === 0 && (
                <p className="text-center text-gray-400 text-xs py-6">Tidak ada item. Cek URL API + Secret di Atur.</p>
              )}
              {results.slice(0, 60).map((item) => (
                <button
                  key={item.kode}
                  type="button"
                  onClick={() => addItem(item)}
                  className="w-full text-left px-3 py-3 rounded-xl active:bg-blue-50 transition-colors min-h-[52px]"
                >
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
