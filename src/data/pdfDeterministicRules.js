/** Deterministic PDF name resolver — V6.5.4 */
export function normalizeOcr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolvePdfNameDeterministic(entity, rawName, masterList) {
  const name = String(rawName || '').trim();
  if (!name || !Array.isArray(masterList) || !masterList.length) return null;
  const norm = normalizeOcr(name);
  // Exact nama
  for (const m of masterList) {
    if (normalizeOcr(m.nama) === norm) return { item: m, matchType: 'exact' };
  }
  // Kode exact
  for (const m of masterList) {
    if (normalizeOcr(m.kode) === norm) return { item: m, matchType: 'kode' };
  }
  // Contains (nama di dalam raw atau sebaliknya)
  let best = null;
  let bestLen = 0;
  for (const m of masterList) {
    const mn = normalizeOcr(m.nama);
    if (mn.length < 4) continue;
    if (norm.includes(mn) || mn.includes(norm)) {
      if (mn.length > bestLen) {
        bestLen = mn.length;
        best = m;
      }
    }
  }
  if (best) return { item: best, matchType: 'contains' };
  return null;
}
