/**
 * PDF/Text Validation — parse rekap order / nota lines and match to master + aliases.
 * Rules:
 *  - Never auto-guess ambiguous items (must user-pick)
 *  - Qty = TOTAL column (last numeric after Pack/Ekor) when present
 *  - Do not treat "(0.5 kg)" inside name as unit/qty
 */

import { matchByAlias, searchMaster } from './master';

const PDFJS_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

let pdfjsLibPromise = null;

async function loadPdfJs() {
  if (pdfjsLibPromise) return pdfjsLibPromise;
  pdfjsLibPromise = (async () => {
    const pdfjs = await import(/* @vite-ignore */ PDFJS_CDN);
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    }
    return pdfjs;
  })();
  return pdfjsLibPromise;
}

/** Extract plain text from a PDF File/Blob (client-side). */
export async function extractTextFromPdf(file) {
  if (!file) throw new Error('File kosong');
  const buf = await file.arrayBuffer();
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items || [];
    const linesMap = new Map();
    for (const it of items) {
      const str = (it.str || '').trim();
      if (!str) continue;
      const y = it.transform ? Math.round(it.transform[5]) : 0;
      const key = String(y);
      if (!linesMap.has(key)) linesMap.set(key, []);
      linesMap.get(key).push({ x: it.transform ? it.transform[4] : 0, str });
    }
    const sortedY = [...linesMap.keys()].map(Number).sort((a, b) => b - a);
    for (const y of sortedY) {
      const row = linesMap
        .get(String(y))
        .sort((a, b) => a.x - b.x)
        .map((c) => c.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (row) parts.push(row);
    }
    parts.push('');
  }
  return parts.join('\n').trim();
}

/** Split raw text into candidate item lines (skip headers/footers). */
export function parseLinesFromText(text) {
  if (!text) return [];
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => {
      if (!l || l.length < 2) return false;
      if (/^(no|keterangan|total|unit|outlet|halaman|page|rekap|order|cv\.|pt\.)/i.test(l)) return false;
      if (/^[\d.\s]+$/.test(l)) return false;
      return true;
    });
}

/**
 * Parse one line → { name, qty }.
 * Prefer last standalone number as TOTAL qty (rekap order).
 * Ignore numbers inside parentheses like (0.5 kg) / (10 pcs).
 */
export function parseLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;

  let clean = trimmed.replace(/^\d+[\.)]\s+/, '').trim();
  clean = clean.replace(/\([^)]*\b(?:kg|pcs|pack|ekor|gr|g|ml|liter)\b[^)]*\)/gi, ' ').trim();

  const tabParts = clean.split('\t').map((s) => s.trim()).filter(Boolean);
  if (tabParts.length >= 2) {
    const last = tabParts[tabParts.length - 1].replace(/,/g, '.');
    const num = parseFloat(last.replace(/[^\d.\-]/g, ''));
    if (!isNaN(num) && num > 0 && /^[\d.,]+$/.test(tabParts[tabParts.length - 1].replace(/\s/g, ''))) {
      return { name: tabParts.slice(0, -1).join(' ').trim(), qty: num };
    }
  }

  const wide = clean.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
  if (wide.length >= 2) {
    const last = wide[wide.length - 1].replace(/,/g, '.');
    const num = parseFloat(last.replace(/[^\d.\-]/g, ''));
    if (!isNaN(num) && num > 0 && /^[\d.,]+$/.test(wide[wide.length - 1].replace(/\s/g, ''))) {
      let nameParts = wide.slice(0, -1);
      if (/^(pack|pcs|ekor|kg|box|unit|pail)$/i.test(nameParts[nameParts.length - 1] || '')) {
        nameParts = nameParts.slice(0, -1);
      }
      return { name: nameParts.join(' ').trim(), qty: num };
    }
  }

  const unitQty = clean.match(
    /^(.+?)\s+(?:pack|pcs|ekor|kg|box|pail|unit|liter|porsi)?\s*(\d+(?:[.,]\d+)?)\s*$/i
  );
  if (unitQty) {
    return {
      name: unitQty[1].replace(/\b(?:pack|pcs|ekor|kg|box|pail|unit|liter|porsi)\b/gi, '').replace(/\s+/g, ' ').trim(),
      qty: parseFloat(unitQty[2].replace(',', '.')) || 1,
    };
  }

  const allNums = [...clean.matchAll(/\b(\d+(?:[.,]\d+)?)\b/g)];
  if (allNums.length) {
    const last = allNums[allNums.length - 1];
    const qty = parseFloat(last[1].replace(',', '.')) || 1;
    const name = (clean.slice(0, last.index) + clean.slice(last.index + last[0].length))
      .replace(/\b(?:pack|pcs|ekor|kg|box|pail|unit|liter|porsi)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (name) return { name, qty };
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

/**
 * Validate lines against master + aliases.
 * NEVER auto-guess: fuzzy multi → ambiguous; critical aliases → ambiguous.
 * Only exact/alias unique matches go to matched without user action.
 */
export function validateItems(linesOrText, entity) {
  const lines = Array.isArray(linesOrText)
    ? linesOrText
    : parseLinesFromText(String(linesOrText || ''));

  const matched = [];
  const unmatched = [];
  const ambiguous = [];
  const parsedRows = [];

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed || !parsed.name) continue;
    const { name, qty } = parsed;
    parsedRows.push({ line, name, qty });

    const result = matchByAlias(entity, name);
    if (result && result.item) {
      const warn = checkAmbiguity(name);
      if (warn) {
        const candidates = searchMaster(entity, name).slice(0, 6);
        ambiguous.push({
          line,
          nameFromPdf: name,
          qty,
          kode: result.item.kode,
          nama: result.item.nama,
          satuan: result.item.satuan,
          divisi: result.item.divisi,
          matchType: result.matchType || 'alias',
          warning: warn,
          candidates: candidates.length ? candidates : [result.item],
          status: 'ambiguous',
        });
      } else {
        matched.push({
          line,
          nameFromPdf: name,
          qty,
          ...result.item,
          matchType: result.matchType || 'alias',
          status: 'matched',
        });
      }
      continue;
    }

    const fuzzy = searchMaster(entity, name);
    if (fuzzy.length === 1) {
      ambiguous.push({
        line,
        nameFromPdf: name,
        qty,
        kode: fuzzy[0].kode,
        nama: fuzzy[0].nama,
        satuan: fuzzy[0].satuan,
        divisi: fuzzy[0].divisi,
        matchType: 'fuzzy',
        warning: 'Perkiraan tunggal — konfirmasi dulu',
        candidates: fuzzy,
        status: 'ambiguous',
      });
    } else if (fuzzy.length > 1) {
      ambiguous.push({
        line,
        nameFromPdf: name,
        qty,
        kode: fuzzy[0].kode,
        nama: fuzzy[0].nama,
        satuan: fuzzy[0].satuan,
        divisi: fuzzy[0].divisi,
        matchType: 'fuzzy-multi',
        warning: `${fuzzy.length} kandidat — pilih yang benar`,
        candidates: fuzzy.slice(0, 6),
        status: 'ambiguous',
      });
    } else {
      unmatched.push({
        line,
        nameFromPdf: name,
        qty,
        status: 'unmatched',
      });
    }
  }

  return { matched, unmatched, ambiguous, parsedRows, totalLines: lines.length };
}

export function summarizeValidation(results) {
  if (Array.isArray(results)) {
    const matched = results.filter((r) => r.status === 'matched');
    const ambiguous = results.filter((r) => r.status === 'ambiguous');
    const unmatched = results.filter((r) => r.status === 'unmatched');
    return {
      matched: matched.length,
      ambiguous: ambiguous.length,
      unmatched: unmatched.length,
      matchedItems: matched.map((r) => ({
        kode: r.kode,
        nama: r.namaMaster || r.nama,
        qty: r.qty,
        satuan: r.satuan,
        keterangan: r.keterangan || 'Validasi PDF/Nota',
      })),
    };
  }
  const matched = results?.matched || [];
  return {
    matched: matched.length,
    ambiguous: (results?.ambiguous || []).length,
    unmatched: (results?.unmatched || []).length,
    matchedItems: matched.map((m) => ({
      kode: m.kode,
      nama: m.nama,
      qty: m.qty,
      satuan: m.satuan,
      keterangan: m.keterangan || 'Validasi PDF',
    })),
  };
}

export async function scanBarcodeFromVideo(videoEl) {
  if (!videoEl) return { ok: false, error: 'Video tidak siap' };
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code', 'ean_13', 'code_128'] });
      const codes = await detector.detect(videoEl);
      if (codes && codes[0]) return { ok: true, value: codes[0].rawValue || '' };
      return { ok: false, error: 'Tidak ada barcode terdeteksi' };
    } catch (err) {
      return { ok: false, error: err.message || 'Scan gagal' };
    }
  }
  return { ok: false, error: 'BarcodeDetector tidak didukung di browser ini' };
}

export { checkAmbiguity };
