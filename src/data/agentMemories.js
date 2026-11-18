import { supabaseRestRequest } from './supabaseAuth';

const MEMORY_KINDS = new Set(['idea', 'decision', 'learning', 'follow_up']);

export async function listAgentMemories(accessToken) {
  const query = new URLSearchParams({
    select: 'id,title,content,kind,created_at',
    order: 'created_at.desc',
    limit: '30',
  });
  const result = await supabaseRestRequest(`agent_memories?${query}`, { accessToken });
  return Array.isArray(result) ? result : [];
}

export async function createAgentMemory({ accessToken, userId, title, content, kind = 'idea' }) {
  const cleanTitle = String(title || '').trim();
  const cleanContent = String(content || '').trim();
  if (!accessToken || !userId) throw new Error('Login Supabase diperlukan untuk menyimpan memori.');
  if (cleanTitle.length < 1 || cleanTitle.length > 120) throw new Error('Judul harus berisi 1–120 karakter.');
  if (cleanContent.length < 1 || cleanContent.length > 2400) throw new Error('Isi memori harus berisi 1–2.400 karakter.');
  if (!MEMORY_KINDS.has(kind)) throw new Error('Jenis memori tidak valid.');

  const result = await supabaseRestRequest('agent_memories?select=id,title,content,kind,created_at', {
    accessToken,
    method: 'POST',
    body: { user_id: userId, title: cleanTitle, content: cleanContent, kind },
    prefer: 'return=representation',
  });
  return Array.isArray(result) ? result[0] : result;
}

export async function deleteAgentMemory({ accessToken, id }) {
  if (!accessToken) throw new Error('Login Supabase diperlukan untuk menghapus memori.');
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) throw new Error('ID memori tidak valid.');
  const query = new URLSearchParams({ id: `eq.${id}` });
  return supabaseRestRequest(`agent_memories?${query}`, { accessToken, method: 'DELETE' });
}
