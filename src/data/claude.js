const CLAUDE_ENDPOINT = '/api/claude';

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

  const response = await fetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, context, history: compactHistory }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.error || `Agent Claude tidak tersedia (HTTP ${response.status}).`);
    error.code = payload?.code || '';
    throw error;
  }
  return payload;
}
