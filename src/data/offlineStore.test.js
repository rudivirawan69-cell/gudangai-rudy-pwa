import { afterEach, describe, expect, it, vi } from 'vitest';
import { hydrateQueueBackup, persistQueueBackup } from './offlineStore';

describe('offline queue durability gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not acknowledge a queue snapshot when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(persistQueueBackup([{ id: 'Q-1', items: [{ clientItemId: 'CI-1' }] }], 7))
      .rejects.toThrow(/IndexedDB tidak tersedia/);
  });

  it('fails closed and preserves the local pending snapshot when recovery storage fails', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const localQueue = [{ id: 'Q-KEEP', items: [{ clientItemId: 'CI-KEEP' }] }];
    const writeLocalState = vi.fn();

    const result = await hydrateQueueBackup(
      () => ({ revision: 4, queue: localQueue }),
      writeLocalState,
    );

    expect(result.ok).toBe(false);
    expect(result.queue).toEqual(localQueue);
    expect(result.error).toMatch(/IndexedDB tidak tersedia/);
    expect(writeLocalState).not.toHaveBeenCalled();
  });
});
