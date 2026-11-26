import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import RiwayatPage from '../RiwayatPage';

const api = vi.hoisted(() => ({
  getLocalHistory: vi.fn(() => []),
  getPendingQueue: vi.fn(() => []),
  fetchRemoteTransactionHistory: vi.fn(async () => []),
}));

vi.mock('../../data/api', () => api);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.getLocalHistory.mockReturnValue([{
    id: 'local-1', transactionId: 'local-1', type: 'keluar', entity: 'CV',
    status: 'success', at: '2026-11-26T01:00:00+07:00',
    items: [{ kode: 'L-001', nama: 'Barang Lokal', qty: 2, satuan: 'Pack' }],
  }]);
  api.getPendingQueue.mockReturnValue([]);
  api.fetchRemoteTransactionHistory.mockResolvedValue([{
    id: 'remote-1', transactionId: 'remote-1', type: 'masuk', entity: 'PT',
    status: 'success', at: '2026-11-26T02:00:00+07:00',
    items: [{ kode: 'R-001', nama: 'Barang Server', qty: 3, satuan: 'Pack' }],
  }]);
});

afterEach(() => cleanup());

describe('RiwayatPage remote history', () => {
  it('menampilkan transaksi remote dan tetap menggabungkan riwayat lokal', async () => {
    render(<RiwayatPage />);
    await waitFor(() => expect(screen.getByText(/Barang Server/)).toBeInTheDocument());
    expect(screen.getByText(/Barang Lokal/)).toBeInTheDocument();
    expect(api.fetchRemoteTransactionHistory).toHaveBeenCalledWith(31);
  });

  it('tetap menampilkan riwayat lokal saat pengambilan remote gagal', async () => {
    api.fetchRemoteTransactionHistory.mockRejectedValue(new Error('remote unavailable'));
    render(<RiwayatPage />);
    await waitFor(() => expect(screen.getByText(/Barang Lokal/)).toBeInTheDocument());
    expect(screen.queryByText(/Barang Server/)).not.toBeInTheDocument();
  });
});
