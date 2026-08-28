import { useState, useEffect, useCallback } from 'react';
import { fetchStock } from '../data/api';

export function useStock(entity) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStock(entity);
      setItems(data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => { refresh(); }, [refresh]);

  const getStats = useCallback(() => {
    const total = items.length;
    const safe = items.filter(i => i.stok > 20).length;
    const warning = items.filter(i => i.stok > 5 && i.stok <= 20).length;
    const danger = items.filter(i => i.stok > 0 && i.stok <= 5).length;
    const zero = items.filter(i => i.stok === 0).length;
    const totalStok = items.reduce((s, i) => s + (i.stok || 0), 0);
    return { total, safe, warning, danger, zero, totalStok };
  }, [items]);

  return { items, loading, error, refresh, lastRefresh, getStats };
}
