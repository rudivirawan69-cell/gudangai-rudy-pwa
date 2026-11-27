import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  it('mempertahankan tiga filter utama dan menghilangkan chip ringkasan Semua/Masuk/Keluar/Rusak', async () => {
    render(<RiwayatPage />);
    expect(screen.getByRole('button', { name: 'Transaksi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entitas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Status' })).toBeInTheDocument();
    expect(screen.queryByText('Semua', { selector: '.rw-count-chip' })).not.toBeInTheDocument();
    expect(screen.queryByText('Masuk', { selector: '.rw-count-chip' })).not.toBeInTheDocument();
    expect(screen.queryByText('Keluar', { selector: '.rw-count-chip' })).not.toBeInTheDocument();
    expect(screen.queryByText('Rusak', { selector: '.rw-count-chip' })).not.toBeInTheDocument();
  });


  it('menampilkan transaksi remote dan tetap menggabungkan riwayat lokal', async () => {
    render(<RiwayatPage />);
    await waitFor(() => expect(screen.getAllByText('Barang Server').length).toBeGreaterThan(0));
    expect(screen.queryByText('Barang Lokal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /2 transaksi/ }));
    await waitFor(() => expect(screen.getByText('Barang Lokal')).toBeInTheDocument());
    expect(api.fetchRemoteTransactionHistory).toHaveBeenCalledWith(31);
  });

  it('deduplicates a server row against its matching local transaction identity', async () => {
    api.getLocalHistory.mockReturnValue([{
      id: 'local-same', transactionId: 'TX-SAME', type: 'masuk', entity: 'CV',
      status: 'success', at: '2026-11-26T01:00:00+07:00',
      items: [{ kode: 'CV-0001', nama: 'Barang Sama', qty: 1, satuan: 'Pack' }],
    }]);
    api.fetchRemoteTransactionHistory.mockResolvedValue([{
      id: 'remote-same', transactionId: 'TX-SAME', type: 'masuk', entity: 'CV',
      status: 'success', at: '2026-11-26T01:00:00+07:00',
      items: [{ kode: 'CV-0001', nama: 'Barang Sama', qty: 1, satuan: 'Pack' }],
    }]);
    render(<RiwayatPage />);
    await waitFor(() => expect(screen.getByText('1 transaksi', { selector: '.rw-day-summary-main small' })).toBeInTheDocument());
  });

  it('tetap menampilkan riwayat lokal saat pengambilan remote gagal', async () => {
    api.fetchRemoteTransactionHistory.mockRejectedValue(new Error('remote unavailable'));
    render(<RiwayatPage />);
    await waitFor(() => expect(screen.getAllByText('Barang Lokal').length).toBeGreaterThan(0));
    expect(screen.queryAllByText('Barang Server')).toHaveLength(0);
  });
});
