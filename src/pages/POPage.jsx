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
function buildMergedRows(items, defaultTglIso) {
  const map = new Map();
  for (const it of items) {
    const qty = Number(it.qty) || 0;
    if (qty <= 0) continue;
    const key = String(it.nama || it.kode || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        kodeCV: it.entity === 'CV' ? it.kode : '',
        kodePT: it.entity === 'PT' ? it.kode : '',
        nama: it.nama,
        size: it.size || '',
        satuan: it.satuan || 'Pack',
        divisi: it.divisi || '',
        poCV: 0,
        poPT: 0,
        total: 0,
        stokCV: 0,
        stokPT: 0,
        amanCV: 0,
        amanPT: 0,
        tglKedatangan: defaultTglIso || dateParts(2).iso,
      });
    }
    const row = map.get(key);
    if (it.entity === 'CV') {
      row.poCV += qty;
      row.kodeCV = it.kode || row.kodeCV;
      row.stokCV = Number(it.stok) || row.stokCV;
      row.amanCV = Number(it.aman) || row.amanCV;
      if (it.size) row.size = it.size;
      if (it.divisi) row.divisi = it.divisi;
    } else {
      row.poPT += qty;
      row.kodePT = it.kode || row.kodePT;
      row.stokPT = Number(it.stok) || row.stokPT;
      row.amanPT = Number(it.aman) || row.amanPT;
      if (!row.size && it.size) row.size = it.size;
    }
    row.total = row.poCV + row.poPT;
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.nama.localeCompare(b.nama));
}

function MergedItemCard({ row, onChangeCV, onChangePT, onChangeTgl, onRemove }) {
  return (
    <div className="surface-flat p-4 touch-manipulation">
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-slate-800 leading-snug">{row.nama}</p>
          <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
            {row.size ? `${row.size} · ` : ''}{row.satuan}
            {row.kodeCV ? ` · CV ${row.kodeCV}` : ''}
            {row.kodePT ? ` · PT ${row.kodePT}` : ''}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px] font-semibold">
            {row.kodeCV ? (
              <span className="text-cyan-700">
                CV: stok <b className="tabular-nums">{row.stokCV ?? '—'}</b>
                {row.amanCV > 0 ? <> · aman <b className="tabular-nums">{row.amanCV}</b></> : null}
              </span>
            ) : null}
            {row.kodePT ? (
              <span className="text-orange-700">
                PT: stok <b className="tabular-nums">{row.stokPT ?? '—'}</b>
                {row.amanPT > 0 ? <> · aman <b className="tabular-nums">{row.amanPT}</b></> : null}
              </span>
            ) : null}
          </div>
        </div>
        <button type="button" aria-label={`Hapus ${row.nama}`} onClick={() => onRemove(row.id)}
          className="min-w-[40px] min-h-[40px] flex items-center justify-center text-red-400 rounded-xl bg-red-50 active:bg-red-100 shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="border-b border-slate-200 pb-3 mb-3">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Tgl kedatangan</label>
        <input type="date" value={row.tglKedatangan || ''} onChange={(e) => onChangeTgl(row.id, e.target.value)}
          className="w-full mt-1 text-sm font-bold text-slate-800 border border-slate-200 rounded-xl py-2 px-2.5 bg-white focus:outline-none focus:border-cyan-400" />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="border border-cyan-200 rounded-xl p-2.5">
          <p className="text-[10px] font-bold text-cyan-700 mb-1.5">PO CV</p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onChangeCV(row.id, Math.max(0, row.poCV - 1))} className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center text-cyan-700"><Minus className="w-3.5 h-3.5" /></button>
            <input type="number" min="0" inputMode="numeric" value={row.poCV} onChange={(e) => onChangeCV(row.id, Math.max(0, Number(e.target.value) || 0))} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 text-center text-sm font-bold border border-slate-200 rounded-lg py-1.5 text-slate-800" />
            <button type="button" onClick={() => onChangeCV(row.id, row.poCV + 1)} className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center text-cyan-700"><Plus className="w-3.5 h-3.5" /></button>
          </div>
        </div>
        <div className="border border-orange-200 rounded-xl p-2.5">
          <p className="text-[10px] font-bold text-orange-700 mb-1.5">PO PT</p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onChangePT(row.id, Math.max(0, row.poPT - 1))} className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-700"><Minus className="w-3.5 h-3.5" /></button>
            <input type="number" min="0" inputMode="numeric" value={row.poPT} onChange={(e) => onChangePT(row.id, Math.max(0, Number(e.target.value) || 0))} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 text-center text-sm font-bold border border-slate-200 rounded-lg py-1.5 text-slate-800" />
            <button type="button" onClick={() => onChangePT(row.id, row.poPT + 1)} className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-700"><Plus className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end">
        <p className="text-[11px] text-slate-400 font-medium">
          Total PO <span className="text-base font-bold text-slate-800 tabular-nums ml-1">{row.poCV + row.poPT}</span>
        </p>
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
          <div className="grid grid-cols-2 gap-2">
            <div className="skeleton h-16 rounded-lg" />
            <div className="skeleton h-16 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function POPage({ onBack }) {
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const loading = stockCV.loading || stockPT.loading;
  const refresh = () => {
    try { stockCV.refresh({ force: true }); } catch (_) {}
    try { stockPT.refresh({ force: true }); } catch (_) {}
  };
  const [tab, setTab] = useState('cs');
  const [phase, setPhase] = useState('review');
  const [draftItems, setDraftItems] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  const criticalCS = useMemo(() => [
    ...buildCritical(stockCV.items || [], 'CV', isCS),
    ...buildCritical(stockPT.items || [], 'PT', isCS),
  ].sort((a, b) => b.qty - a.qty), [stockCV.items, stockPT.items]);

  const criticalProduksi = useMemo(() => [
    ...buildCritical(stockCV.items || [], 'CV', isProduksi),
    ...buildCritical(stockPT.items || [], 'PT', isProduksi),
  ].sort((a, b) => b.qty - a.qty), [stockCV.items, stockPT.items]);

  const activeCritical = tab === 'cs' ? criticalCS : criticalProduksi;
  const defaultArrival = useMemo(() => dateParts(2).iso, []);
  const [mergedRows, setMergedRows] = useState([]);
  const activeCount = mergedRows.filter((r) => r.poCV + r.poPT > 0).length;

  useEffect(() => {
    if (loading) return;
    if (initialized) return;
    try {
      const draft = activeCritical.map((i) => ({ ...i }));
      setDraftItems(draft);
      setMergedRows(buildMergedRows(draft, defaultArrival));
      setInitialized(true);
    } catch (err) {
      console.error('[POPage] init failed', err);
      setDraftItems([]);
      setMergedRows([]);
      setInitialized(true);
    }
  }, [loading, initialized, tab, defaultArrival, activeCritical]);

  const regenerate = useCallback(() => {
    const draft = activeCritical.map((i) => ({ ...i }));
    setDraftItems(draft);
    setMergedRows(buildMergedRows(draft, dateParts(2).iso));
    setPhase('review');
    setSubmitMsg('');
  }, [activeCritical]);

  const syncDraftFromMerged = (rows) => {
    const out = [];
    for (const r of rows) {
      if (r.poCV > 0 && r.kodeCV) {
        out.push({ id: `CV-${r.kodeCV}`, kode: r.kodeCV, nama: r.nama, size: r.size || '', satuan: r.satuan, divisi: r.divisi || '', entity: 'CV', qty: r.poCV, tglKedatangan: r.tglKedatangan });
      }
      if (r.poPT > 0 && r.kodePT) {
        out.push({ id: `PT-${r.kodePT}`, kode: r.kodePT, nama: r.nama, size: r.size || '', satuan: r.satuan, divisi: r.divisi || '', entity: 'PT', qty: r.poPT, tglKedatangan: r.tglKedatangan });
      }
    }
    setDraftItems(out);
  };

  const updateMergedCV = (id, qty) => {
    setMergedRows((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, poCV: qty, total: qty + r.poPT } : r));
      syncDraftFromMerged(next);
      return next;
    });
  };
  const updateMergedPT = (id, qty) => {
    setMergedRows((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, poPT: qty, total: r.poCV + qty } : r));
      syncDraftFromMerged(next);
      return next;
    });
  };
  const updateMergedTgl = (id, tgl) => {
    setMergedRows((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, tglKedatangan: tgl } : r));
      syncDraftFromMerged(next);
      return next;
    });
  };
  const removeMerged = (id) => {
    setMergedRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      syncDraftFromMerged(next);
      return next;
    });
  };

  const switchTab = (nextTab) => {
    if (nextTab === tab) return;
    setTab(nextTab);
    setInitialized(false);
    setDraftItems([]);
    setMergedRows([]);
    setPhase('review');
    setSubmitMsg('');
  };

  const handleSubmit = async () => {
    const active = mergedRows.filter((r) => r.poCV + r.poPT > 0);
    if (submitting || active.length === 0) return;
    setSubmitting(true);
    setSubmitMsg('Menyimpan PO...');
    try {
      const today = dateParts(0);
      // Backend production mensyaratkan poCV/poPT (bukan hanya qty+entity).
      // Satu baris merged = satu item Final PO dengan kedua kolom CV/PT.
      const items = active.map((r) => ({
        kode: r.kodeCV || r.kodePT || '',
        kodeCV: r.kodeCV || '',
        kodePT: r.kodePT || '',
        nama: r.nama,
        size: r.size || '',
        satuan: r.satuan || 'Pack',
        divisi: r.divisi || '',
        entity: r.poCV > 0 && r.poPT > 0 ? 'BOTH' : r.poCV > 0 ? 'CV' : 'PT',
        entitas: r.poCV > 0 && r.poPT > 0 ? 'BOTH' : r.poCV > 0 ? 'CV' : 'PT',
        qty: Number(r.poCV || 0) + Number(r.poPT || 0),
        poCV: Number(r.poCV || 0),
        poPT: Number(r.poPT || 0),
        tglKedatangan: r.tglKedatangan || defaultArrival,
      }));
      const payload = {
        action: 'submitPO',
        tipe: tab === 'cs' ? 'CS' : 'PRODUKSI',
        tanggal: today.iso,
        tglKedatangan: items[0]?.tglKedatangan || defaultArrival,
        items,
        requestId: `PO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      const res = await submitPO(payload);
      if (res && (res.success === true || res.status === 'OK' || res.status === 'APPLIED' || res.status === 'COMMITTED' || res.status === 'SAVED' || res.code === 'PO_WRITE_APPLIED')) {
        setPhase('saved');
        setSubmitMsg(res.message || 'PO berhasil disimpan ke sheet purchase order.');
      } else {
        setSubmitMsg(res?.error || res?.message || 'Gagal menyimpan PO. Coba lagi.');
      }
    } catch (err) {
      setSubmitMsg(err?.message || 'Gagal menyimpan PO.');
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'saved') {
    return (
      <div className="pb-4 animate-fade-in space-y-4">
        <div className="card p-6 text-center space-y-3">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
          <p className="text-base font-bold text-slate-800">PO berhasil disimpan</p>
          <p className="text-xs text-slate-500">{submitMsg}</p>
          <button type="button" onClick={() => { setPhase('review'); setInitialized(false); setSubmitMsg(''); }} className="mt-2 px-4 py-2.5 rounded-xl bg-[#0b2a55] text-white text-sm font-semibold">Buat PO baru</button>
          {onBack && (<button type="button" onClick={onBack} className="block w-full mt-1 px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600">Kembali</button>)}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 animate-fade-in space-y-4">
      <div className="flex items-center gap-3">
        {onBack && (
          <button type="button" onClick={onBack} className="size-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-700" aria-label="Kembali">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold text-slate-900">Purchase Order</h1>
          <p className="text-xs text-slate-500 font-medium">Edit jumlah dan tanggal kedatangan setiap item</p>
        </div>
        <button type="button" onClick={() => { refresh(); setInitialized(false); }} className="size-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-700" aria-label="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => switchTab('cs')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 border transition-all ${tab === 'cs' ? 'bg-cyan-500 text-white border-cyan-500 shadow-sm' : 'bg-white border-slate-100 text-slate-600 shadow-sm'}`}>
          <Snowflake className="w-4 h-4" /> PO CS
        </button>
        <button type="button" onClick={() => switchTab('produksi')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 border transition-all ${tab === 'produksi' ? 'bg-orange-500 text-white border-orange-500 shadow-sm' : 'bg-white border-slate-100 text-slate-600 shadow-sm'}`}>
          <ChefHat className="w-4 h-4" /> PO Produksi
        </button>
      </div>

      {loading || !initialized ? (
        <SkeletonCards />
      ) : (
        <>
          <div className="surface-flat flex items-center justify-between px-4 py-3">
            <p className="text-xs font-semibold text-slate-600">{activeCount} item · tgl kedatangan per item</p>
            <button type="button" onClick={regenerate} className="text-xs font-bold text-cyan-600">Regenerate</button>
          </div>

          <div className="space-y-2">
            {mergedRows.filter((r) => r.poCV + r.poPT > 0).map((row) => (
              <MergedItemCard key={row.id} row={row} onChangeCV={updateMergedCV} onChangePT={updateMergedPT} onChangeTgl={updateMergedTgl} onRemove={removeMerged} />
            ))}
            {activeCount === 0 && (
              <div className="card p-6 text-center text-sm text-slate-500">Tidak ada item di bawah stok aman.</div>
            )}
          </div>

          {activeCount > 0 && (
            <div className="sticky bottom-16 pt-2">
              <button type="button" onClick={handleSubmit} disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold shadow-lg shadow-cyan-500/25 active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-2">
                {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan…</>) : (<><Send className="w-4 h-4" /> Kirim PO ({activeCount})</>)}
              </button>
              {submitMsg && <p className="text-center text-xs text-slate-500 mt-2">{submitMsg}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
