import { useState, useRef, useCallback } from 'react';
import {
  Search, FileText, Trash2, Send, Loader2,
  CheckCircle2, XCircle, AlertTriangle, Plus, Minus,
  PackagePlus, PackageMinus, AlertOctagon, Mic, Upload,
} from 'lucide-react';
import {
  extractTextFromPdf, parseLinesFromText, validateItems,
  summarizeValidation, detectEntityFromText,
} from '../data/pdfValidate';
import {
  submitBarangMasuk, submitBarangKeluar, submitBarangRusak,
  saveToHistory, fetchStock,
} from '../data/api';
import { searchMaster } from '../data/master';

const TX_TYPES = [
  { id: 'masuk', label: 'Masuk', icon: PackagePlus, active: 'bg-emerald-50 border-emerald-200 ring-2 ring-emerald-400/40', iconBg: 'bg-emerald-500 text-white', iconIdle: 'bg-emerald-50 text-emerald-600' },
  { id: 'keluar', label: 'Keluar', icon: PackageMinus, active: 'bg-orange-50 border-orange-200 ring-2 ring-orange-400/40', iconBg: 'bg-orange-500 text-white', iconIdle: 'bg-orange-50 text-orange-600' },
  { id: 'rusak', label: 'Rusak', icon: AlertOctagon, active: 'bg-rose-50 border-rose-200 ring-2 ring-rose-400/40', iconBg: 'bg-rose-500 text-white', iconIdle: 'bg-rose-50 text-rose-600' },
];

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
    setHits(q.length >= 1 ? searchMaster(entity, q).slice(0, 8) : []);
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
    setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, qty: Math.max(0.01, +(c.qty + delta).toFixed(2)) } : c)));
  };
  const setQtyValue = (idx, val) => {
    const n = parseFloat(String(val).replace(',', '.'));
    setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, qty: Number.isFinite(n) && n > 0 ? +n.toFixed(2) : c.qty } : c)));
  };
  const updateKet = (idx, val) => {
    setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, keterangan: val } : c)));
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
    setMode('pdf');
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

      const SUBSTITUTE = { 'CV-0008': 'CV-0084', 'CV-0084': 'CV-0008' };
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
        mergeMatchedIntoCart(
          matchedRows.map((r) => ({
            ...r,
            namaMaster: r.namaMaster || r.nama,
            kode: r.kode,
            satuan: r.satuan,
            qty: r.qty,
          }))
        );
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
        autoAdded: matchedRows.length > 0 && ambCount === 0 ? matchedRows.length : 0,
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
    setPdfResults((prev) =>
      prev.map((r, i) =>
        i === idx
          ? {
              ...r,
              status: 'matched',
              matchType: 'manual',
              item,
              kode: item.kode,
              namaMaster: item.nama,
              satuan: item.satuan,
              candidates: undefined,
              searchQ: undefined,
              searchHits: undefined,
            }
          : r
      )
    );
  };

  const skipReviewItem = (idx) => {
    setPdfResults((prev) => prev.filter((_, i) => i !== idx));
  };

  const onReviewSearch = (idx, q) => {
    const h = q.length >= 1 ? searchMaster(entity, q).slice(0, 6) : [];
    setPdfResults((prev) => prev.map((r, i) => (i === idx ? { ...r, searchQ: q, searchHits: h } : r)));
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
      const payload = cart.map((c) => ({
        kode: c.kode,
        qty: c.qty,
        keterangan: (c.keterangan || '').slice(0, 200),
      }));
      const submitFn =
        txType === 'masuk' ? submitBarangMasuk : txType === 'rusak' ? submitBarangRusak : submitBarangKeluar;
      const res = await submitFn(entity, payload, { tanggal });
      saveToHistory({
        type: txType,
        entity,
        tanggal,
        items: cart.map((c) => ({ kode: c.kode, nama: c.nama, qty: c.qty, keterangan: c.keterangan })),
        ...res,
      });
      setSubmitMsg(res);
      if (res.success) {
        setCart([]);
        setPdfResults([]);
        setPdfInfo(null);
      }
    } catch (err) {
      setSubmitMsg({ success: false, error: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const pdfSummary = summarizeValidation(pdfResults);
  const typeLabel = txType === 'masuk' ? 'Masuk' : txType === 'rusak' ? 'Rusak' : 'Keluar';
  const submitGradient =
    txType === 'masuk'
      ? 'from-emerald-500 to-teal-600'
      : txType === 'rusak'
        ? 'from-rose-500 to-red-600'
        : 'from-teal-500 to-emerald-600';

  return (
    <div className="pb-28 animate-fade-in space-y-3">
      <div className="grid grid-cols-3 gap-2.5">
        {TX_TYPES.map(({ id, label, icon: Icon, active, iconBg, iconIdle }) => {
          const on = txType === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTxType(id)}
              className={`relative rounded-2xl border bg-white px-2 py-3.5 flex flex-col items-center gap-2 transition active:scale-[0.98] ${
                on ? active : 'border-slate-100 shadow-sm'
              }`}
            >
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${on ? iconBg : iconIdle}`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={`text-[12px] font-semibold ${on ? 'text-slate-800' : 'text-slate-500'}`}>{label}</span>
              {on && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-orange-400" />}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 p-1 bg-slate-100/80 rounded-2xl">
        {['CV', 'PT'].map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              setEntity(e);
              setHits([]);
              setQuery('');
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${
              entity === e
                ? 'bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-md'
                : 'text-slate-500'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`rounded-2xl border px-2 py-3 flex flex-col items-center gap-1.5 ${
            mode === 'manual' ? 'border-cyan-200 bg-cyan-50/80' : 'border-slate-100 bg-white'
          }`}
        >
          <Search className={`w-4 h-4 ${mode === 'manual' ? 'text-cyan-600' : 'text-slate-400'}`} />
          <span className={`text-[11px] font-semibold ${mode === 'manual' ? 'text-cyan-800' : 'text-slate-500'}`}>
            Cari Master
          </span>
        </button>
        <button
          type="button"
          onClick={() => setError('Fitur suara segera hadir.')}
          className="rounded-2xl border border-slate-100 bg-white px-2 py-3 flex flex-col items-center gap-1.5 opacity-90"
        >
          <Mic className="w-4 h-4 text-violet-500" />
          <span className="text-[11px] font-semibold text-slate-500">Suara</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('pdf');
            fileRef.current?.click();
          }}
          className={`rounded-2xl border px-2 py-3 flex flex-col items-center gap-1.5 ${
            mode === 'pdf' ? 'border-cyan-200 bg-cyan-50/80' : 'border-slate-100 bg-white'
          }`}
        >
          <Upload className={`w-4 h-4 ${mode === 'pdf' ? 'text-cyan-600' : 'text-cyan-500'}`} />
          <span className={`text-[11px] font-semibold ${mode === 'pdf' ? 'text-cyan-800' : 'text-slate-500'}`}>
            PDF / Validasi
          </span>
        </button>
      </div>

      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={onFile} />

      <div className="rounded-2xl bg-white border border-slate-100 px-3 py-2.5 flex items-center gap-3 shadow-sm">
        <label className="text-[11px] text-slate-400 shrink-0 font-medium">Tanggal</label>
        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          className="flex-1 text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-100 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-cyan-400"
        />
      </div>

      {mode === 'manual' && (
        <div className="rounded-2xl bg-white border border-slate-100 p-3 space-y-2 shadow-sm">
          <input
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={`Cari barang ${entity}…`}
            className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-100 text-sm focus:outline-none focus:border-cyan-400"
          />
          {hits.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {hits.map((h) => (
                <button
                  key={h.kode}
                  type="button"
                  onClick={() => addToCart(h)}
                  className="w-full text-left text-xs px-3 py-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50 text-slate-700 flex items-center gap-2"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="font-semibold text-emerald-700">{h.kode}</span>
                  <span className="truncate">{h.nama}</span>
                  <span className="ml-auto text-slate-400 shrink-0">{h.satuan}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'pdf' && (
        <div className="space-y-2">
          {busy && (
            <div className="rounded-2xl bg-cyan-50 border border-cyan-100 px-3 py-3 flex items-center gap-2 text-sm text-cyan-800">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              Membaca & validasi PDF…
            </div>
          )}
          {error && (
            <div
              className={`text-xs px-3 py-2.5 rounded-xl border ${
                /masuk keranjang|langsung masuk|cocok/i.test(error)
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                  : /ambigu|tidak cocok|tidak ada|revisi|pilih/i.test(error)
                    ? 'bg-amber-50 text-amber-800 border-amber-100'
                    : 'bg-slate-50 text-slate-700 border-slate-100'
              }`}
            >
              {error}
            </div>
          )}
          {pdfInfo && pdfInfo.autoAdded > 0 && pdfResults.length === 0 && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5 flex items-center gap-2 text-sm text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                <strong>{pdfInfo.autoAdded}</strong> item dari PDF masuk keranjang
                {pdfInfo.rowCount ? ` · ${pdfInfo.rowCount} baris` : ''}
              </span>
            </div>
          )}
          {pdfResults.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2.5 text-center">
                  <p className="text-lg font-bold text-emerald-600">{pdfSummary.matched}</p>
                  <p className="text-[10px] text-emerald-600">Cocok</p>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-2.5 text-center">
                  <p className="text-lg font-bold text-amber-600">{pdfSummary.ambiguous}</p>
                  <p className="text-[10px] text-amber-600">Ambigu</p>
                </div>
                <div className="rounded-xl bg-red-50 border border-red-100 p-2.5 text-center">
                  <p className="text-lg font-bold text-red-600">{pdfSummary.unmatched}</p>
                  <p className="text-[10px] text-red-600">Tidak cocok</p>
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {pdfResults.map((r, idx) => (
                  <div
                    key={idx}
                    className={`bg-white rounded-xl border p-3 ${
                      r.status === 'matched'
                        ? 'border-emerald-100'
                        : r.status === 'ambiguous'
                          ? 'border-amber-200'
                          : 'border-red-100'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {r.status === 'matched' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                      ) : r.status === 'ambiguous' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{r.nama}</p>
                        <p className="text-[11px] text-slate-400">Qty {r.qty}</p>
                        {r.status === 'matched' && (
                          <p className="text-[11px] text-emerald-700 mt-0.5">
                            → {r.kode} · {r.namaMaster} ({r.satuan}) · {r.matchType}
                          </p>
                        )}
                        {r.status === 'ambiguous' && (
                          <div className="mt-1.5 space-y-1">
                            <p className="text-[10px] text-amber-700">Pilih yang benar:</p>
                            {(r.candidates || []).map((c) => (
                              <button
                                key={c.kode}
                                type="button"
                                onClick={() => pickCandidate(idx, c)}
                                className="block w-full text-left text-xs px-2 py-1.5 rounded-lg bg-amber-50 text-slate-700"
                              >
                                {c.kode} — {c.nama}
                              </button>
                            ))}
                            <button type="button" onClick={() => skipReviewItem(idx)} className="text-[10px] text-slate-400 underline mt-1">
                              Abaikan item ini
                            </button>
                          </div>
                        )}
                        {r.status === 'unmatched' && (
                          <div className="mt-1.5 space-y-1.5">
                            <p className="text-[10px] text-red-600">Tidak cocok — cari di master atau abaikan:</p>
                            <input
                              value={r.searchQ || ''}
                              onChange={(e) => onReviewSearch(idx, e.target.value)}
                              placeholder="Cari nama / kode master..."
                              className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-cyan-400"
                            />
                            {(r.searchHits || []).map((c) => (
                              <button
                                key={c.kode}
                                type="button"
                                onClick={() => pickCandidate(idx, c)}
                                className="block w-full text-left text-xs px-2 py-1.5 rounded-lg bg-slate-50 text-slate-700"
                              >
                                {c.kode} — {c.nama}
                              </button>
                            ))}
                            <button type="button" onClick={() => skipReviewItem(idx)} className="text-[10px] text-slate-400 underline mt-1">
                              Abaikan item ini
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {pdfSummary.matched > 0 && (
                <button
                  type="button"
                  onClick={addReviewedToCart}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
                >
                  Tambah {pdfSummary.matched} item yang sudah cocok ke keranjang
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {cart.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <h3 className="text-sm font-semibold text-slate-800">Keranjang ({cart.length})</h3>
            <button type="button" onClick={() => setCart([])} className="text-xs text-rose-500 flex items-center gap-1 font-medium">
              <Trash2 className="w-3.5 h-3.5" /> Kosongkan
            </button>
          </div>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {cart.map((c, idx) => (
              <div key={c.kode + idx} className="rounded-2xl bg-white border border-slate-100 px-3.5 py-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-cyan-700">{c.kode}</p>
                    <p className="text-[13px] font-bold text-slate-800 truncate leading-snug">{c.nama}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{c.satuan || 'Pack'}</p>
                  </div>
                  <button type="button" onClick={() => removeFromCart(idx)} className="text-slate-300 p-1 active:text-rose-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-2.5 grid grid-cols-[1fr_1.4fr] gap-2">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Qty</p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateQty(idx, -1)}
                        className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center"
                      >
                        <Minus className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                      <input
                        type="number"
                        step="0.01"
                        value={c.qty}
                        onChange={(e) => setQtyValue(idx, e.target.value)}
                        className="flex-1 min-w-0 text-center text-sm font-bold border border-slate-100 rounded-xl py-1.5 bg-slate-50"
                      />
                      <button
                        type="button"
                        onClick={() => updateQty(idx, 1)}
                        className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center"
                      >
                        <Plus className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Keterangan</p>
                    <input
                      value={c.keterangan}
                      onChange={(e) => updateKet(idx, e.target.value)}
                      placeholder="Opsional"
                      className="w-full text-[12px] px-2.5 py-2 bg-slate-50 border border-slate-100 rounded-xl"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {submitMsg && (
            <div
              className={`text-xs px-3 py-2.5 rounded-xl border ${
                submitMsg.success ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
              }`}
            >
              {submitMsg.success
                ? `Berhasil menulis ${submitMsg.written || cart.length} item${submitMsg.offline ? ' (sebagian offline)' : ''}.`
                : submitMsg.error || 'Gagal mengirim'}
            </div>
          )}

          <div className="fixed bottom-[4.25rem] left-0 right-0 z-40 px-3 pointer-events-none">
            <div className="max-w-lg mx-auto pointer-events-auto">
              <button
                type="button"
                onClick={submitCart}
                disabled={submitting || !cart.length}
                className={`w-full py-3.5 rounded-2xl bg-gradient-to-r ${submitGradient} text-white text-sm font-bold flex items-center justify-center gap-2 shadow-xl disabled:opacity-50 active:scale-[0.99]`}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Kirim {cart.length} item · {typeLabel} ({entity})
              </button>
            </div>
          </div>
        </div>
      )}

      {cart.length === 0 && !busy && mode === 'manual' && !query && (
        <p className="text-center text-[12px] text-slate-400 py-6">
          Pilih tipe transaksi, cari master atau unggah PDF untuk mengisi keranjang.
        </p>
      )}
    </div>
  );
}
