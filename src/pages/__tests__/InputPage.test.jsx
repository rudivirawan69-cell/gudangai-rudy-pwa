import React from 'react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import InputPage from '../InputPage';

const api = vi.hoisted(() => ({
  submitBarangMasuk: vi.fn(),
  submitBarangKeluar: vi.fn(),
  submitBarangRusak: vi.fn(),
  fetchStock: vi.fn(async () => []),
  saveToHistory: vi.fn(),
  pushNotification: vi.fn(),
  getNotifications: vi.fn(() => []),
  markNotificationsRead: vi.fn(),
  unreadNotificationCount: vi.fn(() => 0),
}));
const pdf = vi.hoisted(() => ({
  extractTextFromPdf: vi.fn(),
  extractTextFromImage: vi.fn(),
  parseLinesFromText: vi.fn(() => []),
  validateItems: vi.fn(() => ({ matched: [], ambiguous: [], unmatched: [] })),
  applyStockAwareFallback: vi.fn(() => []),
  detectEntityFromText: vi.fn(() => null),
  scanBarcodeFromVideo: vi.fn(),
}));

vi.mock('../../data/api', () => api);
vi.mock('../../data/pdfValidate', () => pdf);
vi.mock('../../data/master', () => ({ searchMaster: vi.fn(() => []) }));
vi.mock('../../data/liveSearch', () => ({ searchLiveStock: vi.fn(() => []) }));
vi.mock('../../hooks/useBootstrapRevision', () => ({ useBootstrapRevision: vi.fn(() => 0) }));

function seedCart(items) {
  localStorage.setItem('gudangai_input_draft_v1', JSON.stringify({
    version: 1, entity: 'CV', txType: 'keluar', tanggal: '05/11/2026', cart: items, pdfReview: [],
  }));
}

function item(id, qty = 1) {
  return { kode: `K-${id}`, nama: `Barang ${id}`, satuan: 'Pack', qty, keterangan: '', clientItemId: id };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.fetchStock.mockResolvedValue([]);
  pdf.extractTextFromImage.mockReset();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => cleanup());

describe('InputPage PR 1', () => {
  it('melepas busy saat OCR foto gagal dan mengaktifkan semua tombol input', async () => {
    seedCart([]);
    pdf.extractTextFromImage.mockResolvedValue({ ok: false, error: 'OCR gagal' });
    const { container } = render(<InputPage />);
    fireEvent.change(container.querySelector('input[accept=\"image/*\"]'), { target: { files: [new File(['x'], 'foto.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(screen.getByText('OCR gagal')).toBeInTheDocument());
    for (const label of ['PDF', 'Foto', 'QR', 'Suara', '(paste)']) expect(screen.getByRole('button', { name: label })).not.toBeDisabled();
  });
  it('memakai koma desimal dan menyimpan 1,5 sebagai 1.5', async () => {
    seedCart([item('one', 1)]);
    render(<InputPage />);
    const qty = screen.getByDisplayValue('1');
    fireEvent.change(qty, { target: { value: '1,5' } });
    fireEvent.blur(qty);
    await waitFor(() => expect(screen.getByDisplayValue('1.5')).toBeInTheDocument());
  });

  it('mengosongkan keranjang jika semua item confirmed', async () => {
    seedCart([item('one'), item('two')]);
    api.submitBarangKeluar.mockResolvedValue({
      results: [{ clientItemId: 'one', success: true }, { clientItemId: 'two', skipped: true }],
      count: 2, queuedCount: 0, failed: 0,
    });
    render(<InputPage />);
    fireEvent.click(screen.getByRole('button', { name: /Kirim 2 item/i }));
    await waitFor(() => expect(screen.queryByText('Keranjang (2)')).not.toBeInTheDocument());
    expect(api.saveToHistory).toHaveBeenCalledWith(expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ clientItemId: 'one' })]) }));
  });

  it('menyisakan hanya failed dan qty 0, serta menghapus confirmed dan queued tersimpan', async () => {
    seedCart([item('confirmed'), item('queued'), item('failed'), item('zero', 0)]);
    api.submitBarangKeluar.mockResolvedValue({
      results: [
        { clientItemId: 'confirmed', success: true },
        { clientItemId: 'queued', queued: true, queueStored: true },
        { clientItemId: 'failed', success: false },
      ], count: 1, queuedCount: 1, failed: 1,
    });
    render(<InputPage />);
    fireEvent.click(screen.getByRole('button', { name: /Kirim 4 item/i }));
    await waitFor(() => expect(screen.getByText('Keranjang (2)')).toBeInTheDocument());
    expect(screen.getByText('Barang failed')).toBeInTheDocument();
    expect(screen.getByText('Barang zero')).toBeInTheDocument();
    expect(screen.queryByText('Barang confirmed')).not.toBeInTheDocument();
    expect(screen.queryByText('Barang queued')).not.toBeInTheDocument();
    expect(screen.getByText(/1 terkonfirmasi · 1 masuk Antrian Sinkronisasi · 2 belum terkonfirmasi/)).toBeInTheDocument();
  });

  it('tidak menghapus queued bila tidak ada bukti tersimpan', async () => {
    seedCart([item('queued')]);
    api.submitBarangKeluar.mockResolvedValue({ results: [{ clientItemId: 'queued', queued: true }] });
    render(<InputPage />);
    fireEvent.click(screen.getAllByRole('button', { name: /Kirim 1 item/i })[0]);
    await waitFor(() => expect(screen.getByText('Keranjang (1)')).toBeInTheDocument());
    expect(screen.getByText(/0 terkonfirmasi · 0 masuk Antrian Sinkronisasi · 1 belum terkonfirmasi/)).toBeInTheDocument();
  });

  it('menampilkan tiga angka progres success, queued, failed', async () => {
    seedCart([item('one')]);
    render(<InputPage />);
    window.dispatchEvent(new CustomEvent('gudangai-submit-progress', { detail: { sent: 1, total: 3, success: 1, queued: 1, failed: 1 } }));
    await waitFor(() => expect(screen.getByText(/ok 1 · antri 1 · gagal 1/)).toBeInTheDocument());
  });
});

