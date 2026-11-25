import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '../hooks/useAuth';
import AgentMemoryPanel from '../components/AgentMemoryPanel';
import { createAgentMemory, deleteAgentMemory, listAgentMemories } from '../data/agentMemories';
import {
  BrainCircuit, Send, Wifi, WifiOff, Sparkles, Trash2, RotateCcw, ChevronDown,
} from 'lucide-react';

const SKILLS = [
  { id: 'stok', label: 'Cek stok', prompt: 'Ringkas kondisi stok kritis dan waspada hari ini.' },
  { id: 'po', label: 'Status PO', prompt: 'Bagaimana status PO aktif dan yang perlu dikonfirmasi?' },
  { id: 'masuk', label: 'Barang masuk', prompt: 'Bantu saya mencatat rencana barang masuk.' },
  { id: 'keluar', label: 'Barang keluar', prompt: 'Bantu saya mencatat rencana barang keluar.' },
  { id: 'ringkas', label: 'Ringkasan', prompt: 'Berikan ringkasan operasional gudang hari ini.' },
];

const WORKER_URL = import.meta.env.VITE_WORKER_URL || '';

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AIAssistantPage({ onNavigate }) {
  const { user, session } = useAuth();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [health, setHealth] = useState('Memeriksa koneksi Worker AI…');
  const [online, setOnline] = useState(true);
  const [showMemory, setShowMemory] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const { data: memories = [], mutate: mutateMemories } = useSWR(
    session?.access_token ? ['agent-memories', session.access_token] : null,
    () => listAgentMemories(session.access_token),
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    const ac = new AbortController();
    const base = WORKER_URL.replace(/\/$/, '');
    if (!base) {
      setHealth('Worker URL belum dikonfigurasi');
      setOnline(false);
      return;
    }
    fetch(`${base}/health`, { signal: ac.signal })
      .then((r) => r.json())
      .then((payload) => {
        setOnline(true);
        setHealth(payload.primaryConfigured ? 'Online' : 'Worker merespons');
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setOnline(false);
          setHealth('Worker belum dapat dijangkau');
        }
      });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = useCallback(async (text) => {
    const content = String(text || '').trim();
    if (!content || loading) return;
    if (!online) {
      setError('Worker AI offline. Coba lagi nanti.');
      return;
    }
    setError('');
    setDraft('');
    const userMsg = { id: uid(), role: 'user', content, at: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const base = WORKER_URL.replace(/\/$/, '');
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const response = await fetch(`${base}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: content,
          history: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
          agent: 'Agent Rubee Intelligence',
          user: user?.email || user?.name || 'operator',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const authHint = response.status === 401 ? ' (login ulang diperlukan)' : '';
        throw new Error((payload.error || payload.detail || `Worker AI gagal merespons (HTTP ${response.status})`) + authHint);
      }
      const reply = payload.reply || payload.message || payload.content || '';
      if (!reply) throw new Error('Worker AI mengirim respons kosong.');
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: 'assistant', content: reply, model: payload.model || '', at: Date.now() },
      ]);
    } catch (err) {
      setError(err.message || 'Gagal menghubungi Worker AI.');
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [loading, online, messages, session, user]);

  const onSkill = (skill) => {
    setDraft(skill.prompt);
    inputRef.current?.focus();
  };

  const clearChat = () => {
    setMessages([]);
    setError('');
  };

  return (
    <section
      className="flex min-h-[calc(100dvh-var(--app-chrome,8.5rem))] flex-col gap-2"
      aria-label="Agent Rubee Intelligence"
    >
      <header className="shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600">
            <BrainCircuit className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-black text-slate-900 dark:text-white">Agent Rubee Intelligence</h2>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              {online ? <Wifi className="h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="h-3.5 w-3.5 text-amber-500" />}
              <span className="truncate">{health}</span>
            </p>
          </div>
          <button type="button" onClick={clearChat} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Hapus percakapan">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="-mx-1 shrink-0 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Pilih skill">
        <div className="flex min-w-max gap-1.5">
          {SKILLS.map((skill) => (
            <button
              key={skill.id}
              type="button"
              onClick={() => onSkill(skill)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm active:scale-[0.97] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <Sparkles className="h-3 w-3 text-orange-500" />
              {skill.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/80 p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
        {messages.length === 0 && !loading && (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 px-4 text-center">
            <BrainCircuit className="h-10 w-10 text-orange-400/80" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Siap membantu operasional gudang</p>
          </div>
        )}
        {messages.map((item) => (
          <div
            key={item.id}
            className={`max-w-[92%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
              item.role === 'user'
                ? 'ml-auto bg-cyan-600 text-white'
                : 'mr-auto border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
            }`}
          >
            <p className="mb-1.5 text-[11px] font-bold opacity-60">{item.role === 'user' ? 'Operator' : `Rubee · ${item.model || 'Workers AI'}`}</p>
            <p className="whitespace-pre-wrap">{item.content}</p>
          </div>
        ))}
        {loading && (
          <div className="mr-auto flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-500 dark:border-slate-700 dark:bg-slate-800">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-500" />
            Rubee sedang memproses…
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">
          {error}
        </div>
      )}

      <form
        className="shrink-0 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(draft);
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            id="rubee-message"
            ref={inputRef}
            rows={1}
            maxLength={4000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                event.preventDefault();
                sendMessage(draft);
              }
            }}
            placeholder="Tulis kebutuhan operasional…"
            disabled={loading || !online}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl bg-slate-50 px-3 py-2.5 text-[15px] text-slate-800 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-300 disabled:opacity-50 dark:bg-slate-800 dark:text-white"
          />
          <button
            type="submit"
            disabled={loading || !online || !draft.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white disabled:opacity-40"
            aria-label="Kirim"
          >
            {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </section>
  );
}
