import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchStock } from '../data/api';
import { findByKode, getMasterByEntity } from '../data/master';

/**
 * Normalisasi respons getAllStock → array item datar + divisi dari master.
 */
function normalizeStockPayload(data, entityFilter) {
  if (!data) return [];
  let list = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (typeof data === 'object') {
    if (Array.isArray(data.items)) list = data.items;
    else if (Array.isArray(data.stock)) list = data.stock;
    else {
      const cv = data.cv || data.CV || [];
      const pt = data.pt || data.PT || [];
      list = [
        ...(Array.isArray(cv) ? cv.map((x) => ({ ...x, entity: x.entity || x.entitas || 'CV' })) : []),
        ...(Array.isArray(pt) ? pt.map((x) => ({ ...x, entity: x.entity || x.entitas || 'PT' })) : []),
      ];
    }
  }
  if (entityFilter && (entityFilter === 'CV' || entityFilter === 'PT')) {
    list = list.filter((x) => String(x.entity || x.entitas || '').toUpperCase() === entityFilter || !x.entity);
  }
  return list.map((raw) => {
    const kode = raw.kode || raw.kodeBarang || raw.code || '';
    const master = kode ? findByKode(kode) : null;
    const qty = Number(raw.qty ?? raw.stok ?? raw.sisa ?? raw.stock ?? raw.jumlah ?? 0);
    return {
      ...raw,
      kode,
      nama: raw.nama || raw.name || master?.nama || kode,
      satuan: raw.satuan || master?.satuan || 'Pack',
      divisi: raw.divisi || raw.division || master?.divisi || 'LAIN',
      qty,
      stok: qty,
      entity: String(raw.entity || raw.entitas || (String(kode).startsWith('PT') ? 'PT' : 'CV')).toUpperCase(),
      min: Number(raw.min ?? raw.stokMin ?? raw.stockAman ?? master?.min ?? 5),
    };
  }).filter((x) => x.kode);
}

export function useStock(entity) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const lastOk = useRef([]);
  const fetching = useRef(false);

  const refresh = useCallback(async ({ force = false } = {}) => {
    if (fetching.current && !force) return;
    fetching.current = true;
    if (lastOk.current.length === 0) setLoading(true);
    setError(null);
    try {
      const data = await fetchStock(entity, { allowDemo: false });
      if (data && data.success === false) {
        const errMsg = data.error || data.message || 'Gagal memuat stok';
        setError(errMsg);
        if (lastOk.current.length > 0) setItems(lastOk.current);
        else setItems([]);
        return;
      }
      const list = normalizeStockPayload(data, entity);
      if (list.length > 0) {
        lastOk.current = list;
        setItems(list);
        setLastRefresh(new Date());
        setError(null);
      } else if (lastOk.current.length > 0) {
        setItems(lastOk.current);
      } else {
        const masterList = [
          ...getMasterByEntity('CV').map((m) => ({ ...m, entity: 'CV', qty: 0, stok: 0, min: 5 })),
          ...getMasterByEntity('PT').map((m) => ({ ...m, entity: 'PT', qty: 0, stok: 0, min: 5 })),
        ];
        const filtered = entity && (entity === 'CV' || entity === 'PT')
          ? masterList.filter((m) => m.entity === entity)
          : masterList;
        setItems(filtered);
        setError(data?.error || 'Stok API kosong — menampilkan master (qty 0). Cek API Secret di Atur.');
      }
    } catch (err) {
      setError(err.message);
      if (lastOk.current.length > 0) {
        setItems(lastOk.current);
      } else {
        const masterList = [
          ...getMasterByEntity('CV').map((m) => ({ ...m, entity: 'CV', qty: 0, stok: 0, min: 5 })),
          ...getMasterByEntity('PT').map((m) => ({ ...m, entity: 'PT', qty: 0, stok: 0, min: 5 })),
        ];
        setItems(masterList);
      }
    } finally {
      setLoading(false);
      fetching.current = false;
    }
  }, [entity]);

  useEffect(() => {
    lastOk.current = [];
    setItems([]);
    setLoading(true);
    refresh({ force: true });
  }, [entity, refresh]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) refresh({ force: true });
    };
    const id = setInterval(() => {
      if (navigator.onLine) refresh({ force: false });
    }, 45000);
    const onStockRefresh = () => refresh({ force: true });
    window.addEventListener('gudangai-stock-refresh', onStockRefresh);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', () => refresh({ force: true }));
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('gudangai-stock-refresh', onStockRefresh);
    };
  }, [refresh]);

  const getStats = useCallback(() => {
    const total = items.length;
    const safe = items.filter((i) => {
      const aman = Number(i.min || i.stockAman) || 5;
      const q = Number(i.stok ?? i.qty ?? 0);
      return q > aman;
    }).length;
    const warning = items.filter((i) => {
      const aman = Number(i.min || i.stockAman) || 5;
      const q = Number(i.stok ?? i.qty ?? 0);
      return q > 0 && q <= aman;
    }).length;
    const danger = items.filter((i) => Number(i.stok ?? i.qty ?? 0) <= 0).length;
    const totalStok = items.reduce((s, i) => s + (Number(i.stok ?? i.qty) || 0), 0);
    return { total, safe, warning, danger, zero: danger, totalStok };
  }, [items]);

  return { items, loading, error, refresh, lastRefresh, getStats };
}
