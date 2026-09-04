/**
 * pdfValidate.js — PDF/image text extraction + master validation
 * Tuned for REKAP ORDER warehouse PDFs (CV. SELERA BOGATAMA / PT. RASYUKA)
 */
import { matchByAlias, getMasterByEntity } from './master';

/* ── PDF text extraction (pdfjs-dist) with Y-position line grouping ─ */
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

/** Group text items into lines by Y coordinate (tolerance ~3 units) */
function itemsToLines(items) {
  if (!items?.length) return [];
  const sorted = [...items]
    .filter((i) => i.str && i.str.trim())
    .map((i) => ({
      str: i.str,
      x: i.transform?.[4] ?? 0,
      y: i.transform?.[5] ?? 0,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines = [];
  let curY = null;
  let cur = [];
  const Y_TOL = 3.5;

  for (const it of sorted) {
    if (curY === null || Math.abs(it.y - curY) <= Y_TOL) {
      cur.push(it);
      if (curY === null) curY = it.y;
    } else {
      cur.sort((a, b) => a.x - b.x);
      lines.push(cur.map((c) => c.str).join(' ').replace(/\s+/g, ' ').trim());
      cur = [it];
      curY = it.y;
    }
  }
  if (cur.length) {
    cur.sort((a, b) => a.x - b.x);
    lines.push(cur.map((c) => c.str).join(' ').replace(/\s+/g, ' ').trim());
  }
  return lines.filter((l) => l.length >= 1);
}

export async function extractTextFromPdf(file, onProgress) {
  if (onProgress) onProgress('Membaca PDF...');
  const lib = await loadPdfjs();
  if (!lib) {
    if (onProgress) onProgress('pdfjs-dist tidak tersedia. Coba OCR...');
    const ocrResult = await extractTextFromImage(file, onProgress);
    return { text: ocrResult?.text || '', method: 'ocr', lines: [] };
  }
  try {
    const arrayBuf = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: arrayBuf }).promise;
    const allLines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      if (onProgress) onProgress(`Halaman ${p}/${pdf.numPages}...`);
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const pageLines = itemsToLines(content.items);
      allLines.push(...pageLines);
    }
    const text = allLines.join('\n');
    if (text.replace(/\s/g, '').length >= 5) {
      return { text, method: 'text', lines: allLines };
    }
    if (onProgress) onProgress('PDF scan — fallback ke OCR...');
    const ocrResult = await extractTextFromImage(file, onProgress);
    return { text: ocrResult?.text || '', method: 'mixed', lines: [] };
  } catch (err) {
    if (onProgress) onProgress('PDF gagal — coba OCR: ' + (err.message || err));
    const ocrResult = await extractTextFromImage(file, onProgress);
    return { text: ocrResult?.text || '', method: 'ocr', lines: [] };
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

/* ── Detect entity from header text ───────────────────────────── */
export function detectEntityFromText(text) {
  const t = (text || '').toUpperCase();
  if (/CV\.?\s*SELERA\s*BOGATAMA|SELERA\s*BOGATAMA/.test(t)) return 'CV';
  if (/PT\.?\s*RASYUKA|RASYUKA/.test(t)) return 'PT';
  if (/\bCV\b/.test(t) && !/\bPT\b/.test(t)) return 'CV';
  if (/\bPT\b/.test(t) && !/\bCV\b/.test(t)) return 'PT';
  return null;
}

/* ── Parse REKAP ORDER / free-form text into item rows ─────────── */
const HEADER_RE = /^(no\.?|tanggal|nama\s*barang|jumlah|satuan|total|harga|keterangan|entitas|unit|rekap\s*order|periode|outlet|frozen|kering|chinese|traditional|specialist)/i;
const UNIT_WORDS = /(?:Pack|Ekor|Kg|Box|Pail|Unit|Liter|Pcs|pcs)\b/i;

/**
 * REKAP ORDER: KETERANGAN (name) + UNIT + outlet cols + TOTAL (qty)
 * Qty = last number after unit word (TOTAL column).
 */
export function parseLinesFromText(text, preLines) {
  if (!text && !preLines?.length) return [];

  let lines = Array.isArray(preLines) && preLines.length
    ? preLines.map((l) => String(l).trim()).filter((l) => l.length >= 2)
    : String(text || '')
        .split(/\n/)
        .map((l) => l.trim())
        .filter((l) => l.length >= 2);

  if (lines.length <= 2 && text && text.length > 80) {
    const blob = text.replace(/\s+/g, ' ').trim();
    const parts = blob.split(/(?=(?:^|\s)\d{1,3}[\.\)]\s+[A-Za-zÀ-ÿ])/);
    if (parts.length > 2) {
      lines = parts.map((p) => p.trim()).filter((p) => p.length >= 3);
    }
  }

  const rows = [];
  const seen = new Set();

  for (const line of lines) {
    if (HEADER_RE.test(line)) continue;
    if (/^\d{1,3}[\.\)]?\s*$/.test(line)) continue;
    if (/periode\s*:|rekap\s*order|keterangan\s+unit/i.test(line)) continue;
    if (line.length < 3) continue;

    let cleaned = line.replace(/^\d{1,3}[\.\)]\s+/, '').trim();
    if (!cleaned || cleaned.length < 2) continue;

    const unitMatch = cleaned.match(UNIT_WORDS);
    let name = cleaned;
    let qty = 1;
    let satuanHint = '';

    if (unitMatch) {
      const unitIdx = unitMatch.index;
      const before = cleaned.slice(0, unitIdx).trim();
      const after = cleaned.slice(unitIdx + unitMatch[0].length).trim();
      satuanHint = unitMatch[0];
      name = before.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
      const nums = after.match(/\d+(?:[.,]\d+)?/g);
      if (nums && nums.length) {
        qty = parseFloat(nums[nums.length - 1].replace(',', '.')) || 1;
      }
    } else {
      const reTrailX = /^(.+?)\s+[xX×]\s*(\d+(?:[.,]\d+)?)\s*$/;
      const reTrailQty = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*$/;
      const reLeadQty = /^(\d+(?:[.,]\d+)?)\s*[xX×]?\s+(.+)/;
      let m = cleaned.match(reLeadQty);
      if (m) {
        qty = parseFloat(m[1].replace(',', '.')) || 1;
        name = m[2].trim();
      } else {
        m = cleaned.match(reTrailX);
        if (m) {
          name = m[1].trim();
          qty = parseFloat(m[2].replace(',', '.')) || 1;
        } else {
          m = cleaned.match(reTrailQty);
          if (m && m[1].length > 2 && !/^\d/.test(m[1])) {
            name = m[1].trim();
            qty = parseFloat(m[2].replace(',', '.')) || 1;
          } else {
            name = cleaned;
            qty = 1;
          }
        }
      }
    }

    name = name
      .replace(/\s*\/\s*CV\.?\s*PD3\s*CHICKEN/gi, '')
      .replace(/\s*\/\s*GOOD\s*EAT/gi, '')
      .replace(/[-–—]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (name.length < 2) continue;
    if (/^(total|sub\s*total|grand\s*total|jumlah|qty)$/i.test(name)) continue;

    const key = `${name.toLowerCase()}|${qty}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({ name, qty, raw: line, line, satuanHint: satuanHint || undefined });
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
      const master = getMasterByEntity(entity);
      const nameL = row.name.toLowerCase().trim()
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .replace(/["\u201C\u201D]/g, '')
        .replace(/[-\u2013\u2014]+/g, ' ')
        .replace(/\s+/g, ' ').trim();

      const candidates = master.filter((item) => {
        const n = item.nama.toLowerCase();
        return n.includes(nameL) || nameL.includes(n) || tokenOverlap(nameL, n) >= 0.6;
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
          candidates: candidates.slice(0, 6),
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

function tokenOverlap(a, b) {
  const ta = new Set(a.split(/\s+/).filter((t) => t.length > 2));
  const tb = new Set(b.split(/\s+/).filter((t) => t.length > 2));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.max(ta.size, tb.size);
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
    const detector = new window.BarcodeDetector({
      formats: ['qr_code', 'ean_13', 'ean_8', 'code_128'],
    });
    const barcodes = await detector.detect(video);
    if (barcodes.length === 0) {
      return { ok: false, error: 'Tidak ada barcode terdeteksi. Arahkan kamera ke barcode.' };
    }
    return { ok: true, value: barcodes[0].rawValue };
  } catch (err) {
    return { ok: false, error: err.message || 'Scan gagal' };
  }
}
