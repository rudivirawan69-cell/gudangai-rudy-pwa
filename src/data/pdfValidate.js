 /**
 * PDF Validation + QR/Barcode — parse PDF surat jalan and match items to master data
 */
import { matchByAlias, getMasterByEntity } from './master';

/** Extract text from a PDF File (placeholder — full pdf.js TBD) */
export async function extractTextFromPdf(file) {
  return { text: '', lines: [], error: 'PDF parser akan tersedia di update berikutnya.' };
}

/** Parse raw text into structured lines */
export function parseLinesFromText(text) {
  if (!text) return [];
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}

/** Detect entity (CV/PT) from text context */
export function detectEntityFromText(text) {
  if (!text) return 'CV';
  const lower = text.toLowerCase();
  if (lower.includes('rasyuka') || lower.includes('pt.') || lower.includes('pt ')) return 'PT';
  return 'CV';
}

/** Validate parsed items against master data using alias matching */
export function validateItems(lines, entity) {
  const matched = [];
  const unmatched = [];
  for (const line of lines) {
    const parts = line.split(/\s{2,}|\t/);
    let name = '', qty = 0;
    if (parts.length >= 2) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const num = parseFloat(parts[i].replace(',', '.'));
        if (!isNaN(num) && num > 0) { qty = num; name = parts.slice(0, i).filter(p => !/^\d+\.?$/.test(p.trim())).join(' ').trim(); break; }
      }
      if (!name) name = parts.slice(0, -1).join(' ').trim();
    } else { name = line; }
    if (!name) continue;
    const result = matchByAlias(entity, name);
    if (result) {
      matched.push({ line, nameFromPdf: name, ...result.item, qty: qty || 1, matchType: result.matchType });
    } else {
      unmatched.push({ line, nameFromPdf: name, qty: qty || 0 });
    }
  }
  return { matched, unmatched };
}

/** Scan barcode from video stream (placeholder) */
export async function scanBarcodeFromVideo() {
  return { code: null, error: 'QR Scanner akan tersedia di update berikutnya.' };
}
