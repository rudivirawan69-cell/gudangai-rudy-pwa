import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ArrowRight, Bot, Boxes, ClipboardList, FileSearch, PackageCheck, Send, ShieldCheck, Sparkles, Thermometer, Trash2, X } from 'lucide-react';

const AGENT_API = (import.meta.env.VITE_GUDANGAI_AGENT_API || 'https://gudangai-rudy-pwa69.rudivirawan69.workers.dev').replace(/\/$/, '');
const MAX_HISTORY = 8;

const SKILLS = [
  { id: 'stock', title: 'Analisis Stok', description: 'Evaluasi stok aman, kritis, dan kebutuhan item.', icon: Boxes, prompt: 'Bantu analisis data stok berikut. Pisahkan fakta, risiko, dan rekomendasi. Jangan mengarang angka atau saldo.\n\nTempel data stok di bawah ini:' },
  { id: 'purchasing', title: 'Purchasing & PO', description: 'Tinjau kebutuhan pembelian dan prioritas PO.', icon: ClipboardList, prompt: 'Bantu evaluasi rencana purchasing/PO berikut. Periksa kebutuhan, prioritas, potensi overstock, dan data yang masih kurang. Jangan membuat atau mengirim PO.\n\nTempel data PO/kebutuhan:' },
  { id: 'audit', title: 'Audit Transaksi', description: 'Periksa konsistensi catatan masuk, keluar, dan rusak.', icon: FileSearch, prompt: 'Bantu audit transaksi gudang berikut. Cari duplikasi, anomali jumlah, tanggal, dan informasi yang belum lengkap. Jangan mengubah transaksi.\n\nTempel data transaksi:' },
  { id: 'cold', title: 'Cold Storage', description: 'Checklist kondisi, risiko, dan tindak lanjut.', icon: Thermometer, prompt: 'Buat analisis kondisi cold storage berdasarkan catatan berikut. Bedakan fakta dan dugaan, lalu susun tindakan prioritas. Jangan mengasumsikan suhu sensor yang tidak diberikan.\n\nTempel catatan kondisi:' },
  { id: 'sop', title: 'SOP & Checklist', description: 'Susun langkah kerja dan pemeriksaan operator.', icon: ShieldCheck, prompt: 'Susun SOP/checklist operasional gudang yang ringkas, berurutan, dan mudah dijalankan untuk kebutuhan berikut:' },
  { id: 'report', title: 'Laporan Operasional', description: 'Rangkum progres, kendala, dan rencana tindak lanjut.', icon: PackageCheck, prompt: 'Bantu susun laporan operasional gudang dari catatan berikut. Kelompokkan hasil, kendala, risiko, dan tindak lanjut. Jangan menambah fakta yang tidak tersedia.\n\nTempel catatan:' },
];

function getReply(payload) {
  return String(payload?.reply || payload?.response || payload?.text || '').trim();
}

export default function AIAssistantPage({ onNavigate }) {
  const { accessToken, authStatus } = useAuth();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [activeSkill, setActiveSkill] = useState('general');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [health, setHealth] = useState('Memeriksa koneksi Worker AI…');
  const controllerRef = useRef(null);
  const bottomRef = useRef(null);
  const chatScrollRef = useRef(null);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${AGENT_API}/api/agent/health`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success !== true) throw new Error(payload.error || `HTTP ${response.status}`);
        setHealth(payload.primaryConfigured ? `Worker aktif · ${payload.model || 'Workers AI'}` : 'Worker merespons, binding AI belum terdeteksi');
      })
      .catch((err) => { if (err.name !== 'AbortError') setHealth('Worker belum dapat dijangkau'); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const sendMessage = useCallback(async (rawText) => {
    const message = String(rawText || '').trim();
    if (!message || loading || !online) return;
    setError('');
    setDraft('');
    const history = messages.slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, { role: 'user', content: message }, { role: 'assistant', content: '', pending: true }]);
    setLoading(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response = await fetch(`${AGENT_API}/api/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: 'omit',
        signal: controller.signal,
        body: JSON.stringify({
          message,
          history,
          context: {
            application: 'GudangAI RUDY PWA',
            agent: 'Agent Rubee Intelligence',
            surface: 'Halaman operasional AI',
            skill: activeSkill,
            permissions: 'read_only',
            capabilities: ['analisis data yang diberikan operator', 'rekomendasi purchasing dan PO', 'audit catatan transaksi', 'checklist cold storage', 'SOP operasional', 'ringkasan laporan'],
            constraints: ['tidak memiliki akses baca langsung ke Google Sheets', 'tidak menulis atau mengubah transaksi', 'jangan mengarang stok, kode, jumlah, PO, atau jadwal', 'minta data sumber bila diperlukan'],
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success !== true) {
        const authHint = !accessToken || authStatus !== 'authenticated'
          ? ' Sesi Supabase aktif diperlukan; login ulang dengan akun yang terhubung.'
          : '';
        throw new Error((payload.error || payload.detail || `Worker AI gagal merespons (HTTP ${response.status})`) + authHint);
      }
      const reply = getReply(payload);
      if (!reply) throw new Error('Worker AI mengirim respons kosong.');
      setMessages((current) => {
        const next = [...current];
        next[next.length - 1] = { role: 'assistant', content: reply, model: payload.model, provider: payload.provider };
        return next;
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Gagal menghubungi Worker AI.');
        setMessages((current) => current.filter((item) => !item.pending));
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setLoading(false);
    }
  }, [accessToken, activeSkill, authStatus, loading, messages, online]);

  const chooseSkill = (skill) => {
    setActiveSkill(skill.id);
    setDraft(skill.prompt);
  };

  const clearChat = () => {
    if (loading) controllerRef.current?.abort();
    controllerRef.current = null;
    setMessages([]);
    setError('');
    setLoading(false);
  };

  return (
    <section
      className="mx-auto flex h-[calc(100dvh-7.5rem)] w-full max-w-4xl flex-col gap-3 overflow-hidden pb-1"
      aria-label="Agent Rubee Intelligence"
    >
      <header className="shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-700 text-white shadow">
            <Bot className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-black text-slate-900 dark:text-white">Agent Rubee Intelligence</h2>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Worker AI</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{health}</p>
          </div>
          <button type="button" onClick={clearChat} disabled={!messages.length && !loading} className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-40 dark:border-slate-700" aria-label="Hapus percakapan" title="Percakapan baru">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3">
        {SKILLS.map((skill) => {
          const Icon = skill.icon;
          const selected = activeSkill === skill.id;
          return (
            <button key={skill.id} type="button" onClick={() => chooseSkill(skill)}
              className={`rounded-xl border p-3 text-left transition ${selected ? 'border-cyan-500 bg-cyan-50 ring-1 ring-cyan-300 dark:bg-cyan-950/40' : 'border-slate-200 bg-white hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-900'}`}>
              <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-cyan-700 dark:bg-slate-800 dark:text-cyan-300"><Icon className="h-4 w-4" /></span>
              <span className="block text-xs font-extrabold text-slate-800 dark:text-slate-100">{skill.title}</span>
              <span className="mt-1 block text-[10px] leading-snug text-slate-500 dark:text-slate-400">{skill.description}</span>
            </button>
          );
        })}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
        <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{online ? 'Online' : 'Offline'} · {activeSkill === 'general' ? 'Mode umum' : SKILLS.find((item) => item.id === activeSkill)?.title}</span>
        <span className="ml-auto text-[10px] text-slate-400">Analisis berbasis data yang Anda kirim</span>
      </div>

      <div
        ref={chatScrollRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-slate-50/90 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/70"
      >
        {!messages.length && (
          <div className="m-auto max-w-md py-5 text-center">
            <Sparkles className="mx-auto mb-2 h-8 w-8 text-cyan-600" />
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Apa yang perlu dibantu?</h3>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Pilih skill atau tulis instruksi operasional. Rubee akan membantu analisis dan menyusun langkah kerja.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => onNavigate?.('stok')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Buka Data Stok <ArrowRight className="ml-1 inline h-3 w-3" /></button>
              <button type="button" onClick={() => onNavigate?.('po')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Buka PO <ArrowRight className="ml-1 inline h-3 w-3" /></button>
            </div>
          </div>
        )}
        {messages.map((item, index) => (
          <article key={index} className={`max-w-[94%] rounded-2xl px-3.5 py-3 text-sm leading-relaxed shadow-sm ${item.role === 'user' ? 'ml-auto bg-[#0b2a55] text-white' : 'mr-auto border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'}`}>
            <p className="mb-1 text-[10px] font-bold opacity-60">{item.role === 'user' ? 'Operator' : `Rubee · ${item.model || 'Workers AI'}`}</p>
            <p className="whitespace-pre-wrap break-words">{item.content || (item.pending ? 'Rubee sedang menganalisis…' : '')}</p>
          </article>
        ))}
        {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><X className="h-4 w-4 shrink-0" />{error}</div>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(event) => { event.preventDefault(); sendMessage(draft); }}
        className="sticky bottom-0 z-10 shrink-0 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900"
      >
        <label htmlFor="rubee-message" className="sr-only">Instruksi untuk Rubee</label>
        <div className="flex items-end gap-2">
          <textarea
            id="rubee-message"
            rows={2}
            maxLength={4000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(draft); } }}
            placeholder="Tulis kebutuhan operasional…"
            disabled={loading || !online}
            className="max-h-36 min-h-[48px] flex-1 resize-y rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-300 disabled:opacity-50 dark:bg-slate-800 dark:text-white"
          />
          <button type="submit" disabled={!draft.trim() || loading || !online} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0b2a55] text-white disabled:opacity-40" aria-label="Kirim ke Rubee">
            {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="px-2 pt-1.5 text-[9px] text-slate-400">Mode analisis: tidak membaca atau mengubah Google Sheets secara langsung. Jangan kirim PIN, password, atau API key.</p>
      </form>
    </section>
  );
}
