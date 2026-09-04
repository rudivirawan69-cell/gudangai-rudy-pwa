import { useState, useMemo } from 'react';
import { useStock } from '../hooks/useStock';
import {
  FileText, Trash2, Plus, Minus, Download, ShoppingCart,
  CheckCircle, Snowflake, ChefHat,
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
      if (!aman) return false;
      return Number(i.stok) < aman;
    })
    .map((i) => {
      const aman = getAman(i);
      const stok = Number(i.stok) || 0;
      const kurang = Math.max(0, aman - stok);
      return {
        ...i,
        entity,
        aman,
        kurang,
        suggestQty: kurang,
      };
    })
    .sort((a, b) => b.kurang - a.kurang);
}

function formatTglKedatangan() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd} Sep ${yyyy}`.replace('Sep', ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][d.getMonth()]);
}

function formatTglHeader() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][d.getMonth()];
  return `${dd} ${mm} ${d.getFullYear()}`;
}

/** TSV kolom B–I (mulai baris 6 sheet purchase order). */
function buildSheetTSV(items) {
  const tgl = formatTglKedatangan();
  const map = new Map();
  items.forEach((it) => {
    const key = String(it.nama || it.kode).trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        nama: it.nama,
        size: it.size || '',
        satuan: it.satuan || 'Pack',
        poCV: 0,
        poPT: 0,
      });
    }
    const row = map.get(key);
    if (it.entity === 'CV') row.poCV += Number(it.qty) || 0;
    else row.poPT += Number(it.qty) || 0;
  });
  const rows = Array.from(map.values()).filter((r) => r.poCV + r.poPT > 0);
  return rows
    .map((r, idx) => {
      const total = r.poCV + r.poPT;
      return [idx + 1, r.nama, r.size, r.satuan, r.poCV || 0, r.poPT || 0, total, tgl].join('\t');
    })
    .join('\n');
}

function buildReadablePO(items, title) {
  const tgl = formatTglHeader();
  let text = `PURCHASE ORDER (PRODIS) — ${title}\nTANGGAL : ${tgl}\n\n`;
  text += 'NO\tNAMA BARANG\tSIZE\tSATUAN\tPO CV\tPO PT\tTOTAL\tTGL KEDATANGAN\n';
  text += buildSheetTSV(items);
  text += `\n\nDibuat oleh: Rudi Virawan\nMengetahui: Heri Suprijanto`;
  return text;
}

function ItemCard({ item, onUpdate, onRemove, editable }) {
  return (
    <div className="bg-white rounded-xl px-2.5 py-2 border border-gray-100 shadow-sm">
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`text-[8px] font-bold px-1 py-0.5 rounded shrink-0 ${
              item.entity === 'CV' ? 'bg-blue-100 text-blue-600' : 'bg-violet-100 text-violet-600'
            }`}>{item.entity}</span>
            <p className="text-[11px] font-medium text-gray-800 truncate">{item.nama}</p>
          </div>
          <p className="text-[9px] text-gray-400 mt-0.5">
            {item.kode} · sisa {item.sisa ?? item.stok}/{item.aman}
          </p>
        </div>
        {editable ? (
          <button type="button" onClick={() => onRemove(item.kode)} className="text-gray-300 p-0.5">
            <Trash2 className="w-3 h-3" />
          </button>
        ) : (
          <span className="text-xs font-bold text-red-600 shrink-0">-{item.kurang}</span>
        )}
      </div>
      {editable && (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onUpdate(item.kode, item.qty - 10)}
            className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center">
            <Minus className="w-3 h-3 text-gray-500" />
          </button>
          <input
            type="number" min="0" value={item.qty}
            onChange={(e) => onUpdate(item.kode, parseInt(e.target.value, 10) || 0)}
            className="w-14 text-center text-xs font-bold border border-gray-200 rounded-lg py-1"
          />
          <button type="button" onClick={() => onUpdate(item.kode, item.qty + 10)}
            className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center">
            <Plus className="w-3 h-3 text-gray-500" />
          </button>
          <span className="text-[9px] text-gray-400 ml-1">{item.satuan}</span>
        </div>
      )}
    </div>
  );
}

export default function POPage() {
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const [tab, setTab] = useState('cs');
  const [csItems, setCsItems] = useState([]);
  const [prodItems, setProdItems] = useState([]);
  const [csGenerated, setCsGenerated] = useState(false);
  const [prodGenerated, setProdGenerated] = useState(false);
  const [copied, setCopied] = useState(false);

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
    const src = tab === 'cs' ? criticalCS : criticalProd;
    const mapped = src.map((i) => ({
      kode: i.kode,
      nama: i.nama,
      entity: i.entity,
      satuan: i.satuan || 'Pack',
      size: i.size || '',
      sisa: i.stok,
      aman: i.aman,
      qty: i.suggestQty,
      divisi: i.divisi,
    }));
    if (tab === 'cs') {
      setCsItems(mapped);
      setCsGenerated(true);
    } else {
      setProdItems(mapped);
      setProdGenerated(true);
    }
  };

  const updateQty = (kode, qty) => {
    const setter = tab === 'cs' ? setCsItems : setProdItems;
    setter((p) => p.map((i) => (i.kode === kode ? { ...i, qty: Math.max(0, qty) } : i)));
  };
  const removeItem = (kode) => {
    const setter = tab === 'cs' ? setCsItems : setProdItems;
    setter((p) => p.filter((i) => i.kode !== kode));
  };

  const copyPO = async () => {
    const title = tab === 'cs' ? 'DIVISI CS (Cold Storage)' : 'TEAM PRODUKSI';
    const text = buildReadablePO(editList, title);
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {
      setCopied(false);
    }
  };

  const copySheetOnly = async () => {
    const tsv = buildSheetTSV(editList);
    try {
      await navigator.clipboard?.writeText(tsv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {}
  };

  const totalKurang = activeList.reduce((s, i) => s + i.kurang, 0);

  return (
    <div className="pb-28 animate-fade-in">
      <h2 className="text-lg font-bold text-gray-800 mb-1">PO Generator</h2>
      <p className="text-xs text-gray-400 mb-3">
        2 jalur: <b>PO CS</b> (beli cold storage) · <b>PO Produksi</b> (prioritas proses)
      </p>

      {/* Sticky header: tabs + rekomendasi PO */}
      <div className="sticky top-0 z-20 -mx-0.5 px-0.5 pt-0.5 pb-3 mb-1 bg-slate-100/95 backdrop-blur-md">
        <div className="grid grid-cols-2 gap-2 mb-2.5">
          <button
            type="button"
            onClick={() => setTab('cs')}
            className={`rounded-xl px-3 py-3 flex items-center gap-2 border-2 transition-all ${
              tab === 'cs'
                ? 'border-cyan-500 bg-cyan-50 shadow-sm'
                : 'border-gray-100 bg-white'
            }`}
          >
            <Snowflake className={`w-5 h-5 ${tab === 'cs' ? 'text-cyan-600' : 'text-gray-400'}`} />
            <div className="text-left min-w-0">
              <p className={`text-xs font-bold ${tab === 'cs' ? 'text-cyan-800' : 'text-gray-700'}`}>PO CS</p>
              <p className="text-[9px] text-gray-400 truncate">Cold Storage · ke sheet PO</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setTab('produksi')}
            className={`rounded-xl px-3 py-3 flex items-center gap-2 border-2 transition-all ${
              tab === 'produksi'
                ? 'border-orange-500 bg-orange-50 shadow-sm'
                : 'border-gray-100 bg-white'
            }`}
          >
            <ChefHat className={`w-5 h-5 ${tab === 'produksi' ? 'text-orange-600' : 'text-gray-400'}`} />
            <div className="text-left min-w-0">
              <p className={`text-xs font-bold ${tab === 'produksi' ? 'text-orange-800' : 'text-gray-700'}`}>PO Produksi</p>
              <p className="text-[9px] text-gray-400 truncate">Prioritas proses dapur</p>
            </div>
          </button>
        </div>

        <div className={`rounded-2xl p-4 text-white bg-gradient-to-br shadow-lg ${
          tab === 'cs' ? 'from-cyan-700 to-[#0b2a55]' : 'from-orange-600 to-amber-800'
        }`}>
          <div className="flex items-center gap-3 mb-3">
            <ShoppingCart className="w-6 h-6 text-white/90" />
            <div>
              <p className="text-sm font-bold">
                {tab === 'cs' ? 'Rekomendasi PO · Divisi CS' : 'Prioritas · Team Produksi'}
              </p>
              <p className="text-[11px] text-white/70">
                {tab === 'cs'
                  ? 'Stok kritis CS → generate ke purchase order'
                  : 'Item non-CS / non-rekanan yang harus diproses dulu'}
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <p className="text-white/50 text-[10px] uppercase">Item Kritis</p>
              <p className="text-2xl font-bold">{loading ? '…' : activeList.length}</p>
            </div>
            <div className="flex-1">
              <p className="text-white/50 text-[10px] uppercase">Total Kurang</p>
              <p className="text-2xl font-bold">{loading ? '…' : totalKurang.toLocaleString('id-ID')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      {!generated ? (
        <>
          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : activeList.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                {tab === 'cs' ? 'Stok CS aman!' : 'Tidak ada item produksi kritis'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 mb-2">
              {activeList.map((item) => (
                <ItemCard key={`${item.entity}-${item.kode}`} item={item} editable={false} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="space-y-1.5 mb-2">
            {editList.map((item) => (
              <ItemCard
                key={`${item.entity}-${item.kode}`}
                item={item}
                editable
                onUpdate={updateQty}
                onRemove={removeItem}
              />
            ))}
          </div>
          <p className="text-[10px] text-gray-400 text-center mb-2">
            Dibuat oleh: <b>Rudi Virawan</b> · Mengetahui: <b>Heri Suprijanto</b>
          </p>
        </>
      )}

      <div className="fixed bottom-[4.25rem] left-0 right-0 z-40 px-3 pointer-events-none">
        <div className="max-w-lg mx-auto pointer-events-auto space-y-2">
          {!generated ? (
            <button
              type="button"
              onClick={generate}
              disabled={loading || activeList.length === 0}
              className={`w-full py-3.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 shadow-xl disabled:opacity-50 ${
                tab === 'cs'
                  ? 'bg-gradient-to-r from-cyan-600 to-[#0b2a55]'
                  : 'bg-gradient-to-r from-orange-500 to-amber-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              Generate {tab === 'cs' ? 'PO CS' : 'PO Produksi'} ({activeList.length} item)
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => (tab === 'cs' ? setCsGenerated(false) : setProdGenerated(false))}
                className="flex-1 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-medium shadow"
              >
                Kembali
              </button>
              {tab === 'cs' && (
                <button
                  type="button"
                  onClick={copySheetOnly}
                  className="flex-1 py-3 rounded-xl bg-cyan-600 text-white text-xs font-semibold flex items-center justify-center gap-1 shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  {copied ? 'Tersalin!' : 'Salin ke Sheet'}
                </button>
              )}
              <button
                type="button"
                onClick={copyPO}
                className={`flex-1 py-3 rounded-xl text-white text-xs font-semibold flex items-center justify-center gap-1 shadow ${
                  copied ? 'bg-emerald-500' : tab === 'cs' ? 'bg-[#0b2a55]' : 'bg-orange-600'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                {copied ? 'OK' : 'Salin PO'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
