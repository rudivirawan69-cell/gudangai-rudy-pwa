import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AgentMemoryPanel from './AgentMemoryPanel';

describe('AgentMemoryPanel', () => {
  it('saves a labeled memory entry and shows account-scoped notes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn();
    render(
      <AgentMemoryPanel
        open
        onClose={vi.fn()}
        onSave={onSave}
        onDelete={onDelete}
        items={[{
          id: 'memory-1',
          title: 'Arah fitur',
          content: 'Lanjutkan dari catatan operator.',
          kind: 'decision',
          created_at: '2026-11-18T12:00:00.000Z',
        }]}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Memori pengembangan' })).toBeTruthy();
    expect(screen.getByText('Catatan ini dipakai sebagai konteks Rubee pada sesi berikutnya.')).toBeTruthy();
    expect(screen.getByText('Arah fitur')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Judul'), { target: { value: 'Rencana lanjutan' } });
    fireEvent.change(screen.getByLabelText('Catatan'), { target: { value: 'Simpan keputusan untuk sesi berikut.' } });
    fireEvent.change(screen.getByLabelText('Jenis catatan'), { target: { value: 'follow_up' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan catatan' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      title: 'Rencana lanjutan',
      content: 'Simpan keputusan untuk sesi berikut.',
      kind: 'follow_up',
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Hapus memori Arah fitur' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('memory-1'));
  });
});
