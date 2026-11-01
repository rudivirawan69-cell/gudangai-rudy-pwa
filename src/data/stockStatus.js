/** Shared fixed stock bands used by Stok, Dashboard and fallback data. */
export function classifyStockLevel(value) {
  const stock = Number(value) || 0;
  if (stock < 10) return 'kritis';
  if (stock < 20) return 'waspada';
  return 'aman';
}
