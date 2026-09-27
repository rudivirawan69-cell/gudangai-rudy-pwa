/**
 * pdfValidate.js — PDF/image text extraction + master validation
 * V6.8.0: OCR foto uses same validation pipeline as PDF for consistent accuracy
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
    .map((i) => ({ str: i.str, x: i.transform?.[4] ?? 0, y: i.transform?.[5] ?? 0 }))
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
  if (!lib) return { ok: false, error: 'pdfjs tidak tersedia' };
  try {
    const buf = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: buf }).promise;
    let fullText = '';
    const allLines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      if (onProgress) onProgress(`Halaman ${p}/${pdf.numPages}`);
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const lines = itemsToLines(content.items);
      allLines.push(...lines);
      fullText += lines.join('\n') + '\n';
    }
    return { ok: true, text: fullText, lines: allLines, pageCount: pdf.numPages };
  } catch (err) {
    return { ok: false, error: err.message || 'Gagal baca PDF' };
  }
}

/**
 * Enhanced image OCR — pre-process text for better validation accuracy
 * Uses same normalizeOcr pipeline + additional OCR-specific cleaning
 */
export async function extractTextFromImage(file, onProgress) {
  if (onProgress) onProgress('OCR foto...');
  try {
    const Tesseract = (await import('tesseract.js')).default;
    const result = await Tesseract.recognize(file, 'ind+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(`OCR ${Math.round((m.progress || 0) * 100)}%`);
        }
      },
    });
    const rawText = result?.data?.text || '';
    // OCR post-processing: fix common OCR mistakes
    const cleaned = cleanOcrText(rawText);
    const lines = cleaned.split(/\n/).map((l) => l.trim()).filter(Boolean);
    return { ok: true, text: cleaned, lines };
  } catch (err) {
    return { ok: false, error: err.message || 'OCR gagal' };
  }
}

/**
 * Clean OCR text — fix common misreads for Indonesian food/stock items
 */
function cleanOcrText(text) {
  return String(text || '')
    // Fix common OCR character substitutions
    .replace(/[|l](?=\d)/gi, '1')        // |5 or l5 → 15
    .replace(/(?<=\d)[oO]/g, '0')         // 1o → 10
    .replace(/\bAyarn\b/gi, 'Ayam')       // Ayarn → Ayam
    .replace(/\bDag[il]ng\b/gi, 'Daging') // Dagiing/Daging
    .replace(/\bBaks[oO0]\b/gi, 'Bakso')  // Baks0 → Bakso
    .replace(/\bNugge[t7]\b/gi, 'Nugget') // Nugge7 → Nugget
    .replace(/\bS[ao0]s[il]s\b/gi, 'Sosis') // S0sis, Sasis
    .replace(/\bBumb[uU0]\b/gi, 'Bumbu')  // Bumb0
    .replace(/\bSa[oO0]s\b/gi, 'Saos')    // Sa0s
    .replace(/\bSamba[l1]\b/gi, 'Sambal')  // Sambal
    .replace(/\bF[il1]llet\b/gi, 'Fillet') // F1llet
    .replace(/\b[Kk]atsu\b/g, 'Katsu')
    .replace(/\bCh[il1]ken\b/gi, 'Chiken') // Ch1ken → Chiken (matching master data spelling)
    // Fix unit/satuan OCR
    .replace(/\bPa[ck]k\b/gi, 'Pack')
    .replace(/\bpc[s5]\b/gi, 'pcs')
    .replace(/\bGR[A4]M\b/gi, 'GRAM')
    // Fix number-space issues
    .replace(/(\d)\s*[xX×]\s*(\d)/g, '$1 x $2')
    // Remove stray special characters from OCR noise
    .replace(/[~`^{}[\]\\]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ');
}

function stripLeadingNo(name) {
  return String(name || '')
    .replace(/^\d{1,3}[.)\s-]+/, '')
    .replace(/\s*[/\\]\s*cv\.?\s*pd3\s*chicken/gi, '')
    .replace(/\s*[/\\]\s*good\s*eat/gi, '')
    .replace(/[-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parsePdfLinesToItems(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items = [];
  for (const line of lines) {
    if (/^(no\.?|total|grand|sub\s*total|jumlah|halaman|page)/i.test(line)) continue;
    // Skip header-like lines
    if (/^(nama\s*barang|kode|satuan|qty|quantity|unit)/i.test(line)) continue;
    const nums = [...line.matchAll(/(\d+(?:[.,]\d+)?)/g)];
    if (!nums.length) continue;
    // Take the last number as qty (could have commas for decimals)
    let qtyStr = nums[nums.length - 1][1].replace(',', '.');
    const qty = parseFloat(qtyStr);
    if (!(qty > 0) || qty > 99999) continue;
    let rawName = line.slice(0, nums[nums.length - 1].index).trim();
    rawName = stripLeadingNo(rawName)
      .replace(/\b(pack|pcs|pail|ekor|kg|box|unit|porsi|gram|liter)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (rawName.length < 2) continue;
    items.push({ rawName, qty });
  }
  return items;
}

export function validatePdfItems(entity, textOrItems, masterOverride) {
  const master = masterOverride || getMasterByEntity(entity) || [];
  const items = Array.isArray(textOrItems) ? textOrItems : parsePdfLinesToItems(textOrItems);
  const results = [];
  const seenKodes = new Set(); // prevent duplicate matches
  for (const it of items) {
    const rawNameOriginal = it.rawName || it.nama || it.name || '';
    const qty = Number(it.qty) || 0;
    if (!rawNameOriginal || qty <= 0) continue;
    const deterministic = resolvePdfNameDeterministic(entity, rawNameOriginal, master);
    let match = null;
    let status = 'matched';
    let note = '';
    if (deterministic) {
      match = deterministic.item || deterministic;
      note = deterministic.matchType || 'deterministic';
    }
    if (!match) {
      const aliasResult = matchByAlias(entity, stripLeadingNo(rawNameOriginal));
      if (aliasResult) {
        match = aliasResult;
        note = aliasResult.matchType || 'alias';
      }
    }
    if (!match) {
      status = 'unmatched';
      note = 'tidak cocok master';
    }
    const masterItem = match?.kode ? match : (match?.item || null);
    const kode = masterItem?.kode || match?.kode || null;

    // Deduplicate: if same kode already matched, merge qty
    if (kode && seenKodes.has(kode)) {
      const existing = results.find((r) => r.kode === kode && r.status === 'matched');
      if (existing) {
        existing.qty = +(existing.qty + qty).toFixed(2);
        continue;
      }
    }
    if (kode) seenKodes.add(kode);

    results.push({
      rawName: rawNameOriginal,
      qty,
      status,
      note,
      kode,
      nama: masterItem?.nama || match?.nama || null,
      satuan: masterItem?.satuan || match?.satuan || null,
      match: masterItem || match,
    });
  }
  return results;
}

export function parseLinesFromText(text, _lines = []) {
  return parsePdfLinesToItems(text).map((it) => ({
    name: it.rawName,
    rawName: it.rawName,
    qty: it.qty,
    nameFromPdf: it.rawName,
  }));
}

export function validateItems(rows, entity) {
  const results = validatePdfItems(entity, rows);
  const matched = [], ambiguous = [], unmatched = [];
  for (const r of results) {
    const base = { ...r, name: r.nama || r.rawName, nameFromPdf: r.rawName, qty: r.qty };
    if (r.status === 'matched') matched.push(base);
    else if (r.status === 'ambiguous') ambiguous.push(base);
    else unmatched.push(base);
  }
  return { matched, ambiguous, unmatched };
}

export function applyStockAwareFallback(matched) {
  return Array.isArray(matched) ? matched : [];
}

export function detectEntityFromText(text) {
  const t = String(text || '').toLowerCase();
  if (/\bpt\.?\s*rasyuka|\brasyuka\b/.test(t)) return 'PT';
  if (/\bcv\.?\s*selera|\bselera\b/.test(t)) return 'CV';
  // Count mentions
  const ptCount = (t.match(/\bpt[-.\s]/g) || []).length;
  const cvCount = (t.match(/\bcv[-.\s]/g) || []).length;
  if (ptCount > cvCount && ptCount >= 2) return 'PT';
  if (cvCount > ptCount && cvCount >= 2) return 'CV';
  return null;
}

export async function scanBarcodeFromVideo(video) {
  if (!('BarcodeDetector' in window)) {
    return { ok: false, error: 'BarcodeDetector tidak didukung. Gunakan Chrome Android.' };
  }
  if (!video || video.readyState < 2) return { ok: false, error: 'Kamera belum siap' };
  try {
    const detector = new window.BarcodeDetector({
      formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'],
    });
    const barcodes = await detector.detect(video);
    if (!barcodes?.length) return { ok: false, error: 'Tidak ada barcode terdeteksi.' };
    const value = barcodes[0].rawValue == null ? '' : String(barcodes[0].rawValue);
    if (!value) return { ok: false, error: 'Barcode kosong' };
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err?.message || 'Scan gagal' };
  }
}
