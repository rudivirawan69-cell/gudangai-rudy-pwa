import { useState, useEffect, useCallback } from 'react';
import {
  getPendingQueue,
  syncPendingQueue,
  removePendingByClientIds,
  saveToHistory,
  pushNotification,
  markItemApplied,
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
  Server,
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

export default function SyncQueuePage({ onBack }) {
  const [rows, setRows] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [lastSyncReport, setLastSyncReport] = useState(null);
  const [circuit, setCircuit] = useState(() => getWriteCircuitState());

  const refresh = useCallback(() => {
    setRows(flattenQueue(getPendingQueue()));
    setReviewing(false);
  }, []);

  useEffect(() => {
    refresh();
    const onQueue = () => refresh();
    const onCircuit = (e) => setCircuit(e.detail || getWriteCircuitState());
    window.addEventListener('gudangai-queue-changed', onQueue);
    window.addEventListener('gudangai-circuit', onCircuit);
    const id = setInterval(() => setCircuit(getWriteCircuitState()), 1000);
    return () => {
      window.removeEventListener('gudangai-queue-changed', onQueue);
      window.removeEventListener('gudangai-circuit', onCircuit);
      clearInterval(id);
    };
  }, [refresh]);

  const total = rows.length;

  const handleRemove = (clientItemId) => {
    if (!clientItemId) return;
    removePendingByClientIds([clientItemId]);
    setRows((prev) => prev.filter((r) => r.clientItemId !== clientItemId));
    setResult(null);
    setError(null);
  };

  const handleMarkSuccess = (row) => {
    if (!row?.clientItemId) return;
    markItemApplied(row.clientItemId);
    removePendingByClientIds([row.clientItemId]);
    saveToHistory({
      type: row.type,
      entity: row.entity,
      kode: row.kode,
      nama: row.nama,
      qty: row.qty,
      keterangan: row.keterangan || '',
      tanggal: row.tanggal,
      source: 'queue-manual-success',
      clientItemId: row.clientItemId,
      status: 'sukses',
    });
    setRows((prev) => prev.filter((r) => r.clientItemId !== row.clientItemId));
    setResult({ synced: 1, failed: 0, message: `${row.nama || row.kode} ditandai sukses · masuk Riwayat` });
    setError(null);
    pushNotification({
      type: 'ok',
      title: 'Ditandai sukses',
      body: `${row.nama || row.kode} dihapus dari antrian (sudah di sheet).`,
    });
  };

  const handleSendAll = async () => {
    if (total === 0 || syncing || circuit.open) return;
    setReviewing(false);
    setSyncing(true);
    setResult(null);
    setError(null);
    const before = flattenQueue(getPendingQueue());
    try {
      const res = await syncPendingQueue();
      const after = flattenQueue(getPendingQueue());
      const afterIds = new Set(after.map((r) => r.clientItemId).filter(Boolean));
      const succeeded = before.filter((r) => r.clientItemId && !afterIds.has(r.clientItemId));
      setLastSyncReport({ confirmed: summarizeRows(succeeded), remaining: summarizeRows(after), at: Date.now() });
      for (const item of succeeded) {
        saveToHistory({
          type: item.type, entity: item.entity, kode: item.kode, nama: item.nama,
          qty: item.qty, keterangan: item.keterangan, tanggal: item.tanggal,
          source: 'sync-queue', clientItemId: item.clientItemId,
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
        pushNotification({ type: 'ok', title: 'Sinkronisasi selesai', body: `${succeeded.length} item berhasil dikirim ke spreadsheet.` });
      }
      if (after.length > 0 && !res.skipped) {
        pushNotification({ type: 'warn', title: 'Sebagian gagal', body: `${after.length} item masih pending. Coba lagi nanti.` });
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
        <button type="button" onClick={onBack}
          className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-sm"
          aria-label="Kembali">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold text-white drop-shadow-sm">Antrian Sinkronisasi</h1>
          <p className="text-[11px] text-cyan-100/80">
            {total === 0 ? 'Tidak ada item pending' : `${total} item di keranjang antrian`}
          </p>
        </div>
      </div>

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
            Jika item sudah tertulis di sheet, tekan <b>Sukses</b>. Jangan tekan Kirim ulang agar tidak dobel.
          </p>
        </div>
      )}

      {total === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">Antrian kosong</p>
          <p className="text-xs text-slate-500">Semua transaksi sudah tersinkron atau dihapus.</p>
          <button type="button" onClick={onBack}
            className="mt-2 px-4 py-2.5 rounded-xl bg-[#0b2a55] text-white text-sm font-semibold">
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
                  <p className="text-sm font-bold text-cyan-900">Keranjang Antrian</p>
                  <p className="text-[11px] text-cyan-800/80">{total} item · belum dikirim ulang ke server</p>
                </div>
              </div>
            </div>

            {rows.map((row) => (
              <div key={row.key} className="rounded-2xl bg-white border border-slate-200 shadow-sm p-3.5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                    <Clock3 className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {TYPE_LABEL[row.type] || row.type}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-100">
                        {row.entity || '—'}
                      </span>
                      {row.tanggal ? <span className="text-[10px] text-slate-400">{row.tanggal}</span> : null}
                    </div>
                    <p className="text-sm font-bold text-slate-900 mt-1">{row.nama || row.kode}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Qty: <b className="text-slate-800">{row.qty}</b>
                      {row.keterangan ? ' · ' + row.keterangan : ''}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => handleMarkSuccess(row)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                        Sukses
                      </button>
                      <button type="button" onClick={() => handleRemove(row.clientItemId)}
                        className="px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[11px] font-bold">
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="sticky bottom-0 pt-2 pb-1">
            <button type="button" onClick={() => setReviewing(true)}
              disabled={syncing || total === 0 || circuit.open}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50">
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

      {lastSyncReport && (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-3.5 space-y-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-slate-700" />
            <div>
              <p className="text-sm font-bold text-slate-900">Hasil sinkronisasi</p>
              <p className="text-[10px] text-slate-500">{new Date(lastSyncReport.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
          {lastSyncReport.confirmed.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-emerald-700 mb-1.5">TERKONFIRMASI</p>
              <div className="space-y-1.5">
                {lastSyncReport.confirmed.map((row) => (
                  <div key={'ok-' + row.key} className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
                    <p className="text-xs font-bold text-emerald-900 truncate">{row.nama}</p>
                    <b className="text-sm text-emerald-800 tabular-nums">{row.qty}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
          {lastSyncReport.remaining.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-amber-700 mb-1.5">MASIH ANTRIAN</p>
              <div className="space-y-1.5">
                {lastSyncReport.remaining.map((row) => (
                  <div key={'p-' + row.key} className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
                    <p className="text-xs font-bold text-amber-900 truncate">{row.nama}</p>
                    <b className="text-sm text-amber-800 tabular-nums">{row.qty}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className={`rounded-2xl border p-3 text-xs ${
          result.failed || result.skipped
            ? 'bg-amber-50 text-amber-800 border-amber-100'
            : 'bg-emerald-50 text-emerald-800 border-emerald-100'
        }`}>{result.message}</div>
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
