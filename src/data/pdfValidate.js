/**
 * pdfValidate.js — PDF/image text extraction + master validation
 * Used by ValidasiPage.jsx and InputPage.jsx
 */
import { matchByAlias, getMasterByEntity } from './master';

/* ── PDF text extraction (pdfjs-dist) ─────────────────────────── */
let pdfjsLib = null;
async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  try {
    pdfjsLib = await import('pdfjs-dist');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }
    return pdfjsLib;
  } catch {
    return null;
  }
}

export async function extractTextFromPdf(file, onProgress) {
  if (onProgress) onProgress('Membaca PDF...');
  const lib = await loadPdfjs();
  if (!lib) {
    if (onProgress) onProgress('pdfjs-dist tidak tersedia. Coba OCR...');
    const ocrResult = await extractTextFromImage(file, onProgress);
    return { text: ocrResult?.text || '', method: 'ocr' };
  }
  try {
    const arrayBuf = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: arrayBuf }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      if (onProgress) onProgress(`Halaman ${p}/${pdf.numPages}...`);
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const lines = content.items.map((i) => i.str).join(' ');
      pages.push(lines);
    }
    const text = pages.join('\n');
    if (text.replace(/\s/g, '').length >= 5) {
      return { text, method: 'text' };
    }
    // fallback OCR if PDF has no selectable text
    if (onProgress) onProgress('PDF scan — fallback ke OCR...');
    const ocrResult = await extractTextFromImage(file, onProgress);
    return { text: ocrResult?.text || '', method: 'mixed' };
  } catch (err) {
    if (onProgress) onProgress('PDF gagal — coba OCR: ' + (err.message || err));
    const ocrResult = await extractTextFromImage(file, onProgress);
    return { text: ocrResult?.text || '', method: 'ocr' };
  }
}

/* ── Image OCR (Tesseract.js) ─────────────────────────────────── */
let tesseractWorker = null;
async function getTesseractWorker(onProgress) {
  if (tesseractWorker) return tesseractWorker;
  try {
    const Tesseract = await import('tesseract.js');
    if (onProgress) onProgress('Memuat OCR engine...');
    tesseractWorker = await Tesseract.createWorker('ind+eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(`OCR ${Math.round((m.progress || 0) * 100)}%`);
        }
      },
    });
    return tesseractWorker;
  } catch {
    return null;
  }
}

export async function extractTextFromImage(file, onProgress) {
  if (onProgress) onProgress('Memuat OCR...');
  const worker = await getTesseractWorker(onProgress);
  if (!worker) {
    return { text: '', error: 'Tesseract.js tidak tersedia' };
  }
  try {
    const buf = file instanceof Blob ? file : new Blob([file]);
    const { data } = await worker.recognize(buf);
    return { text: data?.text || '' };
  } catch (err) {
    return { text: '', error: err.message || 'OCR gagal' };
  }
}

/* ── Parse raw text into item rows ────────────────────────────── */
export function parseLinesFromText(text) {
  if (!text) return [];
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2);

  const rows = [];
  // Patterns: "2x Ayam Fillet", "Ayam Fillet x3", "Ayam Fillet 5", "3 Ayam Fillet"
  const reLeadQty = /^(\d+(?:[.,]\d+)?)\s*[xX×]?\s+(.+)/;
  const reTrailQty = /^(.+?)\s+[xX×]?\s*(\d+(?:[.,]\d+)?)\s*$/;
  const reTrailX = /^(.+?)\s+[xX×]\s*(\d+(?:[.,]\d+)?)\s*$/;

  for (const line of lines) {
    // skip header / non-item lines
    if (/^(no|tanggal|nama\s*barang|jumlah|satuan|total|harga|keterangan|entitas)/i.test(line)) continue;
    if (/^\d{1,3}[\.\)]\s*$/.test(line)) continue;

    let name = '';
    let qty = 1;
    let raw = line;

    // strip leading row number: "1. " or "1) " or just "1 "
    let cleaned = line.replace(/^\d{1,3}[\.\)]\s*/, '');

    // try leading qty: "2x Ayam" or "2 Ayam"
    let m = cleaned.match(reLeadQty);
    if (m) {
      qty = parseFloat(m[1].replace(',', '.')) || 1;
      name = m[2].trim();
    } else {
      // try trailing qty with x: "Ayam x3"
      m = cleaned.match(reTrailX);
      if (m) {
        name = m[1].trim();
        qty = parseFloat(m[2].replace(',', '.')) || 1;
      } else {
        // try trailing qty: "Ayam 3"
        m = cleaned.match(reTrailQty);
        if (m && m[1].length > 1 && !/^\d/.test(m[1])) {
          name = m[1].trim();
          qty = parseFloat(m[2].replace(',', '.')) || 1;
        } else {
          name = cleaned;
          qty = 1;
        }
      }
    }

    if (name.length >= 2) {
      rows.push({ name, qty, raw, line });
    }
  }
  return rows;
}

/* ── Validate parsed rows against master + alias ──────────────── */
export function validateItems(rows, entity) {
  const matched = [];
  const ambiguous = [];
  const unmatched = [];

  for (const row of rows) {
    const result = matchByAlias(entity, row.name);
    if (result) {
      matched.push({
        nameFromPdf: row.name,
        nama: result.item.nama,
        kode: result.item.kode,
        satuan: result.item.satuan,
        divisi: result.item.divisi,
        matchType: result.matchType,
        qty: row.qty,
        raw: row.raw,
        line: row.line,
        item: result.item,
      });
    } else {
      // try fuzzy: find all items whose nama partially matches
      const master = getMasterByEntity(entity);
      const nameL = row.name.toLowerCase().trim()
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .replace(/["\u201C\u201D]/g, '')
        .replace(/[-\u2013\u2014]+/g, ' ')
        .replace(/\s+/g, ' ').trim();
      const candidates = master.filter((item) => {
        const n = item.nama.toLowerCase();
        return n.includes(nameL) || nameL.includes(n);
      });
      if (candidates.length === 1) {
        matched.push({
          nameFromPdf: row.name,
          nama: candidates[0].nama,
          kode: candidates[0].kode,
          satuan: candidates[0].satuan,
          divisi: candidates[0].divisi,
          matchType: 'fuzzy-single',
          qty: row.qty,
          raw: row.raw,
          line: row.line,
          item: candidates[0],
        });
      } else if (candidates.length > 1) {
        ambiguous.push({
          nameFromPdf: row.name,
          candidates,
          qty: row.qty,
          raw: row.raw,
          line: row.line,
        });
      } else {
        unmatched.push({
          nameFromPdf: row.name,
          qty: row.qty,
          raw: row.raw,
          line: row.line,
        });
      }
    }
  }
  return { matched, ambiguous, unmatched };
}

/* ── Summarize validation results ─────────────────────────────── */
export function summarizeValidation(results) {
  if (!results || !Array.isArray(results)) {
    return { matched: 0, ambiguous: 0, unmatched: 0, matchedItems: [] };
  }
  const matchedItems = results.filter((r) => r.status === 'matched');
  const ambiguousItems = results.filter((r) => r.status === 'ambiguous');
  const unmatchedItems = results.filter((r) => r.status === 'unmatched');
  return {
    matched: matchedItems.length,
    ambiguous: ambiguousItems.length,
    unmatched: unmatchedItems.length,
    matchedItems,
  };
}

/* ── Barcode scanner (BarcodeDetector API) ────────────────────── */
export async function scanBarcodeFromVideo(video) {
  if (!('BarcodeDetector' in window)) {
    return { ok: false, error: 'BarcodeDetector tidak didukung browser ini.' };
  }
  try {
    const detector = new window.BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128'] });
    const barcodes = await detector.detect(video);
    if (barcodes.length === 0) {
      return { ok: false, error: 'Tidak ada barcode terdeteksi. Arahkan kamera ke barcode.' };
    }
    return { ok: true, value: barcodes[0].rawValue };
  } catch (err) {
    return { ok: false, error: err.message || 'Scan gagal' };
  }
}
