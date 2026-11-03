import { useEffect, useMemo, useState } from 'react';
import {
  BellRing, Plus, ClipboardPlus, CalendarDays, Users, Truck,
  ChevronDown, ChevronUp, CheckCircle2, Circle, Trash2, X,
} from 'lucide-react';

const STORAGE_KEY = 'gudangai_home_notes_v1';

const CATEGORIES = [
  { id: 'tambahan-order', label: 'Tambahan Order', short: 'Order', Icon: ClipboardPlus, tone: 'amber', hint: 'Contoh: tambahan order ayam fillet 20 kg' },
  { id: 'jadwal-off', label: 'Jadwal Off', short: 'Off', Icon: CalendarDays, tone: 'emerald', hint: 'Contoh: jadwal off Andi, Jumat' },
  { id: 'jadwal-meeting', label: 'Jadwal Meeting', short: 'Meeting', Icon: Users, tone: 'indigo', hint: 'Contoh: meeting evaluasi stok pukul 14.00' },
  { id: 'kirim-luar-kota', label: 'Kirim Luar Kota', short: 'Pengiriman', Icon: Truck, tone: 'sky', hint: 'Contoh: pengiriman ke Malang, Senin 10.00' },
];

const TONE = {
  amber: { icon: 'bg-amber-100 text-amber-700', badge: 'bg-amber-50 text-amber-700 border-amber-200', ring: 'border-amber-300', active: 'bg-amber-50/80' },
  emerald: { icon: 'bg-emerald-100 text-emerald-700', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', ring: 'border-emerald-300', active: 'bg-emerald-50/80' },
  indigo: { icon: 'bg-indigo-100 text-indigo-700', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', ring: 'border-indigo-300', active: 'bg-indigo-50/80' },
  sky: { icon: 'bg-sky-100 text-sky-700', badge: 'bg-sky-50 text-sky-700 border-sky-200', ring: 'border-sky-300', active: 'bg-sky-50/80' },
};

function readNotes() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === 'string') : [];
  } catch {
    return [];
  }
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function HomeReminderModule({ onNavigate }) {
  const [notes, setNotes] = useState(readNotes);
  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [draft, setDraft] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); } catch (_) {}
  }, [notes]);

  const counts = useMemo(() => {
    const result = Object.fromEntries(CATEGORIES.map((item) => [item.id, 0]));
    notes.forEach((item) => { if (!item.done && result[item.category] !== undefined) result[item.category] += 1; });
    return result;
  }, [notes]);

  const activeCount = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const selected = CATEGORIES.find((item) => item.id === category) || CATEGORIES[0];
  const visibleNotes = activeCategory ? notes.filter((item) => item.category === activeCategory) : [];
  const activeMeta = CATEGORIES.find((item) => item.id === activeCategory);

  const addNote = () => {
    const value = draft.trim();
    if (!value) return;
    setNotes((current) => [{ id: makeId(), category, text: value, done: false, createdAt: new Date().toISOString() }, ...current]);
    setDraft('');
    setExpanded(false);
    setActiveCategory(category);
  };

  const toggleNote = (id) => setNotes((current) => current.map((item) => item.id === id ? { ...item, done: !item.done, updatedAt: new Date().toISOString() } : item));
  const deleteNote = (id) => setNotes((current) => current.filter((item) => item.id !== id));

  return (
    <section className="space-y-3" aria-label="Pengingat dan catatan operasional">
      <div className="overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls="home-reminder-form"
          className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-slate-50"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-200/70">
              <BellRing className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="mb-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-amber-700">Reminder & Input Baru</span>
              <span className="block truncate text-xs font-extrabold text-slate-800">Pengingat & Catatan Operasional</span>
              <span className="mt-0.5 block text-[10px] text-slate-500">Catat tugas, jadwal, dan tindak lanjut tim</span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-extrabold text-amber-700">{activeCount} aktif</span>
            {expanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
          </span>
        </button>

        {expanded && (
          <div id="home-reminder-form" className="space-y-3 border-t border-slate-100 bg-slate-50/80 p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Pilih kategori catatan</p>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((item) => {
                const Icon = item.Icon;
                const tone = TONE[item.tone];
                const isSelected = category === item.id;
                return (
                  <button key={item.id} type="button" onClick={() => setCategory(item.id)} aria-pressed={isSelected}
                    className={`flex min-h-11 items-center gap-2 rounded-xl border bg-white px-2.5 py-2 text-left text-[11px] font-bold transition-all ${isSelected ? `${tone.ring} ${tone.active} text-slate-800 shadow-sm` : 'border-slate-200 text-slate-600'}`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${tone.icon}`}><Icon className="h-3.5 w-3.5" /></span>
                    <span className="leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
            <label className="block">
              <span className="sr-only">Rincian catatan</span>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} maxLength={300}
                onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') addNote(); }}
                placeholder={selected.hint}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-xs text-slate-800 shadow-inner outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
              />
            </label>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-slate-400">{draft.length}/300 karakter</span>
              <button type="button" onClick={addNote} disabled={!draft.trim()}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-extrabold text-white shadow-md transition hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">
                <Plus className="h-4 w-4 text-amber-400" /> Simpan Catatan
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm"><ClipboardPlus className="h-4 w-4" /></span>
            <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">Modul Pengingat</h2>
          </div>
          <span className="text-[10px] font-bold text-slate-400">{notes.length - activeCount} selesai</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {CATEGORIES.map((item) => {
            const Icon = item.Icon;
            const tone = TONE[item.tone];
            const isActive = activeCategory === item.id;
            const latest = notes.find((note) => note.category === item.id && !note.done);
            return (
              <button key={item.id} type="button" onClick={() => setActiveCategory(isActive ? null : item.id)}
                aria-pressed={isActive}
                className={`group min-w-0 rounded-2xl border bg-white p-3.5 text-left shadow-sm transition-all active:scale-[0.98] ${isActive ? `${tone.ring} ${tone.active}` : 'border-slate-200/90 hover:border-slate-300'}`}>
                <span className="mb-2 flex items-start justify-between gap-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${tone.icon}`}><Icon className="h-4 w-4" /></span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${tone.badge}`}>{counts[item.id]}</span>
                </span>
                <span className="block text-xs font-extrabold leading-tight text-slate-800">{item.label}</span>
                <span className="mt-1 block truncate text-[10px] text-slate-500">{latest ? latest.text : 'Belum ada catatan aktif'}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeCategory && activeMeta && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label={`Daftar ${activeMeta.label}`}>
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-3">
            <div className="min-w-0">
              <h3 className="truncate text-xs font-extrabold text-slate-800">{activeMeta.label}</h3>
              <p className="text-[10px] text-slate-500">{visibleNotes.length} catatan tersimpan di perangkat ini</p>
            </div>
            <button type="button" onClick={() => setActiveCategory(null)} aria-label="Tutup daftar catatan" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
            {visibleNotes.length === 0 && <li className="px-3 py-6 text-center text-[11px] text-slate-400">Belum ada catatan. Gunakan form di atas untuk menambahkan.</li>}
            {visibleNotes.map((item) => (
              <li key={item.id} className="flex items-start gap-2.5 px-3.5 py-3">
                <button type="button" onClick={() => toggleNote(item.id)} aria-label={item.done ? 'Tandai belum selesai' : 'Tandai selesai'} className={`mt-0.5 shrink-0 ${item.done ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {item.done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`break-words text-xs font-semibold ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.text}</p>
                  <p className="mt-1 text-[9px] text-slate-400">{new Date(item.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
                <button type="button" onClick={() => deleteNote(item.id)} aria-label="Hapus catatan" className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="px-1 text-[9px] leading-relaxed text-slate-400">Catatan tersimpan di perangkat ini dan tidak otomatis terkirim ke WhatsApp atau Google Spreadsheet.</p>
    </section>
  );
}
