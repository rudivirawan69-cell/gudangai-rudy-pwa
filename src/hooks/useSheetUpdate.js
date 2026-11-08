import { useEffect, useState } from 'react';

const EVENT_NAME = 'gudangai-sheet-updated';

function getLabel(detail) {
  if (typeof detail === 'string') return detail;
  if (!detail || typeof detail !== 'object') return '';
  return String(detail.label || detail.updatedAt || detail.lastUpdated || detail.timestamp || '');
}

export function useSheetUpdate() {
  const [label, setLabel] = useState('');

  useEffect(() => {
    const handleUpdate = (event) => {
      const nextLabel = getLabel(event.detail);
      if (nextLabel) setLabel(nextLabel);
    };

    window.addEventListener(EVENT_NAME, handleUpdate);
    return () => window.removeEventListener(EVENT_NAME, handleUpdate);
  }, []);

  return label;
}
