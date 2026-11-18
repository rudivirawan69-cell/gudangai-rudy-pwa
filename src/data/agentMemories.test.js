import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentMemory, deleteAgentMemory, listAgentMemories } from './agentMemories';

const accessToken = 'supabase-session-token';
const userId = '00000000-0000-4000-8000-000000000001';

afterEach(() => vi.unstubAllGlobals());

describe('agent memory persistence', () => {
  it('sends writes with the signed-in bearer token and authenticated user id', async () => {
    const saved = {
      id: '00000000-0000-4000-8000-000000000002',
      title: 'Arah fitur',
      content: 'Simpan keputusan pengembangan.',
      kind: 'decision',
      created_at: '2026-11-18T12:00:00.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => [saved] });
    vi.stubGlobal('fetch', fetchMock);

    const result = await createAgentMemory({
      accessToken,
      userId,
      title: ' Arah fitur ',
      content: ' Simpan keputusan pengembangan. ',
      kind: 'decision',
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/rest/v1/agent_memories?select=');
    expect(options.headers.Authorization).toBe(`Bearer ${accessToken}`);
    expect(options.headers.apikey).toBeTruthy();
    expect(options.headers.Prefer).toBe('return=representation');
    expect(JSON.parse(options.body)).toEqual({
      user_id: userId,
      title: 'Arah fitur',
      content: 'Simpan keputusan pengembangan.',
      kind: 'decision',
    });
    expect(result).toEqual(saved);
  });

  it('lists and deletes notes through the authenticated table endpoint', async () => {
    const note = { id: '00000000-0000-4000-8000-000000000002', title: 'Arah fitur' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [note] })
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => null });
    vi.stubGlobal('fetch', fetchMock);

    expect(await listAgentMemories(accessToken)).toEqual([note]);
    await deleteAgentMemory({ accessToken, id: note.id });

    const [listUrl, listOptions] = fetchMock.mock.calls[0];
    const [deleteUrl, deleteOptions] = fetchMock.mock.calls[1];
    expect(new URL(String(listUrl)).searchParams.get('order')).toBe('created_at.desc');
    expect(listOptions.headers.Authorization).toBe(`Bearer ${accessToken}`);
    expect(deleteOptions.method).toBe('DELETE');
    expect(new URL(String(deleteUrl)).searchParams.get('id')).toBe(`eq.${note.id}`);
    expect(deleteOptions.headers.Authorization).toBe(`Bearer ${accessToken}`);
  });

  it('rejects empty notes before making a database request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(createAgentMemory({ accessToken, userId, title: ' ', content: '\n' }))
      .rejects.toThrow('Judul harus berisi');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
