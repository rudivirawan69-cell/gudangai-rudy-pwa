import React, { useEffect, useState } from 'react';
import { BookOpen, Loader2, Plus, Trash2, X } from 'lucide-react';

const MEMORY_KINDS = [
  { value: 'idea', label: 'Gagasan' },
  { value: 'decision', label: 'Keputusan' },
  { value: 'learning', label: 'Temuan' },
  { value: 'follow_up', label: 'Tindak lanjut' },
];

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Baru disimpan';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

export default function AgentMemoryPanel({
  open,
  onClose,
  items = [],
  loading = false,
  saving = false,
  locked = false,
  error = '',
  onSave,
  onDelete,
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [kind, setKind] = useState('idea');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    try {
      await onSave?.({ title, content, kind });
      setTitle('');
      setContent('');
      setKind('idea');
    } catch (submitError) {
      setFormError(submitError?.message || 'Memori gagal disimpan. Coba lagi.');
    }
  };

  const handleDelete = async (id) => {
    setFormError('');
    try {
      await onDelete?.(id);
    } catch (deleteError) {
      setFormError(deleteError?.message || 'Catatan gagal dihapus. Coba lagi.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 p-2 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="agent-memory-title" className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3.5 dark:border-slate-700">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200"><BookOpen className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="agent-memory-title" className="text-sm font-black text-slate-900 dark:text-white">Memori pengembangan</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Catatan ini dipakai sebagai konteks Rubee pada sesi berikutnya.</p>
          </div>
          <button type="button" onClick={onClose} autoFocus className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" aria-label="Tutup memori">
            <X className="size-4" />
          </button>
        </header>

        <div className="overflow-y-auto p-4">
          {locked ? (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">Login Supabase diperlukan untuk melihat atau menyimpan memori lintas sesi.</div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-3.5 dark:border-cyan-900/70 dark:bg-cyan-950/20">
              <div>
                <label htmlFor="agent-memory-title-input" className="mb-1 block text-[11px] font-bold text-slate-700 dark:text-slate-200">Judul</label>
                <input id="agent-memory-title-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required placeholder="Contoh: Ide perbaikan alur stok" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                <div>
                  <label htmlFor="agent-memory-kind" className="mb-1 block text-[11px] font-bold text-slate-700 dark:text-slate-200">Jenis catatan</label>
                  <select id="agent-memory-kind" value={kind} onChange={(event) => setKind(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                    {MEMORY_KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="agent-memory-content" className="mb-1 block text-[11px] font-bold text-slate-700 dark:text-slate-200">Catatan</label>
                  <textarea id="agent-memory-content" value={content} onChange={(event) => setContent(event.target.value)} maxLength={2400} required rows={3} placeholder="Simpan gagasan atau keputusan yang ingin dipertimbangkan lagi…" className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                </div>
              </div>
              {formError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{formError}</p>}
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Pribadi untuk akun ini · jangan simpan PIN atau kredensial.</p>
                <button type="submit" disabled={saving || !title.trim() || !content.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0b2a55] px-3.5 py-2.5 text-xs font-bold text-white disabled:opacity-45">
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  {saving ? 'Menyimpan…' : 'Simpan catatan'}
                </button>
              </div>
            </form>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-100">Catatan tersimpan</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{items.length} / 30</span>
          </div>
          {error && <p role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
          {locked ? (
            <p className="mt-2 rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs leading-relaxed text-slate-500 dark:border-slate-700">Catatan tersimpan hanya dapat dilihat setelah login dengan akun yang sama.</p>
          ) : loading ? (
            <p role="status" className="py-6 text-center text-xs text-slate-500">Memuat catatan…</p>
          ) : !items.length ? (
            <p className="mt-2 rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs leading-relaxed text-slate-500 dark:border-slate-700">Belum ada catatan. Simpan ide, keputusan, atau tindak lanjut agar Rubee dapat menggunakannya sebagai konteks di sesi berikutnya.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2.5">
              {items.map((item) => (
                <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="break-words text-xs font-extrabold text-slate-900 dark:text-white">{item.title}</h4>
                        <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[9px] font-bold text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200">{MEMORY_KINDS.find((option) => option.value === item.kind)?.label || 'Gagasan'}</span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600 dark:text-slate-300">{item.content}</p>
                      <time className="mt-2 block text-[10px] text-slate-400" dateTime={item.created_at}>{formatDate(item.created_at)}</time>
                    </div>
                    <button type="button" onClick={() => handleDelete(item.id)} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40" aria-label={`Hapus memori ${item.title}`} title="Hapus catatan">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
