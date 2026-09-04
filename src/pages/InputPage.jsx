import { useState, useRef, useCallback } from 'react';
import {
  PackagePlus, Search, FileText, Trash2, Send, Loader2,
  CheckCircle2, XCircle, AlertTriangle, Plus, Minus,
} from 'lucide-react';
import {
  extractTextFromPdf, parseLinesFromText, validateItems,
  summarizeValidation, detectEntityFromText,
} from '../data/pdfValidate';
import { submitBarangMasuk, submitBarangKeluar, saveToHistory, fetchStock } from '../data/api';
import { searchMaster } from '../data/master';

export default function InputPage() {
  const [entity, setEntity] = useState('CV');
  const [txType, setTxType] = useState('keluar');
  const [mode, setMode] = useState('manual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState(null);
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [pdfResults, setPdfResults] = useState([]);
  const [pdfInfo, setPdfInfo] = useState(null);
  const fileRef = useRef(null);

  const onSearch = (q) => {
    setQuery(q);
    setHits(q.length >= 1 ? searchMaster(entity, q).slice(0, 25) : []);
  };

  const addToCart = (item, qty = 1) => {
    setCart((prev) => {
      const i = prev.findIndex((c) => c.kode === item.kode);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: +(next[i].qty + (qty || 1)).toFixed(2) };
        return next;
      }
      return [...prev, { kode: item.kode, nama: item.nama, satuan: item.satuan, qty: qty || 1, keterangan: '' }];
    });
    setQuery('');
    setHits([]);
  };

  const mergeMatchedIntoCart = useCallback((matchedItems) => {
    setCart((prev) => {
      let next = [...prev];
      for (const it of matchedItems) {
        const kode = it.kode;
        const qty = it.qty || 1;
        const nama = it.namaMaster || it.nama || it.item?.nama;
        const satuan = it.satuan || it.item?.satuan;
        const idx = next.findIndex((c) => c.kode === kode);
        if (idx >= 0) next[idx] = { ...next[idx], qty: +(next[idx].qty + qty).toFixed(2) };
        else next.push({ kode, nama, satuan, qty, keterangan: '' });
      }
      return next;
    });
  }, []);

  const updateQty = (idx, delta) => {
    setCart((prev) => {
      const next = prev.map((c, i) => {
        if (i !== idx) return c;
        return { ...c, qty: +(c.qty + delta).toFixed(2) };
      });
      // Qty 0 atau kurang → hapus item dari keranjang
      return next.filter((c) => c.qty > 0);
    });
  };
  const setQtyValue = (idx, val) => {
    const n = parseFloat(String(val).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return;
    setCart((prev) => {
      if (n === 0) return prev.filter((_, i) => i !== idx);
      return prev.map((c, i) => i === idx ? { ...c, qty: +n.toFixed(2) } : c);
    });
  };
  const updateKet = (idx, val) => {
    setCart((prev) => prev.map((c, i) => i === idx ? { ...c, keterangan: val } : c));
  };
  const removeFromCart = (idx) => setCart((prev) => prev.filter((_, i) => i !== idx));

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    setPdfResults([]);
    setPdfInfo(null);
    setSubmitMsg(null);
    try {
      const result = await extractTextFromPdf(file, (msg) => setError(msg));
      const text = typeof result === 'string' ? result : (result?.text || '');
      const lines = result?.lines || [];
      const method = result?.method || 'text';
      const detected = detectEntityFromText(text);
      const useEntity = detected || entity;
      if (detected && detected !== entity) setEntity(detected);

      if (text.trim().length < 3 && !lines.length) {
        setError('PDF kosong / OCR gagal membaca teks.');
        return;
      }

      const rows = parseLinesFromText(text, lines);
      if (!rows.length) {
        setError('Tidak ada baris barang terdeteksi. Pastikan PDF adalah REKAP ORDER dengan kolom KETERANGAN + TOTAL.');
        setPdfInfo({ method, rowCount: 0, autoAdded: 0 });
        return;
      }

      const validation = validateItems(rows, useEntity);
      const flat = [
        ...(validation.matched || []).map((r) => ({ ...r, status: 'matched', nama: r.nameFromPdf, namaMaster: r.nama, item: r.item || r })),
        ...(validation.ambiguous || []).map((r) => ({ ...r, status: 'ambiguous', nama: r.nameFromPdf })),
        ...(validation.unmatched || []).map((r) => ({ ...r, status: 'unmatched', nama: r.nameFromPdf })),
      ];

      const matchedCount = validation.matched?.length || 0;
      const ambCount = validation.ambiguous?.length || 0;
      const unCount = validation.unmatched?.length || 0;

      const SUBSTITUTE = {
        'CV-0008': 'CV-0084',
        'CV-0084': 'CV-0008',
      };
      let matchedRows = validation.matched || [];
      if (matchedRows.length && txType === 'keluar') {
        try {
          const stockList = await fetchStock(useEntity);
          const byKode = Object.fromEntries((stockList || []).map((s) => [s.kode, Number(s.stok) || 0]));
          matchedRows = matchedRows.map((r) => {
            const st = byKode[r.kode];
            if (st != null && st <= 0 && SUBSTITUTE[r.kode]) {
              const alt = SUBSTITUTE[r.kode];
              const altSt = byKode[alt];
              if (altSt != null && altSt > 0) {
                const altItem = (stockList || []).find((s) => s.kode === alt);
                return {
                  ...r,
                  kode: alt,
                  nama: altItem?.nama || r.nama,
                  namaMaster: altItem?.nama || r.nama,
                  satuan: altItem?.satuan || r.satuan,
                  matchType: (r.matchType || 'alias') + '+stok-fallback',
                  note: `Stok ${r.kode} habis → pakai ${alt}`,
                };
              }
            }
            return r;
          });
        } catch (_) {}
      }

      if (matchedRows.length > 0 && ambCount === 0) {
        mergeMatchedIntoCart(matchedRows.map((r) => ({
          ...r, namaMaster: r.namaMaster || r.nama, kode: r.kode, satuan: r.satuan, qty: r.qty,
        })));
      }

      const needReview = [
        ...(validation.ambiguous || []).map((r) => ({ ...r, status: 'ambiguous', nama: r.nameFromPdf })),
        ...(validation.unmatched || []).map((r) => ({ ...r, status: 'unmatched', nama: r.nameFromPdf })),
      ];
      const reviewList = ambCount > 0 ? flat : needReview;

      setPdfResults(reviewList);
      setPdfInfo({
        method,
        rowCount: rows.length,
        autoAdded: (matchedRows.length > 0 && ambCount === 0) ? matchedRows.length : 0,
        unmatched: unCount,
        ambiguous: ambCount,
      });

      if (matchedRows.length > 0 && ambCount === 0 && unCount === 0) {
        setError(`${matchedRows.length} item cocok — langsung masuk keranjang.`);
      } else if (matchedRows.length > 0 && ambCount === 0 && unCount > 0) {
        setError(`${matchedRows.length} item masuk keranjang. ${unCount} perlu direvisi manual / diabaikan.`);
      } else if (ambCount > 0) {
        setError(`${matchedCount} cocok, ${ambCount} ambigu, ${unCount} tidak cocok — pilih atau abaikan.`);
      } else {
        setError('Tidak ada item yang cocok. Cari manual di bawah atau abaikan.');
      }
    } catch (err) {
      setError(err.message || 'Gagal membaca file');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const pickCandidate = (idx, item) => {
    setPdfResults((prev) => prev.map((r, i) => i === idx ? {
      ...r, status: 'matched', matchType: 'manual', item,
      kode: item.kode, namaMaster: item.nama, satuan: item.satuan, candidates: undefined,
      searchQ: undefined, searchHits: undefined,
    } : r));
  };

  const skipReviewItem = (idx) => {
    setPdfResults((prev) => prev.filter((_, i) => i !== idx));
  };

  const onReviewSearch = (idx, q) => {
    const h = q.length >= 1 ? searchMaster(entity, q).slice(0, 15) : [];
    setPdfResults((prev) => prev.map((r, i) => i === idx ? { ...r, searchQ: q, searchHits: h } : r));
  };

  const addReviewedToCart = () => {
    const summary = summarizeValidation(pdfResults);
    if (!summary.matchedItems.length) return;
    mergeMatchedIntoCart(summary.matchedItems);
    setPdfResults([]);
    setPdfInfo((info) => ({ ...(info || {}), autoAdded: summary.matched }));
    setError(`${summary.matched} item ditambahkan ke keranjang.`);
  };

  const submitCart = async () => {
    if (!cart.length) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const payload = cart.map((c) => ({ kode: c.kode, qty: c.qty, keterangan: (c.keterangan || '').slice(0, 200) }));
      const submitFn = txType === 'masuk' ? submitBarangMasuk : submitBarangKeluar;
      const res = await submitFn(entity, payload, { tanggal });
      saveToHistory({
        type: txType, entity, tanggal,
        items: cart.map((c) => ({ kode: c.kode, nama: c.nama, qty: c.qty, keterangan: c.keterangan })),
        ...res,
      });
      setSubmitMsg(res);
      if (res.success) { setCart([]); setPdfResults([]); setPdfInfo(null); }
    } catch (err) {
      setSubmitMsg({ success: false, error: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const pdfSummary = summarizeValidation(pdfResults);

  return (
    <div className={`animate-fade-in space-y-4 ${cart.length > 0 ? 'pb-40' : 'pb-28'}`}>
      <div>
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <PackagePlus className="w-5 h-5 text-emerald-600" />
          Input Barang
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Manual atau upload PDF — validasi otomatis ke master + alias.
        </p>
      </div>

      <div className="flex gap-2">
        {['CV', 'PT'].map((e) => (
          <button key={e} type="button" onClick={() => { setEntity(e); setHits([]); setQuery(''); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${
              entity === e ? 'bg-[#0b2a55] text-white shadow' : 'bg-white border border-gray-200 text-gray-600'
            }`}>{e}</button>
        ))}
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setTxType('masuk')}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold ${
            txType === 'masuk' ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600'
          }`}>Barang Masuk</button>
        <button type="button" onClick={() => setTxType('keluar')}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold ${
            txType === 'keluar' ? 'bg-orange-600 text-white' : 'bg-white border border-gray-200 text-gray-600'
          }`}>Barang Keluar</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 px-3 py-2.5 flex items-center gap-3">
        <label className="text-xs text-gray-500 shrink-0">Tanggal transaksi</label>
        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          className="flex-1 text-sm font-medium text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-400"
        />
      </div>

      <div className="flex gap-2">
        {[ { id: 'manual', label: 'Manual', icon: Search }, { id: 'pdf', label: 'Upload PDF', icon: FileText } ].map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setMode(id)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
              mode === id ? 'bg-cyan-600 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {mode === 'manual' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-2">
          <input value={query} onChange={(e) => onSearch(e.target.value)}
            placeholder={`Cari barang ${entity}...`}
            className="w-full px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-cyan-400" />
          {hits.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {hits.map((h) => (
                <button key={h.kode} type="button" onClick={() => addToCart(h)}
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

      {mode === 'pdf' && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-4">
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={onFile} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
              className="w-full py-8 flex flex-col items-center gap-2 text-gray-500 rounded-xl">
              {busy ? <Loader2 className="w-8 h-8 animate-spin text-cyan-600" /> : <FileText className="w-8 h-8 text-cyan-600" />}
              <span className="text-sm font-semibold text-gray-700">
                {busy ? (error || 'Membaca & validasi PDF...') : 'Pilih PDF / foto REKAP ORDER'}
              </span>
              <span className="text-[11px] text-gray-400">Validasi otomatis · item cocok langsung ke keranjang</span>
            </button>
          </div>

          {error && (
            <div className={`text-xs px-3 py-2 rounded-lg border ${
              /masuk keranjang|langsung masuk/i.test(error)
                ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                : /ambigu|tidak cocok|tidak ada|revisi|pilih/i.test(error)
                  ? 'bg-amber-50 text-amber-800 border-amber-100'
                  : 'bg-slate-50 text-slate-700 border-slate-100'
            }`}>{error}</div>
          )}

          {pdfInfo && pdfInfo.autoAdded > 0 && pdfResults.length === 0 && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5 flex items-center gap-2 text-sm text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span><strong>{pdfInfo.autoAdded}</strong> item dari PDF masuk keranjang</span>
            </div>
          )}

          {pdfResults.length > 0 && (
            <div className="space-y-3">
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
                Review item yang perlu diperbaiki. Cocok otomatis sudah di keranjang.
              </div>
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

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {pdfResults.map((r, idx) => (
                  <div key={idx} className={`bg-white rounded-xl border p-3 ${
                    r.status === 'matched' ? 'border-emerald-100' : r.status === 'ambiguous' ? 'border-amber-200' : 'border-red-100'
                  }`}>
                    <div className="flex items-start gap-2">
                      {r.status === 'matched' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                        : r.status === 'ambiguous' ? <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        : <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{r.nama}</p>
                        <p className="text-[11px] text-gray-400">Qty {r.qty}</p>
                        {r.status === 'matched' && (
                          <p className="text-[11px] text-emerald-700 mt-0.5">→ {r.kode} · {r.namaMaster} ({r.satuan}) · {r.matchType}</p>
                        )}
                        {r.status === 'ambiguous' && (
                          <div className="mt-1.5 space-y-1">
                            <p className="text-[10px] text-amber-700">Pilih yang benar:</p>
                            {(r.candidates || []).map((c) => (
                              <button key={c.kode} type="button" onClick={() => pickCandidate(idx, c)}
                                className="block w-full text-left text-xs px-2 py-1.5 rounded-lg bg-amber-50 text-gray-700">
                                {c.kode} — {c.nama}
                              </button>
                            ))}
                            <button type="button" onClick={() => skipReviewItem(idx)}
                              className="text-[10px] text-gray-400 underline mt-1">Abaikan item ini</button>
                          </div>
                        )}
                        {r.status === 'unmatched' && (
                          <div className="mt-1.5 space-y-1.5">
                            <p className="text-[10px] text-red-600">Tidak cocok — cari di master atau abaikan:</p>
                            <input
                              value={r.searchQ || ''}
                              onChange={(e) => onReviewSearch(idx, e.target.value)}
                              placeholder="Cari nama / kode master..."
                              className="w-full px-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-cyan-400"
                            />
                            {(r.searchHits || []).map((c) => (
                              <button key={c.kode} type="button" onClick={() => pickCandidate(idx, c)}
                                className="block w-full text-left text-xs px-2 py-1.5 rounded-lg bg-red-50 text-gray-700">
                                {c.kode} — {c.nama}
                              </button>
                            ))}
                            <button type="button" onClick={() => skipReviewItem(idx)}
                              className="text-[10px] text-gray-400 underline mt-1">Abaikan item ini</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {pdfSummary.matched > 0 && (
                <button type="button" onClick={addReviewedToCart}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold">
                  Masukkan {pdfSummary.matched} item yang sudah dipilih ke keranjang
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {cart.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">Keranjang ({cart.length})</h3>
            <button type="button" onClick={() => setCart([])} className="text-xs text-red-500">Kosongkan</button>
          </div>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pb-2">
            {cart.map((c, idx) => (
              <div key={c.kode + idx} className="flex items-start gap-2 p-2 rounded-xl bg-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-emerald-700">{c.kode}</p>
                  <p className="text-xs text-gray-700 truncate">{c.nama}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <button type="button" onClick={() => updateQty(idx, -1)} className="w-6 h-6 rounded-lg bg-white border text-gray-600 flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                    <input value={c.qty} onChange={(e) => setQtyValue(idx, e.target.value)}
                      className="w-14 text-center text-xs font-medium border rounded-lg py-1" />
                    <button type="button" onClick={() => updateQty(idx, 1)} className="w-6 h-6 rounded-lg bg-white border text-gray-600 flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                    <span className="text-[10px] text-gray-400">{c.satuan}</span>
                  </div>
                  <input value={c.keterangan} onChange={(e) => updateKet(idx, e.target.value)}
                    placeholder="Keterangan (opsional)"
                    className="mt-1 w-full text-[11px] px-2 py-1 rounded-lg border border-gray-200" />
                </div>
                <button type="button" onClick={() => removeFromCart(idx)} className="text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tombol Kirim fixed di atas navigasi bawah */}
      {cart.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-30 px-3.5 max-w-lg mx-auto pointer-events-none">
          <div className="pointer-events-auto space-y-2">
            {submitMsg && (
              <div className={`text-xs px-3 py-2 rounded-lg shadow ${
                submitMsg.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
              }`}>
                {submitMsg.success ? 'Berhasil disimpan ke server.' : (submitMsg.error || 'Gagal menyimpan')}
              </div>
            )}
            <button type="button" onClick={submitCart} disabled={submitting}
              className="w-full py-3 rounded-xl bg-[#0b2a55] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {submitting ? 'Mengirim...' : `Kirim ${txType === 'masuk' ? 'Barang Masuk' : 'Barang Keluar'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
