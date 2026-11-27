import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import NotificationsPage from '../NotificationsPage';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('gudangai_notifications', JSON.stringify([
    { id: 'N-1', title: 'Transaksi terkonfirmasi', body: '2 item berhasil disimpan.', at: Date.now(), read: false },
    { id: 'N-2', title: 'Koneksi pulih', body: 'Sinkronisasi aktif.', at: Date.now() - 1000, read: true },
  ]));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('NotificationsPage', () => {
  it('shows centralized notification list and unread count', () => {
    render(<NotificationsPage />);
    expect(screen.getByText('Pusat Notifikasi')).toBeInTheDocument();
    expect(screen.getByText('2 notifikasi · 1 belum dibaca')).toBeInTheDocument();
    expect(screen.getByText('Transaksi terkonfirmasi')).toBeInTheDocument();
    expect(screen.getByText('Koneksi pulih')).toBeInTheDocument();
  });

  it('marks all notifications read from the central page', () => {
    render(<NotificationsPage />);
    fireEvent.click(screen.getByRole('button', { name: /Baca semua/i }));
    expect(screen.getByText('2 notifikasi · 0 belum dibaca')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('gudangai_notifications') || '[]').every((item) => item.read)).toBe(true);
  });

  it('updates when a new notification event arrives', () => {
    render(<NotificationsPage />);
    const list = JSON.parse(localStorage.getItem('gudangai_notifications') || '[]');
    list.unshift({ id: 'N-3', title: 'Antrean menunggu verifikasi', body: 'Periksa sinkronisasi.', at: Date.now(), read: false });
    localStorage.setItem('gudangai_notifications', JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('gudangai-notification', { detail: list[0] }));
    expect(screen.getByText('3 notifikasi · 2 belum dibaca')).toBeInTheDocument();
    expect(screen.getByText('Antrean menunggu verifikasi')).toBeInTheDocument();
  });
});
