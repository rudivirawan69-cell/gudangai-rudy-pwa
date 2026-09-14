import { useState, useMemo, useCallback } from 'react';
import { useStock } from '../hooks/useStock';
import { submitPO } from '../data/api';
import {
  FileText, Trash2, Plus, Minus, CheckCircle, Snowflake, ChefHat,
  ArrowLeft, Save, Loader2,
} from 'lucide-react';

/** Fallback batas aman (dipakai jika live stockAman = 0). */
const STOCK_AMAN = {
  'CV-0001': 2500, 'CV-0002': 500, 'CV-0003': 500, 'CV-0005': 850, 'CV-0007': 350,
  'CV-0009': 150, 'CV-0010': 550, 'CV-0012': 850, 'CV-0013': 500, 'CV-0014': 750,
  'CV-0015': 650, 'CV-0016': 300, 'CV-0017': 300, 'CV-0018': 250, 'CV-0020': 450,
  'CV-0021': 450, 'CV-0022': 250, 'CV-0023': 350, 'CV-0024': 300, 'CV-0025': 150,
  'CV-0026': 75, 'CV-0027': 500, 'CV-0030': 15, 'CV-0031': 500, 'CV-0032': 125,
  'CV-0033': 72, 'CV-0037': 400, 'CV-0039': 1850, 'CV-0061': 75, 'CV-0062': 10,
  'CV-0070': 550, 'CV-0071': 500, 'CV-0079': 70, 'CV-0083': 250, 'CV-0084': 500,
  'CV-0085': 650, 'CV-0089': 200, 'CV-0091': 240,
  'PT-0001': 1500, 'PT-0002': 450, 'PT-0005': 250, 'PT-0006': 450, 'PT-0008': 150,
  'PT-0010': 150, 'PT-0011': 450, 'PT-0012': 350, 'PT-0013': 350, 'PT-0014': 250,
  'PT-0015': 500, 'PT-0016': 450, 'PT-0017': 400, 'PT-0020': 150, 'PT-0021': 250,
  'PT-0022': 200, 'PT-0024': 95, 'PT-0026': 65, 'PT-0028': 250, 'PT-0029': 15,
  'PT-0030': 1500, 'PT-0032': 125, 'PT-0035': 36, 'PT-0037': 125, 'PT-0043': 200,
  'PT-0044': 150,
};

function normDiv(d) {
  return String(d || '').trim().toUpperCase();
}

function isCS(divisi) {
  const d = normDiv(divisi);
  return d === 'CS' || d.includes('COLD') || d === 'COLD STORAGE';
}

function isRekanan(divisi) {
  const d = normDiv(divisi);
  return d.includes('REKANAN') || d.includes('REKAN') || d === 'RK';
}

function isProduksi(divisi) {
  return !isCS(divisi) && !isRekanan(divisi);
}

function getAman(item) {
  const live = Number(item.stockAman ?? item.aman ?? 0);
  if (live > 0) return live;
  return STOCK_AMAN[item.kode] || 0;
}

function buildCritical(list, entity, predicate) {
  return list
    .filter((i) => {
      if (i.kode?.startsWith('BB')) return false;
      if (predicate && !predicate(i.divisi)) return false;
      const aman = getAman(i);
      if (!aman || aman <= 0) return false;
      return Number(i.stok) < aman;
    })
    .map((i) => {
      const aman = getAman(i);
      const stok = Number(i.stok) || 0;
      const qty = Math.max(0, aman - stok);
      return {
        id: `${entity}-${i.kode}`,
        kode: i.kode,
        nama: i.nama,
        size: i.size || '',
        satuan: i.satuan || 'Pack',
        divisi: i.divisi,
        entity,
        stok,
        aman,
        qty,
      };
    })
    .sort((a, b) => b.qty - a.qty);
}

function formatTglKedatangan() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTglHeader() {
  const d = new Date();
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Merge CV + PT by normalized nama into final table rows. Qty 0 discarded. */
function buildFinalRows(items) {
  const map = new Map();
  items.forEach((it) => {
    const qty = Number(it.qty) || 0;
    if (qty <= 0) return;
    const key = String(it.nama || '').trim().toLowerCase();
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        nama: it.nama,
        size: it.size || '',
        satuan: it.satuan || 'Pack',
        poCV: 0,
        poPT: 0,
        total: 0,
        tgl: formatTglKedatangan(),
      });
    }
    const row = map.get(key);
    if (it.entity === 'CV') row.poCV += qty;
    else row.poPT += qty;
    row.total = row.poCV + row.poPT;
  });
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function ItemCard({ item, onUpdate, onRemove }) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800 truncate">{item.nama}</p>
          <p className="text-[10px] text-gray-400">{item.size || '—'} · {item.satuan} · {item.entity}</p>
        </div>
        <button type="button" onClick={() => onRemove(item.id)} className="text-red-400 p-1">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onUpdate(item.id, Math.max(0, item.qty - 1))} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="number"
          value={item.qty}
          onChange={(e) => onUpdate(item.id, Math.max(0, Number(e.target.value) || 0))}
          className="w-16 text-center text-sm font-bold border border-gray-200 rounded-lg py-1.5"
        />
        <button type="button" onClick={() => onUpdate(item.id, item.qty + 1)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
          <Plus className="w-4 h-4" />
        </button>
        <span className="text-[10px] text-gray-400 ml-auto">stok {item.stok} / aman {item.aman}</span>
      </div>
    </div>
  );
}

export default function POPage() {
  const { stockCV, stockPT, loading } = useStock();
  const [tab, setTab] = useState('cs');
  const [phase, setPhase] = useState('idle');
  const [draftItems, setDraftItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  const criticalCS = useMemo(() => {
    const cv = buildCritical(stockCV || [], 'CV', isCS);
    const pt = buildCritical(stockPT || [], 'PT', isCS);
    return [...cv, ...pt].sort((a, b) => b.qty - a.qty);
  }, [stockCV, stockPT]);

  const criticalProduksi = useMemo(() => {
    const cv = buildCritical(stockCV || [], 'CV', isProduksi);
    const pt = buildCritical(stockPT || [], 'PT', isProduksi);
    return [...cv, ...pt].sort((a, b) => b.qty - a.qty);
  }, [stockCV, stockPT]);

  const activeCritical = tab === 'cs' ? criticalCS : criticalProduksi;

  const finalRows = useMemo(() => buildFinalRows(draftItems), [draftItems]);

  const generate = () => {
    setDraftItems(activeCritical.map((i) => ({ ...i })));
    setPhase('review');
    setSubmitMsg('');
  };

  const updateQty = (id, qty) => {
    setDraftItems((prev) => prev.map((i) => (i.id === id ? { ...i, qty: Math.max(0, qty) } : i)));
  };

  const removeItem = (id) => {
    setDraftItems((prev) => prev.filter((i) => i.id !== id));
  };

  const goFinal = () => {
    setPhase('final');
  };

  const goReview = () => {
    setPhase('review');
  };

  const handleSubmit = async () => {
    if (submitting || finalRows.length === 0) return;
    setSubmitting(true);
    setSubmitMsg('Menyimpan PO...');
    try {
      const payload = {
        tipe: tab === 'cs' ? 'CS' : 'PRODUKSI',
        tanggal: formatTglHeader(),
        tglKedatangan: formatTglKedatangan(),
        items: draftItems
          .filter((i) => Number(i.qty) > 0)
          .map((i) => ({
            kode: i.kode,
            nama: i.nama,
            size: i.size,
            satuan: i.satuan,
            entity: i.entity,
            qty: Number(i.qty) || 0,
            divisi: i.divisi,
          })),
        requestId: 'PO-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      };
      const res = await submitPO(payload);
      if (res && (res.success === true || res.status === 'OK' || res.status === 'APPLIED')) {
        setPhase('saved');
        setSubmitMsg('PO berhasil disimpan.');
      } else {
        setSubmitMsg(res?.error || 'Gagal menyimpan PO. Cek koneksi atau coba lagi.');
      }
    } catch (err) {
      setSubmitMsg(err?.message || 'Gagal menyimpan PO');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setPhase('idle');
    setDraftItems([]);
    setSubmitMsg('');
  };

  return (
    <div className="pb-28 animate-fade-in">
      <h2 className="text-lg font-bold text-gray-800 mb-0.5">Purchase Order</h2>
      <p className="text-xs text-gray-400 mb-3">Buat rekomendasi PO berdasarkan stok aman.</p>

      {/* Tabs tipe PO */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          type="button"
          onClick={() => { setTab('cs'); if (phase !== 'idle') resetAll(); }}
          className={`rounded-xl px-3 py-3 flex items-center gap-2 border-2 transition-all ${
            tab === 'cs' ? 'border-cyan-500 bg-cyan-50 shadow-sm' : 'border-gray-100 bg-white'
          }`}
        >
          <Snowflake className={`w-5 h-5 ${tab === 'cs' ? 'text-cyan-600' : 'text-gray-400'}`} />
          <div className="text-left min-w-0">
            <p className={`text-sm font-bold ${tab === 'cs' ? 'text-cyan-800' : 'text-gray-700'}`}>PO CS</p>
            <p className="text-[10px] text-gray-400">Cold Storage</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => { setTab('produksi'); if (phase !== 'idle') resetAll(); }}
          className={`rounded-xl px-3 py-3 flex items-center gap-2 border-2 transition-all ${
            tab === 'produksi' ? 'border-orange-500 bg-orange-50 shadow-sm' : 'border-gray-100 bg-white'
          }`}
        >
          <ChefHat className={`w-5 h-5 ${tab === 'produksi' ? 'text-orange-600' : 'text-gray-400'}`} />
          <div className="text-left min-w-0">
            <p className={`text-sm font-bold ${tab === 'produksi' ? 'text-orange-800' : 'text-gray-700'}`}>PO PRODUKSI</p>
            <p className="text-[10px] text-gray-400">Team Produksi</p>
          </div>
        </button>
      </div>

      {/* ===== IDLE ===== */}
      {phase === 'idle' && (
        <div className="text-center py-10 text-gray-400 text-sm">
          {loading ? 'Memuat stok...' : activeCritical.length === 0 ? 'Tidak ada item di bawah stok aman.' : `${activeCritical.length} item siap generate.`}
        </div>
      )}

      {/* ===== REVIEW ===== */}
      {phase === 'review' && (
        <>
          <p className="text-xs text-gray-500 mb-2">Revisi qty jika perlu, lalu tinjau hasil.</p>
          {draftItems.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">Semua item dihapus. Kembali untuk generate ulang.</div>
          ) : (
            <div className="space-y-2 mb-3">
              {draftItems.map((item) => (
                <ItemCard key={item.id} item={item} onUpdate={updateQty} onRemove={removeItem} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== FINAL ===== */}
      {phase === 'final' && (
        <>
          <div className="mb-3">
            <p className="text-sm font-bold text-gray-800">Purchase Order</p>
            <p className="text-[11px] text-gray-400">Tanggal {formatTglHeader()} · {finalRows.length} item</p>
          </div>
          {finalRows.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Tidak ada item (qty 0 dibuang).</div>
          ) : (
            <div className="space-y-2 mb-4">
              {finalRows.map((r, idx) => (
                <div
                  key={idx}
                  className="rounded-xl bg-white/95 border border-slate-100 shadow-sm px-3 py-2.5"
                >
                  <div className="flex items-start gap-2 mb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 tabular-nums w-5 shrink-0 pt-0.5">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <p className="text-[13px] font-semibold text-slate-800 leading-snug flex-1 min-w-0">
                      {r.nama}
                    </p>
                    <span className="text-[13px] font-bold text-[#0b2a55] tabular-nums shrink-0">
                      {r.total}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 text-[10px] text-slate-500">
                    <span>
                      Size <b className="text-slate-700 font-medium">{r.size || '—'}</b>
                    </span>
                    <span>
                      Sat. <b className="text-slate-700 font-medium">{r.satuan}</b>
                    </span>
                    <span>
                      CV <b className="text-cyan-700 font-semibold tabular-nums">{r.poCV || 0}</b>
                    </span>
                    <span>
                      PT <b className="text-violet-700 font-semibold tabular-nums">{r.poPT || 0}</b>
                    </span>
                    <span className="text-slate-400">
                      Kedatangan <b className="text-slate-600 font-medium">{r.tgl}</b>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {submitMsg && (
            <p className={`text-center text-xs mb-2 ${submitMsg.includes('berhasil') ? 'text-emerald-600' : 'text-amber-600'}`}>
              {submitMsg}
            </p>
          )}
        </>
      )}

      {/* ===== SAVED ===== */}
      {phase === 'saved' && (
        <div className="text-center py-10">
          <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
          <p className="text-gray-800 font-bold mb-1">PO berhasil disimpan</p>
          <p className="text-xs text-gray-400 mb-4">{submitMsg || 'Data telah dikirim ke sheet Purchase Order.'}</p>
          <button
            type="button"
            onClick={resetAll}
            className="px-5 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium"
          >
            Buat PO baru
          </button>
        </div>
      )}

      {/* Bottom actions */}
      {phase !== 'saved' && (
        <div className="fixed bottom-[4.25rem] left-0 right-0 z-40 px-3 pointer-events-none">
          <div className="max-w-lg mx-auto pointer-events-auto space-y-2">
            {phase === 'idle' && (
              <button
                type="button"
                onClick={generate}
                disabled={loading || activeCritical.length === 0}
                className={`w-full py-3.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 shadow-xl disabled:opacity-50 ${
                  tab === 'cs'
                    ? 'bg-gradient-to-r from-cyan-600 to-[#0b2a55]'
                    : 'bg-gradient-to-r from-orange-500 to-amber-700'
                }`}
              >
                <FileText className="w-4 h-4" />
                Generate Rekomendasi PO
              </button>
            )}

            {phase === 'review' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetAll}
                  className="flex-1 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-medium shadow flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="w-4 h-4" /> Batal
                </button>
                <button
                  type="button"
                  onClick={goFinal}
                  disabled={draftItems.length === 0}
                  className={`flex-[1.4] py-3 rounded-xl text-white text-sm font-bold shadow disabled:opacity-50 ${
                    tab === 'cs' ? 'bg-cyan-600' : 'bg-orange-600'
                  }`}
                >
                  Tinjau Hasil PO
                </button>
              </div>
            )}

            {phase === 'final' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={goReview}
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-medium shadow flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="w-4 h-4" /> Revisi
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || finalRows.length === 0}
                  className={`flex-[1.4] py-3 rounded-xl text-white text-sm font-bold shadow disabled:opacity-50 flex items-center justify-center gap-2 ${
                    tab === 'cs' ? 'bg-[#0b2a55]' : 'bg-orange-700'
                  }`}
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                  ) : (
                    <><Save className="w-4 h-4" /> Simpan / Kirim PO</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
