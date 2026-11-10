import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ArrowDown, ArrowRight, Bot, Boxes, ClipboardList, FileSearch, PackageCheck, Send, ShieldCheck, Sparkles, Thermometer, Trash2, X } from 'lucide-react';

const AGENT_API = (import.meta.env.VITE_GUDANGAI_AI_API_BASE || import.meta.env.VITE_GUDANGAI_AGENT_API || 'https://gudangai-rudy-pwa-69.rudivirawan69.workers.dev').replace(/\/$/, '');
const MAX_HISTORY = 8;
// Jarak (px) dari dasar daftar pesan yang masih dianggap "sedang membaca pesan terbaru".
const STICK_THRESHOLD = 96;

const SKILLS = [
  { id: 'stock', title: 'Analisis Stok', description: 'Evaluasi stok aman, kritis, dan kebutuhan item.', icon: Boxes, prompt: 'Analisis data stok gudang melalui sumber live read-only yang tersedia. Jika data live tidak tersedia, minta operator menempelkan data stok. Pisahkan fakta, risiko, dan rekomendasi; jangan mengarang angka atau saldo.' },
  { id: 'purchasing', title: 'Purchasing & PO', description: 'Tinjau kebutuhan pembelian dan prioritas PO.', icon: ClipboardList, prompt: 'Evaluasi kebutuhan purchasing dan status PO berdasarkan data read-only yang tersedia. Jika data live tidak tersedia, minta operator menempelkan data PO atau kebutuhan. Periksa prioritas, potensi overstock, dan data yang masih kurang. Jangan membuat atau mengirim PO.' },
  { id: 'audit', title: 'Audit Transaksi', description: 'Periksa konsistensi catatan masuk, keluar, dan rusak.', icon: FileSearch, prompt: 'Audit transaksi gudang berdasarkan riwayat read-only yang tersedia. Jika data live tidak tersedia, minta operator menempelkan data transaksi. Cari duplikasi, anomali jumlah, tanggal, dan informasi yang belum lengkap. Jangan mengubah transaksi.' },
  { id: 'cold', title: 'Cold Storage', description: 'Checklist kondisi, risiko, dan tindak lanjut.', icon: Thermometer, prompt: 'Buat analisis kondisi cold storage berdasarkan catatan berikut. Bedakan fakta dan dugaan, lalu susun tindakan prioritas. Jangan mengasumsikan suhu sensor yang tidak diberikan.\n\nTempel catatan kondisi:' },
  { id: 'sop', title: 'SOP & Checklist', description: 'Susun langkah kerja dan pemeriksaan operator.', icon: ShieldCheck, prompt: 'Susun SOP/checklist operasional gudang yang ringkas, berurutan, dan mudah dijalankan untuk kebutuhan berikut:' },
  { id: 'report', title: 'Laporan Operasional', description: 'Rangkum progres, kendala, dan rencana tindak lanjut.', icon: PackageCheck, prompt: 'Susun laporan operasional gudang berdasarkan data read-only yang tersedia dan catatan operator. Jika sumber live tidak tersedia, minta catatan atau data pendukung. Kelompokkan hasil, kendala, risiko, dan tindak lanjut. Jangan menambah fakta yang tidak tersedia.' },
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
  const [showJump, setShowJump] = useState(false);
  const controllerRef = useRef(null);
  const scrollRef = useRef(null);
  const stickRef = useRef(true);

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

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Pengguna yang menggulir ke atas tidak ditarik kembali ke bawah.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance <= STICK_THRESHOLD;
    stickRef.current = atBottom;
    setShowJump(!atBottom);
  }, []);

  useEffect(() => {
    if (stickRef.current) scrollToBottom('smooth');
  }, [messages, loading, error, scrollToBottom]);

  const sendMessage = useCallback(async (rawText) => {
    const message = String(rawText || '').trim();
    if (!message || loading || !online) return;
    setError('');
    setDraft('');
    stickRef.current = true;
    setShowJump(false);
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
            constraints: ['membaca data gudang hanya melalui gateway server read-only yang diizinkan; tidak mengakses spreadsheet secara langsung', 'tidak menulis atau mengubah stok, transaksi, maupun PO', 'jangan mengarang stok, kode, jumlah, status PO, atau jadwal', 'jika sumber live gagal atau belum tersedia, nyatakan data belum terkonfirmasi dan minta data pendukung'],
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
    stickRef.current = true;
    setShowJump(false);
  };

  const skillTitle = activeSkill === 'general' ? 'Mode umum' : SKILLS.find((item) => item.id === activeSkill)?.title;

  return (
    <section
      className="mx-auto flex w-full max-w-4xl flex-col gap-2.5"
      // Tinggi halaman mengikuti layar; area pesan menggulir sendiri di dalamnya.
      // Sesuaikan --app-chrome (tinggi header + navigasi bawah aplikasi) bila perlu.
      style={{ height: 'calc(100dvh - var(--app-chrome, 9rem))', minHeight: '26rem' }}
      aria-label="Agent Rubee Intelligence"
    >
      <header className="shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-700 text-white shadow">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-black text-slate-900 dark:text-white">Agent Rubee Intelligence</h2>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
              <span className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="truncate">{online ? health : 'Offline'} · {skillTitle}</span>
            </p>
          </div>
          <button type="button" onClick={clearChat} disabled={!messages.length && !loading} className="rounded-xl border border-slate-200 p-2.5 text-slate-500 disabled:opacity-40 dark:border-slate-700" aria-label="Hapus percakapan" title="Percakapan baru">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="-mx-1 shrink-0 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Pilih skill">
        <div className="flex gap-2">
          {SKILLS.map((skill) => {
            const Icon = skill.icon;
            const selected = activeSkill === skill.id;
            return (
              <button key={skill.id} type="button" onClick={() => chooseSkill(skill)} title={skill.description}
                className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold transition ${selected ? 'border-cyan-500 bg-cyan-50 text-cyan-800 ring-1 ring-cyan-300 dark:bg-cyan-950/40 dark:text-cyan-200' : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>
                <Icon className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
                {skill.title}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50/90 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="absolute inset-0 flex flex-col gap-4 overflow-y-auto overscroll-contain px-3.5 py-4 sm:px-5 [-webkit-overflow-scrolling:touch]"
          role="log"
          aria-live="polite"
          aria-label="Percakapan dengan Rubee"
        >
          {!messages.length && (
            <div className="m-auto max-w-md py-6 text-center">
              <Sparkles className="mx-auto mb-3 h-9 w-9 text-cyan-600" />
              <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100">Apa yang perlu dibantu?</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Pilih skill atau tulis instruksi operasional. Rubee membantu analisis dan menyusun langkah kerja dari data yang Anda kirim.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => onNavigate?.('stok')} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Buka Data Stok <ArrowRight className="ml-1 inline h-3 w-3" /></button>
                <button type="button" onClick={() => onNavigate?.('po')} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Buka PO <ArrowRight className="ml-1 inline h-3 w-3" /></button>
              </div>
            </div>
          )}

          {messages.map((item, index) => (
            <article key={index} className={`max-w-[92%] rounded-2xl px-4 py-3.5 text-[15px] leading-7 shadow-sm sm:max-w-[85%] ${item.role === 'user' ? 'ml-auto bg-[#0b2a55] text-white' : 'mr-auto border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'}`}>
              <p className="mb-1.5 text-[11px] font-bold opacity-60">{item.role === 'user' ? 'Operator' : `Rubee · ${item.model || 'Workers AI'}`}</p>
              <p className="whitespace-pre-wrap break-words">{item.content || (item.pending ? 'Rubee sedang menganalisis…' : '')}</p>
            </article>
          ))}

          {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs leading-relaxed text-rose-700"><X className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        </div>

        {showJump && (
          <button type="button" onClick={() => { stickRef.current = true; setShowJump(false); scrollToBottom('smooth'); }}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#0b2a55] px-3.5 py-2 text-xs font-bold text-white shadow-lg">
            <ArrowDown className="h-3.5 w-3.5" /> Pesan terbaru
          </button>
        )}
      </div>

      <form onSubmit={(event) => { event.preventDefault(); sendMessage(draft); }} className="shrink-0 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <label htmlFor="rubee-message" className="sr-only">Instruksi untuk Rubee</label>
        <div className="flex items-end gap-2">
          <textarea id="rubee-message" rows={2} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(draft); } }} placeholder="Tulis kebutuhan operasional…" disabled={loading || !online} className="max-h-32 min-h-[48px] flex-1 resize-none rounded-xl bg-slate-50 px-3 py-3 text-[15px] text-slate-800 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-300 disabled:opacity-50 dark:bg-slate-800 dark:text-white" />
          <button type="submit" disabled={!draft.trim() || loading || !online} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0b2a55] text-white disabled:opacity-40" aria-label="Kirim ke Rubee">
            {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="px-2 pt-1.5 text-[10px] text-slate-400">Data gudang dibaca hanya melalui koneksi server read-only yang tersedia atau dari data yang Anda kirim. Rubee tidak dapat mengubah stok, transaksi, maupun PO. Jangan kirim PIN, password, atau API key.</p>
      </form>
    </section>
  );
}
