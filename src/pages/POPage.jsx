import { useState, useMemo, useEffect, useRef } from 'react';
import { useBootstrapRevision } from '../hooks/useBootstrapRevision';
import { useStock } from '../hooks/useStock';
import {
  FileText, Trash2, Plus, Minus, Download, ShoppingCart,
  CheckCircle, Snowflake, ChefHat, Loader2, CloudUpload,
  FilePlus2, CalendarDays, CalendarClock, ClipboardCheck, ChevronLeft,
} from 'lucide-react';
import { submitPO } from '../data/api';
import { StatusPOHubPanel } from '../components/StatusPOHub';

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
      if (!aman) return false;
      return Number(i.stok) < aman;
    })
    .map((i) => {
      const aman = getAman(i);
      const stok = Number(i.stok) || 0;
      const kurang = Math.max(0, aman - stok);
      return { ...i, entity, aman, kurang, suggestQty: kurang };
    })
    .sort((a, b) => b.kurang - a.kurang);
}
function formatTglKedatangan(baseDate) {
  const d = baseDate ? new Date(baseDate) : new Date();
  if (!baseDate) d.setDate(d.getDate() + 2);
  if (Number.isNaN(d.getTime())) {
    const f = new Date();
    f.setDate(f.getDate() + 2);
    return formatTglKedatangan(localISODate(f));
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  return `${dd}-${mon}-${d.getFullYear()}`;
}
function defaultTglISO() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return localISODate(d);
}

function localISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const PO_DRAFT_KEY = 'gudangai_po_draft_v1';

function persistPODraft(draft) {
  if (!draft) return;
  try { localStorage.setItem(PO_DRAFT_KEY, JSON.stringify(draft)); } catch (_) {
    // Draft persistence is best-effort and must not block PO editing.
  }
}

function loadPODraft() {
  try {
    const raw = JSON.parse(localStorage.getItem(PO_DRAFT_KEY) || 'null');
    if (!raw || raw.version !== 1) return {};
    const safeItems = (items) => Array.isArray(items) ? items.slice(0, 500).filter((item) => item && item.kode && item.entity).map((item) => ({
      kode: String(item.kode), nama: String(item.nama || ''), entity: item.entity === 'PT' ? 'PT' : 'CV',
      satuan: String(item.satuan || 'Pack'), size: String(item.size || ''), sisa: Number(item.sisa) || 0,
      aman: Number(item.aman) || 0, qty: item.qty == null ? 0 : item.qty,
      tglKedatangan: String(item.tglKedatangan || ''), divisi: String(item.divisi || ''),
    })) : [];
    return {
      hub: ['generate', 'current', 'previous', 'confirm'].includes(raw.hub) ? raw.hub : null,
      tab: raw.tab === 'produksi' ? 'produksi' : 'cs',
      csItems: safeItems(raw.csItems),
      prodItems: safeItems(raw.prodItems),
      csGenerated: !!raw.csGenerated,
      prodGenerated: !!raw.prodGenerated,
    };
  } catch (_) { return {}; }
}
function formatTglHeader() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][d.getMonth()];
  return `${dd} ${mm} ${d.getFullYear()}`;
}
function buildSheetTSV(items) {
  const map = new Map();
  items.forEach((it) => {
    const key = String(it.nama || it.kode).trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, { nama: it.nama, size: it.size || '', satuan: it.satuan || 'Pack', poCV: 0, poPT: 0, tglKedatangan: it.tglKedatangan || defaultTglISO() });
    }
    const row = map.get(key);
    if (it.entity === 'CV') row.poCV += Number(it.qty) || 0;
    else row.poPT += Number(it.qty) || 0;
    if (it.tglKedatangan) row.tglKedatangan = it.tglKedatangan;
  });
  return Array.from(map.values()).filter((r) => r.poCV + r.poPT > 0).map((r, idx) => {
    const total = r.poCV + r.poPT;
    return [idx + 1, r.nama, r.size, r.satuan, r.poCV || 0, r.poPT || 0, total, formatTglKedatangan(r.tglKedatangan)].join('\t');
  }).join('\n');
}
function buildReadablePO(items, title) {
  let text = `PURCHASE ORDER (PRODIS) — ${title}\nTANGGAL : ${formatTglHeader()}\n\n`;
  text += 'NO\tNAMA BARANG\tSIZE\tSATUAN\tPO CV\tPO PT\tTOTAL\tTGL KEDATANGAN\n';
  text += buildSheetTSV(items);
  text += `\n\nDibuat oleh: Rudi Virawan\nMengetahui: Heri Suprijanto`;
  return text;
}
function ItemCard({ item, onUpdate, onRemove, editable }) {
  return (
    <div className="stock-card bg-white rounded-xl px-2.5 py-2 border border-slate-200 shadow-sm">
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded shrink-0 ${item.entity === 'CV' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>{item.entity}</span>
            <p className="text-[13px] font-bold text-slate-900 leading-tight truncate">{item.nama}</p>
          </div>
          
        </div>
        {editable && (
          <button type="button" onClick={() => onRemove(item)} className="p-1 rounded-lg text-slate-400 hover:text-red-500 shrink-0" aria-label="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {editable ? (
          <>
            <button type="button" onClick={() => onUpdate(item, { qty: Math.max(0, (Number(item.qty) || 0) - 1) })} className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold"><Minus className="w-3.5 h-3.5" /></button>
            <input type="number" inputMode="numeric" value={item.qty ?? 0} onChange={(e) => onUpdate(item, { qty: e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0) })} className="w-14 text-center text-sm font-extrabold text-slate-900 tabular-nums border border-slate-200 rounded-lg py-1 bg-slate-50" />
            <button type="button" onClick={() => onUpdate(item, { qty: (Number(item.qty) || 0) + 1 })} className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold"><Plus className="w-3.5 h-3.5" /></button>
          </>
        ) : (
          <span className="text-sm font-extrabold text-slate-900 tabular-nums">{item.qty ?? item.kurang}</span>
        )}
        <div className="flex-1" />
        <label className="flex items-center gap-1 shrink-0">
          
          <input type="date" value={item.tglKedatangan || defaultTglISO()} onChange={(e) => onUpdate && onUpdate(item, { tglKedatangan: e.target.value })} disabled={!editable} className="text-[11px] font-semibold text-slate-800 border border-slate-200 rounded-lg px-1.5 py-1 bg-white max-w-[8.5rem]" />
        </label>
      </div>
    </div>
  );
}

export default function POPage({ onNavigate }) {
  const [initialDraft] = useState(loadPODraft);
  const [density, setDensity] = useState(() => localStorage.getItem('gudangai_density') || 'comfortable');
  const [hub, setHub] = useState(initialDraft.hub ?? null);
  const gapClass = density === 'compact' ? 'space-y-1.5' : 'space-y-2.5';
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const bootstrapRevision = useBootstrapRevision();
  useEffect(() => {
    if (!bootstrapRevision) return;
    stockCV.refresh?.({ force: true });
    stockPT.refresh?.({ force: true });
  }, [bootstrapRevision]);
  const [tab, setTab] = useState(initialDraft.tab || 'cs');
  const [csItems, setCsItems] = useState(initialDraft.csItems || []);
  const [prodItems, setProdItems] = useState(initialDraft.prodItems || []);
  const [csGenerated, setCsGenerated] = useState(!!initialDraft.csGenerated);
  const [prodGenerated, setProdGenerated] = useState(!!initialDraft.prodGenerated);
  const [copied, setCopied] = useState(false);
  const [poSaved, setPoSaved] = useState(false);
  const [savingPO, setSavingPO] = useState(false);
  const [poSaveMessage, setPoSaveMessage] = useState(() => (initialDraft.csGenerated || initialDraft.prodGenerated) ? 'Draft PO dipulihkan dari perangkat.' : '');
  const poDraftSnapshotRef = useRef(null);
  useEffect(() => {
    const draft = {
      version: 1, savedAt: Date.now(), hub, tab, csItems, prodItems, csGenerated, prodGenerated,
    };
    poDraftSnapshotRef.current = draft;
    const timer = setTimeout(() => persistPODraft(draft), 200);
    return () => clearTimeout(timer);
  }, [hub, tab, csItems, prodItems, csGenerated, prodGenerated]);

  useEffect(() => {
    const flushDraft = () => persistPODraft(poDraftSnapshotRef.current);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushDraft();
    };
    window.addEventListener('pagehide', flushDraft);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushDraft);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flushDraft();
    };
  }, []);
  const criticalCS = useMemo(() => {
    const cv = buildCritical(stockCV.items, 'CV', isCS);
    const pt = buildCritical(stockPT.items, 'PT', isCS);
    return [...cv, ...pt].sort((a, b) => b.kurang - a.kurang);
  }, [stockCV.items, stockPT.items]);
  const criticalProd = useMemo(() => {
    const cv = buildCritical(stockCV.items, 'CV', isProduksi);
    const pt = buildCritical(stockPT.items, 'PT', isProduksi);
    return [...cv, ...pt].sort((a, b) => b.kurang - a.kurang);
  }, [stockCV.items, stockPT.items]);
  const loading = stockCV.loading || stockPT.loading;
  const activeList = tab === 'cs' ? criticalCS : criticalProd;
  const generated = tab === 'cs' ? csGenerated : prodGenerated;
  const editList = tab === 'cs' ? csItems : prodItems;
  const generate = () => {
    setPoSaved(false); setCopied(false); setPoSaveMessage('');
    const src = tab === 'cs' ? criticalCS : criticalProd;
    const mapped = src.map((i) => ({ kode: i.kode, nama: i.nama, entity: i.entity, satuan: i.satuan || 'Pack', size: i.size || i.ukuran || '', sisa: i.stok, aman: i.aman, qty: i.suggestQty, tglKedatangan: defaultTglISO(), divisi: i.divisi }));
    if (tab === 'cs') { setCsItems(mapped); setCsGenerated(true); }
    else { setProdItems(mapped); setProdGenerated(true); }
  };
  const onUpdateItem = (item, patch) => {
    setPoSaved(false);
    const setter = tab === 'cs' ? setCsItems : setProdItems;
    setter((p) => p.map((i) => (i.kode === item.kode && i.entity === item.entity ? { ...i, ...patch } : i)));
  };
  const onRemoveItem = (item) => {
    setPoSaved(false);
    const setter = tab === 'cs' ? setCsItems : setProdItems;
    setter((p) => p.filter((i) => !(i.kode === item.kode && i.entity === item.entity)));
  };
  const copyPO = async () => {
    const title = tab === 'cs' ? 'DIVISI CS (Cold Storage)' : 'TEAM PRODUKSI';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(buildReadablePO(editList, title));
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    } catch (_) { setCopied(false); }
  };
  const copySheetOnly = async () => {
    if (savingPO) return;
    const tsv = buildSheetTSV(editList);
    if (!tsv.trim()) { setPoSaveMessage('Tidak ada item dengan qty lebih dari 0.'); return; }
    const items = tsv.split('\n').map((line) => line.split('\t')).map((r) => ({
      no: Number(r[0]) || 0, nama: String(r[1] || '').trim(), size: String(r[2] || '').trim(), satuan: String(r[3] || 'Pack').trim(),
      poCV: Number(r[4]) || 0, poPT: Number(r[5]) || 0, total: Number(r[6]) || 0, tanggalKedatangan: String(r[7] || '').trim(),
    })).filter((r) => r.nama && r.total > 0);
    if (!items.length) { setPoSaveMessage('PO tidak dikirim: qty seluruh item kosong atau nol.'); return; }
    setSavingPO(true); setPoSaveMessage('Mengirim PO ke Spreadsheet utama…');
    try {
      const poDate = localISODate();
      const res = await submitPO({ items, tanggal: poDate, noPO: 'PO-' + poDate + '-' + (tab === 'cs' ? 'CS' : 'PROD'), deviceId: 'gudangai-rudy-pwa' });
      if (res?.success === true && (res.writeOccurred === true || res.status === 'APPLIED' || res.code === 'IDEMPOTENT_REPLAY')) {
        setPoSaveMessage('Tersimpan dan dikonfirmasi backend: ' + (res.count ?? items.length) + ' item ke sheet ' + (res.sheet || 'purchase order') + '.');
        setPoSaved(true); setCopied(false);
      } else {
        setPoSaveMessage('BELUM TERKONFIRMASI — ' + (res?.error || res?.code || 'backend belum memastikan penulisan').toString());
        setPoSaved(false); setCopied(false);
      }
    } catch (err) {
      setPoSaveMessage('Gagal mengirim PO: ' + (err?.message || 'kesalahan tidak diketahui'));
      setPoSaved(false); setCopied(false);
    } finally { setSavingPO(false); }
  };
  const totalKurang = activeList.reduce((s, i) => s + i.kurang, 0);
  const hubs = [
    { id: 'generate', title: 'PO', Icon: FilePlus2 },
    { id: 'current', title: 'PO Minggu Ini', Icon: CalendarDays },
    { id: 'previous', title: 'PO Minggu Lalu', Icon: CalendarClock },
    { id: 'confirm', title: 'Konfirmasi PO', Icon: ClipboardCheck },
  ];
  return (
    <div className="pb-28 animate-fade-in po-page">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h2 className="text-[22px] leading-7 font-extrabold text-slate-900">Purchase order</h2>
        </div>
        {hub && (
          <button type="button" onClick={() => setHub(null)} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm shrink-0 flex items-center gap-1">
            <ChevronLeft className="w-3.5 h-3.5" /> Semua kartu
          </button>
        )}
      </div>
      <div className="po-hub-grid mb-3">
        {hubs.map((h) => {
          const Icon = h.Icon;
          return (
            <button key={h.id} type="button" onClick={() => setHub(h.id)} className={`po-hub-card-btn ${hub === h.id ? 'is-active' : ''}`}>
              <div className="flex flex-col items-center text-center gap-2 mb-1"><Icon className="po-hub-icon w-5 h-5" aria-hidden="true" /><span className="hub-title">{h.title}</span></div>
            </button>
          );
        })}
      </div>
      {hub === 'generate' && (
        <>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-slate-900">PO Generator</h3>
            </div>
            <button type="button" onClick={() => { const next = density === 'compact' ? 'comfortable' : 'compact'; setDensity(next); try { localStorage.setItem('gudangai_density', next); } catch (_) {} }} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm">{density === 'compact' ? 'Grid padat' : 'Grid longgar'}</button>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button type="button" onClick={() => setTab('cs')} className={`po-generator-tab po-generator-tab-cs rounded-xl px-3 py-3 flex items-center gap-2 border-2 ${tab === 'cs' ? 'is-active' : ''}`}>
              <Snowflake className="po-generator-tab-icon w-5 h-5" aria-hidden="true" />
              <div className="text-left"><p className="po-generator-tab-title text-xs font-bold">PO CS</p></div>
            </button>
            <button type="button" onClick={() => setTab('produksi')} className={`po-generator-tab po-generator-tab-produksi rounded-xl px-3 py-3 flex items-center gap-2 border-2 ${tab === 'produksi' ? 'is-active' : ''}`}>
              <ChefHat className="po-generator-tab-icon w-5 h-5" aria-hidden="true" />
              <div className="text-left"><p className="po-generator-tab-title text-xs font-bold">PO Produksi</p></div>
            </button>
          </div>
          <section className={`po-recommendation-panel po-recommendation-${tab} mb-3`}>
            <div className="po-recommendation-heading"><ShoppingCart className="po-recommendation-icon" aria-hidden="true" /><p className="text-sm font-bold">{tab === 'cs' ? 'Rekomendasi PO · CS' : 'Rekomendasi PO · Produksi'}</p></div>
            <div className="po-recommendation-metrics" aria-label="Ringkasan rekomendasi PO">
              <strong aria-label="Jumlah item kritis">{loading ? '…' : activeList.length}</strong>
              <strong aria-label="Total kekurangan">{loading ? '…' : totalKurang.toLocaleString('id-ID')}</strong>
            </div>
          </section>
          {!generated ? (
            <>
              {loading ? <div className={gapClass}>{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
              : activeList.length === 0 ? <div className="text-center py-12"><CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" /><p className="text-slate-600 text-sm">{tab === 'cs' ? 'Stok CS aman!' : 'Tidak ada item produksi kritis'}</p></div>
              : <div className={`${gapClass} mb-2`}>{activeList.map((item) => <ItemCard key={`${item.entity}-${item.kode}`} item={{ ...item, qty: item.kurang, tglKedatangan: defaultTglISO() }} editable={false} />)}</div>}
              {activeList.length > 0 && !loading && (
                <button type="button" onClick={generate} className="w-full py-3 rounded-xl bg-cyan-700 text-white text-sm font-extrabold shadow-md">Generate keranjang PO</button>
              )}
            </>
          ) : (
            <>
              <div className={`${gapClass} mb-2`}>{editList.map((item) => <ItemCard key={`${item.entity}-${item.kode}`} item={item} editable onUpdate={onUpdateItem} onRemove={onRemoveItem} />)}</div>
              {poSaveMessage && <p className={`text-[11px] text-center mb-2 font-semibold ${poSaveMessage.startsWith('Tersimpan') ? 'text-emerald-700' : 'text-amber-700'}`}>{poSaveMessage}</p>}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={copyPO} className="py-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700">{copied ? 'Tersalin' : 'Salin teks'}</button>
                <button type="button" onClick={copySheetOnly} disabled={savingPO} className="py-3 rounded-xl bg-[#0f8c91] text-white text-sm font-extrabold disabled:opacity-50">{savingPO ? 'Menyimpan…' : (poSaved ? 'Tersimpan' : 'Simpan ke Sheet')}</button>
              </div>
            </>
          )}
        </>
      )}
      {(hub === 'current' || hub === 'previous' || hub === 'confirm') && (
        <StatusPOHubPanel mode={hub} />
      )}
    </div>
  );
}
