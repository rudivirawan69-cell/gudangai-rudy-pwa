import { useEffect, useState } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, Truck, PackageCheck, ClipboardCheck, BellRing } from 'lucide-react';

const STORAGE_KEY = 'gudangai_operator_tasks_v1';

const TYPE_META = {
  po: { label: 'Konfirmasi PO', Icon: ClipboardCheck, chip: 'bg-violet-500/15 text-violet-700' },
  datang: { label: 'Kedatangan barang', Icon: PackageCheck, chip: 'bg-emerald-500/15 text-emerald-700' },
  kirim: { label: 'Kirim luar kota', Icon: Truck, chip: 'bg-amber-500/15 text-amber-700' },
};

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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function uid() {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Catatan tugas operator di Beranda:
 * - Konfirmasi PO
 * - Kedatangan barang
 * - Jadwal pengiriman luar kota
 * Bisa ditambah, dicentang selesai/belum, dihapus. Tersimpan lokal perangkat.
 */
export default function OperatorTasks() {
  const [tasks, setTasks] = useState(() => loadTasks());
  const [text, setText] = useState('');
  const [type, setType] = useState('po');

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  const addTask = () => {
    const t = text.trim();
    if (!t) return;
    setTasks((prev) => [
      {
        id: uid(),
        type,
        text: t,
        done: false,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setText('');
  };

  const toggle = (id) => {
    setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  };

  const remove = (id) => {
    setTasks((prev) => prev.filter((x) => x.id !== id));
  };

  const pending = tasks.filter((t) => !t.done).length;

  return (
    <section aria-label="Pengingat dan konfirmasi kedatangan" className="mt-4 rounded-[26px] border border-stone-200/80 bg-[#fffdfa] p-4 sm:p-6 shadow-[0_10px_30px_rgba(30,41,59,0.07)] space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <BellRing className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900">Pengingat &amp; Konfirmasi Kedatangan</h2>
            <p className="text-xs sm:text-sm text-slate-500">Catatan tugas &amp; verifikasi supplier</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-700 tabular-nums">
          {pending} Catatan
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5" aria-label="Jenis pengingat">
        {Object.entries(TYPE_META).map(([key, meta]) => (
          <button
            key={key}
            type="button"
            onClick={() => setType(key)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
              type === key
                ? 'bg-cyan-700 text-white border-cyan-700 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-cyan-300'
            }`}
          >
            {meta.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addTask();
          }}
          placeholder={
            type === 'po'
              ? 'Contoh: Konfirmasi PO ayam fillet…'
              : type === 'datang'
                ? 'Contoh: Terima 20 pack udang PND…'
                : 'Contoh: Kirim ke Malang Senin 10:00…'
          }
          className="flex-1 min-w-0 h-12 rounded-2xl border border-slate-200/80 bg-white px-4 text-sm text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
        />
        <button
          type="button"
          onClick={addTask}
          className="shrink-0 h-12 rounded-2xl bg-cyan-700 px-4 text-white flex items-center justify-center gap-2 font-bold active:scale-95"
          aria-label="Tambah catatan"
        >
          <Plus className="w-5 h-5" /><span className="hidden sm:inline">Tambah</span>
        </button>
      </div>

      <ul className="space-y-2.5 max-h-72 overflow-y-auto">
        {tasks.length === 0 && (
          <li className="text-[11px] text-slate-400 text-center py-3 font-medium">
            Belum ada catatan. Tambah konfirmasi PO, kedatangan, atau jadwal kirim luar kota.
          </li>
        )}
        {tasks.map((task) => {
          const meta = TYPE_META[task.type] || TYPE_META.po;
          const Icon = meta.Icon;
          return (
            <li
              key={task.id}
              className={`flex items-start gap-3 rounded-2xl border px-3 py-3.5 sm:px-4 ${
                task.done
                  ? 'bg-white/70 border-slate-100 opacity-70'
                  : 'bg-white border-slate-100 shadow-[0_2px_8px_rgba(15,23,42,0.035)]'
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(task.id)}
                className="mt-0.5 shrink-0 text-cyan-700"
                aria-label={task.done ? 'Tandai belum' : 'Tandai selesai'}
              >
                {task.done ? <CheckCircle2 className="w-6 h-6 text-emerald-600" /> : <Circle className="w-6 h-6 text-slate-400" />}
              </button>
              <div className="flex-1 min-w-0">
                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${meta.chip}`}>
                  <Icon className="w-3 h-3" />
                  {meta.label}
                </span>
                <p
                  className={`text-sm font-semibold text-slate-800 mt-1 leading-snug ${
                    task.done ? 'line-through text-slate-400' : ''
                  }`}
                >
                  {task.text}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(task.id)}
                className="shrink-0 p-1 text-slate-400 hover:text-red-500"
                aria-label="Hapus"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
