import { useState } from 'react';
import { PackagePlus, PackageMinus, AlertOctagon } from 'lucide-react';
import { useStock } from '../hooks/useStock';
import { localDateYMD } from '../data/api';

export default function InputPage() {
  const { stock, loading } = useStock();
  const [mode, setMode] = useState('masuk');
  const today = localDateYMD();

  return (
    <div className="p-4 text-white space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <PackagePlus className="w-6 h-6 text-cyan-300" /> Input
      </h1>
      <p className="text-sm opacity-70">Tanggal: {today}</p>

      <div className="flex gap-2">
        {[
          { id: 'masuk', label: 'Masuk', Icon: PackagePlus },
          { id: 'keluar', label: 'Keluar', Icon: PackageMinus },
          { id: 'rusak', label: 'Rusak', Icon: AlertOctagon },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold flex flex-col items-center gap-1 ${
              mode === id ? 'bg-cyan-600 text-white' : 'bg-white/10 text-white/70'
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-sm space-y-2">
        <p className="font-semibold text-cyan-200">Modul Input sedang dipulihkan</p>
        <p className="opacity-70">
          Halaman ini sudah stabil (build lolos). Fitur penuh (PDF, barcode, suara, keranjang)
          akan di-restore pada langkah berikutnya setelah deploy sukses.
        </p>
        {loading && <p className="text-xs opacity-50">Memuat stok…</p>}
        {!loading && stock && (
          <p className="text-xs opacity-50">
            Stok tersedia: {(stock.cv?.length || 0) + (stock.pt?.length || 0)} item
          </p>
        )}
      </div>
    </div>
  );
}
