/**
 * PDF/Text Validation - parse items and match to master data
 * Uses alias-config.json (189 items, 396+ aliases) for accurate matching
 */
import { matchByAlias, searchMaster } from './master';

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let clean = trimmed.replace(/^\d+[\.)\s]+/, '').trim();
  clean = clean.replace(/\b(?:pack|pcs|kg|ekor|box|pail|unit|liter|porsi)\b/gi, '').trim();
  const lastNumMatch = clean.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*$/);
  if (lastNumMatch) return { name: lastNumMatch[1].trim(), qty: parseFloat(lastNumMatch[2].replace(',', '.')) || 1 };
  const tabParts = clean.split('\t');
  if (tabParts.length >= 2) {
    const num = parseFloat(tabParts[tabParts.length - 1].replace(',', '.'));
    if (!isNaN(num) && num > 0) return { name: tabParts.slice(0, -1).join(' ').trim(), qty: num };
  }
  const spaceParts = clean.split(/\s{2,}/);
  if (spaceParts.length >= 2) {
    const num = parseFloat(spaceParts[spaceParts.length - 1].replace(',', '.'));
    if (!isNaN(num) && num > 0) return { name: spaceParts.slice(0, -1).join(' ').trim(), qty: num };
  }
  return { name: clean, qty: 1 };
}

function checkAmbiguity(name) {
  const lower = name.toLowerCase();
  if (/daging\s*slice/i.test(lower) && !/yakiniku|lowfat/i.test(lower)) return 'YAKINIKU atau LOWFAT?';
  if (/bakso\s*ikan/i.test(lower) && !/cidea/i.test(lower) && !/good\s*eat/i.test(lower)) return 'Bakso Ikan biasa atau CIDEA?';
  if (/saos\s*lada\s*hitam/i.test(lower) && !/promo/i.test(lower)) return 'Saos Lada Hitam biasa atau PROMO?';
  return null;
}

export function validateItems(lines, entity) {
  const matched = [], unmatched = [], ambiguous = [];
  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed || !parsed.name) continue;
    const { name, qty } = parsed;
    const result = matchByAlias(entity, name);
    if (result) {
      const warn = checkAmbiguity(name);
      if (warn) {
        ambiguous.push({ line, nameFromPdf: name, qty, ...result.item, matchType: result.matchType, warning: warn });
      } else {
        matched.push({ line, nameFromPdf: name, qty, ...result.item, matchType: result.matchType });
      }
    } else {
      const fuzzy = searchMaster(entity, name);
      if (fuzzy.length === 1) {
        matched.push({ line, nameFromPdf: name, qty, ...fuzzy[0], matchType: 'fuzzy' });
      } else if (fuzzy.length > 1) {
        ambiguous.push({ line, nameFromPdf: name, qty, ...fuzzy[0], matchType: 'fuzzy-multi', warning: `${fuzzy.length} kandidat`, candidates: fuzzy.slice(0, 5) });
      } else {
        unmatched.push({ line, nameFromPdf: name, qty });
      }
    }
  }
  return { matched, unmatched, ambiguous };
}

export { parseLine, checkAmbiguity };
