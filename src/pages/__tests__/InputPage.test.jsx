import React from 'react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import InputPage from '../InputPage';

const api = vi.hoisted(() => ({
  submitBarangMasuk: vi.fn(),
  submitBarangKeluar: vi.fn(),
  submitBarangRusak: vi.fn(),
  fetchStock: vi.fn(async () => []),
  saveToHistory: vi.fn(),
  stagePendingTransaction: vi.fn(async ({ items }) => items.map((item) => item.clientItemId)),
  updatePendingItemStates: vi.fn(async () => ({ success: true })),
  removePendingByClientIds: vi.fn(async () => ({ success: true })),
  finishPendingTransaction: vi.fn(),
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
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('InputPage PR 1', () => {
  it('melepas busy saat OCR foto gagal dan mengaktifkan semua tombol input', async () => {
    seedCart([]);
    pdf.extractTextFromImage.mockResolvedValue({ ok: false, error: 'OCR gagal' });
    const { container } = render(<InputPage />);
    fireEvent.change(container.querySelector('input[accept=\"image/*\"]'), { target: { files: [new File(['x'], 'foto.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(screen.getByText('OCR gagal')).toBeInTheDocument());
    for (const label of ['PDF', 'Foto', 'QR', 'Suara', 'Tempel']) expect(screen.getByRole('button', { name: label })).not.toBeDisabled();
  });
  it('memakai koma desimal dan menyimpan 1,5 sebagai 1.5', async () => {
    seedCart([item('one', 1)]);
    render(<InputPage />);
    const qty = screen.getByDisplayValue('1');
    fireEvent.change(qty, { target: { value: '1,5' } });
    fireEvent.blur(qty);
    await waitFor(() => expect(screen.getByDisplayValue('1.5')).toBeInTheDocument());
  });

  it('menyiapkan transaksi untuk antrean tanpa menulis ke backend atau membuat hasil akhir', async () => {
    seedCart([item('one'), item('two'), item('zero', 0)]);
    const onNavigate = vi.fn();
    render(<InputPage onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: /Kirim 2 item/i }));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('sync'));
    expect(api.stagePendingTransaction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'barangKeluar', entity: 'CV', status: 'PENDING_REVIEW', autoSend: true,
      items: expect.arrayContaining([expect.objectContaining({ clientItemId: 'one' }), expect.objectContaining({ clientItemId: 'two' })]),
    }));
    expect(api.submitBarangMasuk).not.toHaveBeenCalled();
    expect(api.submitBarangKeluar).not.toHaveBeenCalled();
    expect(api.submitBarangRusak).not.toHaveBeenCalled();
    expect(api.saveToHistory).not.toHaveBeenCalled();
    expect(api.pushNotification).not.toHaveBeenCalled();
    expect(screen.getByText('Barang zero')).toBeInTheDocument();
    expect(screen.queryByText('Barang one')).not.toBeInTheDocument();
  });

  it('mengalihkan tanggung jawab ke Sinkronisasi setelah lima detik bila staging lokal tertahan', async () => {
    seedCart([item('slow-handoff')]);
    let resolveStage;
    api.stagePendingTransaction.mockReturnValueOnce(new Promise((resolve) => { resolveStage = resolve; }));
    const onNavigate = vi.fn();
    vi.useFakeTimers();
    render(<InputPage onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: /Kirim 1 item/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(onNavigate).toHaveBeenCalledWith('sync');
    expect(screen.getByText(/Input melepas proses setelah 5 detik/)).toBeInTheDocument();

    await act(async () => { resolveStage(['slow-handoff']); });
    expect(api.stagePendingTransaction).toHaveBeenCalledWith(expect.objectContaining({ autoSend: true }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('mempertahankan keranjang dan tidak berpindah jika antrean gagal disimpan', async () => {
    seedCart([item('retry')]);
    api.stagePendingTransaction.mockRejectedValueOnce(new Error('Penyimpanan antrean gagal'));
    const onNavigate = vi.fn();
    render(<InputPage onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: /Kirim 1 item/i }));

    await waitFor(() => expect(screen.getByText(/Penyimpanan antrean gagal/)).toBeInTheDocument());
    expect(screen.getByText('Keranjang (1)')).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(api.submitBarangKeluar).not.toHaveBeenCalled();
  });

  it('tidak mengantrekan keranjang yang seluruh jumlahnya nol', async () => {
    seedCart([item('zero-only', 0)]);
    render(<InputPage />);
    expect(screen.getByRole('button', { name: /Kirim 0 item/i })).toBeDisabled();
    expect(api.stagePendingTransaction).not.toHaveBeenCalled();
  });
});

