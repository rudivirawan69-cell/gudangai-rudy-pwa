import { useEffect, useState, useMemo } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, Truck, PackageCheck, ClipboardCheck, BellRing, CalendarOff } from 'lucide-react';

const STORAGE_KEY = 'gudangai_operator_tasks_v1';

const TYPE_META = {
  po: {
    label: 'Konfirmasi PO',
    Icon: ClipboardCheck,
    chip: 'ot-chip ot-chip-po',
  },
  datang: {
    label: 'Kedatangan barang',
    Icon: PackageCheck,
    chip: 'ot-chip ot-chip-datang',
  },
  kirim: {
    label: 'Kirim luar kota',
    Icon: Truck,
    chip: 'ot-chip ot-chip-kirim',
  },
  off: {
    label: 'Jadwal off & tugas',
    Icon: CalendarOff,
    chip: 'ot-chip ot-chip-off',
  },
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
 * Mendukung Soft Productive / Navy Dark / Teal Soft.
 */
export default function OperatorTasks({ initialType = 'po' } = {}) {
  const [tasks, setTasks] = useState(() => loadTasks());
  const [text, setText] = useState('');
  const [type, setType] = useState(initialType);

  useEffect(() => {
    if (TYPE_META[initialType]) setType(initialType);
  }, [initialType]);

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

  const { pending, doneCount, byType } = useMemo(() => {
    let pending = 0;
    let doneCount = 0;
    const byType = { po: 0, datang: 0, kirim: 0, off: 0 };
    for (const t of tasks) {
      if (t.done) doneCount += 1;
      else {
        pending += 1;
        if (byType[t.type] !== undefined) byType[t.type] += 1;
      }
    }
    return { pending, doneCount, byType };
  }, [tasks]);

  const hasilJadiText = useMemo(() => {
    if (tasks.length === 0) {
      return 'Belum ada catatan. Tambahkan konfirmasi PO, kedatangan barang, atau jadwal kirim luar kota untuk mulai memantau hasil operasional harian.';
    }
    if (pending === 0) {
      return `Hasil jadi: seluruh ${doneCount} catatan telah diselesaikan. Status operasional kedatangan & konfirmasi hari ini bersih.`;
    }
    const parts = [];
    if (byType.po > 0) parts.push(`${byType.po} konfirmasi PO`);
    if (byType.datang > 0) parts.push(`${byType.datang} kedatangan barang`);
    if (byType.kirim > 0) parts.push(`${byType.kirim} kirim luar kota`);
    if (byType.off > 0) parts.push(`${byType.off} jadwal off/tugas`);
    const pendingLabel = parts.length ? parts.join(', ') : `${pending} catatan`;
    return `Hasil jadi: ${doneCount} selesai · ${pending} masih terbuka (${pendingLabel}). Centang item setelah diverifikasi agar status operasional tetap akurat.`;
  }, [tasks.length, pending, doneCount, byType]);

  return (
    <section
      id="operator-tasks-panel"
      aria-label="Pengingat, konfirmasi kedatangan, dan tugas operator"
      className="operator-tasks-card mt-4 rounded-[26px] border p-4 sm:p-6 space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="ot-icon-wrap flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
            <BellRing className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="ot-title text-base sm:text-lg font-extrabold tracking-tight">
              Pengingat &amp; Konfirmasi Kedatangan
            </h2>
            <p className="ot-subtitle text-xs sm:text-sm">
              Catatan tugas &amp; verifikasi supplier
            </p>
          </div>
        </div>
        <span className="ot-badge shrink-0 rounded-full px-3 py-2 text-xs font-extrabold tabular-nums">
          {pending} Catatan
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5" aria-label="Jenis pengingat">
        {Object.entries(TYPE_META).map(([key, meta]) => (
          <button
            key={key}
            type="button"
            onClick={() => setType(key)}
            className={`ot-type-btn px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
              type === key ? 'is-active' : ''
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
          className="ot-input flex-1 min-w-0 h-12 rounded-2xl border px-4 text-sm font-medium focus:outline-none focus:ring-2"
        />
        <button
          type="button"
          onClick={addTask}
          className="ot-add-btn shrink-0 h-12 rounded-2xl px-4 text-white flex items-center justify-center gap-2 font-bold active:scale-95"
          aria-label="Tambah catatan"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Tambah</span>
        </button>
      </div>

      <ul className="space-y-2.5 max-h-72 overflow-y-auto ot-list">
        {tasks.length === 0 && (
          <li className="ot-empty text-[11px] text-center py-3 font-medium">
            Belum ada catatan. Tambahkan konfirmasi PO, kedatangan, jadwal off, atau pengiriman luar kota.
          </li>
        )}
        {tasks.map((task) => {
          const meta = TYPE_META[task.type] || TYPE_META.po;
          const Icon = meta.Icon;
          return (
            <li
              key={task.id}
              className={`ot-item flex items-start gap-3 rounded-2xl border px-3 py-3.5 sm:px-4 ${
                task.done ? 'is-done' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(task.id)}
                className="ot-check mt-0.5 shrink-0"
                aria-label={task.done ? 'Tandai belum' : 'Tandai selesai'}
              >
                {task.done ? (
                  <CheckCircle2 className="w-6 h-6 ot-check-done" />
                ) : (
                  <Circle className="w-6 h-6 ot-check-open" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${meta.chip}`}>
                  <Icon className="w-3 h-3" />
                  {meta.label}
                </span>
                <p className={`ot-item-text text-sm font-semibold mt-1 leading-snug ${task.done ? 'is-done-text' : ''}`}>
                  {task.text}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(task.id)}
                className="ot-delete shrink-0 p-1"
                aria-label="Hapus"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          );
        })}
      </ul>

      {/* Keterangan hasil jadi — di bawah kotak kartu kedatangan barang */}
      <div className="ot-hasil-jadi rounded-2xl border px-3.5 py-3" role="status" aria-live="polite">
        <p className="ot-hasil-label text-[10px] font-extrabold uppercase tracking-[0.12em] mb-1">
          Keterangan hasil jadi
        </p>
        <p className="ot-hasil-text text-[12px] leading-snug font-medium">
          {hasilJadiText}
        </p>
        {tasks.length > 0 && (
          <div className="ot-hasil-stats flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] font-bold tabular-nums">
            <span className="ot-stat-done">{doneCount} selesai</span>
            <span className="ot-stat-pending">{pending} terbuka</span>
            <span className="ot-stat-total">{tasks.length} total</span>
          </div>
        )}
      </div>
    </section>
  );
}
