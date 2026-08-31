import { useState, useMemo } from 'react';
import { getMasterByEntity, ENTITIES } from '../data/master';
import { getApiUrl, getApiSecret, getTransactionHistory } from '../data/api';
import {
  ClipboardList, Send, Loader2, CheckCircle, AlertCircle, Plus, Trash2, Calendar
} from 'lucide-react';

function isCS(item) {
  const d = (item.divisi || '').toLowerCase();
  return /cs|cold/i.test(d) || /ice cream|udang|cumi|bakso ikan|daging slice|nangka|degan|golden farm|sosis|fillet|tulang kerongkongan|tulang krongkongan/i.test(item.nama || '');
}

function isBahanBakuOrRekanan(item) {
  const d = (item.divisi || '').toUpperCase();
  const k = (item.kode || '').toUpperCase();
  if (k.startsWith('BBCV') || k.startsWith('BBPT')) return true;
  if (/BAHAN BAKU|REKANAN/.test(d)) return true;
  return false;
}

function weekLabel(d = new Date()) {
  const start = new Date(d);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (x) => x.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function POPage() {
  const [poType, setPoType] = useState('mingguan');
  const [entity, setEntity] = useState('CV');
  const [lines, setLines] = useState([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [filter, setFilter] = useState('');

  const weekReport = useMemo(() => {
    const history = getTransactionHistory();
    const now = new Date();
    const start = new Date(now);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + diff);
    let masuk = 0, keluar = 0, rusak = 0, tx = 0;
    history.forEach((h) => {
      if (!h.savedAt) return;
      const d = new Date(h.savedAt);
      if (d < start) return;
      const q = (h.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
      if (h.type === 'masuk') masuk += q;
      else if (h.type === 'rusak') rusak += q;
      else if (h.type === 'keluar') keluar += q;
      tx += 1;
    });
    return {
      label: weekLabel(now),
      masuk: Math.round(masuk * 10) / 10,
      keluar: Math.round(keluar * 10) / 10,
      rusak: Math.round(rusak * 10) / 10,
      tx,
    };
  }, []);

  const catalog = useMemo(() => {
    const all = getMasterByEntity(entity);
    if (poType === 'cs') return all.filter(isCS);
    return all.filter(i => !isBahanBakuOrRekanan(i));
  }, [entity, poType]);

  const filtered = useMemo(() => {
    if (!filter) return catalog.slice(0, 80);
    const q = filter.toLowerCase();
    return catalog.filter(i =>
      i.nama.toLowerCase().includes(q) || i.kode.toLowerCase().includes(q) || (i.divisi || '').toLowerCase().includes(q)
    ).slice(0, 80);
  }, [catalog, filter]);

  const addLine = (item) => {
    if (lines.find(l => l.kode === item.kode)) return;
    setLines(prev => [...prev, { ...item, qty: 1, keterangan: '' }]);
  };

  const submitPO = async () => {
    if (!lines.length) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const url = getApiUrl();
      const secret = getApiSecret();
      if (!url) throw new Error('URL API belum diisi di Atur');
      const body = {
        action: 'createPO',
        schemaVersion: '1.0',
        secret: secret || undefined,
        entity,
        poType: poType === 'cs' ? 'PO_CS' : 'PO_MINGGUAN',
        weekLabel: weekLabel(),
        note: note.trim(),
        items: lines.map(l => ({
          kode: l.kode, nama: l.nama, qty: Number(l.qty) || 0,
          satuan: l.satuan, divisi: l.divisi, keterangan: l.keterangan || '',
        })),
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success === false) throw new Error(data.error || data.message || 'Gagal create PO');
      const key = 'gudangai_po_drafts';
      const drafts = JSON.parse(localStorage.getItem(key) || '[]');
      drafts.unshift({ ...body, savedAt: new Date().toISOString(), server: data });
      localStorage.setItem(key, JSON.stringify(drafts.slice(0, 50)));
      setMsg({ success: true, text: data.message || `PO tersimpan (${poType === 'cs' ? 'PO CS' : 'PO Mingguan'})` });
      setLines([]);
      setNote('');
    } catch (err) {
      const key = 'gudangai_po_drafts';
      const drafts = JSON.parse(localStorage.getItem(key) || '[]');
      drafts.unshift({ entity, poType, weekLabel: weekLabel(), note, items: lines, savedAt: new Date().toISOString(), offline: true });
      localStorage.setItem(key, JSON.stringify(drafts.slice(0, 50)));
      setMsg({ success: false, text: (err.message || 'Error') + ' · Draft disimpan di perangkat' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-4 animate-fade-in space-y-4">
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-cyan-600" /> Laporan Mingguan
          </h3>
          <span className="text-[10px] text-slate-400">{weekReport.label}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2.5 text-center">
            <p className="text-[9px] text-emerald-600 font-medium uppercase">Masuk</p>
            <p className="text-lg font-bold text-emerald-700 tabular-nums">{weekReport.masuk}</p>
          </div>
          <div className="rounded-xl bg-orange-50 border border-orange-100 p-2.5 text-center">
            <p className="text-[9px] text-orange-600 font-medium uppercase">Keluar</p>
            <p className="text-lg font-bold text-orange-700 tabular-nums">{weekReport.keluar}</p>
          </div>
          <div className="rounded-xl bg-red-50 border border-red-100 p-2.5 text-center">
            <p className="text-[9px] text-red-600 font-medium uppercase">Rusak</p>
            <p className="text-lg font-bold text-red-700 tabular-nums">{weekReport.rusak}</p>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-2 text-center">
          {weekReport.tx} transaksi minggu ini · dari riwayat perangkat
        </p>
      </div>

      <div>
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-[#0b2a55]" /> Purchase Order
        </h2>
        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
          <Calendar className="w-3 h-3" /> Minggu: {weekLabel()}
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => { setPoType('mingguan'); setLines([]); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-semibold ${poType === 'mingguan' ? 'bg-[#0b2a55] text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
          PO Mingguan Produksi
        </button>
        <button onClick={() => { setPoType('cs'); setLines([]); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-semibold ${poType === 'cs' ? 'bg-cyan-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
          PO CS (Cold Storage)
        </button>
      </div>

      <p className="text-[11px] text-gray-500 bg-white rounded-xl border border-gray-100 px-3 py-2">
        {poType === 'cs'
          ? 'PO Purchase Order khusus item revisi CS (cold storage).'
          : 'PO Mingguan untuk kebutuhan produksi — semua divisi kecuali bahan baku & rekanan.'}
      </p>

      <div className="flex gap-2">
        {ENTITIES.map(e => (
          <button key={e} onClick={() => { setEntity(e); setLines([]); }}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold ${entity === e ? 'bg-[#0b2a55] text-white' : 'bg-white border text-gray-600'}`}>
            {e}
          </button>
        ))}
      </div>

      <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Cari item katalog PO..."
        className="w-full px-3 py-2.5 bg-white rounded-xl border border-gray-200 text-sm" />

      <div className="bg-white rounded-xl border border-gray-100 max-h-40 overflow-y-auto divide-y divide-gray-50">
        {filtered.map(item => (
          <button key={item.kode} onClick={() => addLine(item)}
            className="w-full text-left px-3 py-2 hover:bg-cyan-50 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-mono text-blue-600">{item.kode}</p>
              <p className="text-xs text-gray-800 truncate">{item.nama}</p>
            </div>
            <Plus className="w-4 h-4 text-cyan-600 shrink-0" />
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600">Baris PO ({lines.length})</p>
        {lines.map((l, idx) => (
          <div key={l.kode} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{l.nama}</p>
              <p className="text-[10px] text-gray-400">{l.kode} · {l.divisi}</p>
            </div>
            <input type="number" min="0" value={l.qty}
              onChange={e => setLines(prev => prev.map((x, i) => i === idx ? { ...x, qty: parseFloat(e.target.value) || 0 } : x))}
              className="w-16 px-2 py-1.5 bg-gray-50 rounded-lg border text-sm font-semibold text-center" />
            <button onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))} className="text-gray-400">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Catatan PO (opsional)"
        className="w-full px-3 py-2 bg-white rounded-xl border border-gray-200 text-sm" />

      <button onClick={submitPO} disabled={submitting || !lines.length}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-[#0b2a55] to-[#164e8a] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Simpan {poType === 'cs' ? 'PO CS' : 'PO Mingguan'} → Sheet
      </button>

      {msg && (
        <div className={`text-xs px-3 py-2 rounded-lg flex items-start gap-2 ${msg.success ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
          {msg.success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {msg.text}
        </div>
      )}
    </div>
  );
}
