import { useState, useMemo, useRef, useCallback } from 'react';
import { searchMaster, ENTITIES, matchByAlias } from '../data/master';
import { useStock } from '../hooks/useStock';
import { searchLiveStock } from '../data/liveSearch';
import { submitBarangMasuk, submitBarangKeluar, submitBarangRusak, saveToHistory } from '../data/api';
import { validateItems } from '../data/pdfValidate';
import {
  PackagePlus, PackageMinus, Search, Trash2, Send,
  CheckCircle, AlertCircle, Loader2, X, AlertTriangle,
  Upload, Eye
} from 'lucide-react';

function ItemRow({ item, onRemove, onUpdate, showMatch }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm animate-slide-up">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-blue-600 font-mono font-bold">{item.kode}</p>
          <p className="text-[15px] font-semibold text-gray-800 leading-tight mt-0.5">{item.nama}</p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-[12px] text-gray-400">{item.divisi} &middot; {item.satuan}</p>
            {showMatch && item.matchType && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 font-medium">{item.matchType}</span>
            )}
          </div>
          {item.nameFromPdf && (
            <p className="text-[10px] text-gray-400 mt-0.5 truncate" title={item.nameFromPdf}>PDF: {item.nameFromPdf}</p>
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
  const searchRef = useRef(null);
  const fileRef = useRef(null);
  const submitLock = useRef(false);

  const results = useMemo(() => {
    const live = stock.items || [];
    if (live.length > 0) return searchLiveStock(live, search);
    return searchMaster(entity, search);
  }, [entity, search, stock.items]);

  const addItem = (item) => {
    if (items.find((i) => i.kode === item.kode)) { setShowSearch(false); setSearch(''); return; }
    setItems((prev) => [...prev, { ...item, qty: item.qty || 1, keterangan: item.keterangan || '' }]);
    setShowSearch(false); setSearch('');
  };

  const handleUploadClick = () => { setShowUpload(true); setUploadText(''); setValidationResult(null); };

  const handleValidateText = useCallback(() => {
    if (!uploadText.trim()) return;
    const lines = uploadText.split('\n').map(l => l.trim()).filter(Boolean);
    const result = validateItems(lines, entity);
    setValidationResult(result);
  }, [uploadText, entity]);

  const handleApplyValidated = (applyItems) => {
    const merged = [...items];
    for (const ni of applyItems) {
      const existing = merged.find(m => m.kode === ni.kode);
      if (existing) { existing.qty += ni.qty; } else { merged.push({ ...ni, keterangan: '' }); }
    }
    setItems(merged);
    setConfirmedFromUpload(true);
    setShowUpload(false); setUploadText(''); setValidationResult(null);
  };

  const handleSubmit = async () => {
    if (submitLock.current || submitting) return;
    if (items.length === 0) { setResult({ success: false, error: 'Belum ada item.' }); return; }
    const bad = items.filter((i) => !i.kode || !(Number(i.qty) > 0));
    if (bad.length) { setResult({ success: false, error: 'Qty harus > 0 untuk semua item.' }); return; }
    submitLock.current = true; setSubmitting(true); setResult(null);
    const snapshot = items.map((i) => ({ kode: i.kode, nama: i.nama, qty: i.qty, keterangan: i.keterangan }));
    try {
      const payload = items.map((i) => ({ kode: String(i.kode).trim(), qty: Math.round(Number(i.qty) * 1000) / 1000, keterangan: String(i.keterangan || '').trim().slice(0, 200) }));
      const submitFn = type === 'masuk' ? submitBarangMasuk : type === 'keluar' ? submitBarangKeluar : submitBarangRusak;
      const res = await submitFn(entity, payload);
      saveToHistory({ type, entity, items: snapshot, ...res });
      setResult(res);
      if (res.success) { setItems([]); setConfirmedFromUpload(false); try { stock.refresh?.({ force: true }); } catch (_) {} }
      setTimeout(() => setResult(null), 8000);
    } catch (err) { setResult({ success: false, error: err.message || 'Gagal mengirim' }); }
    finally { setSubmitting(false); setTimeout(() => { submitLock.current = false; }, 600); }
  };

  const typeConfig = {
    masuk: { icon: PackagePlus, label: 'Masuk', gradient: 'from-emerald-500 to-emerald-600', color: 'bg-emerald-50 text-emerald-600', activeColor: 'bg-emerald-500 text-white shadow-lg shadow-emerald-200', modeClass: 'mode-active-masuk' },
    keluar: { icon: PackageMinus, label: 'Keluar', gradient: 'from-orange-500 to-red-500', color: 'bg-orange-50 text-orange-600', activeColor: 'bg-orange-500 text-white shadow-lg shadow-orange-200', modeClass: 'mode-active-keluar' },
    rusak: { icon: AlertTriangle, label: 'Rusak', gradient: 'from-red-600 to-rose-700', color: 'bg-red-50 text-red-600', activeColor: 'bg-red-500 text-white shadow-lg shadow-red-200', modeClass: 'mode-active-rusak' },
  };
  const tc = typeConfig[type];

  return (
    <div className="pb-28">
      <div className="grid grid-cols-3 gap-2.5 mb-3">
        {(['masuk', 'keluar', 'rusak']).map((m) => {
          const cfg = typeConfig[m]; const Icon = cfg.icon; const active = type === m;
          return (
            <button key={m} type="button" onClick={() => setType(m)}
              className={`card card-interactive relative p-3 flex flex-col items-center text-center gap-1.5 min-h-[92px] justify-center transition-all duration-300 ${active ? cfg.modeClass : 'mode-dim'}`}>
              {active && <span className={`mode-badge absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ${m === 'masuk' ? 'bg-emerald-500' : m === 'keluar' ? 'bg-orange-500' : 'bg-red-500'}`} />}
              <div className={`mode-icon-wrap w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ${active ? cfg.activeColor : cfg.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className={`text-[11px] font-semibold ${active ? 'text-slate-900' : 'text-slate-600'}`}>{cfg.label}</p>
            </button>
          );
        })}
      </div>

      <div className={`mb-3 rounded-xl px-3 py-2.5 flex items-center gap-2 border-2 ${type === 'masuk' ? 'bg-emerald-50 border-emerald-400' : type === 'keluar' ? 'bg-orange-50 border-orange-400' : 'bg-red-50 border-red-400'}`}>
        <span className={`w-3 h-3 rounded-full mode-badge ${type === 'masuk' ? 'bg-emerald-500' : type === 'keluar' ? 'bg-orange-500' : 'bg-red-500'}`} />
        <p className="text-[13px] font-bold text-slate-800">
          Mode: <span className={type === 'masuk' ? 'text-emerald-700' : type === 'keluar' ? 'text-orange-700' : 'text-red-700'}>{tc.label}</span>
          <span className="text-slate-400 font-normal"> &middot; {entity}</span>
        </p>
      </div>

      <div className="flex gap-2 mb-3">
        {ENTITIES.map((e) => (
          <button key={e} type="button" onClick={() => { setEntity(e); setItems([]); }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold min-h-[44px] ${entity === e ? 'bg-[#0b2a55] text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200'}`}>
            {e}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-3">
        <button type="button" onClick={handleUploadClick}
          className="flex-1 py-3 rounded-xl border-2 border-dashed border-cyan-300 bg-cyan-50/60 text-cyan-700 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] min-h-[48px]">
          <Upload className="w-4 h-4" /> Upload / Validasi
        </button>
        <button type="button" onClick={() => { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 80); }}
          className="flex-1 py-3 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/60 text-blue-800 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] min-h-[48px]">
          <Search className="w-4 h-4" /> Cari Barang
        </button>
      </div>

      {stock.error && (
        <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2 mb-2">Stok live gagal: {stock.error}</p>
      )}

      <div className="space-y-3 mb-4">
        {items.map((item, idx) => (
          <ItemRow key={item.kode + idx} item={item} showMatch={confirmedFromUpload}
            onRemove={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
            onUpdate={(u) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...u } : it)))} />
        ))}
        {items.length === 0 && (
          <p className="text-center text-gray-400 text-xs py-8">Belum ada item &mdash; Cari Barang atau Upload/Validasi</p>
        )}
      </div>

      {result && (
        <div className={`mb-3 text-xs px-3 py-2.5 rounded-lg flex items-center gap-2 ${result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {result.success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{result.success ? (result.offline ? 'Offline &mdash; antri sync' : `${result.written ?? 'OK'} terkirim`) : (result.error || 'Gagal')}</span>
        </div>
      )}

      {items.length > 0 && (
        <div className="fixed bottom-[4.25rem] left-0 right-0 z-40 px-3 pointer-events-none">
          <div className="max-w-lg mx-auto pointer-events-auto">
            <button type="button" onClick={handleSubmit} disabled={submitting}
              className={`w-full py-3.5 rounded-xl bg-gradient-to-r ${tc.gradient} text-white text-sm font-bold flex items-center justify-center gap-2 shadow-xl disabled:opacity-60 active:scale-[0.98] min-h-[52px]`}>
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
              {submitting ? 'Mengirim...' : `Kirim ${items.length} item &middot; ${tc.label} (${entity})`}
            </button>
          </div>
        </div>
      )}

      {showSearch && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center" onClick={() => setShowSearch(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b">
              <div className="flex justify-between mb-2">
                <h3 className="text-sm font-semibold">Cari Barang ({entity}) {stock.items?.length ? `&middot; Live ${stock.items.length}` : ''}</h3>
                <button type="button" onClick={() => setShowSearch(false)} className="p-2 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input ref={searchRef} type="text" autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Kode, nama, atau alias..." className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl border text-sm" />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {results.slice(0, 60).map((item) => (
                <button key={item.kode} type="button" onClick={() => addItem(item)}
                  className="w-full text-left px-3 py-3 rounded-xl active:bg-blue-50 min-h-[56px]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-blue-600 font-bold">{item.kode}</p>
                      <p className="text-sm text-gray-800 truncate">{item.nama}</p>
                      <p className="text-[10px] text-gray-400">{item.divisi} &middot; {item.satuan}</p>
                    </div>
                    {item.stok != null && (
                      <span className={`text-sm font-bold tabular-nums shrink-0 ${item.stok <= 5 ? 'text-red-600' : item.stok <= 20 ? 'text-amber-600' : 'text-emerald-600'}`}>{item.stok}</span>
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
                <h3 className="text-sm font-semibold text-gray-800">Validasi Data &mdash; Alias Mapping ({entity})</h3>
                <button type="button" onClick={() => setShowUpload(false)} className="p-2 -mr-2"><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-[11px] text-gray-400 mb-3">Salin teks dari foto/PDF surat jalan. Satu baris per item.<br/>Format: <b>nama barang [spasi] qty</b></p>
              <textarea
                value={uploadText}
                onChange={(e) => { setUploadText(e.target.value); setValidationResult(null); }}
                placeholder={"Ayam Fillet Dada 50\nNugget Katsu 30\nMie Goreng 100\nIce Cream INDOLAKTO 5\nBakso Ikan CIDEA 20\nSaos Lada Hitam PROMO 15"}
                rows={8}
                className="w-full px-4 py-3 bg-gray-50 rounded-xl border text-sm font-mono resize-none focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 leading-relaxed"
              />
              <button type="button" onClick={handleValidateText} disabled={!uploadText.trim()}
                className="w-full mt-3 py-3 rounded-xl bg-[#0b2a55] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] min-h-[48px]">
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
                            <p className="text-[11px] text-gray-400">PDF: &ldquo;{m.nameFromPdf}&rdquo; &middot; {m.matchType}</p>
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
                      <AlertTriangle className="w-3.5 h-3.5" /> Ambigu: {validationResult.ambiguous.length} item &mdash; perlu konfirmasi
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
                              <button key={ci} type="button"
                                onClick={() => {
                                  const fixed = { ...a, kode: c.kode, nama: c.nama, satuan: c.satuan, divisi: c.divisi, matchType: 'manual', warning: undefined, candidates: undefined };
                                  setValidationResult(prev => ({
                                    ...prev,
                                    matched: [...prev.matched, fixed],
                                    ambiguous: prev.ambiguous.filter((_, idx) => idx !== i),
                                  }));
                                }}
                                className="w-full text-left px-2 py-1.5 bg-white rounded-lg border border-amber-200 text-xs active:bg-amber-100">
                                <span className="font-mono text-amber-700">{c.kode}</span> &mdash; {c.nama}
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
                  <button type="button"
                    onClick={() => handleApplyValidated(validationResult.matched)}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] min-h-[52px]">
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
