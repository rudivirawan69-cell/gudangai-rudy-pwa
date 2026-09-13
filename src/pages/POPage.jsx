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
        tgl: formatTglKedatangan(),
      });
    }
    const row = map.get(key);
    if (it.entity === 'CV') row.poCV += qty;
    else row.poPT += qty;
  });
  return Array.from(map.values())
    .map((r) => ({ ...r, total: r.poCV + r.poPT }))
    .filter((r) => r.total > 0);
}

function ItemCard({ item, onUpdate, onRemove }) {
  return (
    <div className="bg-white rounded-xl px-3 py-2.5 border border-gray-100 shadow-sm">
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
              item.entity === 'CV' ? 'bg-blue-100 text-blue-600' : 'bg-violet-100 text-violet-600'
            }`}>{item.entity}</span>
            <p className="text-[12px] font-medium text-gray-800 truncate">{item.nama}</p>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {item.kode} · stok {item.stok} / aman {item.aman}
          </p>
          <p className="text-[10px] text-gray-500">Rekomendasi: {item.qty} {item.satuan}</p>
        </div>
        <button type="button" onClick={() => onRemove(item.id)} className="text-gray-300 p-1 hover:text-red-400" aria-label="Hapus">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onUpdate(item.id, Math.max(0, item.qty - 1))}
          className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center active:bg-gray-200"
        >
          <Minus className="w-3.5 h-3.5 text-gray-600" />
        </button>
        <input
          type="number"
          min="0"
          value={item.qty}
          onChange={(e) => onUpdate(item.id, Math.max(0, parseInt(e.target.value, 10) || 0))}
          className="w-16 text-center text-sm font-bold border border-gray-200 rounded-lg py-1.5"
        />
        <button
          type="button"
          onClick={() => onUpdate(item.id, item.qty + 1)}
          className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center active:bg-gray-200"
        >
          <Plus className="w-3.5 h-3.5 text-gray-600" />
        </button>
        <span className="text-[10px] text-gray-400 ml-1">{item.satuan}</span>
      </div>
    </div>
  );
}

export default function POPage() {
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const [tab, setTab] = useState('cs');
  const [phase, setPhase] = useState('idle'); // idle | review | final | saved
  const [draftItems, setDraftItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  const criticalCS = useMemo(() => {
    const cv = buildCritical(stockCV.items, 'CV', isCS);
    const pt = buildCritical(stockPT.items, 'PT', isCS);
    return [...cv, ...pt].sort((a, b) => b.qty - a.qty);
  }, [stockCV.items, stockPT.items]);

  const criticalProd = useMemo(() => {
    const cv = buildCritical(stockCV.items, 'CV', isProduksi);
    const pt = buildCritical(stockPT.items, 'PT', isProduksi);
    return [...cv, ...pt].sort((a, b) => b.qty - a.qty);
  }, [stockCV.items, stockPT.items]);

  const loading = stockCV.loading || stockPT.loading;
  const activeCritical = tab === 'cs' ? criticalCS : criticalProd;
  const finalRows = useMemo(() => buildFinalRows(draftItems), [draftItems]);
  const totalQty = draftItems.reduce((s, i) => s + (Number(i.qty) || 0), 0);

  const generate = useCallback(() => {
    const src = tab === 'cs' ? criticalCS : criticalProd;
    setDraftItems(src.map((i) => ({ ...i })));
    setPhase('review');
    setSubmitMsg('');
  }, [tab, criticalCS, criticalProd]);

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
            <p className={`text-xs font-bold ${tab === 'cs' ? 'text-cyan-800' : 'text-gray-700'}`}>PO CS</p>
            <p className="text-[9px] text-gray-400 truncate">Cold Storage</p>
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
            <p className={`text-xs font-bold ${tab === 'produksi' ? 'text-orange-800' : 'text-gray-700'}`}>PO PRODUKSI</p>
            <p className="text-[9px] text-gray-400 truncate">Team Produksi</p>
          </div>
        </button>
      </div>

      {/* ===== IDLE ===== */}
      {phase === 'idle' && (
        <>
          <div className={`rounded-2xl p-4 text-white bg-gradient-to-br shadow-lg mb-3 ${
            tab === 'cs' ? 'from-cyan-700 to-[#0b2a55]' : 'from-orange-600 to-amber-800'
          }`}>
            <div className="flex items-center gap-3 mb-2">
              <FileText className="w-5 h-5 text-white/90" />
              <div>
                <p className="text-sm font-bold">{tab === 'cs' ? 'Rekomendasi PO · Cold Storage' : 'Rekomendasi PO · Produksi'}</p>
                <p className="text-[11px] text-white/70">Stok di bawah stok aman → generate draft</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <p className="text-white/50 text-[10px] uppercase">Item kritis</p>
                <p className="text-2xl font-bold">{loading ? '…' : activeCritical.length}</p>
              </div>
              <div className="flex-1">
                <p className="text-white/50 text-[10px] uppercase">Total kurang</p>
                <p className="text-2xl font-bold">
                  {loading ? '…' : activeCritical.reduce((s, i) => s + i.qty, 0).toLocaleString('id-ID')}
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : activeCritical.length === 0 ? (
            <div className="text-center py-10">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">{tab === 'cs' ? 'Stok CS aman' : 'Tidak ada item produksi kritis'}</p>
            </div>
          ) : (
            <div className="space-y-1.5 mb-3">
              {activeCritical.slice(0, 8).map((item) => (
                <div key={item.id} className="bg-white rounded-xl px-3 py-2 border border-gray-100 text-[11px]">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-800 truncate">{item.nama}</span>
                    <span className="text-red-600 font-bold shrink-0">-{item.qty}</span>
                  </div>
                  <p className="text-gray-400">{item.kode} · {item.stok}/{item.aman}</p>
                </div>
              ))}
              {activeCritical.length > 8 && (
                <p className="text-center text-[10px] text-gray-400">+{activeCritical.length - 8} item lainnya</p>
              )}
            </div>
          )}
        </>
      )}

      {/* ===== REVIEW ===== */}
      {phase === 'review' && (
        <>
          <div className="mb-2">
            <p className="text-sm font-bold text-gray-800">REVISI REKOMENDASI</p>
            <p className="text-[11px] text-gray-400">{draftItems.length} item · {totalQty.toLocaleString('id-ID')} total qty</p>
          </div>
          {draftItems.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Semua item dihapus. Kembali untuk generate ulang.</div>
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
          <div className="mb-2">
            <p className="text-sm font-bold text-gray-800">Purchase Order</p>
            <p className="text-[11px] text-gray-400">Tanggal {formatTglHeader()}</p>
          </div>
          {finalRows.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Tidak ada item (qty 0 dibuang).</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white mb-3">
              <table className="min-w-full text-[11px]">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="px-2 py-2 text-left font-semibold">No</th>
                    <th className="px-2 py-2 text-left font-semibold">Nama Barang</th>
                    <th className="px-2 py-2 text-left font-semibold">Size</th>
                    <th className="px-2 py-2 text-left font-semibold">Sat.</th>
                    <th className="px-2 py-2 text-right font-semibold">CV</th>
                    <th className="px-2 py-2 text-right font-semibold">PT</th>
                    <th className="px-2 py-2 text-right font-semibold">Total</th>
                    <th className="px-2 py-2 text-left font-semibold">Kedatangan</th>
                  </tr>
                </thead>
                <tbody>
                  {finalRows.map((r, idx) => (
                    <tr key={idx} className="border-t border-gray-100">
                      <td className="px-2 py-1.5">{idx + 1}</td>
                      <td className="px-2 py-1.5 font-medium text-gray-800 max-w-[120px] truncate">{r.nama}</td>
                      <td className="px-2 py-1.5">{r.size || '—'}</td>
                      <td className="px-2 py-1.5">{r.satuan}</td>
                      <td className="px-2 py-1.5 text-right">{r.poCV || 0}</td>
                      <td className="px-2 py-1.5 text-right">{r.poPT || 0}</td>
                      <td className="px-2 py-1.5 text-right font-bold">{r.total}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.tgl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
