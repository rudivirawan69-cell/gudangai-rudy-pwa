import { useState, useRef, useCallback } from 'react';
import {
  PackagePlus, Search, FileText, Trash2, Send, Loader2,
  CheckCircle2, XCircle, AlertTriangle, Plus, Minus, X,
} from 'lucide-react';
import {
  extractTextFromPdf, parseLinesFromText, validateItems,
  summarizeValidation,
} from '../data/pdfValidate';
import { submitBarangMasuk, submitBarangKeluar, saveToHistory } from '../data/api';
import { searchMaster, getMasterByEntity } from '../data/master';

export default function InputPage() {
  /* ── state ─────────────────────────────────────────────── */
  const [entity, setEntity] = useState('CV');
  const [txType, setTxType] = useState('masuk');
  const [mode, setMode] = useState('manual');    // manual | pdf
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cart, setCart] = useState([]);           // [{kode,nama,satuan,qty,keterangan}]
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState(null);

  // manual search
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);

  // pdf
  const [rawText, setRawText] = useState('');
  const [pdfResults, setPdfResults] = useState([]);
  const fileRef = useRef(null);

  /* ── search ────────────────────────────────────────────── */
  const onSearch = (q) => {
    setQuery(q);
    if (q.length >= 1) {
      setHits(searchMaster(entity, q).slice(0, 8));
    } else {
      setHits([]);
    }
  };

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.findIndex((c) => c.kode === item.kode);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], qty: next[existing].qty + 1 };
        return next;
      }
      return [...prev, { kode: item.kode, nama: item.nama, satuan: item.satuan, qty: 1, keterangan: '' }];
    });
    setQuery('');
    setHits([]);
  };

  const updateQty = (idx, delta) => {
    setCart((prev) => prev.map((c, i) =>
      i === idx ? { ...c, qty: Math.max(0.5, +(c.qty + delta).toFixed(2)) } : c,
    ));
  };

  const updateKet = (idx, val) => {
    setCart((prev) => prev.map((c, i) =>
      i === idx ? { ...c, keterangan: val } : c,
    ));
  };

  const removeFromCart = (idx) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  };

  /* ── PDF upload ────────────────────────────────────────── */
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    setPdfResults([]);
    setSubmitMsg(null);
    try {
      const result = await extractTextFromPdf(file, (msg) => setError(msg));
      const text = typeof result === 'string' ? result : (result?.text || '');
      const method = typeof result === 'object' && result?.method ? result.method : 'text';
      setRawText(text);
      if (text.trim().length >= 3) {
        runValidation(text);
        setError(method === 'ocr' || method === 'mixed' ? `PDF dibaca via OCR (${method})` : '');
      } else {
        setError('PDF kosong / OCR gagal membaca teks.');
      }
    } catch (err) {
      setError(err.message || 'Gagal membaca file');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const runValidation = useCallback((text) => {
    const rows = parseLinesFromText(text);
    if (!rows.length) {
      setError('Tidak ada baris barang terdeteksi.');
      setPdfResults([]);
      return;
    }
    const result = validateItems(rows, entity);
    const flat = [
      ...(result.matched || []).map((r) => ({
        ...r, status: 'matched', nama: r.nameFromPdf, namaMaster: r.nama, item: r,
      })),
      ...(result.ambiguous || []).map((r) => ({
        ...r, status: 'ambiguous', nama: r.nameFromPdf,
      })),
      ...(result.unmatched || []).map((r) => ({
        ...r, status: 'unmatched', nama: r.nameFromPdf,
      })),
    ];
    setPdfResults(flat);
    setError('');
  }, [entity]);

  const addAllMatchedToCart = () => {
    const summary = summarizeValidation(pdfResults);
    for (const it of summary.matchedItems) {
      const existing = cart.findIndex((c) => c.kode === it.kode);
      if (existing >= 0) {
        setCart((prev) => {
          const next = [...prev];
          next[existing] = { ...next[existing], qty: next[existing].qty + (it.qty || 1) };
          return next;
        });
      } else {
        setCart((prev) => [...prev, {
          kode: it.kode,
          nama: it.namaMaster || it.nama,
          satuan: it.satuan,
          qty: it.qty || 1,
          keterangan: '',
        }]);
      }
    }
    setPdfResults([]);
    setRawText('');
  };

  const pickCandidate = (idx, item) => {
    setPdfResults((prev) => prev.map((r, i) => i === idx ? {
      ...r, status: 'matched', matchType: 'manual', item,
      kode: item.kode, namaMaster: item.nama, satuan: item.satuan, candidates: undefined,
    } : r));
  };

  /* ── submit ────────────────────────────────────────────── */
  const submitCart = async () => {
    if (!cart.length) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const payload = cart.map((c) => ({
        kode: c.kode,
        qty: c.qty,
        keterangan: (c.keterangan || '').slice(0, 200),
      }));
      const submitFn = txType === 'masuk' ? submitBarangMasuk : submitBarangKeluar;
      const res = await submitFn(entity, payload);
      saveToHistory({
        type: txType, entity,
        items: cart.map((c) => ({ kode: c.kode, nama: c.nama, qty: c.qty, keterangan: c.keterangan })),
        ...res,
      });
      setSubmitMsg(res);
      if (res.success) {
        setCart([]);
        setRawText('');
        setPdfResults([]);
      }
    } catch (err) {
      setSubmitMsg({ success: false, error: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const pdfSummary = summarizeValidation(pdfResults);

  /* ── render ────────────────────────────────────────────── */
  return (
    <div className="pb-28 animate-fade-in space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <PackagePlus className="w-5 h-5 text-emerald-600" />
          Input Barang
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Manual atau upload PDF — validasi otomatis ke master + alias.
        </p>
      </div>

      {/* Entity selector */}
      <div className="flex gap-2">
        {['CV', 'PT'].map((e) => (
          <button key={e} onClick={() => { setEntity(e); setHits([]); setQuery(''); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${
              entity === e ? 'bg-[#0b2a55] text-white shadow' : 'bg-white border border-gray-200 text-gray-600'
            }`}>{e}</button>
        ))}
      </div>

      {/* Transaction type */}
      <div className="flex gap-2">
        {[
          { id: 'masuk', label: 'Barang Masuk', color: 'emerald' },
          { id: 'keluar', label: 'Barang Keluar', color: 'orange' },
        ].map(({ id, label, color }) => (
          <button key={id} onClick={() => setTxType(id)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold ${
              txType === id
                ? `bg-${color}-600 text-white`
                : 'bg-white border border-gray-200 text-gray-600'
            }`}>{label}</button>
        ))}
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2">
        {[
          { id: 'manual', label: 'Manual', icon: Search },
          { id: 'pdf', label: 'Upload PDF', icon: FileText },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setMode(id)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
              mode === id ? 'bg-cyan-600 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ─── MANUAL MODE ─── */}
      {mode === 'manual' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-2">
          <input
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={`Cari barang ${entity}...`}
            className="w-full px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-cyan-400"
          />
          {hits.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {hits.map((h) => (
                <button key={h.kode} onClick={() => addToCart(h)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg bg-gray-50 hover:bg-emerald-50 text-gray-700 flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="font-medium text-emerald-700">{h.kode}</span>
                  <span className="truncate">{h.nama}</span>
                  <span className="ml-auto text-gray-400 shrink-0">{h.satuan}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── PDF MODE ─── */}
      {mode === 'pdf' && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-4">
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onFile} />
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="w-full py-8 flex flex-col items-center gap-2 text-gray-500 rounded-xl">
              {busy
                ? <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
                : <FileText className="w-8 h-8 text-cyan-600" />}
              <span className="text-sm font-semibold text-gray-700">
                {busy ? (error || 'Membaca PDF...') : 'Pilih PDF (teks / scan OCR)'}
              </span>
            </button>
          </div>

          {rawText && (
            <div className="bg-white rounded-2xl border border-gray-100 p-3">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Teks terdeteksi</label>
              <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} rows={4}
                className="mt-1.5 w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-cyan-400" />
              <button onClick={() => runValidation(rawText)} disabled={!rawText.trim() || busy}
                className="mt-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-[#0b2a55] to-[#164e8a] text-white text-sm font-semibold disabled:opacity-50">
                Validasi ke Master {entity}
              </button>
            </div>
          )}

          {error && <div className="text-xs px-3 py-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-100">{error}</div>}

          {/* PDF validation results */}
          {pdfResults.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
                  <p className="text-lg font-bold text-emerald-600">{pdfSummary.matched}</p>
                  <p className="text-[10px] text-emerald-600">Cocok</p>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
                  <p className="text-lg font-bold text-amber-600">{pdfSummary.ambiguous}</p>
                  <p className="text-[10px] text-amber-600">Ambigu</p>
                </div>
                <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-center">
                  <p className="text-lg font-bold text-red-600">{pdfSummary.unmatched}</p>
                  <p className="text-[10px] text-red-600">Tidak cocok</p>
                </div>
              </div>

              <div className="space-y-2">
                {pdfResults.map((r, idx) => (
                  <div key={idx} className={`bg-white rounded-xl border p-3 ${
                    r.status === 'matched' ? 'border-emerald-100' :
                    r.status === 'ambiguous' ? 'border-amber-200' : 'border-red-100'
                  }`}>
                    <div className="flex items-start gap-2">
                      {r.status === 'matched' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                        : r.status === 'ambiguous' ? <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        : <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{r.nama}</p>
                        <p className="text-[11px] text-gray-400">Qty {r.qty} · {r.raw || ''}</p>
                        {r.status === 'matched' && (
                          <p className="text-[11px] text-emerald-700 mt-0.5">
                            → {r.kode} · {r.namaMaster} ({r.satuan}) · {r.matchType}
                          </p>
                        )}
                        {r.status === 'ambiguous' && (
                          <div className="mt-1.5 space-y-1">
                            <p className="text-[10px] text-amber-700">Pilih yang benar:</p>
                            {(r.candidates || []).map((c) => (
                              <button key={c.kode} onClick={() => pickCandidate(idx, c)}
                                className="block w-full text-left text-xs px-2 py-1.5 rounded-lg bg-amber-50 text-gray-700">
                                {c.kode} — {c.nama}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {pdfSummary.matched > 0 && pdfSummary.ambiguous === 0 && (
                <button onClick={addAllMatchedToCart}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg">
                  <Plus className="w-4 h-4" />
                  Tambah {pdfSummary.matched} item ke keranjang
                </button>
              )}
              {pdfSummary.matched > 0 && pdfSummary.ambiguous > 0 && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  Selesaikan item Ambigu terlebih dahulu sebelum tambah ke keranjang.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── CART ─── */}
      {cart.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
            <PackagePlus className="w-4 h-4 text-emerald-600" />
            Keranjang ({cart.length} item)
          </h3>
          {cart.map((c, idx) => (
            <div key={c.kode + '-' + idx} className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{c.nama}</p>
                  <p className="text-[11px] text-gray-400">{c.kode} · {c.satuan}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => updateQty(idx, -1)} className="p-1 rounded-lg bg-gray-100 text-gray-600">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold text-gray-800">{c.qty}</span>
                  <button onClick={() => updateQty(idx, 1)} className="p-1 rounded-lg bg-gray-100 text-gray-600">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button onClick={() => removeFromCart(idx)} className="p-1 text-gray-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <input
                value={c.keterangan}
                onChange={(e) => updateKet(idx, e.target.value)}
                placeholder="Keterangan (opsional)"
                className="mt-2 w-full px-2.5 py-1.5 bg-gray-50 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>
          ))}
        </div>
      )}

      {/* Submit message */}
      {submitMsg && (
        <div className={`text-xs px-3 py-2 rounded-lg ${
          submitMsg.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {submitMsg.success
            ? (submitMsg.offline ? 'Disimpan offline — akan sync saat online' : `${submitMsg.written || cart.length} item terkirim ke server`)
            : (submitMsg.error || 'Gagal mengirim')}
        </div>
      )}

      {/* ─── SEND BUTTON (fixed above navbar) ─── */}
      {cart.length > 0 && (
        <div className="fixed bottom-[70px] left-0 right-0 z-30 px-3.5 pb-2 safe-bottom">
          <div className="max-w-lg mx-auto">
            <button onClick={submitCart} disabled={submitting}
              className={`w-full py-3.5 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 shadow-xl disabled:opacity-60 ${
                txType === 'masuk'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                  : 'bg-gradient-to-r from-orange-500 to-red-500'
              }`}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Kirim {cart.length} item — Barang {txType === 'masuk' ? 'Masuk' : 'Keluar'} ({entity})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
