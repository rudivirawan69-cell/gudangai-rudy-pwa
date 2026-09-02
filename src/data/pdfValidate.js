/**
 * PDF/Text Validation — REKAP ORDER / nota
 * - Hanya baca: NAMA BARANG + TOTAL qty
 * - Nomor urut PDF, header kolom, TGL di PDF = diabaikan
 * - Qty 25.00 → 25 ; 2.00 → 2
 * - Tidak menebak: fuzzy/ambigu wajib konfirmasi user
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

/** Extract plain text from PDF with row grouping by Y. */
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
    const rows = [];
    for (const it of items) {
      const str = (it.str || '').replace(/\s+/g, ' ').trim();
      if (!str) continue;
      const x = it.transform ? it.transform[4] : 0;
      const y = it.transform ? it.transform[5] : 0;
      const yKey = Math.round(y / 3) * 3;
      let row = rows.find((r) => r.yKey === yKey);
      if (!row) {
        row = { yKey, y, cells: [] };
        rows.push(row);
      }
      row.cells.push({ x, str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const row of rows) {
      row.cells.sort((a, b) => a.x - b.x);
      const line = row.cells.map((c) => c.str).join(' ').replace(/\s+/g, ' ').trim();
      if (line) parts.push(line);
    }
    parts.push('');
  }
  return parts.join('\n').trim();
}

const HEADER_RE =
  /^(no\.?|keterangan|nama\s*barang|size|satuan|unit|total|po\s*cv|po\s*pt|tgl|tanggal|outlet|halaman|page|rekap|order|cv\.|pt\.|frozen\s*food|cold\s*storage)/i;

const UNIT_ONLY_RE =
  /^(pack|pcs|ekor|kg|box|pail|unit|liter|porsi|frozen|chilled|dry|btl|botol|bal|dus)$/i;

/** Normalize qty: 25.00 → 25, 2.50 stays 2.5 */
export function normalizeQty(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (Math.abs(x - Math.round(x)) < 1e-9) return Math.round(x);
  return Math.round(x * 1000) / 1000;
}

function cleanName(raw) {
  let s = String(raw || '')
    .replace(/["\u201C\u201D']/g, ' ')
    .replace(/\([^)]*\b(?:kg|pcs|pack|ekor|gr|g|ml|liter|ltr)\b[^)]*\)/gi, ' ')
    .replace(/\b(?:pack|pcs|ekor|kg|box|pail|unit|liter|porsi|frozen|chilled)\b/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

/**
 * Parse one logical item line → { name, qty } | null
 * Prefer last numeric token as TOTAL (kolom TOTAL di rekap).
 */
export function parseLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.length < 2) return null;
  if (HEADER_RE.test(trimmed)) return null;
  if (/^[\d.\s,]+$/.test(trimmed)) return null;
  if (UNIT_ONLY_RE.test(trimmed)) return null;

  let clean = trimmed.replace(/^\d{1,3}[\.)]\s+/, '').replace(/^\d{1,3}\s+(?=[A-Za-z])/, '').trim();
  if (!clean || HEADER_RE.test(clean)) return null;

  const withoutParen = clean.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

  const numMatches = [...withoutParen.matchAll(/\b(\d+(?:[.,]\d+)?)\b/g)];
  if (!numMatches.length) {
    const nameOnly = cleanName(withoutParen);
    if (nameOnly.length < 2) return null;
    return { name: nameOnly, qty: 1 };
  }

  const last = numMatches[numMatches.length - 1];
  const qty = normalizeQty(parseFloat(last[1].replace(',', '.')));
  if (!(qty > 0)) return null;

  let namePart = withoutParen.slice(0, last.index).trim();
  namePart = namePart.replace(/\b(?:pack|pcs|ekor|kg|box|pail|unit|liter|porsi|frozen|chilled)\s*$/i, '').trim();
  let name = cleanName(namePart);
  if (!name || name.length < 2) return null;
  if (UNIT_ONLY_RE.test(name)) return null;

  return { name, qty };
}

/**
 * Merge broken multi-line PDF rows: name on one line, "Pail FROZEN 2.00 2.00" on next.
 */
export function parseLinesFromText(text) {
  if (!text) return [];
  const raw = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const merged = [];
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i];
    if (HEADER_RE.test(line)) continue;
    if (/^[\d.\s,]+$/.test(line)) continue;

    const hasQty = /\b\d+(?:[.,]\d+)?\b/.test(line);
    const next = raw[i + 1] || '';
    const nextLooksLikeQtyRow =
      next &&
      /^(pack|pcs|pail|ekor|kg|box|unit|frozen|chilled)/i.test(next) &&
      /\d+(?:[.,]\d+)?/.test(next);

    if (!hasQty && nextLooksLikeQtyRow) {
      line = `${line} ${next}`;
      i += 1;
    } else if (hasQty === false && next && /\b\d+(?:[.,]\d+)?\b/.test(next) && !HEADER_RE.test(next)) {
      const nextParsed = parseLine(next);
      if (nextParsed && cleanName(next).length < 8) {
        line = `${line} ${next}`;
        i += 1;
      }
    }

    const parsed = parseLine(line);
    if (!parsed) continue;
    if (/^frozen$/i.test(parsed.name)) continue;
    if (parsed.name.length < 3) continue;

    merged.push(line);
  }
  return merged;
}

function checkAmbiguity(name) {
  const lower = name.toLowerCase();
  if (/daging\s*slice/i.test(lower) && !/yakiniku|lowfat/i.test(lower)) return 'YAKINIKU atau LOWFAT?';
  if (/bakso\s*ikan/i.test(lower) && !/cidea/i.test(lower) && !/good\s*eat/i.test(lower)) return 'Bakso Ikan biasa atau CIDEA?';
  if (/saos\s*lada\s*hitam/i.test(lower) && !/promo/i.test(lower)) return 'Saos Lada Hitam biasa atau PROMO?';
  return null;
}

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
        warning: 'Perkiraan tunggal \u2014 konfirmasi dulu',
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
        warning: `${fuzzy.length} kandidat \u2014 pilih yang benar`,
        candidates: fuzzy.slice(0, 6),
        status: 'ambiguous',
      });
    } else {
      unmatched.push({ line, nameFromPdf: name, qty, status: 'unmatched' });
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

export { checkAmbiguity, cleanName };
