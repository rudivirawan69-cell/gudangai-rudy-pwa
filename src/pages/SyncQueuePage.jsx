import { useState, useEffect, useCallback } from 'react';
import {
  getPendingQueue,
  syncPendingQueue,
  removePendingByClientIds,
  saveToHistory,
  pushNotification,
} from '../data/api';
import {
  ArrowLeft,
  Trash2,
  RefreshCw,
  Loader2,
  Package,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

const TYPE_LABEL = {
  masuk: 'Masuk',
  keluar: 'Keluar',
  rusak: 'Rusak',
};

function flattenQueue(queue) {
  const rows = [];
  for (const entry of queue || []) {
    const type = entry.type || 'masuk';
    const entity = entry.entity || '';
    const tanggal = entry.tanggal || '';
    const entryId = entry.id || '';
    for (const it of entry.items || []) {
      rows.push({
        key: it.clientItemId || `${entryId}-${it.kode}-${Math.random()}`,
        clientItemId: it.clientItemId,
        kode: it.kode || '',
        nama: it.nama || '',
        qty: Number(it.qty) || 0,
        keterangan: it.keterangan || '',
        type,
        entity,
        tanggal,
        entryId,
      });
    }
  }
  return rows;
}

export default function SyncQueuePage({ onBack }) {
  const [rows, setRows] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    const q = getPendingQueue();
    setRows(flattenQueue(q));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const total = rows.length;

  const handleRemove = (clientItemId) => {
    if (!clientItemId) return;
    removePendingByClientIds([clientItemId]);
    setRows((prev) => prev.filter((r) => r.clientItemId !== clientItemId));
    setResult(null);
    setError(null);
  };

  const handleSendAll = async () => {
    if (total === 0 || syncing) return;
    setSyncing(true);
    setResult(null);
    setError(null);

    const before = flattenQueue(getPendingQueue());

    try {
      const res = await syncPendingQueue();
      const after = flattenQueue(getPendingQueue());
      const afterIds = new Set(after.map((r) => r.clientItemId).filter(Boolean));

      const succeeded = before.filter((r) => r.clientItemId && !afterIds.has(r.clientItemId));
      for (const item of succeeded) {
        saveToHistory({
          type: item.type,
          entity: item.entity,
          kode: item.kode,
          nama: item.nama,
          qty: item.qty,
          keterangan: item.keterangan,
          tanggal: item.tanggal,
          source: 'sync-queue',
          clientItemId: item.clientItemId,
        });
      }

      setRows(after);
      setResult({
        synced: res.synced ?? succeeded.length,
        failed: res.failed ?? 0,
        skipped: !!res.skipped,
        message: res.skipped
          ? 'Lewati — offline atau sinkronisasi sedang berjalan.'
          : `Berhasil: ${succeeded.length} · Gagal / sisa: ${after.length}`,
      });

      if (succeeded.length > 0) {
        pushNotification({
          type: 'ok',
          title: 'Sinkronisasi selesai',
          body: `${succeeded.length} item berhasil dikirim ke spreadsheet.`,
        });
      }
      if (after.length > 0 && !res.skipped) {
        pushNotification({
          type: 'warn',
          title: 'Sebagian gagal',
          body: `${after.length} item masih pending. Coba lagi nanti.`,
        });
      }
    } catch (err) {
      setError(err?.message || 'Gagal mengeksekusi sinkronisasi.');
      refresh();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="pb-4 animate-fade-in space-y-3.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-xl bg-white/90 border border-slate-200 flex items-center justify-center text-slate-600 active:bg-slate-50"
          aria-label="Kembali"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold text-slate-900">Antrian Sinkronisasi</h1>
          <p className="text-[11px] text-slate-500">
            {total === 0 ? 'Tidak ada item pending' : `${total} item menunggu dikirim`}
          </p>
        </div>
      </div>

      {total > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-900 leading-relaxed">
          <p className="font-semibold">Cek spreadsheet terlebih dahulu.</p>
          <p className="mt-0.5 text-amber-800/90">
            Jika item sudah tertulis di sheet (batch sebelumnya mungkin sukses meski timeout),
            tekan ikon sampah untuk menghapus dari antrian. Jangan kirim ulang — akan dobel.
          </p>
        </div>
      )}

      {total === 0 ? (
        <div className="card p-6 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">Antrian kosong</p>
          <p className="text-xs text-slate-500">Semua transaksi sudah tersinkron atau dihapus.</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-2 px-4 py-2.5 rounded-xl bg-[#0b2a55] text-white text-sm font-semibold"
          >
            Kembali
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.key}
                className="card p-3.5 flex items-start gap-3"
              >
                <div className="w-9 h-9 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {TYPE_LABEL[row.type] || row.type}
                    </span>
                    <span className="text-[10px] font-medium text-slate-500">
                      {row.entity || '—'}
                    </span>
                    {row.tanggal && (
                      <span className="text-[10px] text-slate-400">{row.tanggal}</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-800 mt-1 truncate">
                    {row.nama || row.kode || 'Tanpa nama'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Kode: {row.kode || '—'} · Qty: {row.qty}
                    {row.keterangan ? ` · ${row.keterangan}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(row.clientItemId)}
                  disabled={syncing || !row.clientItemId}
                  className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 disabled:opacity-40"
                  aria-label="Hapus item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="sticky bottom-0 pt-2 pb-1 bg-gradient-to-t from-[#0b2a55]/5 to-transparent">
            <button
              type="button"
              onClick={handleSendAll}
              disabled={syncing || total === 0}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
            >
              {syncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Mengeksekusi…
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Kirim & Eksekusi Semua ({total})
                </>
              )}
            </button>
          </div>
        </>
      )}

      {result && (
        <div
          className={`card p-3 text-xs ${
            result.failed || result.skipped
              ? 'bg-amber-50 text-amber-800 border border-amber-100'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-100'
          }`}
        >
          {result.message}
        </div>
      )}
      {error && (
        <div className="card p-3 text-xs bg-red-50 text-red-700 border border-red-100 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
