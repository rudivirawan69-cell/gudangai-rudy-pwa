/**
 * PDF/Text Validation — REKAP ORDER / nota
 * - Hybrid: pdf.js text layer → jika tipis, OCR Tesseract.js (ind+eng)
 * - Hanya baca: NAMA BARANG + TOTAL qty
 * - Nomor urut PDF, header kolom, TGL di PDF = diabaikan
 * - Qty 25.00 → 25 ; 2.00 → 2
 * - Tidak menebak: fuzzy/ambigu wajib konfirmasi user
 */

import { matchByAlias, searchMaster } from './master';

const PDFJS_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';

let pdfjsLibPromise = null;
let tesseractPromise = null;

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

async function loadTesseract() {
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = import(/* @vite-ignore */ TESSERACT_CDN);
  return tesseractPromise;
}

async function renderPageToCanvas(page, scale = 2) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

export async function ocrImage(source, onProgress) {
  const Tesseract = await loadTesseract();
  const createWorker = Tesseract.createWorker || Tesseract.default?.createWorker;
  if (!createWorker) throw new Error('Tesseract.js tidak termuat');
  onProgress?.('Memuat engine OCR…');
  const worker = await createWorker('ind+eng', 1, {
    logger: (m) => {
      if (!onProgress) return;
      if (m.status === 'recognizing text' && m.progress != null) {
        onProgress(`OCR ${Math.round(m.progress * 100)}%`);
      } else if (m.status) {
        onProgress(String(m.status));
      }
    },
  });
  try {
    const { data } = await worker.recognize(source);
    return (data?.text || '').trim();
  } finally {
    try { await worker.terminate(); } catch (_) {}
  }
}

async function extractTextLayer(doc) {
  const allLines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items || [];

    const eolLines = [];
    let buf = '';
    for (const it of items) {
      const str = it.str || '';
      buf += str;
      if (it.hasEOL) {
        const line = buf.replace(/\s+/g, ' ').trim();
        if (line) eolLines.push(line);
        buf = '';
      }
    }
    if (buf.trim()) eolLines.push(buf.replace(/\s+/g, ' ').trim());

    const rows = [];
    for (const it of items) {
      const str = (it.str || '').replace(/\s+/g, ' ').trim();
      if (!str) continue;
      const tr = it.transform || [1, 0, 0, 1, 0, 0];
      const x = tr[4] || 0;
      const y = tr[5] || 0;
      const h = Math.abs(tr[3] || tr[0] || 12) || 12;
      const tol = Math.max(5, h * 0.65);
      let row = null;
      for (const r of rows) {
        if (Math.abs(r.y - y) <= tol) { row = r; break; }
      }
      if (!row) {
        row = { y, cells: [] };
        rows.push(row);
      }
      row.cells.push({ x, str });
    }
    rows.sort((a, b) => b.y - a.y);
    const yLines = [];
    for (const row of rows) {
      row.cells.sort((a, b) => a.x - b.x);
      const line = row.cells.map((c) => c.str).join(' ').replace(/\s+/g, ' ').trim();
      if (line) yLines.push(line);
    }

    const chosen = (yLines.length >= eolLines.length && yLines.length >= 3) ? yLines
      : (eolLines.length >= 3 ? eolLines : (yLines.length ? yLines : eolLines));
    allLines.push(...chosen);
    allLines.push('');
  }
  return allLines.join('\n').trim();
}

async function ocrPdfDocument(doc, onProgress) {
  const pageTexts = [];
  const maxPages = Math.min(doc.numPages, 8);
  for (let p = 1; p <= maxPages; p++) {
    onProgress?.(`OCR halaman ${p}/${maxPages}…`);
    const page = await doc.getPage(p);
    const canvas = await renderPageToCanvas(page, 2);
    const text = await ocrImage(canvas, (m) => onProgress?.(`Halaman ${p}/${maxPages}: ${m}`));
    if (text) pageTexts.push(text);
  }
  return pageTexts.join('\n\n').trim();
}

export async function extractTextFromPdf(file, onProgress) {
  if (!file) throw new Error('File kosong');
  onProgress?.('Membaca PDF…');
  const buf = await file.arrayBuffer();
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  onProgress?.('Mengekstrak teks digital…');
  let text = await extractTextLayer(doc);
  const alphaLen = (text.match(/[A-Za-z\u00C0-\u024F]/g) || []).length;
  const needOcr = !text || text.length < 40 || alphaLen < 20;
  if (!needOcr) {
    onProgress?.('Teks digital ditemukan');
    return { text, method: 'text' };
  }
  onProgress?.('PDF scan terdeteksi — menjalankan OCR…');
  try {
    const ocrText = await ocrPdfDocument(doc, onProgress);
    if (ocrText && ocrText.length > (text?.length || 0)) {
      return { text: ocrText, method: text ? 'mixed' : 'ocr' };
    }
    if (text && text.length >= 3) return { text, method: 'text' };
    if (ocrText) return { text: ocrText, method: 'ocr' };
  } catch (err) {
    if (text && text.length >= 3) return { text, method: 'text' };
    throw new Error('OCR gagal: ' + (err.message || err));
  }
  return { text: text || '', method: 'text' };
}

export async function extractTextFromImage(file, onProgress) {
  if (!file) throw new Error('File kosong');
  onProgress?.('Menyiapkan gambar…');
  const text = await ocrImage(file, onProgress);
  return { text: text || '', method: 'ocr' };
}

export async function extractTextFromPdfString(file, onProgress) {
  const r = await extractTextFromPdf(file, onProgress);
  return typeof r === 'string' ? r : r.text;
}

const HEADER_RE =
  /^(no\.?|keterangan|nama\s*barang|barang|size|satuan|unit|total|po\s*cv|po\s*pt|tgl|tanggal|outlet|halaman|page|rekap|order|cv\.|pt\.|frozen\s*food|cold\s*storage|periode|area\s*gudang|chinese\s*food|traditional\s*food|selera\s*bogatama|rasyuka)/i;

const SKIP_LINE_RE =
  /^(periode|tanggal|tgl|halaman|page|rekap\s*order|area\s*gudang|chinese\s*food|traditional|selera\s*bogatama|cv\.?\s*selera|pt\.?\s*rasyuka|food\s*specialist)/i;

const UNIT_ONLY_RE =
  /^(pack|pcs|ekor|kg|box|pail|unit|liter|porsi|frozen|chilled|dry|btl|botol|bal|dus)$/i;

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

export function parseLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.length < 2) return null;
  if (HEADER_RE.test(trimmed)) return null;
  if (SKIP_LINE_RE.test(trimmed)) return null;
  if (/periode\s*:/i.test(trimmed) || /tanggal\s*:/i.test(trimmed)) return null;
  if (/^[\d.\s,|]+$/.test(trimmed)) return null;
  if (UNIT_ONLY_RE.test(trimmed)) return null;

  let clean = trimmed
    .replace(/^\d{1,4}[\.)]\s+/, '')
    .replace(/^\d{1,4}\s+(?=[A-Za-zÀ-ÿ])/, '')
    .trim();
  if (!clean || HEADER_RE.test(clean) || SKIP_LINE_RE.test(clean)) return null;

  const withoutParen = clean.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

  let qty = 0;
  let nameSource = withoutParen;
  const totalMark = withoutParen.match(/\btotal\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i);
  if (totalMark) {
    qty = normalizeQty(parseFloat(totalMark[1].replace(',', '.')));
    nameSource = withoutParen.replace(totalMark[0], ' ').replace(/\s+/g, ' ').trim();
  } else {
    const numMatches = [...withoutParen.matchAll(/(\d+(?:[.,]\d+)?)/g)];
    if (numMatches.length) {
      const last = numMatches[numMatches.length - 1];
      qty = normalizeQty(parseFloat(String(last[1]).replace(',', '.')));
      nameSource = withoutParen.slice(0, last.index).trim();
      nameSource = nameSource
        .replace(/(\d+(?:[.,]\d+)?\s*)+$/g, '')
        .replace(/\b(?:pack|pcs|ekor|kg|box|pail|unit|liter|porsi|frozen|chilled|dry)\s*$/i, '')
        .replace(/(\d+(?:[.,]\d+)?\s*)+$/g, '')
        .trim();
    }
  }

  nameSource = nameSource
    .replace(/\b(?:pack|pcs|ekor|kg|box|pail|unit|liter|porsi|frozen|chilled|dry)\s*$/i, '')
    .trim();
  let name = cleanName(nameSource);
  if (!name || name.length < 3) return null;
  if (UNIT_ONLY_RE.test(name)) return null;
  if (name.length > 80 || (name.match(/\s/g) || []).length > 12) return null;
  if (/^(periode|tanggal|barang|keterangan)$/i.test(name)) return null;

  return { name, qty: qty > 0 ? qty : 0, needsQty: !(qty > 0) };
}

export function parseLinesFromText(text) {
  if (!text) return [];
  const raw = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const expanded = [];
  for (const line of raw) {
    if (!line) continue;
    let chunks = line.split(/(?=\b\d{1,3}(?:[\.)]\s+|\s+)[A-Za-zÀ-ÿ])/);
    chunks = chunks.map((c) => c.trim()).filter(Boolean);
    if (chunks.length >= 2) {
      for (const s of chunks) expanded.push(s);
    } else {
      expanded.push(line);
    }
  }

  const merged = [];
  for (let i = 0; i < expanded.length; i++) {
    let line = expanded[i];
    if (HEADER_RE.test(line)) continue;
    if (SKIP_LINE_RE.test(line)) continue;
    if (/periode\s*:/i.test(line) || /tanggal\s*:/i.test(line)) continue;
    if (/^[\d.\s,]+$/.test(line)) continue;

    const hasQty = /\b\d+(?:[.,]\d+)?\b/.test(line);
    const next = expanded[i + 1] || '';
    const nextLooksLikeQtyRow =
      next &&
      /^(pack|pcs|pail|ekor|kg|box|unit|frozen|chilled)/i.test(next) &&
      /\d+(?:[.,]\d+)?/.test(next);

    while (i + 1 < expanded.length) {
      const nxt = expanded[i + 1];
      if (!nxt) break;
      const pureNum = /^[\d.\s,|]+$/.test(nxt);
      const unitQty = /^(pack|pcs|pail|ekor|kg|box|unit|frozen|chilled)\b/i.test(nxt) && /\d+(?:[.,]\d+)?/.test(nxt);
      if (pureNum || unitQty || nextLooksLikeQtyRow) {
        line = `${line} ${nxt}`;
        i += 1;
        continue;
      }
      if (!hasQty && nxt && /\b\d+(?:[.,]\d+)?\b/.test(nxt) && !HEADER_RE.test(nxt) && cleanName(nxt).length < 8) {
        line = `${line} ${nxt}`;
        i += 1;
        continue;
      }
      break;
    }

    const parsed = parseLine(line);
    if (!parsed) continue;
    if (/^frozen$/i.test(parsed.name)) continue;
    if (parsed.name.length < 3) continue;
    if (/^(barang|keterangan|total|unit|size|satuan)$/i.test(parsed.name)) continue;

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
          line, nameFromPdf: name, qty,
          kode: result.item.kode, nama: result.item.nama, satuan: result.item.satuan, divisi: result.item.divisi,
          matchType: result.matchType || 'alias', warning: warn,
          candidates: candidates.length ? candidates : [result.item], status: 'ambiguous',
        });
      } else {
        matched.push({
          line, nameFromPdf: name, qty, ...result.item,
          matchType: result.matchType || 'alias', status: 'matched',
        });
      }
      continue;
    }

    const fuzzy = searchMaster(entity, name);
    if (fuzzy.length === 1) {
      ambiguous.push({
        line, nameFromPdf: name, qty,
        kode: fuzzy[0].kode, nama: fuzzy[0].nama, satuan: fuzzy[0].satuan, divisi: fuzzy[0].divisi,
        matchType: 'fuzzy', warning: 'Perkiraan tunggal — konfirmasi dulu',
        candidates: fuzzy, status: 'ambiguous',
      });
    } else if (fuzzy.length > 1) {
      ambiguous.push({
        line, nameFromPdf: name, qty,
        kode: fuzzy[0].kode, nama: fuzzy[0].nama, satuan: fuzzy[0].satuan, divisi: fuzzy[0].divisi,
        matchType: 'fuzzy-multi', warning: `${fuzzy.length} kandidat — pilih yang benar`,
        candidates: fuzzy.slice(0, 6), status: 'ambiguous',
      });
    } else {
      unmatched.push({ line, nameFromPdf: name, qty, status: 'unmatched' });
    }
  }

  return { matched, unmatched, ambiguous, parsedRows, totalLines: lines.length };
}

export function summarizeValidation(results) {
  const matched = results?.matched || [];
  return {
    matched: matched.length,
    ambiguous: (results?.ambiguous || []).length,
    unmatched: (results?.unmatched || []).length,
    matchedItems: matched.map((m) => ({
      kode: m.kode, nama: m.nama, qty: m.qty, satuan: m.satuan,
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
