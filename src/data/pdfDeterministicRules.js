/**
 * Deterministic PDF matching rules for GudangAI-69.
 * Semantic context is evaluated BEFORE generic alias matching.
 */
function normalizeOcr(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/\bfaem\b|\bfaarn\b|\bfarn\b|\bfaam\b/g, 'farm')
    .replace(/\bgolden\s+fae?m\b/g, 'golden farm')
    .replace(/\s+/g, ' ')
    .trim();
}
function resolvePdfNameDeterministic(entity, rawName, master) {
  const n = normalizeOcr(rawName);
  if (!n || !Array.isArray(master)) return null;
  const code = (cv, pt) => entity === 'PT' ? pt : cv;
  const find = (c) => master.find((i) => i.kode === c) || null;
  if ((/golden\s+farm(?:\s+mix)?/.test(n) || (/k\.?\s*polong/.test(n) && /farm/.test(n)))) {
    const item = find(code('CV-0033', 'PT-0020'));
    if (item) return { item, matchType: 'deterministic-golden-farm' };
  }
  if (/bakso\s+ikan/.test(n) && /\bcidea\b|\bgood\s*eat\b/.test(n)) {
    const item = find(code('CV-0004', 'PT-0007'));
    if (item) return { item, matchType: 'deterministic-bakso-cidea' };
  }
  if (/bakso\s+ikan/.test(n) && !/\bcidea\b|\bgood\s*eat\b/.test(n)) {
    const item = find(code('CV-0007', 'PT-0008'));
    if (item) return { item, matchType: 'deterministic-bakso-normal' };
  }
  if (/saos\s+lada\s+hitam/.test(n) && /\bpromo\b/.test(n)) {
    const item = find(code('CV-0092', 'PT-0052'));
    if (item) return { item, matchType: 'deterministic-lada-hitam-promo' };
  }
  if (/saos\s+lada\s+hitam/.test(n) && !/\bpromo\b/.test(n)) {
    const item = find(code('CV-0021', 'PT-0022'));
    if (item) return { item, matchType: 'deterministic-lada-hitam-normal' };
  }
  return null;
}
export { normalizeOcr, resolvePdfNameDeterministic };
