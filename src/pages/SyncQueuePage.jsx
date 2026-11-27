import { useState, useEffect, useCallback, useMemo, memo, startTransition } from 'react';
import {
  getPendingQueue,
  syncPendingQueue,
  resolvePendingItem,
  removePendingByClientIds,
  getWriteCircuitState,
} from '../data/api';
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ClipboardList,
  Send,
  Clock3,
} from 'lucide-react';

const BATCH = 30;

const TYPE_LABEL = {
  masuk: 'Barang Masuk',
  barangMasuk: 'Barang Masuk',
  keluar: 'Barang Keluar',
  barangKeluar: 'Barang Keluar',
  rusak: 'Barang Rusak',
  barangRusak: 'Barang Rusak',
};

function flattenQueue(queue) {
  const rows = [];
  for (const entry of queue || []) {
    const type = entry.type || 'masuk';
    const entity = entry.entity || '';
    const tanggal = entry.tanggal || '';
    const entryId = entry.id || '';
    const items = entry.items || [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const it = items[itemIndex];
      const stableFallbackKey = [entryId || type, entity, tanggal, itemIndex, it.kode || 'item'].join('-');
      rows.push({
        key: it.clientItemId || stableFallbackKey,
        clientItemId: it.clientItemId,
        kode: it.kode || '',
        nama: it.nama || '',
        qty: Number(it.qty) || 0,
        keterangan: it.keterangan || '',
        type,
        entity,
        tanggal,
        entryId,
        queueStatus: it.queueStatus || entry.status || 'PENDING_REVIEW',
        autoSendRequested: !!entry.autoSendRequested,
        lastError: it.lastError || entry.lastError || '',
      });
    }
  }
  return rows;
}

function summarizeRows(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const name = row.nama || row.kode || 'Tanpa nama';
    const key = [row.type || 'masuk', String(row.entity || '').toUpperCase(), name, row.tanggal || ''].join('|');
    const prev = map.get(key);
    if (prev) {
      prev.qty += Number(row.qty) || 0;
      prev.count += 1;
      if (row.clientItemId) prev.clientItemIds.push(row.clientItemId);
    } else {
      map.set(key, {
        ...row,
        nama: name,
        entity: String(row.entity || '').toUpperCase(),
        qty: Number(row.qty) || 0,
        count: 1,
        clientItemIds: row.clientItemId ? [row.clientItemId] : [],
      });
    }
  }
  return Array.from(map.values());
}

const QueueItem = memo(function QueueItem({ row, onVerify, onRemove, syncing }) {
  const verify = useCallback(() => onVerify(row), [onVerify, row]);
  const remove = useCallback(() => onRemove(row.clientItemId), [onRemove, row.clientItemId]);
  return (
    <div className="sq-item rounded-2xl bg-white border border-slate-200 shadow-sm p-3.5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0"><Clock3 className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{TYPE_LABEL[row.type] || row.type}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-100">{row.entity || '—'}</span>
            {row.tanggal ? <span className="text-[10px] text-slate-400">{row.tanggal}</span> : null}
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${row.queueStatus === 'PENDING_VERIFY' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{row.queueStatus === 'PENDING_VERIFY' ? 'Perlu verifikasi' : 'Menunggu konfirmasi'}</span>
          </div>
          <p className="text-sm font-bold text-slate-900 mt-1">{row.nama || row.kode}</p>
          {row.lastError ? <p className="mt-1 text-[11px] text-amber-800" role="status">{row.lastError}</p> : null}
          <p className="text-[11px] text-slate-500 mt-0.5">Qty: <b className="text-slate-800">{row.qty}</b>{row.keterangan ? ' · ' + row.keterangan : ''}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={verify} disabled={syncing} className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">Verifikasi server</button>
            <button type="button" onClick={remove} disabled={syncing || row.queueStatus === 'PENDING_VERIFY'} title={row.queueStatus === 'PENDING_VERIFY' ? 'Lakukan read-back sebelum menghapus transaksi yang hasilnya belum pasti.' : 'Hapus item yang belum dikirim.'} className="px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-50">{row.queueStatus === 'PENDING_VERIFY' ? 'Verifikasi dulu' : 'Hapus'}</button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default function SyncQueuePage({ onBack, onNavigate }) {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(BATCH);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [circuit, setCircuit] = useState(() => getWriteCircuitState());

  const refresh = useCallback(() => {
    setRows(flattenQueue(getPendingQueue()));
    setReviewing(false);
  }, []);

  useEffect(() => {
    refresh();
    const onQueue = () => refresh();
    const onCircuit = (e) => setCircuit(e.detail || getWriteCircuitState());
    const onProgress = (e) => setProgress(e.detail || null);
    const onAutoSyncStatus = (e) => {
      const detail = e.detail || {};
      if (detail.state === 'started') {
        setSyncing(true);
        setProgress(null);
        setError(null);
        setResult({ synced: 0, failed: 0, message: `Sinkronisasi latar belakang mengambil alih ${detail.count || 0} item dari Input…` });
      } else if (detail.state === 'completed') {
        setRows(flattenQueue(getPendingQueue()));
        setSyncing(false);
        setProgress(null);
        setResult({
          synced: Number(detail.result?.synced || 0),
          failed: Number(detail.result?.failed || 0),
          skipped: !!detail.result?.skipped,
          message: detail.result?.skipped ? 'Sinkronisasi tertunda. Item tetap aman di antrean.' : `${detail.result?.synced || 0} item terkonfirmasi · ${flattenQueue(getPendingQueue()).length} item masih perlu verifikasi.`,
        });
      } else if (detail.state === 'failed') {
        setSyncing(false);
        setError(detail.error || 'Sinkronisasi latar belakang gagal.');
      }
    };
    window.addEventListener('gudangai-queue-changed', onQueue);
    window.addEventListener('gudangai-circuit', onCircuit);
    window.addEventListener('gudangai-submit-progress', onProgress);
    window.addEventListener('gudangai-auto-sync-status', onAutoSyncStatus);
    try {
      const saved = JSON.parse(localStorage.getItem('gudangai_auto_sync_status_v1') || 'null');
      if (saved && Date.now() - Number(saved.at || 0) < 30 * 60 * 1000) {
        if (saved.state === 'started') {
          setSyncing(true);
          setResult({ synced: 0, failed: 0, message: 'Sinkronisasi otomatis masih berjalan di latar belakang…' });
        } else if (saved.state === 'completed') {
          setResult({
            synced: Number(saved.result?.synced || 0),
            failed: Number(saved.result?.failed || 0),
            skipped: !!saved.result?.skipped,
            message: saved.result?.skipped ? 'Sinkronisasi tertunda. Item tetap aman di antrean.' : `${saved.result?.synced || 0} item terkonfirmasi. Hasil terbaru sudah diproses.`,
          });
        } else if (saved.state === 'failed') setError(saved.error || 'Sinkronisasi otomatis gagal.');
      }
    } catch (_) {}
    const id = setInterval(() => setCircuit(getWriteCircuitState()), 1000);
    return () => {
      window.removeEventListener('gudangai-queue-changed', onQueue);
      window.removeEventListener('gudangai-circuit', onCircuit);
      window.removeEventListener('gudangai-submit-progress', onProgress);
      window.removeEventListener('gudangai-auto-sync-status', onAutoSyncStatus);
      clearInterval(id);
    };
  }, [refresh]);

  const total = rows.length;
  const visibleRows = useMemo(() => rows.slice(0, limit), [rows, limit]);
  const loadMore = useCallback(() => startTransition(() => setLimit((n) => n + BATCH)), []);
  useEffect(() => { setLimit(BATCH); }, [total]);

  const handleRemove = useCallback(async (clientItemId) => {
    if (!clientItemId || syncing) return;
    try {
      await removePendingByClientIds([clientItemId]);
      setRows((prev) => prev.filter((r) => r.clientItemId !== clientItemId));
      setResult(null);
      setError(null);
    } catch (err) {
      setError(err?.message || 'Antrean belum dapat diubah secara aman.');
    }
  }, [syncing]);

  const handleMarkSuccess = useCallback(async (row) => {
    if (!row?.clientItemId) return;
    setError(null);
    setResult(null);
    setSyncing(true);
    const verification = await resolvePendingItem(row);
    if (!verification.success) {
      setSyncing(false);
      setError(verification.error || 'Server belum mengonfirmasi transaksi. Item tetap di antrean.');
      setResult({ synced: 0, failed: 1, message: 'Belum terkonfirmasi — item tetap di antrean.' });
      return;
    }
    setRows(flattenQueue(getPendingQueue()));
    setSyncing(false);
    setResult({ synced: 1, failed: 0, message: 'Item terverifikasi dan dicatat di Riwayat.' });
  }, []);

  const handleSendAll = useCallback(async () => {
    if (total === 0 || syncing || circuit.open) return;
    setReviewing(false);
    setSyncing(true);
    setResult(null);
    setError(null);
    setProgress(null);
    const before = flattenQueue(getPendingQueue());
    try {
      const res = await syncPendingQueue();
      const after = flattenQueue(getPendingQueue());
      const afterIds = new Set(after.map((row) => row.clientItemId).filter(Boolean));
      const confirmedCount = before.filter((row) => row.clientItemId && !afterIds.has(row.clientItemId)).length;
      setRows(after);
      setResult({
        synced: res.synced ?? confirmedCount,
        failed: res.failed ?? 0,
        skipped: !!res.skipped,
        message: res.skipped
          ? 'Lewati — offline atau sinkronisasi sedang berjalan.'
          : `${res.synced ?? confirmedCount} item terkonfirmasi · ${after.length} item masih perlu verifikasi. Rincian akhir ada di Riwayat.`,
      });
      if (confirmedCount > 0) window.dispatchEvent(new Event('gudangai-stock-refresh'));
    } catch (err) {
      setError(err?.message || 'Gagal mengeksekusi sinkronisasi.');
      refresh();
    } finally {
      setSyncing(false);
      setProgress(null);
    }
  }, [total, syncing, circuit.open]);


  return (
    <div className="sq-page pb-4 animate-fade-in space-y-3.5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack}
          className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-sm"
          aria-label="Kembali">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold text-slate-900">Sinkronisasi</h1>
          <p className="text-[11px] text-slate-500">
            {total === 0 ? 'Tidak ada item tertunda' : `${total} item dalam antrean`}
          </p>
        </div>
      </div>

      {syncing && progress && (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2.5 text-xs text-cyan-900" role="status">
          <p className="font-semibold">Mengirim {progress.sent || 0}/{progress.total || 0} · terkonfirmasi {progress.success || 0} · perlu verifikasi {progress.failed || 0}</p>
          <progress className="mt-2 h-1.5 w-full accent-cyan-700" aria-label="Progres sinkronisasi" max={Math.max(1, progress.total || 1)} value={Math.min(progress.total || 0, progress.sent || 0)} />
        </div>
      )}

      {circuit.open && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-900">
          <p className="font-bold">Sinkronisasi dijeda sementara</p>
          <p className="mt-0.5 text-amber-800/90">Pengaman write aktif selama {Math.ceil(circuit.retryAfterMs / 1000)} detik. Jangan kirim ulang item yang sudah di sheet.</p>
        </div>
      )}

      {total > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-900 leading-relaxed">
          <p className="font-semibold">Cek spreadsheet terlebih dahulu.</p>
          <p className="mt-0.5 text-amber-800/90">
            Jika item sudah tertulis di sheet, tekan <b>Verifikasi server</b>. Jangan hapus atau kirim ulang tanpa konfirmasi read-back.
          </p>
        </div>
      )}

      {total === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">Tidak ada item tertunda</p>
          <p className="text-xs text-slate-500">Tidak ada transaksi yang menunggu sinkronisasi di perangkat ini.</p>
          <button type="button" onClick={onBack}
            className="mt-2 px-4 py-2.5 rounded-xl bg-cyan-700 text-white text-sm font-semibold">
            Kembali
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-3.5 py-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-cyan-700" />
                <div>
                  <p className="text-sm font-bold text-cyan-900">Item menunggu sinkronisasi</p>
                  <p className="text-[11px] text-cyan-800/80">{total} item · belum dikirim ulang ke server</p>
                </div>
              </div>
            </div>

            {visibleRows.map((row) => <QueueItem key={row.key} row={row} onVerify={handleMarkSuccess} onRemove={handleRemove} syncing={syncing} />)}
            {rows.length > limit && <button type="button" onClick={loadMore} className="w-full py-2.5 rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-800 text-xs font-bold">Tampilkan lebih banyak ({rows.length - limit} tersisa)</button>}
          </div>

          <div className="sticky bottom-0 pt-2 pb-1">
            <button type="button" onClick={() => setReviewing(true)}
              disabled={syncing || total === 0 || circuit.open}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-600 to-teal-600 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50">
              <ClipboardList className="w-4 h-4" />
              {circuit.open ? 'Dijeda Sementara' : 'Tinjau Keranjang & Sinkronisasi (' + total + ')'}
            </button>
          </div>

          {reviewing && (
            <div className="fixed inset-0 z-[70] bg-slate-950/70 p-3 flex items-end sm:items-center justify-center">
              <div className="w-full max-w-md max-h-[88vh] overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col">
                <div className="px-4 py-3.5 border-b border-slate-200 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-slate-900">Periksa sebelum sinkronisasi</p>
                    <p className="text-[11px] text-slate-500">{total} item di keranjang</p>
                  </div>
                  <button type="button" onClick={() => setReviewing(false)}
                    className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">×</button>
                </div>
                <div className="overflow-y-auto p-3 space-y-2">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-900">
                    <b>Belum ada data yang dikirim.</b> Server menerima data setelah tombol konfirmasi ditekan.
                  </div>
                  {summarizeRows(rows).map((row) => (
                    <div key={row.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start gap-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900">{row.nama}</p>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold rounded-lg px-2 py-1 bg-cyan-100 text-cyan-800">{row.entity || '—'}</span>
                            <span className="text-[10px] font-semibold rounded-lg px-2 py-1 bg-slate-200 text-slate-700">{TYPE_LABEL[row.type] || row.type}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-black text-slate-900 tabular-nums">{row.qty}</p>
                          <p className="text-[10px] text-slate-500">TOTAL QTY</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3 border-t border-slate-200 space-y-2 bg-white">
                  <button type="button" onClick={handleSendAll} disabled={syncing || total === 0 || circuit.open}
                    className="w-full py-3.5 rounded-2xl bg-cyan-600 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-50">
                    {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {syncing ? 'Mengirim…' : 'Konfirmasi & Kirim ke Spreadsheet'}
                  </button>
                  <button type="button" onClick={() => setReviewing(false)} disabled={syncing}
                    className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold disabled:opacity-50">
                    Kembali / Periksa Lagi
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {result && (
        <div className={`rounded-2xl border p-3 text-xs ${
          result.failed || result.skipped
            ? 'bg-amber-50 text-amber-800 border-amber-100'
            : 'bg-emerald-50 text-emerald-800 border-emerald-100'
        }`}>
          <p>{result.message}</p>
          {result.synced > 0 && <button type="button" onClick={() => onNavigate?.('riwayat')} className="mt-2 font-bold underline underline-offset-2">Buka Riwayat</button>}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
