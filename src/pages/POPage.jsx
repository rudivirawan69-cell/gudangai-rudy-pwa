import { useState, useMemo } from 'react';
import { useStock } from '../hooks/useStock';
import { FileText, Send, Trash2, Plus, Minus, Download, ShoppingCart, CheckCircle, Loader2 } from 'lucide-react';

const STOCK_AMAN = {"CV-0001":2500,"CV-0002":500,"CV-0003":500,"CV-0005":850,"CV-0007":350,"CV-0009":150,"CV-0010":550,"CV-0012":850,"CV-0013":500,"CV-0014":750,"CV-0015":650,"CV-0016":300,"CV-0017":300,"CV-0018":250,"CV-0020":450,"CV-0021":450,"CV-0022":250,"CV-0023":350,"CV-0024":300,"CV-0025":150,"CV-0026":75,"CV-0027":500,"CV-0030":15,"CV-0031":500,"CV-0032":125,"CV-0033":72,"CV-0037":400,"CV-0039":1850,"CV-0061":75,"CV-0062":10,"CV-0070":550,"CV-0071":500,"CV-0079":70,"CV-0083":250,"CV-0084":500,"CV-0085":650,"CV-0089":200,"CV-0091":240,"PT-0001":1500,"PT-0002":450,"PT-0005":250,"PT-0006":450,"PT-0008":150,"PT-0010":150,"PT-0011":450,"PT-0012":350,"PT-0013":350,"PT-0014":250,"PT-0015":500,"PT-0016":450,"PT-0017":400,"PT-0020":150,"PT-0021":250,"PT-0022":200,"PT-0024":95,"PT-0026":65,"PT-0028":250,"PT-0029":15,"PT-0030":1500,"PT-0032":125,"PT-0035":36,"PT-0037":125,"PT-0043":200,"PT-0044":150,"WK-0004":250,"WK-0008":125,"WK-0009":125,"WK-0010":450,"WK-0013":95,"WK-0016":80,"WK-0017":70,"WK-0019":85,"WK-0025":45,"WK-0026":15,"WK-0028":50,"WK-0029":45,"WK-0030":40,"WK-0031":35,"WK-0032":10,"WK-0038":500,"WK-0039":450,"WK-0040":350,"MM-0002":5,"MM-0004":125,"MM-0005":400,"MM-0006":25,"MM-0008":125,"MM-0009":120,"MM-0010":30,"MM-0011":20,"MM-0012":25,"MM-0013":30,"MM-0014":20,"MM-0015":25,"MM-0016":5};

export default function POPage() {
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const [poItems, setPoItems] = useState([]);
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);

  const criticalItems = useMemo(() => {
    const all = [
      ...stockCV.items.map(i => ({ ...i, entity: 'CV' })),
      ...stockPT.items.map(i => ({ ...i, entity: 'PT' })),
    ];
    return all.filter(i => {
      const aman = STOCK_AMAN[i.kode] || 0;
      if (!aman || i.kode.startsWith('BB')) return false;
      return i.stok < aman;
    }).map(i => ({
      ...i, aman: STOCK_AMAN[i.kode] || 0,
      kurang: (STOCK_AMAN[i.kode] || 0) - i.stok,
      suggestQty: Math.max(0, (STOCK_AMAN[i.kode] || 0) - i.stok),
    })).sort((a, b) => b.kurang - a.kurang);
  }, [stockCV.items, stockPT.items]);

  const generatePO = () => {
    setPoItems(criticalItems.map(i => ({ kode: i.kode, nama: i.nama, entity: i.entity, satuan: i.satuan, sisa: i.stok, aman: i.aman, qty: i.suggestQty })));
    setGenerated(true);
  };

  const updateQty = (kode, qty) => setPoItems(p => p.map(i => i.kode === kode ? { ...i, qty: Math.max(0, qty) } : i));
  const removeItem = (kode) => setPoItems(p => p.filter(i => i.kode !== kode));

  const totalItems = poItems.length;
  const totalQty = poItems.reduce((s, i) => s + i.qty, 0);
  const cvItems = poItems.filter(i => i.entity === 'CV');
  const ptItems = poItems.filter(i => i.entity === 'PT');
  const loading = stockCV.loading || stockPT.loading;

  const copyPO = () => {
    const now = new Date();
    const tgl = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    let text = `PURCHASE ORDER (PRODIS)\nTanggal: ${tgl}\n\nNO | NAMA BARANG | SATUAN | PO CV | PO PT | TOTAL\n`;
    text += '---|-------------|--------|-------|-------|------\n';
    poItems.forEach((it, idx) => {
      const poCV = it.entity === 'CV' ? it.qty : 0;
      const poPT = it.entity === 'PT' ? it.qty : 0;
      text += `${idx + 1} | ${it.nama} | ${it.satuan} | ${poCV} | ${poPT} | ${poCV + poPT}\n`;
    });
    text += `\nTotal: ${totalItems} item, ${totalQty} unit\n\nDibuat oleh: Rudi Virawan\nMengetahui: Heri Suprijanto`;
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div className="pb-4 animate-fade-in">
      <h2 className="text-lg font-bold text-gray-800 mb-1">PO Generator</h2>
      <p className="text-xs text-gray-400 mb-4">Auto-suggest dari stok kritis \u00b7 Edit qty lalu salin PO</p>

      {!generated ? (
        <>
          <div className="bg-gradient-to-br from-[#0b2a55] to-[#164e8a] rounded-2xl p-4 mb-4 text-white">
            <div className="flex items-center gap-3 mb-3">
              <ShoppingCart className="w-6 h-6 text-cyan-400" />
              <div>
                <p className="text-sm font-bold">Rekomendasi PO</p>
                <p className="text-[11px] text-cyan-300/70">Stok aktual vs batas aman</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <p className="text-cyan-300/50 text-[10px] uppercase">Item Kritis</p>
                <p className="text-2xl font-bold">{loading ? '...' : criticalItems.length}</p>
              </div>
              <div className="flex-1">
                <p className="text-cyan-300/50 text-[10px] uppercase">Total Kurang</p>
                <p className="text-2xl font-bold">{loading ? '...' : criticalItems.reduce((s, i) => s + i.kurang, 0).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : criticalItems.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Semua stok aman!</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5 mb-4 max-h-[50vh] overflow-y-auto">
                {criticalItems.slice(0, 25).map(item => (
                  <div key={item.kode} className="bg-white rounded-xl px-3 py-2 border border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold ${item.entity === 'CV' ? 'bg-blue-100 text-blue-600' : 'bg-violet-100 text-violet-600'}`}>{item.entity}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-800 truncate">{item.nama}</p>
                        <p className="text-[10px] text-gray-400">{item.kode} \u00b7 sisa {item.stok}/{item.aman}</p>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-red-600 shrink-0 ml-2">-{item.kurang}</p>
                  </div>
                ))}
              </div>
              <button onClick={generatePO} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#0b2a55] to-[#164e8a] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg">
                <FileText className="w-4 h-4" /> Generate PO ({criticalItems.length} item)
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <div className="flex gap-3 mb-4">
            <div className="flex-1 bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-blue-500 uppercase">CV</p>
              <p className="text-lg font-bold text-blue-700">{cvItems.length}</p>
            </div>
            <div className="flex-1 bg-violet-50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-violet-500 uppercase">PT</p>
              <p className="text-lg font-bold text-violet-700">{ptItems.length}</p>
            </div>
            <div className="flex-1 bg-emerald-50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-emerald-500 uppercase">Total</p>
              <p className="text-lg font-bold text-emerald-700">{totalQty.toLocaleString()}</p>
            </div>
          </div>

          <div className="space-y-1.5 mb-4 max-h-[55vh] overflow-y-auto">
            {poItems.map(item => (
              <div key={item.kode} className="bg-white rounded-xl px-3 py-2 border border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${item.entity === 'CV' ? 'bg-blue-100 text-blue-600' : 'bg-violet-100 text-violet-600'}`}>{item.entity}</span>
                    <span className="text-xs font-medium text-gray-800 truncate">{item.nama}</span>
                  </div>
                  <button onClick={() => removeItem(item.kode)} className="text-gray-300 hover:text-red-500 p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-16">{item.kode}</span>
                  <span className="text-[10px] text-gray-400">sisa:{item.sisa}</span>
                  <div className="flex-1" />
                  <button onClick={() => updateQty(item.kode, item.qty - 10)} className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-gray-500"><Minus className="w-3 h-3" /></button>
                  <input type="number" min="0" value={item.qty} onChange={e => updateQty(item.kode, parseInt(e.target.value) || 0)} className="w-16 text-center text-sm font-bold border border-gray-200 rounded-lg py-1 focus:outline-none focus:border-blue-400" />
                  <button onClick={() => updateQty(item.kode, item.qty + 10)} className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-gray-500"><Plus className="w-3 h-3" /></button>
                  <span className="text-[10px] text-gray-400 w-8">{item.satuan}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gray-50 rounded-xl p-3 mb-4 text-center">
            <p className="text-[10px] text-gray-400">Dibuat oleh: <b>Rudi Virawan</b> \u00b7 Mengetahui: <b>Heri Suprijanto</b></p>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setGenerated(false)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium">Kembali</button>
            <button onClick={copyPO} className={`flex-1 py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 ${copied ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#0b2a55] to-[#164e8a]'}`}>
              <Download className="w-4 h-4" /> {copied ? 'Tersalin!' : 'Salin PO'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
