import { useState, useMemo, useCallback, useEffect } from 'react';
import { useStock } from '../hooks/useStock';
import { submitPO } from '../data/api';
import {
  Trash2, Plus, Minus, CheckCircle, Snowflake, ChefHat,
  ArrowLeft, Send, Loader2, RefreshCw,
} from 'lucide-react';

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

function normDiv(d) { return String(d || '').trim().toUpperCase(); }
function isCS(divisi) { const d = normDiv(divisi); return d === 'CS' || d.includes('COLD'); }
function isRekanan(divisi) { const d = normDiv(divisi); return d.includes('REKAN'); }
function isProduksi(divisi) { return !isCS(divisi) && !isRekanan(divisi); }
function getAman(item) {
  const live = Number(item.stockAman ?? item.aman ?? 0);
  return live > 0 ? live : (STOCK_AMAN[item.kode] || 0);
}
function buildCritical(list, entity, predicate) {
  return (list || []).filter((i) => {
    if (i.kode?.startsWith('BB')) return false;
    if (predicate && !predicate(i.divisi)) return false;
    const aman = getAman(i);
    return aman > 0 && Number(i.stok ?? i.stockAkhir ?? i.qty ?? 0) < aman;
  }).map((i) => {
    const aman = getAman(i);
    const stok = Number(i.stok ?? i.stockAkhir ?? i.qty ?? 0) || 0;
    return {
      id: `${entity}-${i.kode}`,
      kode: i.kode,
      nama: i.nama,
      size: i.size || '',
      satuan: i.satuan || 'Pack',
      divisi: i.divisi || '',
      entity,
      stok,
      aman,
      qty: Math.max(0, aman - stok),
    };
  }).sort((a, b) => b.qty - a.qty || a.nama.localeCompare(b.nama));
}
function dateParts(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const monthsShort = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const monthsLong = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return {
    iso: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    short: `${String(d.getDate()).padStart(2,'0')} ${monthsShort[d.getMonth()]} ${d.getFullYear()}`,
    long: `${String(d.getDate()).padStart(2,'0')} ${monthsLong[d.getMonth()]} ${d.getFullYear()}`,
  };
}
function buildFinalRows(items) {
  const map = new Map();
  for (const it of items) {
    const qty = Number(it.qty) || 0;
    if (qty <= 0) continue;
    const key = String(it.kode || it.nama || '').trim().toLowerCase();
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        kode: it.kode,
        nama: it.nama,
        size: it.size || '',
        satuan: it.satuan || 'Pack',
        divisi: it.divisi || '',
        poCV: 0,
        poPT: 0,
        total: 0,
        tgl: dateParts(2).short,
      });
    }
    const row = map.get(key);
    if (it.entity === 'CV') row.poCV += qty; else row.poPT += qty;
    row.total = row.poCV + row.poPT;
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.nama.localeCompare(b.nama));
}

function ItemCard({ item, onUpdate, onRemove }) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800">{item.nama}</p>
          <p className="text-[10px] text-gray-400">{item.satuan} · {item.divisi || '—'} · {item.entity} · stok {item.stok} / aman {item.aman}</p>
        </div>
        <button type="button" aria-label={`Hapus ${item.nama}`} onClick={() => onRemove(item.id)} className="text-red-400 p-2 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Kurangi" onClick={() => onUpdate(item.id, Math.max(0, item.qty - 1))} className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center touch-manipulation">
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={item.qty}
          onChange={(e) => onUpdate(item.id, Math.max(0, Number(e.target.value) || 0))}
          className="w-20 text-center text-sm font-bold border border-gray-200 rounded-xl py-2.5"
        />
        <button type="button" aria-label="Tambah" onClick={() => onUpdate(item.id, item.qty + 1)} className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center touch-manipulation">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Memuat rekomendasi">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl bg-white border border-gray-100 p-3">
          <div className="skeleton h-4 w-3/4 rounded mb-2" />
          <div className="skeleton h-3 w-1/2 rounded mb-3" />
          <div className="skeleton h-11 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export default function POPage() {
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const loading = stockCV.loading || stockPT.loading;
  const [tab, setTab] = useState('cs');
  const [phase, setPhase] = useState('review');
  const [draftItems, setDraftItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const [initialized, setInitialized] = useState(false);

  const criticalCS = useMemo(() => [
    ...buildCritical(stockCV.items || [], 'CV', isCS),
    ...buildCritical(stockPT.items || [], 'PT', isCS),
  ].sort((a, b) => b.qty - a.qty), [stockCV.items, stockPT.items]);

  const criticalProduksi = useMemo(() => [
    ...buildCritical(stockCV.items || [], 'CV', isProduksi),
    ...buildCritical(stockPT.items || [], 'PT', isProduksi),
  ].sort((a, b) => b.qty - a.qty), [stockCV.items, stockPT.items]);

  const activeCritical = tab === 'cs' ? criticalCS : criticalProduksi;
  const finalRows = useMemo(() => buildFinalRows(draftItems), [draftItems]);
  const activeCount = draftItems.filter((i) => Number(i.qty) > 0).length;

  useEffect(() => {
    if (loading) return;
    if (!initialized) {
      setDraftItems(activeCritical.map((i) => ({ ...i })));
      setInitialized(true);
    }
  }, [loading, activeCritical, initialized]);

  const regenerate = useCallback(() => {
    setDraftItems(activeCritical.map((i) => ({ ...i })));
    setPhase('review');
    setSubmitMsg('');
  }, [activeCritical]);

  const updateQty = (id, qty) => {
    setDraftItems((prev) => prev.map((i) => (i.id === id ? { ...i, qty: Math.max(0, Number(qty) || 0) } : i)));
  };
  const removeItem = (id) => setDraftItems((prev) => prev.filter((i) => i.id !== id));
  const switchTab = (nextTab) => {
    if (nextTab === tab) return;
    setTab(nextTab);
    setInitialized(false);
    setDraftItems([]);
    setPhase('review');
    setSubmitMsg('');
  };

  const handleSubmit = async () => {
    if (submitting || finalRows.length === 0) return;
    setSubmitting(true);
    setSubmitMsg('Menyimpan PO...');
    try {
      const today = dateParts(0);
      const arrival = dateParts(2);
      const payload = {
        tipe: tab === 'cs' ? 'CS' : 'PRODUKSI',
        tanggal: today.iso,
        tglKedatangan: arrival.iso,
        items: draftItems.filter((i) => Number(i.qty) > 0).map((i) => ({
          kode: i.kode,
          nama: i.nama,
          size: i.size || '',
          satuan: i.satuan,
          entity: i.entity,
          qty: Number(i.qty) || 0,
          divisi: i.divisi,
        })),
        requestId: `PO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      const res = await submitPO(payload);
      if (res && (res.success === true || res.status === 'OK' || res.status === 'APPLIED')) {
        setPhase('saved');
        setSubmitMsg('PO berhasil disimpan.');
      } else {
        setSubmitMsg(res?.error || 'Gagal menyimpan PO.');
      }
    } catch (err) {
      setSubmitMsg(err?.message || 'Gagal menyimpan PO.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetSaved = () => {
    setPhase('review');
    setSubmitMsg('');
    regenerate();
  };

  return (
    <div className="pb-32 animate-fade-in">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Purchase Order</h2>
          <p className="text-xs text-gray-400">Rekomendasi langsung · edit · tinjau · kirim</p>
        </div>
        <button type="button" onClick={regenerate} className="p-2.5 rounded-xl bg-white border border-gray-100 text-gray-500 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Generate ulang">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3 mt-3">
        <button type="button" onClick={() => switchTab('cs')} className={`rounded-xl px-3 py-3.5 flex items-center gap-2 border-2 touch-manipulation ${tab === 'cs' ? 'border-cyan-500 bg-cyan-50' : 'border-gray-100 bg-white'}`}>
          <Snowflake className={`w-5 h-5 ${tab === 'cs' ? 'text-cyan-600' : 'text-gray-400'}`} />
          <div className="text-left"><p className="text-sm font-bold">PO CS</p><p className="text-[10px] text-gray-400">Cold Storage</p></div>
        </button>
        <button type="button" onClick={() => switchTab('produksi')} className={`rounded-xl px-3 py-3.5 flex items-center gap-2 border-2 touch-manipulation ${tab === 'produksi' ? 'border-orange-500 bg-orange-50' : 'border-gray-100 bg-white'}`}>
          <ChefHat className={`w-5 h-5 ${tab === 'produksi' ? 'text-orange-600' : 'text-gray-400'}`} />
          <div className="text-left"><p className="text-sm font-bold">PO PRODUKSI</p><p className="text-[10px] text-gray-400">Team Produksi</p></div>
        </button>
      </div>

      {phase === 'review' && (
        <>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">
              {loading || !initialized
                ? 'Memuat rekomendasi…'
                : `${activeCount} item aktif · stok < aman`}
            </p>
            <button type="button" onClick={regenerate} className="text-xs text-cyan-700 font-semibold touch-manipulation py-1 px-2">Generate ulang</button>
          </div>
          {loading || !initialized ? (
            <SkeletonCards />
          ) : draftItems.length === 0 ? (
            <div className="rounded-xl bg-white border border-gray-100 p-8 text-center text-sm text-gray-400">Tidak ada item di bawah stok aman.</div>
          ) : (
            <div className="space-y-2">
              {draftItems.map((item) => (
                <ItemCard key={item.id} item={item} onUpdate={updateQty} onRemove={removeItem} />
              ))}
            </div>
          )}
        </>
      )}

      {phase === 'final' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-gray-800">Hasil PO Siap Dikirim</p>
              <p className="text-[11px] text-gray-400">Tanggal {dateParts(0).long} · Kedatangan {dateParts(2).short}</p>
            </div>
            <button type="button" onClick={() => setPhase('review')} className="px-3 py-2.5 rounded-xl bg-white border border-gray-200 text-xs font-semibold touch-manipulation min-h-[44px]">
              <ArrowLeft className="w-4 h-4 inline mr-1" />Edit
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="px-2 py-2.5 text-left sticky left-0 bg-gray-50">No</th>
                  <th className="px-2 py-2.5 text-left">Nama</th>
                  <th className="px-2 py-2.5 text-right">CV</th>
                  <th className="px-2 py-2.5 text-right">PT</th>
                  <th className="px-2 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {finalRows.map((r, idx) => (
                  <tr key={`${r.kode}-${idx}`} className="border-t border-gray-50">
                    <td className="px-2 py-2.5 sticky left-0 bg-white">{idx + 1}</td>
                    <td className="px-2 py-2.5 font-medium">{r.nama}<div className="text-[10px] text-gray-400">{r.kode} · {r.satuan}</div></td>
                    <td className="px-2 py-2.5 text-right">{r.poCV || '-'}</td>
                    <td className="px-2 py-2.5 text-right">{r.poPT || '-'}</td>
                    <td className="px-2 py-2.5 text-right font-bold">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {phase === 'saved' && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-8 text-center">
          <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-3" />
          <p className="font-bold text-gray-800">PO berhasil disimpan</p>
          <p className="text-xs text-gray-400 mt-1">Data sudah dikirim ke server.</p>
          {submitMsg && <p className="text-xs text-green-600 mt-3">{submitMsg}</p>}
          <button type="button" onClick={resetSaved} className="mt-5 px-4 py-2.5 rounded-xl bg-gray-100 text-sm font-semibold touch-manipulation min-h-[44px]">Kembali</button>
        </div>
      )}

      {submitMsg && phase !== 'saved' && (
        <p className="mt-3 text-xs text-center text-red-500">{submitMsg}</p>
      )}

      {phase === 'review' && (
        <div className="sticky-action-bar">
          <button
            type="button"
            disabled={finalRows.length === 0 || loading}
            onClick={() => setPhase('final')}
            className="w-full rounded-xl bg-slate-900 text-white py-3.5 text-sm font-bold disabled:opacity-40 touch-manipulation min-h-[48px]"
          >
            Tinjau Hasil PO ({finalRows.length})
          </button>
        </div>
      )}

      {phase === 'final' && (
        <div className="sticky-action-bar">
          <button
            type="button"
            disabled={submitting || finalRows.length === 0}
            onClick={handleSubmit}
            className="w-full rounded-xl bg-slate-900 text-white py-3.5 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation min-h-[48px]"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitting ? 'Mengirim…' : 'Kirim PO'}
          </button>
        </div>
      )}
    </div>
  );
}
