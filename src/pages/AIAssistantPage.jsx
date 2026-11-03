import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, BrainCircuit, Send, Square, Trash2, Wifi, WifiOff, AlertCircle, Sparkles } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const AI_API_BASE = (import.meta.env.VITE_GUDANGAI_AI_API_BASE || 'https://gudangai-rudy-pwa69.rudivirawan69.workers.dev').replace(/\/$/, '');
const DEFAULT_MODEL = 'anthropic/claude-sonnet-5.5';
function extractText(payload) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.text === 'string') return payload.text;
  if (typeof payload.response === 'string') return payload.response;
  if (typeof payload.output_text === 'string') return payload.output_text;
  if (typeof payload.content === 'string') return payload.content;
  if (Array.isArray(payload.content)) {
    return payload.content.map((part) => typeof part === 'string' ? part : part?.text || '').join('');
  }
  const choice = payload.choices?.[0];
  if (typeof choice?.delta?.content === 'string') return choice.delta.content;
  if (typeof choice?.message?.content === 'string') return choice.message.content;
  return '';
}

function parseModels(payload) {
  const list = Array.isArray(payload) ? payload : payload?.models || payload?.data || [];
  return list.map((item) => typeof item === 'string' ? item : item?.id || item?.name).filter(Boolean);
}

export default function AIAssistantPage() {
  const { user, accessToken, authStatus } = useAuth();
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [models, setModels] = useState([DEFAULT_MODEL, 'anthropic/claude-haiku-5.5', 'anthropic/claude-opus-5.5']);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [error, setError] = useState('');
  const [modelsStatus, setModelsStatus] = useState('Memuat katalog model…');
  const abortRef = useRef(null);
  const bottomRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${AI_API_BASE}/api/models`, { signal: controller.signal, credentials: 'omit', headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((payload) => {
        const available = parseModels(payload);
        if (available.length) {
          setModels((current) => [...new Set([DEFAULT_MODEL, ...available])]);
          setModelsStatus(`${available.length} model tersedia`);
        } else {
          setModelsStatus('Katalog tidak mengembalikan daftar model; pilihan default tetap tersedia');
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setModelsStatus('Katalog belum dapat dibaca; menggunakan model default');
      });
    return () => controller.abort();
  }, [accessToken]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const sendMessage = useCallback(async (rawText) => {
    const text = String(rawText || '').trim();
    if (!text || loading || !online) return;
    setError('');
    setDraft('');
    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages([...nextMessages, { role: 'assistant', content: '', pending: true }]);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let assistantText = '';

    const append = (chunk) => {
      if (!chunk || !mountedRef.current) return;
      assistantText += chunk;
      setMessages((current) => {
        const copy = [...current];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant') copy[copy.length - 1] = { role: 'assistant', content: assistantText, pending: true };
        return copy;
      });
    };

    try {
      const response = await fetch(`${AI_API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${accessToken}` },
        credentials: 'omit',
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: true,
          max_tokens: 2048,
          messages: nextMessages,
        }),
      });
      if (!response.ok) {
        let detail = '';
        try { detail = (await response.json())?.error || ''; } catch (_) {}
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After') || '60';
          throw new Error(`Batas penggunaan AI tercapai. Coba lagi dalam ${retryAfter} detik.`);
        }
        throw new Error(detail || `Permintaan AI gagal (HTTP ${response.status})`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const handleEvent = (eventBlock) => {
          const dataLines = eventBlock.split(/\r?\n/).filter((line) => line.startsWith('data:'));
          for (const line of dataLines) {
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
              const payload = JSON.parse(raw);
              append(extractText(payload));
              if (payload.error) throw new Error(payload.error);
            } catch (err) {
              if (err instanceof SyntaxError) append(raw);
              else throw err;
            }
          }
        };
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n/g, '\n');
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            handleEvent(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
          }
          if (done) break;
        }
        if (buffer.trim()) handleEvent(buffer);
      } else {
        const payload = await response.json();
        const result = extractText(payload);
        if (payload?.error) throw new Error(payload.error);
        if (!result) throw new Error('Respons AI kosong atau format respons tidak dikenali.');
        append(result);
      }
      if (!assistantText && mountedRef.current) throw new Error('Claude tidak mengirimkan isi jawaban.');
      setMessages((current) => {
        const copy = [...current];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant') copy[copy.length - 1] = { role: 'assistant', content: assistantText };
        return copy;
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Gagal menghubungi Claude.');
        setMessages((current) => current.filter((item, index) => !(index === current.length - 1 && item.role === 'assistant' && !item.content)));
      } else {
        setMessages((current) => current.map((item, index) => index === current.length - 1 && item.role === 'assistant' ? { ...item, pending: false, content: item.content || 'Respons dihentikan.' } : item));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
      abortRef.current = null;
    }
  }, [loading, online, messages, model, accessToken]);

  const quickPrompts = [
    'Jelaskan cara membaca laporan stok gudang.',
    'Bantu susun checklist audit transaksi harian.',
    'Apa saja yang harus diperiksa sebelum membuat PO?',
  ];

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-3 pb-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-amber-600 text-white shadow">
            <BrainCircuit className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-black text-slate-900 dark:text-white">GudangAI Intelligence</h2>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Claude</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Asisten operasional AI · {user?.name || 'Operator'}</p>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
              {online ? <Wifi className="h-3 w-3 text-emerald-600" /> : <WifiOff className="h-3 w-3 text-amber-600" />}
              <span>{online ? (authStatus === 'offline' ? 'Sesi tersimpan · verifikasi ulang saat online' : modelsStatus) : 'Perangkat sedang offline'}</span>
            </div>
          </div>
          <button type="button" onClick={() => { if (!loading) { setMessages([]); setError(''); } }} disabled={loading || !messages.length} className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-40 dark:border-slate-700" aria-label="Hapus percakapan" title="Hapus percakapan">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
          <label className="sr-only" htmlFor="gudangai-ai-model">Model AI</label>
          <select id="gudangai-ai-model" value={model} onChange={(event) => setModel(event.target.value)} disabled={loading} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-orange-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            {models.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <span className="self-center text-[10px] text-slate-400">Default: Claude Sonnet 5.5</span>
        </div>
      </header>

      <div className="flex min-h-[42vh] flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
        {!messages.length && (
          <div className="m-auto max-w-md py-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
              <Sparkles className="h-7 w-7" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Apa yang ingin dianalisis?</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Tanyakan prosedur gudang, audit, purchasing, atau minta bantuan menyusun laporan.</p>
            <div className="mt-4 flex flex-col gap-2">
              {quickPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => sendMessage(prompt)} disabled={loading || !online} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 hover:border-orange-300 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{prompt}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((item, index) => (
          <article key={`${index}-${item.role}`} className={`max-w-[92%] rounded-2xl px-3.5 py-3 text-sm leading-relaxed shadow-sm ${item.role === 'user' ? 'ml-auto bg-[#0b2a55] text-white' : 'mr-auto border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'}`}>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold opacity-65">
              {item.role === 'user' ? user?.name || 'Anda' : <><Bot className="h-3 w-3" /> Claude · {model.split('/').pop()}</>}
            </div>
            <p className="whitespace-pre-wrap break-words">{item.content || (item.pending ? 'Menyiapkan jawaban…' : '')}</p>
          </article>
        ))}
        {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={(event) => { event.preventDefault(); sendMessage(draft); }} className="sticky bottom-20 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <label htmlFor="gudangai-ai-message" className="sr-only">Pesan untuk Claude</label>
        <div className="flex items-end gap-2">
          <textarea id="gudangai-ai-message" rows={2} maxLength={6000} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(draft); } }} placeholder="Tulis pertanyaan operasional…" disabled={loading || !online} className="max-h-36 min-h-[48px] flex-1 resize-y rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-orange-300 disabled:opacity-50 dark:bg-slate-800 dark:text-white" />
          {loading ? (
            <button type="button" onClick={stopGeneration} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white" aria-label="Hentikan jawaban"><Square className="h-4 w-4" /></button>
          ) : (
            <button type="submit" disabled={!draft.trim() || !online} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0b2a55] text-white disabled:opacity-40" aria-label="Kirim pesan"><Send className="h-4 w-4" /></button>
          )}
        </div>
        <p className="px-2 pt-1.5 text-[9px] text-slate-400">Percakapan hanya tersimpan selama halaman ini terbuka. Jangan kirim PIN, password, API key, atau data rahasia.</p>
      </form>
    </section>
  );
}
