import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCachedDashboardData, getDashboardData } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Dashboard Live snapshot cache', () => {
  it('shares requests, keeps the last summary on navigation, and changes only when sheet data changes', async () => {
    const storage = new Map();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('localStorage', {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    });
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('CustomEvent', class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    });

    let payload = {
      success: true,
      generatedAt: '2026-11-20T01:00:00.000Z',
      dashboardReadAt: '2026-11-20T01:00:00.000Z',
      totalItem: 8,
      aman: 5,
      waspada: 2,
      kritis: 1,
      lastUpdate: '2026-11-20T01:00:00.000Z',
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const [first, concurrent] = await Promise.all([getDashboardData(), getDashboardData()]);
    expect(first).toEqual(concurrent);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCachedDashboardData()).toEqual(first);

    payload = { ...payload, generatedAt: '2026-11-20T01:00:15.000Z', dashboardReadAt: '2026-11-20T01:00:15.000Z' };
    await getDashboardData();
    expect(getCachedDashboardData()).toBe(first);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);

    payload = { ...payload, aman: 6, waspada: 1 };
    const updated = await getDashboardData();
    expect(updated.aman).toBe(6);
    expect(getCachedDashboardData()).toBe(updated);
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
