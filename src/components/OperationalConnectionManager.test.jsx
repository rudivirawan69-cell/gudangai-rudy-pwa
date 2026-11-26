import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OperationalConnectionManager from './OperationalConnectionManager';

const mocks = vi.hoisted(() => ({
  getAgentHealth: vi.fn(),
  getPendingQueue: vi.fn(),
}));

vi.mock('../data/claude', () => ({ getAgentHealth: mocks.getAgentHealth }));
vi.mock('../data/api', () => ({ getPendingQueue: mocks.getPendingQueue }));

function renderManager(props = {}) {
  const onNavigate = vi.fn();
  const onCheckSpreadsheet = vi.fn().mockResolvedValue({ ok: true });
  const view = render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <OperationalConnectionManager
        authStatus="authenticated"
        connection={{ online: true, apiOk: true, hasUrl: true, status: 'connected', lastCheck: new Date('2026-11-26T03:00:00.000Z') }}
        realtimeStatus={{ state: 'online', mode: 'delta', failures: 0 }}
        onCheckSpreadsheet={onCheckSpreadsheet}
        onNavigate={onNavigate}
        {...props}
      />
    </SWRConfig>,
  );
  return { ...view, onNavigate, onCheckSpreadsheet };
}

afterEach(cleanup);

beforeEach(() => {
  mocks.getAgentHealth.mockResolvedValue({
    success: true,
    authConfigured: true,
    dataToolsConfigured: true,
    mode: 'hybrid',
    agentStage: 'read_only_live_data',
  });
  mocks.getPendingQueue.mockReturnValue([{ items: [{ clientItemId: 'CI-1' }, { clientItemId: 'CI-2' }] }]);
});

describe('OperationalConnectionManager', () => {
  it('shows live status for auth, Worker, spreadsheet, realtime and pending queue', async () => {
    renderManager();

    expect(screen.getByText('Status sistem operasional')).toBeInTheDocument();
    expect(screen.getByText('Supabase Auth')).toBeInTheDocument();
    expect(screen.getByText('Spreadsheet API')).toBeInTheDocument();
    expect(screen.getByText('Realtime / Delta')).toBeInTheDocument();
    expect(screen.getByText('Sinkronisasi / Outbox')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('hybrid · read_only_live_data.')).toBeInTheDocument());
    expect(screen.getByText('2 item menunggu konfirmasi atau verifikasi.')).toBeInTheDocument();
  });

  it('refreshes checks and sends pending operators to the sync queue', async () => {
    const { onNavigate, onCheckSpreadsheet } = renderManager();
    await screen.findByText('hybrid · read_only_live_data.');
    const healthRequestsBeforeRefresh = mocks.getAgentHealth.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Periksa ulang koneksi operasional' }));
    await waitFor(() => expect(onCheckSpreadsheet).toHaveBeenCalledWith({ quiet: false }));
    await waitFor(() => expect(mocks.getAgentHealth.mock.calls.length).toBeGreaterThan(healthRequestsBeforeRefresh));

    fireEvent.click(screen.getByRole('button', { name: 'Tinjau antrean (2)' }));
    expect(onNavigate).toHaveBeenCalledWith('sync');
  });
});
