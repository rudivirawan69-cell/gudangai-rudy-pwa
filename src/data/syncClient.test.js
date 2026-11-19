import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSyncAll } from './syncClient';

const response = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

const validPayload = {
  success: true,
  readAt: '2026-11-20T00:00:00.000Z',
  data: { getDashboardData: { success: true, statusPerDivisi: [] } },
  summary: { totalActions: 9, successfulActions: 9, failedActions: 0, totalRecords: 0 },
  errors: [],
  permissions: 'read_only',
  version: 2,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchSyncAll', () => {
  it('sends an authenticated same-origin GET and accepts only read-only responses', async () => {
    const fetchMock = vi.fn(async () => response(200, validPayload));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSyncAll({ accessToken: 'test-access-token' });

    expect(result.permissions).toBe('read_only');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/sync-all');
    expect(options.method).toBe('GET');
    expect(options.credentials).toBe('same-origin');
    expect(options.headers.Authorization).toBe('Bearer test-access-token');
  });

  it('rejects missing access tokens without making a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSyncAll()).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries a transient server error once', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(502, { error: 'temporary upstream error' }))
      .mockResolvedValueOnce(response(200, validPayload));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSyncAll({ accessToken: 'retry-token' });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent reads for the same access token', async () => {
    let resolveFetch;
    const fetchMock = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));
    vi.stubGlobal('fetch', fetchMock);

    const first = fetchSyncAll({ accessToken: 'shared-token' });
    const second = fetchSyncAll({ accessToken: 'shared-token' });
    await Promise.resolve();
    resolveFetch(response(200, validPayload));

    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
