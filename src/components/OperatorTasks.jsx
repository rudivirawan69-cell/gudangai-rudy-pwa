import { useEffect, useState } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, Truck, PackageCheck, ClipboardCheck } from 'lucide-react';

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
    <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/80 dark:bg-slate-800/40 px-3 py-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-extrabold text-slate-800 uppercase tracking-wide">
          Catatan tugas operator
        </p>
        <span className="text-[10px] font-bold text-slate-500 tabular-nums">
          {pending} aktif · {tasks.length} total
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Object.entries(TYPE_META).map(([key, meta]) => (
          <button
            key={key}
            type="button"
            onClick={() => setType(key)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
              type === key
                ? 'bg-cyan-600 text-white border-cyan-600'
                : 'bg-white text-slate-600 border-slate-200'
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
          className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-900 font-medium placeholder:text-slate-400"
        />
        <button
          type="button"
          onClick={addTask}
          className="shrink-0 w-10 h-10 rounded-xl bg-cyan-600 text-white flex items-center justify-center active:scale-95"
          aria-label="Tambah catatan"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <ul className="space-y-1.5 max-h-52 overflow-y-auto">
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
              className={`flex items-start gap-2 rounded-xl border px-2.5 py-2 ${
                task.done
                  ? 'bg-white/60 border-slate-100 opacity-70'
                  : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(task.id)}
                className="mt-0.5 shrink-0 text-cyan-700"
                aria-label={task.done ? 'Tandai belum' : 'Tandai selesai'}
              >
                {task.done ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Circle className="w-5 h-5" />}
              </button>
              <div className="flex-1 min-w-0">
                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${meta.chip}`}>
                  <Icon className="w-3 h-3" />
                  {meta.label}
                </span>
                <p
                  className={`text-[12px] font-semibold text-slate-800 mt-1 leading-snug ${
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
    </div>
  );
}
