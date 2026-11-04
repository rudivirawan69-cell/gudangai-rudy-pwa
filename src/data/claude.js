import { readStoredSession } from './supabaseAuth';

const AGENT_ENDPOINT = '/api/agent';

export async function askClaude({ message, context = {}, history = [] }) {
  const text = String(message || '').trim();
  if (!text) throw new Error('Pertanyaan belum diisi.');

  const compactHistory = (Array.isArray(history) ? history : [])
    .slice(-8)
    .map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: String(item.content || '').slice(0, 4000),
    }))
    .filter((item) => item.content);

  const session = readStoredSession();
  if (!session?.access_token) throw new Error('Silakan login kembali untuk menggunakan Agent GudangAI.');

  const response = await fetch(AGENT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ message: text, context, history: compactHistory }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.error || `Agent GudangAI tidak tersedia (HTTP ${response.status}).`);
    error.code = payload?.code || '';
    throw error;
  }
  return payload;
}

export async function getAgentHealth() {
  const response = await fetch('/api/agent/health', { method: 'GET', cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error || `Status Agent tidak tersedia (HTTP ${response.status}).`);
  }
  return payload;
}
