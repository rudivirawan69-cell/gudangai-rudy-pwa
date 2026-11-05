import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Send, X, Loader2, Sparkles, AlertCircle, RotateCcw } from 'lucide-react';

const AGENT_API = (import.meta.env.VITE_GUDANGAI_AGENT_API || 'https://gudangai-rudy.rudivirawan69.workers.dev').replace(/\/$/, '');
const MAX_HISTORY = 8;

export default function HomeAgentAssistant() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [provider, setProvider] = useState('Cloudflare Workers AI');
  const endRef = useRef(null);
  const controllerRef = useRef(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [open, messages, loading]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const send = useCallback(async (event) => {
    event?.preventDefault?.();
    const message = draft.trim();
    if (!message || loading) return;
    setError('');
    setDraft('');
    const history = messages.slice(-MAX_HISTORY);
    setMessages((current) => [...current, { role: 'user', content: message }, { role: 'assistant', content: '', pending: true }]);
    setLoading(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response = await fetch(`${AGENT_API}/api/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'omit',
        signal: controller.signal,
        body: JSON.stringify({
          message,
          history,
          context: { application: 'GudangAI RUDY PWA', surface: 'Beranda', mode: 'analisis_operasional', permissions: 'read_only' },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success !== true || !payload.reply) {
        throw new Error(payload.error || payload.detail || `Agent gagal merespons (HTTP ${response.status})`);
      }
      setProvider(payload.provider === 'cloudflare-workers-ai' ? 'Cloudflare Workers AI' : String(payload.provider || 'AI utama'));
      setMessages((current) => {
        const next = [...current];
        next[next.length - 1] = { role: 'assistant', content: payload.reply, model: payload.model };
        return next;
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Koneksi Agent gagal. Coba kembali.');
        setMessages((current) => current.filter((item) => !item.pending));
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setLoading(false);
    }
  }, [draft, loading, messages]);

  const clear = () => { if (loading) controllerRef.current?.abort(); setMessages([]); setError(''); setLoading(false); };

  return (
    <section className="home-agent-wrap" aria-label="Claude Ops Assistant">
      <button type="button" className="home-agent-card" onClick={() => setOpen((value) => !value)}
        aria-expanded={open} aria-controls="home-agent-panel">
        <span className="home-agent-icon"><Bot className="h-6 w-6" /></span>
        <span className="min-w-0 flex-1 text-left">
          <span className="home-agent-title">Claude Ops Assistant <Sparkles className="inline h-4 w-4 ml-1" /></span>
          <span className="home-agent-copy">AI operasional · Cloudflare Workers AI</span>
        </span>
        <span className="home-agent-action">{open ? 'Tutup' : 'Tanya'} {open ? <X className="h-4 w-4" /> : <Send className="h-4 w-4" />}</span>
      </button>
      {open && (
        <div id="home-agent-panel" className="home-agent-panel">
          <div className="home-agent-panel-head">
            <span><span className="home-agent-online-dot" /> {provider} · AI utama</span>
            <button type="button" onClick={clear} className="home-agent-clear" disabled={!messages.length && !loading} aria-label="Bersihkan percakapan"><RotateCcw className="h-4 w-4" /></button>
          </div>
          <div className="home-agent-thread" aria-live="polite">
            {!messages.length && <div className="home-agent-empty"><Bot className="h-7 w-7" /><strong>Asisten Operasional GudangAI</strong></div>}
            {messages.map((item, index) => (
              <div key={index} className={`home-agent-message ${item.role === 'user' ? 'is-user' : 'is-assistant'}`}>
                {item.pending ? <span className="home-agent-thinking"><Loader2 className="h-4 w-4 animate-spin" /> Menyusun jawaban…</span> : item.content}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          {error && <div className="home-agent-error" role="alert"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
          <form className="home-agent-form" onSubmit={send}>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} maxLength={4000}
              placeholder="Tulis pertanyaan operasional…" aria-label="Pertanyaan untuk Agent" disabled={loading} />
            <button type="submit" disabled={loading || !draft.trim()} aria-label="Kirim pertanyaan">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
