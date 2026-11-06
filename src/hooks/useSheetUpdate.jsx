import { useEffect, useState } from 'react';
import { getDashboardData } from '../data/api';

function formatUpdate(value) {
  if (value === undefined || value === null || value === '') return '';
  const date = typeof value === 'number'
    ? new Date(value < 1e12 ? value * 1000 : value)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    timeZone: 'Asia/Jakarta',
  }).format(date) + ' WIB';
}

/**
 * Menampilkan timestamp yang dikirim API spreadsheet, bukan jam perangkat.
 * Polling ringan menjaga label header tetap aktual walau halaman Dashboard tidak aktif.
 */
export function useSheetUpdate() {
  const [label, setLabel] = useState('');

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await getDashboardData();
        if (!active || !data?.success) return;
        const value = data.lastUpdate ?? data.lastUpdatedAt ?? data.lastUpdated;
        if (value !== undefined && value !== null && value !== '') setLabel(formatUpdate(value));
      } catch (_) {
        // Keep the last verified timestamp visible when the spreadsheet API is offline.
      } finally {
        inFlight = false;
      }
    };
    const onSheetUpdated = (event) => {
      const value = event?.detail?.lastUpdate ?? event?.detail?.updatedAt ?? event?.detail?.timestamp;
      if (value !== undefined && value !== null && value !== '') setLabel(formatUpdate(value));
      refresh();
    };
    refresh();
    const timer = window.setInterval(refresh, 90000);
    window.addEventListener('gudangai-sheet-updated', onSheetUpdated);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('gudangai-sheet-updated', onSheetUpdated);
    };
  }, []);

  return label;
}

export default useSheetUpdate;
