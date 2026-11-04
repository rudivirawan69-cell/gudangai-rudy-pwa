import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, Plus, ClipboardPlus, CalendarDays, Users, Truck, ChevronDown, ChevronUp, CheckCircle2, Circle, Trash2, X, RefreshCw, Cloud, CloudOff, AlertCircle, ArrowUpRight } from 'lucide-react';
import { fetchOperationalNotes, saveOperationalNote, deleteOperationalNote } from '../data/api';

const STORAGE_KEY = 'gudangai_home_notes_v1';
const CATEGORIES = [
  { id: 'tambahan-order', label: 'Tambahan Order', Icon: ClipboardPlus, tone: 'amber', hint: 'Contoh: tambahan order ayam fillet 20 kg' },
  { id: 'jadwal-off', label: 'Jadwal Off', Icon: CalendarDays, tone: 'emerald', hint: 'Contoh: jadwal off Andi, Jumat' },
  { id: 'jadwal-meeting', label: 'Jadwal Meeting', Icon: Users, tone: 'indigo', hint: 'Contoh: meeting evaluasi stok pukul 14.00' },
  { id: 'kirim-luar-kota', label: 'Kirim Luar Kota', Icon: Truck, tone: 'sky', hint: 'Contoh: pengiriman ke Malang, Senin 10.00' },
];
const TONE = {
  amber: { icon: 'bg-amber-100 text-amber-700', badge: 'bg-amber-50 text-amber-700 border-amber-200', ring: 'border-amber-400', active: 'bg-amber-50/80' },
  emerald: { icon: 'bg-emerald-100 text-emerald-700', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', ring: 'border-emerald-400', active: 'bg-emerald-50/80' },
  indigo: { icon: 'bg-indigo-100 text-indigo-700', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', ring: 'border-indigo-400', active: 'bg-indigo-50/80' },
  sky: { icon: 'bg-sky-100 text-sky-700', badge: 'bg-sky-50 text-sky-700 border-sky-200', ring: 'border-sky-400', active: 'bg-sky-50/80' },
};
function normalizeNote(note) {
  return {
    id: String(note?.id || note?.noteId || ''),
    category: String(note?.category || ''),
    text: String(note?.text || ''),
    done: note?.done === true || String(note?.done).toLowerCase() === 'true',
    createdAt: note?.createdAt || note?.created_at || new Date().toISOString(),
    createdBy: note?.createdBy || note?.created_by || 'GudangAI RUDY',
    syncStatus: note?.syncStatus || 'pending',
  };
}
function readNotes() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw.map(normalizeNote).filter((n) => n.id && n.category && n.text) : [];
  } catch { return []; }
}
function makeId() {
  return globalThis.crypto?.randomUUID?.() || 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}
function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta',
  }) + ' WIB';
}
function mergeRemote(remote, local) {
  const pending = local.filter((n) => n.syncStatus !== 'synced');
  const ids = new Set(pending.map((n) => n.id));
  const server = (Array.isArray(remote) ? remote : []).map((n) => ({ ...normalizeNote(n), syncStatus: 'synced' })).filter((n) => !ids.has(n.id));
  return [...pending, ...server].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export default function HomeReminderModule({ onNavigate, criticalCount = 0, userName = 'Rudi Virawan' }) {
  const [notes, setNotes] = useState(readNotes);
  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [draft, setDraft] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const [syncState, setSyncState] = useState('loading');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); } catch (_) {}
  }, [notes]);

  const showToast = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }, []);

  const refreshFromSpreadsheet = useCallback(async () => {
    try {
      setSyncState('loading');
      const remote = await fetchOperationalNotes();
      setNotes((current) => mergeRemote(remote, current));
      setSyncState('synced');
      return true;
    } catch (_) {
      setSyncState(navigator.onLine ? 'error' : 'offline');
      return false;
    }
  }, []);

  const flushPending = useCallback(async () => {
    if (!navigator.onLine) { setSyncState('offline'); return false; }
    const pending = notes.filter((n) => n.syncStatus !== 'synced');
    if (!pending.length) { setSyncState('synced'); return true; }
    setSyncState('loading');
    let ok = true;
    for (const note of pending) {
      try {
        if (note.syncStatus === 'pending-delete') {
          await deleteOperationalNote(note.id);
          setNotes((current) => current.filter((n) => n.id !== note.id));
        } else {
          await saveOperationalNote(note);
          setNotes((current) => current.map((n) => n.id === note.id ? { ...n, syncStatus: 'synced' } : n));
        }
      } catch (_) { ok = false; }
    }
    setSyncState(ok ? 'synced' : 'pending');
    return ok;
  }, [notes]);

  useEffect(() => {
    let mounted = true;
    fetchOperationalNotes().then((remote) => {
      if (!mounted) return;
      setNotes((current) => mergeRemote(remote, current));
      setSyncState('synced');
    }).catch(() => {
      if (mounted) setSyncState(navigator.onLine ? 'error' : 'offline');
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const onOnline = () => { void refreshFromSpreadsheet().then(() => flushPending()); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refreshFromSpreadsheet, flushPending]);

  useEffect(() => {
    if (syncState === 'synced' && notes.some((n) => n.syncStatus !== 'synced')) void flushPending();
  }, [notes, syncState, flushPending]);

  const addNote = async () => {
    const value = draft.trim();
    if (!value || busy) return;
    const note = normalizeNote({ id: makeId(), category, text: value, done: false, createdAt: new Date().toISOString(), createdBy: userName, syncStatus: 'pending' });
    setNotes((current) => [note, ...current]);
    setDraft('');
    setExpanded(false);
    setActiveCategory(category);
    setBusy(true);
    try {
      await saveOperationalNote(note);
      setNotes((current) => current.map((n) => n.id === note.id ? { ...n, syncStatus: 'synced' } : n));
      setSyncState('synced');
      showToast('Catatan tersimpan di Spreadsheet utama.');
    } catch (_) {
      setSyncState(navigator.onLine ? 'pending' : 'offline');
      showToast('Catatan aman di perangkat; sinkronisasi menunggu koneksi.');
    } finally { setBusy(false); }
  };

  const toggleNote = async (note) => {
    const updated = { ...note, done: !note.done, syncStatus: 'pending' };
    setNotes((current) => current.map((n) => n.id === note.id ? updated : n));
    try {
      await saveOperationalNote(updated);
      setNotes((current) => current.map((n) => n.id === note.id ? { ...n, syncStatus: 'synced' } : n));
      setSyncState('synced');
    } catch (_) { setSyncState(navigator.onLine ? 'pending' : 'offline'); showToast('Perubahan menunggu sinkronisasi.'); }
  };

  const removeNote = async (note) => {
    setNotes((current) => current.map((n) => n.id === note.id ? { ...n, syncStatus: 'pending-delete' } : n));
    try {
      await deleteOperationalNote(note.id);
      setNotes((current) => current.filter((n) => n.id !== note.id));
      setSyncState('synced');
      showToast('Catatan dihapus dari daftar bersama.');
    } catch (_) { setSyncState(navigator.onLine ? 'pending' : 'offline'); showToast('Penghapusan menunggu sinkronisasi.'); }
  };

  const counts = useMemo(() => {
    const result = Object.fromEntries(CATEGORIES.map((item) => [item.id, 0]));
    notes.forEach((note) => {
      if (note.syncStatus !== 'pending-delete' && !note.done && result[note.category] !== undefined) result[note.category] += 1;
    });
    return result;
  }, [notes]);
  const activeCount = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const selected = CATEGORIES.find((item) => item.id === category) || CATEGORIES[0];
  const activeMeta = CATEGORIES.find((item) => item.id === activeCategory);
  const visibleNotes = activeCategory ? notes.filter((n) => n.category === activeCategory && n.syncStatus !== 'pending-delete') : [];
  const hour = Number(new Intl.DateTimeFormat('id-ID', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' }).format(new Date()));
  const greeting = hour >= 18 || hour < 4 ? 'Selamat malam' : hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : 'Selamat sore';
  const syncLabel = syncState === 'synced' ? 'Tersinkron ke Spreadsheet' : syncState === 'loading' ? 'Memeriksa sinkronisasi' : syncState === 'offline' ? 'Offline · tersimpan lokal' : syncState === 'error' ? 'Spreadsheet belum merespons' : 'Menunggu sinkronisasi';
  const syncClass = syncState === 'synced' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : syncState === 'loading' ? 'text-sky-700 bg-sky-50 border-sky-200' : 'text-amber-700 bg-amber-50 border-amber-200';

  return (
    <section className="home-reminder-module space-y-3" aria-label="Pengingat dan catatan operasional">
      <div className="home-reminder-surface overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-sm">
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} aria-controls="home-reminder-form"
          className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-slate-50">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-md shadow-amber-200/70"><BellRing className="h-5 w-5" /></span>
            <span className="min-w-0">
              <span className="mb-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-amber-700">Reminder & Input Baru</span>
              <span className="block truncate text-xs font-extrabold text-slate-800">{greeting}, {userName}!</span>
              <span className="mt-0.5 block text-[10px] text-slate-500">Catatan operasional bersama tim</span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-extrabold text-amber-700">{activeCount} aktif</span>
            {expanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
          </span>
        </button>
        {expanded && (
          <div id="home-reminder-form" className="home-reminder-muted space-y-3 border-t border-slate-100 bg-slate-50/80 p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Pilih kategori tugas / catatan</p>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((item) => {
                const Icon = item.Icon; const tone = TONE[item.tone]; const selectedCat = category === item.id;
                return <button key={item.id} type="button" onClick={() => setCategory(item.id)} aria-pressed={selectedCat}
                  className={\`flex min-h-11 items-center gap-2 rounded-xl border bg-white px-2.5 py-2 text-left text-[11px] font-bold transition-all \${selectedCat ? \`\${tone.ring} \${tone.active} text-slate-800 shadow-sm\` : 'border-slate-200 text-slate-600'}\`}>
                  <span className={\`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg \${tone.icon}\`}><Icon className="h-3.5 w-3.5" /></span><span>{item.label}</span>
                </button>;
              })}
            </div>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={300}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void addNote(); } }}
              placeholder={selected.hint} className="home-reminder-input w-full resize-none rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-xs text-slate-800 shadow-inner outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-slate-400">{draft.length}/300 karakter</span>
              <button type="button" onClick={() => void addNote()} disabled={!draft.trim() || busy}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-extrabold text-white shadow-md transition active:scale-[0.98] disabled:opacity-40">
                <Plus className="h-4 w-4 text-amber-400" /> Simpan ke Spreadsheet
              </button>
            </div>
          </div>
        )}
      </div>

      {criticalCount > 0 && <button type="button" onClick={() => onNavigate?.('stok')} className="home-reminder-critical flex w-full items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 p-3.5 text-left shadow-sm">
        <span className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600"><AlertCircle className="h-4 w-4" /></span>
          <span className="min-w-0"><span className="block text-[10px] font-extrabold uppercase tracking-wide text-rose-700">Status Stok Kritis</span><span className="mt-0.5 block text-xs font-semibold text-slate-700"><strong className="text-rose-700">{criticalCount.toLocaleString('id-ID')} item</strong> perlu tindak lanjut segera.</span></span></span>
        <span className="shrink-0 rounded-xl bg-rose-200/80 px-3 py-2 text-[10px] font-extrabold text-rose-800">Cek Stok</span>
      </button>}

      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm"><ClipboardPlus className="h-4 w-4" /></span>
            <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">Pengingat & Catatan Operasional</h2></div>
          <button type="button" onClick={() => void refreshFromSpreadsheet()} title="Muat ulang catatan bersama" className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95"><RefreshCw className="h-3.5 w-3.5" /></button>
        </div>
        <div className="flex items-center gap-1.5 px-1 text-[9px] font-semibold">
          <span className={\`inline-flex items-center gap-1 rounded-full border px-2 py-1 \${syncClass}\`}>{syncState === 'synced' ? <Cloud className="h-3 w-3" /> : syncState === 'loading' ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CloudOff className="h-3 w-3" />}{syncLabel}</span>
          {notes.some((n) => n.syncStatus !== 'synced') && <button type="button" onClick={() => void flushPending()} className="font-bold text-sky-700 underline underline-offset-2">Coba sinkronkan</button>}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {CATEGORIES.map((item) => {
            const Icon = item.Icon; const tone = TONE[item.tone]; const latest = notes.find((n) => n.category === item.id && !n.done && n.syncStatus !== 'pending-delete');
            return <button key={item.id} type="button" onClick={() => setActiveCategory(item.id)}
              className="home-reminder-surface group min-w-0 rounded-2xl border border-slate-200/90 bg-white p-3.5 text-left shadow-sm transition-all active:scale-[0.98]">
              <span className="mb-2 flex items-start justify-between gap-2"><span className={\`flex h-8 w-8 items-center justify-center rounded-xl \${tone.icon}\`}><Icon className="h-4 w-4" /></span>
                <span className={\`rounded-full border px-2 py-0.5 text-[10px] font-extrabold tabular-nums \${tone.badge}\`}>{counts[item.id]}</span></span>
              <span className="block text-xs font-extrabold leading-tight text-slate-800">{item.label}</span>
              <span className="mt-1 block truncate text-[10px] text-slate-500">{latest ? latest.text : 'Belum ada catatan aktif'}</span>
            </button>;
          })}
        </div>
      </div>

      {activeCategory && activeMeta && (
        <div className="home-reminder-sheet fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px]" role="dialog" aria-modal="true" onClick={() => setActiveCategory(null)}>
          <section className="home-reminder-sheet-panel flex max-h-[78vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-3"><span className={\`flex h-9 w-9 items-center justify-center rounded-xl \${TONE[activeMeta.tone].icon}\`}><activeMeta.Icon className="h-4 w-4" /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-extrabold text-slate-800">{activeMeta.label}</span><span className="block text-[10px] text-slate-400">{visibleNotes.length} catatan tersimpan bersama</span></span></div>
              <button type="button" onClick={() => setActiveCategory(null)} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500" aria-label="Tutup panel"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-[180px] flex-1 space-y-2.5 overflow-y-auto p-4">
              {visibleNotes.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center"><p className="text-xs font-semibold text-slate-500">Belum ada catatan di kategori ini</p><p className="mt-1 text-[10px] text-slate-400">Gunakan form Reminder di atas untuk menambahkan</p></div>}
              {visibleNotes.map((note) => <article key={note.id} className={\`flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 \${note.done ? 'opacity-60' : 'shadow-sm'}\`}>
                <button type="button" onClick={() => void toggleNote(note)} className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center" aria-label={note.done ? 'Tandai belum selesai' : 'Tandai selesai'}>{note.done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-slate-300" />}</button>
                <div className="min-w-0 flex-1"><span className="text-[10px] font-medium text-slate-400">{formatTime(note.createdAt)}</span>
                  <p className={\`break-words text-xs font-semibold \${note.done ? 'text-slate-400 line-through' : 'text-slate-800'}\`}>{note.text}</p>
                  {note.category === 'tambahan-order' && !note.done && <button type="button" onClick={() => { setActiveCategory(null); onNavigate?.('input'); }} className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-amber-700">Buka menu Input <ArrowUpRight className="h-3 w-3" /></button>}
                  {note.syncStatus !== 'synced' && <p className="mt-1 text-[9px] font-semibold text-amber-600">Belum tersinkron</p>}
                </div>
                <button type="button" onClick={() => void removeNote(note)} className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Hapus catatan"><Trash2 className="h-3.5 w-3.5" /></button>
              </article>)}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 p-3"><span className="text-[10px] text-slate-400">Disimpan di sheet khusus, terpisah dari transaksi stok.</span>
              <button type="button" onClick={() => setActiveCategory(null)} className="rounded-xl bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700">Tutup</button></div>
          </section>
        </div>
      )}
      {toast && <div role="status" className="home-reminder-toast fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </section>
  );
}
