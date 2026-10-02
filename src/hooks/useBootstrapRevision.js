import { useEffect, useState } from 'react';

/**
 * Reactive bridge for backend bootstrap cache updates.
 * Does not own or mutate master/transaction state; it only exposes a
 * revision number so mounted pages can re-read their existing data sources.
 */
export function useBootstrapRevision() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const onUpdated = () => setRevision((v) => v + 1);
    window.addEventListener('gudangai-bootstrap-updated', onUpdated);
    return () => window.removeEventListener('gudangai-bootstrap-updated', onUpdated);
  }, []);

  return revision;
}

export default useBootstrapRevision;
