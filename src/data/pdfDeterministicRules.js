/** Deterministic PDF name resolver — V6.8.1 (PT-aligned, CV preserved) */
export function normalizeOcr(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\bsomay\b/g, 'siomay')
    // Normalize common PDF/OCR substitutions before deterministic product matching.
    .replace(/\bf[il1]+e?t\b/g, 'fillet')
    .replace(/\bd[a4]d[a4]\b/g, 'dada')
    .replace(/\bp[a4]h[a4]\b/g, 'paha')
    .replace(/\b(?:frozen|beku|chilled|fresh)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Entity-aware deterministic rules.
 * Order matters: more specific patterns first.
 * Only returns match when kode exists in the provided masterList.
 */
export function resolvePdfNameDeterministic(entity, rawName, masterList) {
  const name = String(rawName || '').trim();
  if (!name || !Array.isArray(masterList) || !masterList.length) return null;

  const norm = normalizeOcr(name);
  const ent = String(entity || '').toUpperCase() === 'PT' ? 'PT' : 'CV';
  const byKode = new Map(masterList.map((m) => [String(m.kode || '').trim(), m]));

  function pick(kode, matchType) {
    const item = byKode.get(kode);
    if (!item) return null;
    return { item, matchType: matchType || 'deterministic' };
  }

  // --- Specific rules (CV vs PT codes differ) ---
  // Keep the two fillet variants explicit so OCR/PDF noise cannot swap them.
  if (/fillet\s+dada/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'PT-0001' : 'CV-0001', 'det-ayam-fillet-dada');
    if (hit) return hit;
  }
  if (/fillet\s+paha/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'PT-0002' : 'CV-0002', 'det-ayam-fillet-paha');
    if (hit) return hit;
  }
  // Deterministic mappings for items reported missing in PDF import.
  // PDFs often append a weight before the product variant and a storage label.
  // Match only the distinctive 2-dada + 2-paha product; do not fuzzy-match generic "ayam negeri".
  if (/ayam\s+negeri/.test(norm) && /2\s*dada/.test(norm) && /2\s*paha/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'WK-0039' : 'CV-0071', 'det-ayam-negeri-2dada-2paha');
    if (hit) return hit;
  }
  if (/tulang.*ceker/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'PT-0010' : 'CV-0038', 'det-tulang-ceker');
    if (hit) return hit;
  }
  if (/saos?\s+bakaran?\b/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'WK-0008' : 'CV-0076', 'det-saos-bakaran');
    if (hit) return hit;
  }
  if (/ayam\s+agm(?:\s*\(?\s*promo\s*\)?)?/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'WK-0031' : 'CV-0061', 'det-ayam-agm');
    if (hit) return hit;
  }
  if (/saos?\s+agm(?:\s+promo)?/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'WK-0028' : 'CV-0058', 'det-saos-agm');
    if (hit) return hit;
  }
  if (/saos?\s+rica(?:[-\s]*rica)?(?:\s+promo)?/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'WK-0029' : 'CV-0059', 'det-saos-rica');
    if (hit) return hit;
  }
  if (ent === 'PT' && /(?:paket\s+siomay|siomay\s+paket|paket\s+somay|somay\s+paket|^siomay$)/.test(norm)) {
    const hit = pick('MM-0015', 'det-paket-siomay');
    if (hit) return hit;
  }
  // Bakso ikan CIDEA / GOOD EAT (with brand)
  if (/bakso\s*ikan/.test(norm) && /(cidea|good\s*eat)/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'PT-0007' : 'CV-0004', 'det-bakso-cidea');
    if (hit) return hit;
  }
  // Bakso ikan plain (no CIDEA/GOOD EAT)
  if (/bakso\s*ikan/.test(norm) && !/(cidea|good\s*eat)/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'PT-0008' : 'CV-0007', 'det-bakso-plain');
    if (hit) return hit;
  }
  // Saos Lada Hitam PROMO
  if (/saos?\s*lada\s*hitam/.test(norm) && /promo/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'PT-0052' : 'CV-0092', 'det-saos-lada-promo');
    if (hit) return hit;
  }
  // Saos Lada Hitam (non-promo)
  if (/saos?\s*lada\s*hitam/.test(norm) && !/promo/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'PT-0022' : 'CV-0021', 'det-saos-lada');
    if (hit) return hit;
  }
  // K. Polong / Golden Farm Mix
  if (/(k\.?\s*polong|golden\s*fa[er]m\s*mix|golden\s*farm)/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'WK-0020' : 'CV-0033', 'det-golden-farm');
    if (hit) return hit;
  }
  // Daging slice LOWFAT (≠ YAKINIKU)
  if (/daging.*slice/.test(norm) && /low\s*fat|lowfat/.test(norm) && !/yakiniku/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'PT-0044' : 'CV-0084', 'det-lowfat');
    if (hit) return hit;
  }
  // Bumbu urap / urap-urap — PT uses Rekanan/WK code.
  if (/bumbu\s+urap/.test(norm) || /urap[-\s]*urap/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'WK-0009' : 'CV-0077', 'det-bumbu-urap');
    if (hit) return hit;
  }
  // Daging slice YAKINIKU
  if (/daging.*(slice|sapi)/.test(norm) && /yakiniku/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'PT-0009' : 'CV-0008', 'det-yakiniku');
    if (hit) return hit;
  }
  // Udang PND
  if (/udang/.test(norm) && /(pnd|115)/.test(norm)) {
    const hit = pick(ent === 'PT' ? 'PT-0005' : 'CV-0003', 'det-udang-pnd');
    if (hit) return hit;
  }

  // Exact nama
  for (const m of masterList) {
    if (normalizeOcr(m.nama) === norm) return { item: m, matchType: 'exact' };
  }
  // Kode exact
  for (const m of masterList) {
    if (normalizeOcr(m.kode) === norm) return { item: m, matchType: 'kode' };
  }
  // Contains (longest nama wins)
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
