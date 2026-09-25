/**
 * pdfValidate.js — PDF/image text extraction + master validation
 * Tuned for REKAP ORDER warehouse PDFs (CV. SELERA BOGATAMA / PT. RASYUKA)
 * + 2-column merge + ambiguity rules (YAKINIKU/LOWFAT only for unresolved)
 * Acuan ketat validasi PDF (12 Sep 2026): strip NO urut, size, outlet noise
 * V6.5.4: deterministic resolver BEFORE alias matching; parenthesis context preserved
 */
import { matchByAlias, getMasterByEntity } from './master';
import { resolvePdfNameDeterministic, normalizeOcr } from './pdfDeterministicRules';

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
  return null;
}

export async function extractTextFromPdf(file, onProgress) {
  if (onProgress) onProgress('Membaca PDF...');
  const lib = await loadPdfjs();
  if (!lib) return { ok: false, error: 'pdfjs tidak tersedia' };
  try {
    const buf = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: buf }).promise;
    const allLines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      if (onProgress) onProgress(`Halaman ${p}/${pdf.numPages}...`);
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      allLines.push(...itemsToLines(content.items));
    }
    let text = allLines.join('\n');
    const merged = tryMergeTwoColumnPdf(text);
    if (merged) text = merged;
    return { ok: true, text, pageCount: pdf.numPages };
  } catch (err) {
    return { ok: false, error: err.message || 'Gagal baca PDF' };
  }
}

export async function extractTextFromImage(file, onProgress) {
  if (onProgress) onProgress('OCR gambar...');
  try {
    const Tesseract = (await import('tesseract.js')).default;
    const result = await Tesseract.recognize(file, 'ind+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(`OCR ${Math.round((m.progress || 0) * 100)}%`);
        }
      },
    });
    return { ok: true, text: result.data?.text || '' };
  } catch (err) {
    return { ok: false, error: err.message || 'OCR gagal' };
  }
}

function stripLeadingNoAndNormalize(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^\d{1,4}\s+/, '');
  s = s.replace(/\s*\(\s*\d+\s*gram\s*\)/gi, '');
  s = s.replace(/\s*\(\s*\d+\s*g\s*\)/gi, '');
  s = s.replace(/\b(size|ukuran)\s*[:=]?\s*\d+\s*(gram|g|kg|ml)?/gi, '');
  s = s.replace(/\b(outlet|cabang|store)\s*[:=].*$/i, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function parsePdfLinesToItems(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items = [];
  for (const line of lines) {
    if (/^(no\.?|total|grand|sub\s*total|kode\s*trans|icon\s*mall)/i.test(line)) continue;
    const m = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*$/);
    if (m) {
      items.push({ rawName: m[1].trim(), qty: parseFloat(m[2]) });
    } else {
      const nums = [...line.matchAll(/(\d+(?:\.\d+)?)/g)];
      if (nums.length) {
        const qty = parseFloat(nums[nums.length - 1][1]);
        const namePart = line.slice(0, nums[nums.length - 1].index).trim();
        if (namePart.length >= 3) items.push({ rawName: namePart, qty });
      }
    }
  }
  return items;
}

export function validatePdfItems(entity, textOrItems, masterOverride) {
  const master = masterOverride || getMasterByEntity(entity) || [];
  const items = Array.isArray(textOrItems)
    ? textOrItems
    : parsePdfLinesToItems(textOrItems);
  const results = [];
  for (const it of items) {
    const rawNameOriginal = it.rawName || it.nama || it.name || '';
    const qty = Number(it.qty) || 0;
    if (!rawNameOriginal || qty <= 0) continue;

    const deterministic = resolvePdfNameDeterministic(entity, rawNameOriginal, master);
    let match = deterministic;
    let status = 'matched';
    let note = deterministic ? 'deterministic' : '';

    if (!match) {
      const normalizedForFallback = stripLeadingNoAndNormalize(rawNameOriginal);
      match = matchByAlias(entity, normalizedForFallback);
      if (match) note = 'alias';
    }

    if (!match) {
      const amb = checkAmbiguity(rawNameOriginal);
      if (amb) {
        status = 'ambiguous';
        note = amb;
      } else {
        status = 'unmatched';
        note = 'tidak cocok master';
      }
    }

    results.push({
      rawName: rawNameOriginal,
      qty,
      status,
      note,
      kode: match?.kode || null,
      nama: match?.nama || null,
      satuan: match?.satuan || null,
      match,
    });
  }
  return results;
}

export async function processPdfFile(file, entity, onProgress) {
  const extracted = await extractTextFromPdf(file, onProgress);
  if (!extracted.ok) return { ok: false, error: extracted.error };
  if (onProgress) onProgress('Validasi master...');
  const results = validatePdfItems(entity, extracted.text);
  const matched = results.filter((r) => r.status === 'matched');
  const unmatched = results.filter((r) => r.status === 'unmatched');
  const ambiguous = results.filter((r) => r.status === 'ambiguous');
  return {
    ok: true,
    text: extracted.text,
    results,
    matched,
    unmatched,
    ambiguous,
    pageCount: extracted.pageCount,
  };
}

function tokenSet(s) {
  return new Set(
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u024F\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1)
  );
}

export function nameSimilarity(a, b) {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
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

export { checkAmbiguity, tryMergeTwoColumnPdf, stripLeadingNoAndNormalize };

/* Compatibility layer for InputPage */
export function parseLinesFromText(text, _lines = []) {
  const items = parsePdfLinesToItems(text);
  return items.map((it) => ({
    name: it.rawName,
    rawName: it.rawName,
    qty: it.qty,
    nameFromPdf: it.rawName,
  }));
}

export function validateItems(rows, entity) {
  const results = validatePdfItems(entity, rows);
  const matched = [];
  const ambiguous = [];
  const unmatched = [];
  for (const r of results) {
    const base = {
      ...r,
      name: r.nama || r.rawName,
      nameFromPdf: r.rawName,
      qty: r.qty,
      kode: r.kode,
      nama: r.nama,
      satuan: r.satuan,
    };
    if (r.status === 'matched') matched.push(base);
    else if (r.status === 'ambiguous') ambiguous.push({ ...base, candidates: r.candidates || [] });
    else unmatched.push(base);
  }
  return { matched, ambiguous, unmatched };
}

export function applyStockAwareFallback(matched, entity, stock) {
  if (!Array.isArray(matched)) return [];
  if (!stock) return matched;
  const list = entity === 'PT' ? (stock.pt || stock.PT || []) : (stock.cv || stock.CV || []);
  if (!list.length) return matched;
  const byKode = new Map(list.map((s) => [s.kode, s]));
  return matched.map((m) => {
    const s = m.kode ? byKode.get(m.kode) : null;
    if (!s) return m;
    return {
      ...m,
      stok: s.qty ?? s.stok ?? s.sisa,
      satuan: m.satuan || s.satuan,
      nama: m.nama || s.nama,
    };
  });
}

export function detectEntityFromText(text) {
  const t = String(text || '').toLowerCase();
  if (/\bpt\.?\s*rasyuka|\bpt\b.*rasyuka|entitas\s*pt\b/.test(t)) return 'PT';
  if (/\bcv\.?\s*selera|\bcv\b.*bogatama|entitas\s*cv\b/.test(t)) return 'CV';
  if (/\bpt\b/.test(t) && !/\bcv\b/.test(t)) return 'PT';
  if (/\bcv\b/.test(t) && !/\bpt\b/.test(t)) return 'CV';
  return null;
}
