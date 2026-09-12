/**
 * pdfValidate.js — PDF/image text extraction + master validation
 * Tuned for REKAP ORDER warehouse PDFs (CV. SELERA BOGATAMA / PT. RASYUKA)
 * + 2-column merge + ambiguity rules (YAKINIKU/LOWFAT, CIDEA, saos promo)
 * Acuan ketat validasi PDF (12 Sep 2026): strip NO urut, size, outlet noise
 */
import { matchByAlias, getMasterByEntity } from './master';

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

function tryMergeTwoColumnPdf(text) {
  const lines = String(text || '').split(/\r?\n/);
  const qtyRows = [];
  const nameRows = [];
  let inNameSection = false;
  const NAME_SECTION_MARKERS = [/keterangan/i, /frozen.*kering/i, /^nama\s*barang/i, /no\s+keterangan/i];
  const QTY_ROW_RE = /^\d{1,4}\s+(?:pack|pcs|pail|ekor|kg|box|unit|porsi)?\s*(?:frozen|chilled|dry|kering)?\s*[\d.\s|-]+$/i;
  const HEADER_SKIP = /^(no\.?|unit|er\s*area|chinese\s*food|traditional|cv\.|pt\.|selera\s*bogatama|periode|tanggal|total|kode|barang)/i;
  const PRODUCT_NAME_RE = /[A-Za-z\u00C0-\u024F]{3,}/;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (NAME_SECTION_MARKERS.some((re) => re.test(trimmed))) { inNameSection = true; continue; }
    if (!inNameSection) {
      if (QTY_ROW_RE.test(trimmed)) {
        const nums = [...trimmed.matchAll(/(\d+(?:\.\d+)?)/g)];
        if (nums.length >= 2) qtyRows.push(parseFloat(nums[nums.length - 1][1]));
      }
    } else {
      if (HEADER_SKIP.test(trimmed)) continue;
      if (/^[\d.\s,|]+$/.test(trimmed)) continue;
      if (PRODUCT_NAME_RE.test(trimmed)) nameRows.push(trimmed);
    }
  }
  if (qtyRows.length > 0 && nameRows.length > 0 && Math.abs(qtyRows.length - nameRows.length) <= 3) {
    const merged = [];
    const count = Math.min(qtyRows.length, nameRows.length);
    for (let i = 0; i < count; i++) merged.push(`${nameRows[i]} ${qtyRows[i]}`);
    return merged.join('\n');
  }
  return null;
}

function checkAmbiguity(name) {
  const lower = String(name || '').toLowerCase();
  if (/daging\s*slice/i.test(lower) && !/yakiniku|lowfat/i.test(lower)) return 'YAKINIKU atau LOWFAT?';
  if (/bakso\s*ikan/i.test(lower) && !/cidea/i.test(lower) && !/good\s*eat/i.test(lower)) return 'Bakso Ikan biasa atau CIDEA?';
  if (/saos\s*lada\s*hitam/i.test(lower) && !/promo/i.test(lower)) return 'Saos Lada Hitam biasa atau PROMO?';
  return null;
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
    const textRaw = allLines.join('\n');
    const mergedText = tryMergeTwoColumnPdf(textRaw);
    const text = mergedText || textRaw;
    const outLines = mergedText ? text.split(/\n/) : allLines;
    if (text.replace(/\s/g, '').length >= 5) {
      return { text, method: mergedText ? 'text+merge2col' : 'text', lines: outLines };
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
  if (!worker) return { text: '', error: 'Tesseract.js tidak tersedia' };
  try {
    const buf = file instanceof Blob ? file : new Blob([file]);
    const { data } = await worker.recognize(buf);
    return { text: data?.text || '' };
  } catch (err) {
    return { text: '', error: err.message || 'OCR gagal' };
  }
}

export function detectEntityFromText(text) {
  const t = (text || '').toUpperCase();
  if (/CV\.?\s*SELERA\s*BOGATAMA|SELERA\s*BOGATAMA/.test(t)) return 'CV';
  if (/PT\.?\s*RASYUKA|RASYUKA/.test(t)) return 'PT';
  if (/\bCV\b/.test(t) && !/\bPT\b/.test(t)) return 'CV';
  if (/\bPT\b/.test(t) && !/\bCV\b/.test(t)) return 'PT';
  return null;
}

const HEADER_RE = /^(no\.?|tanggal|nama\s*barang|jumlah|satuan|total|harga|keterangan|entitas|unit|rekap\s*order|periode|outlet|frozen|kering|chinese|traditional|specialist|kode\s*barang|cv\.?\s*selera|pt\.?\s*rasyuka)/i;
const UNIT_WORDS = /(?:Pack|Ekor|Kg|Box|Pail|Unit|Liter|Pcs|pcs)\b/i;
const OUTLET_TOKENS = /\b(CIPUTRA|TRANS\s*ICON(?:\s*SBY)?|DELTA\s*SUPER(?:\s*MALL)?|S\.?\s*CITY|WTC|TANDES|GRAND\s*CITY|ICON\s*GRESIK|GRES\s*MALL|ICON\s*SBY|CITY\s*GRESIK|SUPER\s*GRAND|KODE\s*TRANS|BARANG\s*ICON)\b/gi;
const OUTLET_LINE_RE = /^(kode\s*)?(trans\s*)?(super\s*)?(grand\s*)?(icon\s*)?(sby\s*)?(mall\s*)?(city\s*)?(gresik\s*)?(gres\s*)?(ciputra|tandes|wtc|delta|s\.?\s*city).*$/i;
const SIZE_WITH_UNIT_RE = /\s*\d+(?:[.,]\d+)?\s*(?:kg|gr|gram|g|pcs|pc|pack|pail|ltr|liter|ml|ekor|porsi|ptg)\b/gi;
const SIZE_PAREN_RE = /\s*[\(\[][^)\]]*[\)\]]?\s*/g;

function stripLeadingNoAndNormalize(rawName) {
  let n = String(rawName || '').trim();
  n = n.replace(/^\d+\s+/, '');
  n = n.replace(/^\d{1,4}[\.\)]\s*/, '');
  n = n.replace(SIZE_PAREN_RE, ' ');
  n = n.replace(SIZE_WITH_UNIT_RE, ' ');
  n = n
    .replace(/\s*\/\s*CV\.?\s*PD3\s*CHICKEN/gi, '')
    .replace(/\s*\/\s*GOOD\s*EAT/gi, '')
    .replace(OUTLET_TOKENS, '')
    .replace(/[-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return n;
}

function isNoiseName(name) {
  const n = String(name || '').trim();
  if (!n || n.length < 2) return true;
  if (HEADER_RE.test(n)) return true;
  if (OUTLET_LINE_RE.test(n)) return true;
  const cleaned = n.replace(OUTLET_TOKENS, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length < 3) return true;
  if (/^(kode|barang|total|unit|qty|jumlah|saos\s*$)/i.test(cleaned)) return true;
  if (!/[A-Za-zÀ-ÿ]{3,}/.test(cleaned)) return true;
  return false;
}

export function parseLinesFromText(text, preLines) {
  if (!text && !preLines?.length) return [];
  let lines = Array.isArray(preLines) && preLines.length
    ? preLines.map((l) => String(l).trim()).filter((l) => l.length >= 2)
    : String(text || '').split(/\n/).map((l) => l.trim()).filter((l) => l.length >= 2);
  if (lines.length <= 2 && text && text.length > 80) {
    const blob = text.replace(/\s+/g, ' ').trim();
    const parts = blob.split(/(?=(?:^|\s)\d{1,4}[\.\)]?\s+[A-Za-zÀ-ÿ])/);
    if (parts.length > 2) lines = parts.map((p) => p.trim()).filter((p) => p.length >= 3);
  }
  const rows = [];
  const seen = new Set();
  for (const line of lines) {
    if (HEADER_RE.test(line)) continue;
    if (OUTLET_LINE_RE.test(line)) continue;
    if (/^\d{1,4}[\.\)]?\s*$/.test(line)) continue;
    if (/periode\s*:|rekap\s*order|keterangan\s+unit|chinese\s*food|traditional\s*food/i.test(line)) continue;
    if (line.length < 3) continue;
    if (/^[\d.\s,|xX×-]+$/.test(line)) continue;
    if (OUTLET_TOKENS.test(line) && line.replace(OUTLET_TOKENS, '').replace(/[\d\s.,|xX×-]/g, '').length < 4) continue;
    OUTLET_TOKENS.lastIndex = 0;
    let cleaned = line.replace(/^\d+\s+/, '').replace(/^\d{1,4}[\.\)]\s*/, '').trim();
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
      const nums = after.match(/\d+(?:[.,]\d+)?/g);
      if (nums && nums.length) qty = parseFloat(nums[nums.length - 1].replace(',', '.')) || 1;
      name = before;
    } else {
      const reTrailX = /^(.+?)\s+[xX×]\s*(\d+(?:[.,]\d+)?)\s*$/;
      const reTrailQty = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*$/;
      const reLeadQty = /^(\d+(?:[.,]\d+)?)\s*[xX×]?\s+(.+)/;
      let m = cleaned.match(reLeadQty);
      if (m && !/^\d/.test(m[2])) {
        qty = parseFloat(m[1].replace(',', '.')) || 1;
        name = m[2].trim();
      } else {
        m = cleaned.match(reTrailX);
        if (m) { name = m[1].trim(); qty = parseFloat(m[2].replace(',', '.')) || 1; }
        else {
          m = cleaned.match(reTrailQty);
          if (m && m[1].length > 2 && !/^\d/.test(m[1])) { name = m[1].trim(); qty = parseFloat(m[2].replace(',', '.')) || 1; }
          else { name = cleaned; qty = 1; }
        }
      }
    }
    name = stripLeadingNoAndNormalize(name);
    if (name.length < 2) continue;
    if (/^(total|sub\s*total|grand\s*total|jumlah|qty|unit)$/i.test(name)) continue;
    if (isNoiseName(name)) continue;
    const key = `${name.toLowerCase()}|${qty}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ name, qty, raw: line, line, satuanHint: satuanHint || undefined });
  }
  return rows;
}

export function validateItems(rows, entity) {
  const matched = [];
  const ambiguous = [];
  const unmatched = [];
  for (const row of rows) {
    const result = matchByAlias(entity, row.name);
    if (result) {
      const warn = checkAmbiguity(row.name);
      if (warn) {
        const candidates = getMasterByEntity(entity).filter((it) => {
          const n = it.nama.toLowerCase();
          const nameL = row.name.toLowerCase();
          return n.includes(nameL) || nameL.includes(n) || tokenOverlap(nameL, n) >= 0.4;
        }).slice(0, 6);
        ambiguous.push({ nameFromPdf: row.name, candidates: candidates.length ? candidates : [result.item], qty: row.qty, raw: row.raw, line: row.line, warning: warn, kode: result.item.kode, nama: result.item.nama, satuan: result.item.satuan });
      } else {
        matched.push({ nameFromPdf: row.name, nama: result.item.nama, kode: result.item.kode, satuan: result.item.satuan, divisi: result.item.divisi, matchType: result.matchType, qty: row.qty, raw: row.raw, line: row.line, item: result.item });
      }
    } else {
      const master = getMasterByEntity(entity);
      const nameL = row.name.toLowerCase().trim().replace(/\s*\([^)]*\)\s*/g, ' ').replace(/["\u201C\u201D']/g, '').replace(/[-\u2013\u2014]+/g, ' ').replace(/\s+/g, ' ').trim();
      const candidates = master.filter((item) => {
        const n = item.nama.toLowerCase();
        return n.includes(nameL) || nameL.includes(n) || tokenOverlap(nameL, n) >= 0.6;
      });
      if (candidates.length === 1) {
        matched.push({ nameFromPdf: row.name, nama: candidates[0].nama, kode: candidates[0].kode, satuan: candidates[0].satuan, divisi: candidates[0].divisi, matchType: 'fuzzy-single', qty: row.qty, raw: row.raw, line: row.line, item: candidates[0] });
      } else if (candidates.length > 1) {
        ambiguous.push({ nameFromPdf: row.name, candidates: candidates.slice(0, 6), qty: row.qty, raw: row.raw, line: row.line });
      } else {
        unmatched.push({ nameFromPdf: row.name, qty: row.qty, raw: row.raw, line: row.line });
      }
    }
  }
  return { matched, ambiguous, unmatched };
}

function similarityTokens(a, b) {
  const stop = new Set(['dan', 'yang', 'pcs', 'pack', 'gram', 'kg', 'promo']);
  const left = new Set(String(a || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((x) => x.length > 2 && !stop.has(x)));
  const right = new Set(String(b || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((x) => x.length > 2 && !stop.has(x)));
  if (!left.size || !right.size) return 0;
  let common = 0;
  left.forEach((token) => { if (right.has(token)) common += 1; });
  return common / Math.max(left.size, right.size);
}

function relatedProductGroup(name) {
  const n = String(name || '').toLowerCase();
  if (/daging.*slice|slice.*daging/.test(n)) return 'daging-slice';
  if (/sosis/.test(n)) return 'sosis';
  if (/bakso\s*ikan/.test(n)) return 'bakso-ikan';
  return null;
}

export function applyStockAwareFallback(matched, entity, stockItems = []) {
  const master = getMasterByEntity(entity);
  const stockByCode = new Map((stockItems || []).filter((x) => x?.kode).map((x) => [x.kode, Number(x.stok) || 0]));
  const groups = new Map();
  master.forEach((item) => {
    const group = relatedProductGroup(item.nama);
    if (group) groups.set(group, [...(groups.get(group) || []), item]);
  });
  return (matched || []).map((row) => {
    const currentStock = stockByCode.get(row.kode);
    if (currentStock == null || currentStock > 0) return { ...row, stock: currentStock, fallback: null };
    const group = relatedProductGroup(row.nama);
    const candidates = (groups.get(group) || [])
      .filter((item) => item.kode !== row.kode && (stockByCode.get(item.kode) || 0) > 0)
      .sort((a, b) => {
        const scoreA = similarityTokens(row.nama, a.nama);
        const scoreB = similarityTokens(row.nama, b.nama);
        return scoreB - scoreA || (stockByCode.get(b.kode) || 0) - (stockByCode.get(a.kode) || 0);
      });
    const alternative = candidates[0];
    if (!alternative) return { ...row, stock: currentStock, fallback: null, shortage: true };
    const available = stockByCode.get(alternative.kode) || 0;
    return { ...row, originalKode: row.kode, originalNama: row.nama, kode: alternative.kode, nama: alternative.nama, satuan: alternative.satuan, item: alternative, stock: available, fallback: `Stok ${row.nama} kosong; dialihkan ke ${alternative.nama} (${alternative.kode}) dalam entitas ${entity}.` };
  });
}

function tokenOverlap(a, b) {
  const ta = new Set(a.split(/\s+/).filter((t) => t.length > 2));
  const tb = new Set(b.split(/\s+/).filter((t) => t.length > 2));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.max(ta.size, tb.size);
}

export function summarizeValidation(results) {
  if (!results || !Array.isArray(results)) {
    if (results && typeof results === 'object') {
      const matched = results.matched || [];
      return { matched: matched.length, ambiguous: (results.ambiguous || []).length, unmatched: (results.unmatched || []).length, matchedItems: matched };
    }
    return { matched: 0, ambiguous: 0, unmatched: 0, matchedItems: [] };
  }
  const matchedItems = results.filter((r) => r.status === 'matched');
  return { matched: matchedItems.length, ambiguous: results.filter((r) => r.status === 'ambiguous').length, unmatched: results.filter((r) => r.status === 'unmatched').length, matchedItems };
}

export async function scanBarcodeFromVideo(video) {
  if (!('BarcodeDetector' in window)) return { ok: false, error: 'BarcodeDetector tidak didukung browser ini.' };
  try {
    const detector = new window.BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128'] });
    const barcodes = await detector.detect(video);
    if (barcodes.length === 0) return { ok: false, error: 'Tidak ada barcode terdeteksi. Arahkan kamera ke barcode.' };
    return { ok: true, value: barcodes[0].rawValue };
  } catch (err) {
    return { ok: false, error: err.message || 'Scan gagal' };
  }
}

export { checkAmbiguity, tryMergeTwoColumnPdf };
