import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Trash2, CheckCircle2, Circle, Truck, PackageCheck, ClipboardCheck,
  BellRing, ChevronDown, PackagePlus, Palmtree, Users,
} from 'lucide-react';

const STORAGE_KEY = 'gudangai_operator_tasks_v1';

const TYPE_META = {
  order: { label: 'Tambahan Order', Icon: PackagePlus, chip: 'ot-chip ot-chip-order' },
  off: { label: 'Jadwal Off', Icon: Palmtree, chip: 'ot-chip ot-chip-off' },
  meeting: { label: 'Jadwal Meeting', Icon: Users, chip: 'ot-chip ot-chip-meeting' },
  datang: { label: 'Kedatangan Barang', Icon: PackageCheck, chip: 'ot-chip ot-chip-datang' },
  kirim: { label: 'Kirim Luar Kota', Icon: Truck, chip: 'ot-chip ot-chip-kirim' },
  // Keep old saved PO tasks readable and editable after the UI refresh.
  po: { label: 'Konfirmasi PO', Icon: ClipboardCheck, chip: 'ot-chip ot-chip-po' },
};

const FILTERS = [
  { key: 'order', label: 'Tambahan Order', Icon: PackagePlus },
  { key: 'off', label: 'Jadwal Off', Icon: Palmtree },
  { key: 'meeting', label: 'Jadwal Meeting', Icon: Users },
  { key: 'kirim', label: 'Kirim Luar Kota', Icon: Truck },
];

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTasks(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* storage may be unavailable */ }
}

function uid() {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function OperatorTasks() {
  const [tasks, setTasks] = useState(() => loadTasks());
  const [text, setText] = useState('');
  const [type, setType] = useState('order');
  const [activeFilter, setActiveFilter] = useState('all');
  const [collapsed, setCollapsed] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { saveTasks(tasks); }, [tasks]);

  const addTask = () => {
    const value = text.trim();
    if (!value) return;
    setTasks((prev) => [{
      id: uid(), type, text: value, done: false, pinned: false, createdAt: new Date().toISOString(),
    }, ...prev]);
    setText('');
    setActiveFilter('all');
  };

  const toggle = (id) => setTasks((prev) => prev.map((x) => x.id === id ? { ...x, done: !x.done } : x));
  const togglePin = (id) => setTasks((prev) => prev.map((x) => x.id === id ? { ...x, pinned: !x.pinned } : x));
  const remove = (id) => setTasks((prev) => prev.filter((x) => x.id !== id));

  const activeCount = tasks.filter((t) => !t.done).length;
  const doneCount = tasks.length - activeCount;
  const visibleTasks = useMemo(() => tasks
    .filter((task) => activeFilter === 'all' || task.type === activeFilter || (activeFilter === 'order' && task.type === 'po'))
    .slice()
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
  [tasks, activeFilter]);

  const summaryText = tasks.length === 0
    ? 'Belum ada catatan. Tambahkan order, jadwal tim, kedatangan barang, atau pengiriman luar kota.'
    : activeCount === 0
      ? `Seluruh ${doneCount} catatan telah diselesaikan.`
      : `${doneCount} selesai · ${activeCount} masih perlu ditindaklanjuti.`;

  const openQuickAdd = () => {
    setCollapsed(false);
    window.setTimeout(() => inputRef.current?.focus(), 80);
  };

  return (
    <section className="operator-tasks-card mt-4 rounded-2xl border overflow-hidden" aria-label="Pengingat dan catatan operasional">
      <div className="ot-module-head flex items-center justify-between gap-2 px-3.5 py-3">
        <button type="button" className="flex items-center gap-3 min-w-0 flex-1 text-left" onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed}>
          <span className="ot-icon-wrap flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><BellRing className="h-5 w-5" /></span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 flex-wrap">
              <span className="ot-title text-sm font-extrabold">Pengingat &amp; Catatan</span>
              <span className="ot-badge rounded-full px-2 py-0.5 text-[10px] font-extrabold tabular-nums">{activeCount} Aktif</span>
            </span>
            <span className="ot-subtitle block text-[10px] mt-0.5">Catatan operasional &amp; tugas lapangan</span>
          </span>
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={openQuickAdd} className="ot-quick-add h-8 w-8 rounded-lg flex items-center justify-center" aria-label="Tambah catatan"><Plus className="h-5 w-5" /></button>
          <button type="button" onClick={() => setCollapsed((v) => !v)} className="ot-collapse h-8 w-8 rounded-lg flex items-center justify-center" aria-label={collapsed ? 'Buka pengingat' : 'Tutup pengingat'}>
            <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="ot-module-content border-t px-3.5 py-3.5 space-y-3.5">
          <div className="space-y-1.5">
            <p className="ot-section-label text-[10px] font-extrabold uppercase tracking-wider">Filter Kategori Ops</p>
            <div className="grid grid-cols-2 gap-2">
              {FILTERS.map(({ key, label, Icon }) => (
                <button key={key} type="button" onClick={() => setActiveFilter((v) => v === key ? 'all' : key)}
                  className={`ot-filter-btn flex items-center gap-2 rounded-xl border p-2.5 text-left ${activeFilter === key ? 'is-active' : ''}`}>
                  <span className="ot-filter-icon h-7 w-7 rounded-lg flex items-center justify-center shrink-0"><Icon className="h-4 w-4" /></span>
                  <span className="text-[10px] font-bold leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <form className="ot-form rounded-xl border p-3 space-y-3" onSubmit={(e) => { e.preventDefault(); addTask(); }}>
            <div className="flex items-center justify-between gap-2">
              <span className="ot-form-title text-xs font-extrabold">Tambah Catatan Baru</span>
              <span className="ot-form-hint text-[9px] font-semibold">Tersimpan di perangkat</span>
            </div>
            <textarea ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} rows={2}
              placeholder="Tulis catatan operasional, nomor PO, jadwal, atau tujuan pengiriman…"
              className="ot-input w-full rounded-xl border px-3 py-2.5 text-xs resize-y" />
            <div className="grid grid-cols-2 gap-2">
              {[
                ['order', 'Tambahan Order'], ['off', 'Jadwal Off'], ['meeting', 'Jadwal Meeting'],
                ['datang', 'Kedatangan Barang'], ['kirim', 'Kirim Luar Kota'],
              ].map(([key, label]) => (
                <label key={key} className={`ot-tag-option flex items-center justify-center rounded-lg border px-2 py-2 text-[10px] font-bold ${type === key ? 'is-active' : ''}`}>
                  <input type="radio" name="operator-task-type" value={key} checked={type === key} onChange={() => setType(key)} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
            <button type="submit" disabled={!text.trim()} className="ot-add-btn w-full rounded-xl py-2.5 text-xs font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-45">
              <Plus className="h-4 w-4" /> Simpan Catatan
            </button>
          </form>

          <div className="space-y-2" aria-live="polite">
            {visibleTasks.length === 0 && (
              <div className="ot-empty rounded-xl border border-dashed py-6 text-center text-xs">
                Tidak ada catatan pada kategori ini.
              </div>
            )}
            {visibleTasks.map((task) => {
              const meta = TYPE_META[task.type] || TYPE_META.order;
              const Icon = meta.Icon;
              return (
                <article key={task.id} className={`ot-item flex items-start gap-2.5 rounded-xl border p-3 ${task.done ? 'is-done' : ''} ${task.pinned ? 'is-pinned' : ''}`}>
                  <button type="button" onClick={() => toggle(task.id)} className="ot-check mt-0.5 shrink-0" aria-label={task.done ? 'Tandai belum selesai' : 'Tandai selesai'}>
                    {task.done ? <CheckCircle2 className="h-5 w-5 ot-check-done" /> : <Circle className="h-5 w-5 ot-check-open" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`ot-chip rounded-md border px-2 py-0.5 text-[9px] font-extrabold ${meta.chip}`}><Icon className="inline h-3 w-3 mr-1" />{meta.label}</span>
                      <span className="ot-time text-[9px] font-medium">{task.createdAt ? new Date(task.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB' : ''}</span>
                      {task.pinned && <span className="ot-pinned text-[9px] font-bold">Disematkan</span>}
                    </div>
                    <p className={`ot-item-text text-xs font-semibold leading-relaxed mt-1 ${task.done ? 'is-done-text' : ''}`}>{task.text}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => togglePin(task.id)} className={`ot-action-pin p-1 rounded-md ${task.pinned ? 'is-active' : ''}`} aria-label="Sematkan catatan" title="Sematkan"><ClipboardCheck className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => remove(task.id)} className="ot-delete p-1 rounded-md" aria-label="Hapus catatan" title="Hapus"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="ot-hasil-jadi rounded-xl border px-3 py-2.5" role="status">
            <p className="ot-hasil-label text-[9px] font-extrabold uppercase tracking-wider mb-1">Ringkasan Tugas</p>
            <p className="ot-hasil-text text-[11px] leading-relaxed font-medium">{summaryText}</p>
            <div className="ot-hasil-stats flex gap-3 mt-2 text-[9px] font-extrabold tabular-nums">
              <span className="ot-stat-done">{doneCount} selesai</span><span className="ot-stat-pending">{activeCount} aktif</span><span className="ot-stat-total">{tasks.length} total</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
