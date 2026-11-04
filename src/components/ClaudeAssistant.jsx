import { useMemo, useState } from 'react';
import { Bot, ChevronRight, Loader2, Send, Sparkles } from 'lucide-react';
import { askClaude } from '../data/claude';

const QUICK_PROMPTS = [
  'Apa prioritas stok yang perlu ditangani hari ini?',
  'Buat ringkasan kondisi operasional CV dan PT.',
  'Apa yang harus saya cek sebelum kirim transaksi?',
];

function Message({ role, content }) {
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${role === 'user' ? 'bg-slate-900 text-white rounded-br-md' : 'bg-white/80 text-slate-700 border border-cyan-100 rounded-bl-md'}`}>
        {content}
      </div>
    </div>
  );
}

export default function ClaudeAssistant({ stock = [], pending = 0 }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Saya Claude untuk operasi GudangAI. Tanyakan prioritas stok, transaksi, atau sinkronisasi.' },
  ]);

  const context = useMemo(() => {
    const counts = { aman: 0, waspada: 0, kritis: 0 };
    for (const item of stock) {
      const qty = Number(item.stok ?? item.stockAkhir ?? 0) || 0;
      const min = Number(item.min ?? item.stockAman ?? 5) || 5;
      if (qty <= 0 || qty < min * 0.5) counts.kritis += 1;
      else if (qty < min) counts.waspada += 1;
      else counts.aman += 1;
    }
    return { app: 'GudangAI RUDY', timezone: 'Asia/Jakarta', stockSummary: counts, totalItems: stock.length, pendingSyncItems: pending };
  }, [pending, stock]);

  const send = async (preset = '') => {
    const message = String(preset || draft).trim();
    if (!message || loading) return;
    setDraft('');
    setError('');
    const next = [...messages, { role: 'user', content: message }];
    setMessages(next);
    setLoading(true);
    try {
      const result = await askClaude({ message, context, history: next });
      setMessages((current) => [...current, { role: 'assistant', content: result.reply || 'Tidak ada jawaban dari Claude.' }]);
    } catch (err) {
      setError(err?.message || 'Agent Claude belum siap.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="claude-assistant-card rounded-[1.5rem] border border-cyan-200/70 bg-gradient-to-br from-cyan-50 via-white to-indigo-50 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="w-10 h-10 rounded-2xl bg-slate-900 text-cyan-300 flex items-center justify-center shadow-lg"><Bot className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5"><p className="text-sm font-black text-slate-900">Claude Ops Assistant</p><Sparkles className="w-3.5 h-3.5 text-cyan-600" /></div>
          <p className="text-[11px] text-slate-500 mt-0.5">Baca konteks operasi tanpa mengubah master data</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-2 text-[10px] font-extrabold text-white active:scale-95" aria-expanded={open}>
          {open ? 'Tutup' : 'Tanya'} <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="border-t border-cyan-100 bg-white/55 px-4 py-3 space-y-3">
          <div className="max-h-52 overflow-y-auto space-y-2 pr-1" aria-live="polite">
            {messages.map((item, index) => <Message key={`${item.role}-${index}`} {...item} />)}
            {loading && <div className="flex items-center gap-2 text-[11px] text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Claude sedang menganalisis konteks operasi…</div>}
          </div>
          {error && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">{error}</p>}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {QUICK_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => send(prompt)} className="shrink-0 rounded-full border border-cyan-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-cyan-800 active:scale-95">{prompt}</button>)}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); send(); }} className="flex items-center gap-2">
            <input value={draft} onChange={(event) => setDraft(event.target.value)} className="form-control !rounded-2xl !bg-white px-3 py-2.5 text-xs" placeholder="Tulis pertanyaan operasi…" aria-label="Pertanyaan untuk Claude" />
            <button type="submit" disabled={!draft.trim() || loading} className="h-10 w-10 shrink-0 rounded-2xl bg-cyan-700 text-white flex items-center justify-center disabled:opacity-40" aria-label="Kirim pertanyaan"><Send className="w-4 h-4" /></button>
          </form>
          <p className="text-[9px] text-slate-400">Konteks yang dikirim hanya ringkasan stok dan jumlah antrean, bukan secret atau isi master data.</p>
        </div>
      )}
    </section>
  );
}
