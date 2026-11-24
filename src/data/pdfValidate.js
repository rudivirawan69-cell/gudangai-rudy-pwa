/**
 * pdfValidate.js — PDF/image text extraction + master validation
 * V6.8.0: OCR foto uses same validation pipeline as PDF for consistent accuracy
 */
import { matchByAlias, getMasterByEntity } from './master';
import { resolvePdfNameDeterministic } from './pdfDeterministicRules';

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

export function shouldOcrPdfPage(metrics) {
  const m = metrics && typeof metrics === 'object' ? metrics : {};
  const lineCount = Math.max(0, Number(m.lineCount) || 0);
  const candidateCount = Math.max(0, Number(m.candidateCount) || 0);
  const numericLineCount = Math.max(0, Number(m.numericLineCount) || 0);
  const hasNumericText = Boolean(m.hasNumericText);

  // OCR a page with no useful text layer, or where numeric/product-like rows
  // significantly outnumber rows the deterministic table parser can recover.
  // A page with only a few genuine order lines is not flagged solely for being short.
  if (lineCount < 3 || !hasNumericText || candidateCount === 0) return true;
  return numericLineCount >= 8 && (candidateCount / numericLineCount) < 0.35;
}

export async function extractTextFromPdf(file, onProgress) {
  if (onProgress) onProgress('Membaca PDF...');
  const lib = await loadPdfjs();
  if (!lib) return { ok: false, error: 'pdfjs tidak tersedia' };
  try {
    const buf = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: buf }).promise;
    const pageRecords = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      if (onProgress) onProgress('Halaman ' + p + '/' + pdf.numPages);
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const lines = itemsToLines(content.items);
      const text = lines.join('\n').trim();
      pageRecords.push({
        pageNo: p,
        text,
        lines,
        lineCount: lines.length,
        candidateCount: parsePdfLinesToItems(text).length,
        numericLineCount: lines.filter((line) => /\d/.test(line) && /[A-Za-zÀ-ÿ]/.test(line)).length,
        hasNumericText: /\d/.test(text),
      });
    }

    const textCandidateCount = pageRecords.reduce((sum, page) => sum + page.candidateCount, 0);
    const fullText = pageRecords.map((page) => page.text).filter(Boolean).join('\n');
    const allLines = pageRecords.flatMap((page) => page.lines);
    const suspiciousDocument =
      allLines.length < 3 || !/\d/.test(fullText) || textCandidateCount < 15;
    // A document that looks healthy in aggregate can still have a partially
    // extracted page. OCR all pages for a clearly weak document, or just weak
    // pages when another page already supplies enough rows.
    const pagesToOcr = suspiciousDocument
      ? pageRecords.map((page) => page.pageNo)
      : pageRecords
          .filter((page) => shouldOcrPdfPage(page))
          .map((page) => page.pageNo);

    if (pagesToOcr.length) {
      const ocr = await extractPdfPagesWithOcr(pdf, onProgress, pagesToOcr);
      if (Array.isArray(ocr.pages) && ocr.pages.length) {
        const ocrByPage = new Map(ocr.pages.map((page) => [page.pageNo, page]));
        let usedOcr = false;
        const selected = pageRecords.map((page) => {
          const ocrPage = ocrByPage.get(page.pageNo);
          if (!ocrPage || !String(ocrPage.text || '').trim()) return page;
          const originalCount = parsePdfLinesToItems(page.text).length;
          const ocrCount = parsePdfLinesToItems(ocrPage.text).length;
          // Keep the text layer unless OCR demonstrably recovers more product rows.
          if (ocrCount > originalCount) {
            usedOcr = true;
            return { ...page, text: ocrPage.text, lines: ocrPage.lines };
          }
          return page;
        });
        if (usedOcr) {
          return {
            ok: true,
            text: selected.map((page) => page.text).filter(Boolean).join('\n'),
            lines: selected.flatMap((page) => page.lines),
            pageCount: pdf.numPages,
            method: 'ocr',
          };
        }
      }
    }

    return { ok: true, text: fullText, lines: allLines, pageCount: pdf.numPages, method: 'text' };
  } catch (err) {
    return { ok: false, error: err.message || 'Gagal baca PDF' };
  }
}

async function extractPdfPagesWithOcr(pdf, onProgress, pageNumbers) {
  let Tesseract;
  try {
    Tesseract = (await import('tesseract.js')).default;
  } catch {
    return { text: '', lines: [], pages: [] };
  }
  const requested = Array.isArray(pageNumbers) && pageNumbers.length
    ? [...new Set(pageNumbers.map(Number).filter((n) => n >= 1 && n <= pdf.numPages))]
    : Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  const pages = [];

  for (const pageNo of requested) {
    try {
      if (onProgress) onProgress('OCR PDF halaman ' + pageNo + '/' + pdf.numPages + '...');
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(Math.ceil(viewport.width), 2400);
      canvas.height = Math.min(Math.ceil(viewport.height), 3400);
      const scaleX = canvas.width / viewport.width;
      const scaleY = canvas.height / viewport.height;
      await page.render({
        canvasContext: canvas.getContext('2d', { willReadFrequently: true }),
        viewport: viewport.clone({ scale: 2 * Math.min(scaleX, scaleY) }),
      }).promise;
      const ocrPromise = Tesseract.recognize(canvas, 'ind+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text' && onProgress) {
            onProgress('OCR PDF ' + pageNo + '/' + pdf.numPages + ' ' + Math.round((m.progress || 0) * 100) + '%');
          }
        },
      });
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OCR halaman timeout')), 25000)
      );
      const result = await Promise.race([ocrPromise, timeout]);
      const text = cleanOcrText(result?.data?.text || '');
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      pages.push({ pageNo, text, lines });
    } catch (err) {
      // One page's OCR failure must not prevent recovery on other pages.
      if (onProgress) onProgress('OCR halaman ' + pageNo + ' gagal; mempertahankan hasil teks yang tersedia.');
    }
  }

  return {
    text: pages.map((page) => page.text).filter(Boolean).join('\n'),
    lines: pages.flatMap((page) => page.lines),
    pages,
  };
}

/**
 * Enhanced image OCR — pre-process text for better validation accuracy
 * Uses same normalizeOcr pipeline + additional OCR-specific cleaning
 */
/** Reject OCR lines that are clearly scan noise, not product rows. */
export function isLowQualityOcrLine(value) {
  const line = String(value || '').replace(/\s+/g, ' ').trim();
  if (line.length < 3) return true;
  if (/^[\d\s.,:;|/\\_+=*-]+$/.test(line)) return true;
  const letters = (line.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  const symbols = (line.match(/[^\p{L}\p{N}\s.,()/-]/gu) || []).length;
  if (letters < 2) return true;
  if (symbols > Math.max(4, letters * 0.7)) return true;
  if (/^(?:page|halaman|invoice|faktur|tanggal|periode|total|subtotal|grand total|nama barang|qty|quantity|satuan)\b/i.test(line)) return true;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(line)) return true;
  return false;
}

function normalizeTotalHeader(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/1/g, 'l');
}

function groupOcrWordsIntoRows(words) {
  const valid = (Array.isArray(words) ? words : [])
    .filter((word) => String(word?.text || '').trim() && word?.bbox)
    .map((word) => ({
      text: String(word.text).trim(),
      x0: Number(word.bbox.x0) || 0,
      x1: Number(word.bbox.x1) || 0,
      y0: Number(word.bbox.y0) || 0,
      y1: Number(word.bbox.y1) || 0,
      confidence: Number(word.confidence),
      block: word.block_num,
      paragraph: word.par_num,
      line: word.line_num,
    }))
    .sort((a, b) => ((a.y0 + a.y1) / 2) - ((b.y0 + b.y1) / 2) || a.x0 - b.x0);

  const grouped = new Map();
  for (const word of valid) {
    const hasLineIdentity = word.block != null && word.paragraph != null && word.line != null;
    const key = hasLineIdentity
      ? [word.block, word.paragraph, word.line].join(':')
      : null;
    if (key) {
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(word);
      continue;
    }
    let row = [...grouped.values()].find((candidate) => {
      const center = candidate.reduce((sum, item) => sum + ((item.y0 + item.y1) / 2), 0) / candidate.length;
      return Math.abs(center - ((word.y0 + word.y1) / 2)) <= 10;
    });
    if (!row) {
      row = [];
      grouped.set('y:' + grouped.size, row);
    }
    row.push(word);
  }
  return [...grouped.values()]
    .map((row) => row.sort((a, b) => a.x0 - b.x0))
    .sort((a, b) => {
      const ay = a.reduce((sum, item) => sum + ((item.y0 + item.y1) / 2), 0) / a.length;
      const by = b.reduce((sum, item) => sum + ((item.y0 + item.y1) / 2), 0) / b.length;
      return ay - by;
    });
}

function parseWholeOrderQuantity(token) {
  let value = String(token || '').replace(/\s/g, '').replace(/[Oo]/g, '0');
  if (!/^\d[\d.,]*$/.test(value)) return null;
  if (value.includes('.') && value.includes(',')) {
    const decimalSeparator = value.lastIndexOf('.') > value.lastIndexOf(',') ? '.' : ',';
    const integerPart = value.slice(0, value.lastIndexOf(decimalSeparator)).replace(/[.,]/g, '');
    const decimalPart = value.slice(value.lastIndexOf(decimalSeparator) + 1);
    if (!integerPart || !/^\d+$/.test(integerPart) || !/^\d+$/.test(decimalPart)) return null;
    if (/[1-9]/.test(decimalPart)) return { value: null, reason: 'Jumlah TOTAL memiliki pecahan; perlu pemeriksaan manual.' };
    value = integerPart;
  } else {
    const separator = value.includes('.') ? '.' : value.includes(',') ? ',' : '';
    if (separator) {
      const parts = value.split(separator);
      if (parts.length !== 2 || !parts[0] || !/^\d+$/.test(parts[1])) return null;
      if (parts[1].length === 3 && parts[0].length <= 3) {
        value = parts.join('');
      } else {
        if (/[1-9]/.test(parts[1])) return { value: null, reason: 'Jumlah TOTAL memiliki pecahan; perlu pemeriksaan manual.' };
        value = parts[0];
      }
    }
  }
  const qty = Number(value);
  return Number.isSafeInteger(qty) && qty > 0 && qty <= 999999
    ? { value: qty, reason: '' }
    : null;
}

function cleanRekapProductName(value) {
  return stripLeadingNo(String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s*\/.*$/g, ' ')
    .replace(/\s+\d+(?:[.,]\d+)?\s*(?:pcs?|pack|pail|kg|gram|gr|liter|ml)\b.*$/i, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:;|.-]+|[\s:;|.-]+$/g, '')
    .trim());
}

/**
 * Read only the extreme-right TOTAL column from OCR word geometry.
 * Outlet/branch quantities between the product name and TOTAL are never used.
 */
export function parseOrderSummaryFromOcr(ocrData) {
  const words = Array.isArray(ocrData?.words) ? ocrData.words : [];
  if (!words.length) {
    return { ok: false, error: 'Koordinat teks OCR tidak tersedia. Ambil foto rekap dengan posisi tabel terlihat utuh.', items: [], issues: [] };
  }
  const rows = groupOcrWordsIntoRows(words);
  const headerCandidates = [];
  rows.forEach((row, rowIndex) => row.forEach((word) => {
    if (normalizeTotalHeader(word.text) === 'totall' || normalizeTotalHeader(word.text) === 'total') {
      headerCandidates.push({ word, rowIndex });
    }
  }));
  if (!headerCandidates.length) {
    return { ok: false, error: 'Judul kolom TOTAL tidak ditemukan. Sistem tidak akan menebak dari kolom outlet.', items: [], issues: [] };
  }
  // If the form repeats TOTAL labels, use the one furthest to the right.
  const totalHeader = headerCandidates.sort((a, b) => b.word.x1 - a.word.x1)[0];
  const headerRow = rows[totalHeader.rowIndex];
  const headerY = headerRow.reduce((sum, word) => sum + ((word.y0 + word.y1) / 2), 0) / headerRow.length;
  const totalCenter = (totalHeader.word.x0 + totalHeader.word.x1) / 2;

  const bodyRows = rows.filter((row, index) => {
    if (index <= totalHeader.rowIndex) return false;
    const centerY = row.reduce((sum, word) => sum + ((word.y0 + word.y1) / 2), 0) / row.length;
    return centerY > headerY + 2;
  });
  const nameHeaderWords = headerRow.filter((word) => /^(?:nama|barang|item|produk)$/i.test(word.text.replace(/[^a-z]/gi, '')));
  const nameHeaderRight = nameHeaderWords.length
    ? Math.max(...nameHeaderWords.map((word) => word.x1))
    : null;
  const numericWords = bodyRows.flatMap((row) => row.filter((word) =>
    /^\d[\d.,]*$/.test(word.text) &&
    (nameHeaderRight == null || ((word.x0 + word.x1) / 2) > nameHeaderRight + 18)
  ));
  const numericColumns = [];
  for (const word of numericWords) {
    const center = (word.x0 + word.x1) / 2;
    if (Math.abs(center - totalCenter) < 70) continue;
    let cluster = numericColumns.find((item) => Math.abs(item.x - center) < 42);
    if (!cluster) {
      cluster = { x: center, rows: new Set() };
      numericColumns.push(cluster);
    }
    cluster.rows.add(word.y0 + ':' + word.y1);
    cluster.x = ((cluster.x * (cluster.rows.size - 1)) + center) / cluster.rows.size;
  }
  const repeatedColumns = numericColumns
    .filter((column) => column.rows.size >= Math.min(2, bodyRows.length))
    .sort((a, b) => a.x - b.x);
  const onePageFirstNumeric = numericWords
    .map((word) => (word.x0 + word.x1) / 2)
    .filter((x) => x < totalCenter - 70)
    .sort((a, b) => a - b)[0];
  const firstQtyColumnX = repeatedColumns[0]?.x
    ?? (nameHeaderRight != null ? (onePageFirstNumeric ?? (totalHeader.word.x0 - 20)) : null);
  if (!Number.isFinite(firstQtyColumnX)) {
    return {
      ok: false,
      error: 'Kolom nama barang atau batas kolom angka tidak cukup jelas. Foto ditahan agar angka outlet tidak salah dibaca.',
      items: [],
      issues: [],
    };
  }
  const nameBoundary = firstQtyColumnX - 14;

  const items = [];
  const issues = [];
  let sourceSequence = 0;
  for (const row of bodyRows) {
    const rowText = row.map((word) => word.text).join(' ').replace(/\s+/g, ' ').trim();
    if (!rowText || /^(?:total|grand total|subtotal|sub total|jumlah|keterangan|catatan)\b/i.test(rowText)) continue;

    const nameWords = row.filter((word) => word.x0 < nameBoundary);
    const rawName = cleanRekapProductName(nameWords.map((word) => word.text).join(' '));
    if (!rawName || rawName.length < 2) continue;

    const totalCandidates = row
      .filter((word) => /^\d[\d.,]*$/.test(word.text))
      .filter((word) => ((word.x0 + word.x1) / 2) >= totalCenter - 70)
      .sort((a, b) => Math.abs(a.x1 - totalHeader.word.x1) - Math.abs(b.x1 - totalHeader.word.x1));
    const totalWord = totalCandidates[0];
    if (!totalWord) {
      issues.push({ rawName, qty: 0, sourceLine: rowText, reason: 'Angka pada kolom TOTAL tidak terbaca; cek foto asli.', sourceIndex: ++sourceSequence });
      continue;
    }
    const parsedQty = parseWholeOrderQuantity(totalWord.text);
    if (!parsedQty) {
      issues.push({ rawName, qty: 0, sourceLine: rowText, reason: 'Angka TOTAL tidak dapat dibaca dengan aman.', sourceIndex: ++sourceSequence });
      continue;
    }
    if (parsedQty.reason) {
      issues.push({ rawName, qty: 0, sourceLine: rowText, reason: parsedQty.reason, sourceIndex: ++sourceSequence });
      continue;
    }
    const lowConfidence = [totalWord, ...nameWords].some((word) => Number.isFinite(word.confidence) && word.confidence > 0 && word.confidence < 45);
    if (lowConfidence) {
      issues.push({ rawName, qty: parsedQty.value, sourceLine: rowText, reason: 'Sebagian teks memiliki keyakinan OCR rendah; verifikasi manual.', sourceIndex: ++sourceSequence });
      continue;
    }
    sourceSequence += 1;
    items.push({
      no: items.length + 1,
      sourceIndex: sourceSequence,
      rawName,
      qty: parsedQty.value,
      sourceLine: rowText,
      totalRaw: totalWord.text,
    });
  }
  return {
    ok: items.length > 0 || issues.length > 0,
    error: items.length || issues.length ? '' : 'Tidak ada baris barang yang dapat dibaca di bawah kolom TOTAL.',
    items,
    issues,
    totalColumnX: totalCenter,
  };
}

export async function extractTextFromImage(file, onProgress) {
  if (onProgress) onProgress('OCR foto...');
  try {
    const Tesseract = (await import('tesseract.js')).default;
    const source = await preprocessImageForOcr(file);
    const ocrPromise = Tesseract.recognize(source, 'ind+eng', {
      // PSM 6 is more reliable for photographed stock tables than the default page mode.
      config: { tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' },
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(`OCR ${Math.round((m.progress || 0) * 100)}%`);
        }
      },
    });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('OCR foto timeout')), 45000));
    const result = await Promise.race([ocrPromise, timeout]);
    const rawText = result?.data?.text || '';
    // OCR post-processing: normalize text, then drop only obvious scan noise.
    const cleaned = cleanOcrText(rawText);
    const lines = cleaned.split(/\n/).map((l) => l.trim()).filter((l) => l && !isLowQualityOcrLine(l));
    const text = lines.join('\n');
    const orderSummary = parseOrderSummaryFromOcr(result?.data || {});
    return { ok: true, text, lines, method: 'preprocessed-image', orderSummary };
  } catch (err) {
    return { ok: false, error: err.message || 'OCR gagal' };
  }
}

async function preprocessImageForOcr(file) {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;
  const bitmap = await createImageBitmap(file);
  const maxWidth = 2400;
  const scale = Math.min(1.5, maxWidth / Math.max(bitmap.width, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < image.data.length; i += 4) {
    const gray = (image.data[i] * 0.299) + (image.data[i + 1] * 0.587) + (image.data[i + 2] * 0.114);
    const contrast = Math.max(0, Math.min(255, ((gray - 128) * 1.35) + 128));
    image.data[i] = contrast;
    image.data[i + 1] = contrast;
    image.data[i + 2] = contrast;
  }
  ctx.putImageData(image, 0, 0);
  bitmap.close?.();
  return canvas;
}

/**
 * Clean OCR text — fix common misreads for Indonesian food/stock items
 */
function cleanOcrText(text) {
  return String(text || '').split(/\r?\n/).map((line) => line
    // Fix common OCR character substitutions, per row.
    .replace(/[|l](?=\d)/gi, '1')
    .replace(/(?<=\d)[oO]/g, '0')
    .replace(/\bAyarn\b/gi, 'Ayam')
    .replace(/\bA[yv]am\b/gi, 'Ayam')
    .replace(/\bF[il1][il1]e?t\b/gi, 'Fillet')
    .replace(/\bF[i1]l+e?t\b/gi, 'Fillet')
    .replace(/\bD[a4]d[a4]\b/gi, 'Dada')
    .replace(/\bP[a4]h[a4]\b/gi, 'Paha')
    .replace(/\bDag[il]ng\b/gi, 'Daging')
    .replace(/\bBaks[oO0]\b/gi, 'Bakso')
    .replace(/\bNugge[t7]\b/gi, 'Nugget')
    .replace(/\bS[ao0]s[il]s\b/gi, 'Sosis')
    .replace(/\bBumb[uU0]\b/gi, 'Bumbu')
    .replace(/\bSa[oO0]s\b/gi, 'Saos')
    .replace(/\bSamba[l1]\b/gi, 'Sambal')
    .replace(/\bF[il1]llet\b/gi, 'Fillet')
    .replace(/\b[Kk]atsu\b/g, 'Katsu')
    .replace(/\bCh[il1]ken\b/gi, 'Chiken')
    .replace(/\bPa[ck]k\b/gi, 'Pack')
    .replace(/\bpc[s5]\b/gi, 'pcs')
    .replace(/\bGR[A4]M\b/gi, 'GRAM')
    .replace(/(\d)\s*[xX×]\s*(\d)/g, '$1 x $2')
    .replace(/[~`^{}[\]\\]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()).filter(Boolean).join('\n');
}

function stripLeadingNo(name) {
  return String(name || '')
    .replace(/^\s*(?:no\.?\s*)?\d{1,4}[.)\s-]+/i, '')
    .replace(/\s*[/\\|]\s*(?:cv|pt)\.?\s*(?:pd3\s*chicken|rasyuka|selera|supplier|vendor)?[^\d]*$/gi, '')
    .replace(/\s*\b(?:cv|pt)\.?\s*(?:pd3\s*chicken|rasyuka|selera|supplier|vendor)\b/gi, '')
    .replace(/\b(?:supplier|vendor)\s*[:=-]?\s*[^,;|]+$/gi, '')
    .replace(/\b(?:cv|pt)\.?\s*pd3\s*chicken\b/gi, '')
    .replace(/\b(?:good\s*eat)\b/gi, '')
    .replace(/[-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove supplier/metadata noise while preserving product identity. */
function sanitizePdfProductName(name) {
  return stripLeadingNo(String(name || '')
    .replace(/\s*\([^)]*\b(?:supplier|vendor|cv\.?|pt\.?)\b[^)]*\)/gi, ' ')
    .replace(/\s*[/|]\s*(?:cv|pt)\.?\s*[^|/]+$/gi, ' ')
    .replace(/\s+supplier\b.*$/gi, ' ')
    .replace(/\s+vendor\b.*$/gi, ' ')
    .replace(/\s+/g, ' '));
}

function isPdfNonItemLine(line) {
  const s = String(line || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return true;
  if (/\bperiode\b|\bperiod\b|\btanggal\b|\btgl\b|\bdate\b/.test(s)) return true;
  if (/^\d{1,2}[\\/.-]\d{1,2}[\\/.-]\d{2,4}$/.test(s)) return true;
  if (/\d{1,2}[\\/.-]\d{1,2}[\\/.-]\d{2,4}.*(?:s\s*[/.-]?\s*d|sd|sampai|to|-).*\d{1,2}[\\/.-]\d{1,2}[\\/.-]\d{2,4}/.test(s)) return true;
  if (/^(?:jan(?:uari)?|feb(?:ruari)?|mar(?:et)?|apr(?:il)?|mei|may|jun(?:i)?|jul(?:i)?|agu(?:stus)?|sep(?:tember)?|okt(?:ober)?|nov(?:ember)?|des(?:ember)?)\s*[-/]?\s*\d{4}$/.test(s)) return true;
  return false;
}

export function parsePdfLinesToItems(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items = [];
  let sourceIndex = 0;

  function parseProductSegment(segment) {
    // Supplier names can appear after the product name (for example,
    // "Ayam Fillet Dada / PT. Citra Guna 12"). Extract the trailing quantity
    // from the original segment first; stripping supplier metadata beforehand
    // would also remove the quantity and silently drop the PDF row.
    const sourceSegment = String(segment || '').trim();
    const nums = [...sourceSegment.matchAll(/(\d+(?:[.,]\d+)?)/g)];
    if (!nums.length) return null;
    const last = nums[nums.length - 1];
    const qty = parseFloat(last[1].replace(',', '.'));
    if (!(qty > 0) || qty > 99999) return null;

    let rawName = sourceSegment.slice(0, last.index).trim();
    rawName = sanitizePdfProductName(rawName)
      .replace(/\s+(?:\d+(?:[.,]\d+)?\s+){1,3}\d+(?:[.,]\d+)?\s*$/, '')
      .replace(/\s*\([^)]*\b(?:\d+(?:[.,]\d+)?\s*(?:kg|gram|gr|pcs|pack|pail|liter|ml)|\d+\s*(?:pcs|pack|pail))[^)]*\)/gi, '')
      .replace(/\s+\d+(?:[.,]\d+)?\s*(?:kg|gram|gr|pcs|pack|pail|liter|ml)\b/gi, '')
      .replace(/\b(?:pack|pcs|pail|ekor|kg|box|unit|porsi|gram|liter|ml)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (rawName.length < 2 || /^\d[\d\s./-]*$/.test(rawName)) return null;
    return { rawName, qty };
  }

  for (const line of lines) {
    if (isPdfNonItemLine(line)) continue;
    if (/^(no\.?|total|grand|sub\s*total|jumlah|halaman|page|tanggal|alamat|telepon|telp|invoice|nota)\b/i.test(line)) continue;
    if (/^(nama\s*barang|barang|kode|satuan|unit|qty|quantity|harga|jumlah\s*harga)\b/i.test(line)) continue;
    if (/^(frozen\s*&\s*kering|rekap\s*order|keterangan|pt\.|cv\.)/i.test(line)) continue;

    const withoutTrailingDate = line
      .replace(/\s+\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\s*$/, '')
      .replace(/\s+\d{1,2}[- ](?:jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des)[a-z]*[- ]\d{4}\s*$/i, '')
      .replace(/\s+\d{4}-\d{2}-\d{2}\s*$/, '')
      .trim();
    if (!withoutTrailingDate) continue;

    // Split combined PDF/paste rows only when each product has its own trailing quantity.
    // "Ayam Penyet 2 Dada + 2 Paha" remains intact because '+' is followed by a digit.
    const plusParts = withoutTrailingDate.split(/\s+\+\s+(?=[A-Za-z])/);
    if (plusParts.length > 1) {
      const parsedParts = plusParts.map(parseProductSegment);
      if (parsedParts.every(Boolean)) {
        for (const part of parsedParts) {
          sourceIndex += 1;
          items.push({
            rawName: part.rawName,
            qty: part.qty,
            sourceIndex,
            pdfNo: (line.match(/^\s*(\d{1,4})\b/) || [])[1] || null,
            sourceLine: line,
          });
        }
        continue;
      }
    }

    const parsed = parseProductSegment(withoutTrailingDate);
    if (!parsed) continue;
    sourceIndex += 1;
    items.push({
      rawName: parsed.rawName,
      qty: parsed.qty,
      sourceIndex,
      pdfNo: (line.match(/^\s*(\d{1,4})\b/) || [])[1] || null,
      sourceLine: line,
    });
  }
  return items;
}
function normalizeMatchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/\bfaem\b|\bfaarn\b|\bfarn\b|\bfaam\b/g, 'farm')
    .replace(/\bgolden\s+fae?m\b/g, 'golden farm')
    .replace(/\bchicken\b/g, 'chiken')
    .replace(/\bsambel\b/g, 'sambal')
    .replace(/\bspesial\b/g, 'special')
    .replace(/\bkerongkongan\b/g, 'krongkongan')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const aa = String(a || ''), bb = String(b || '');
  if (!aa) return bb.length;
  if (!bb) return aa.length;
  let prev = Array.from({ length: bb.length + 1 }, (_, i) => i);
  for (let i = 0; i < aa.length; i++) {
    const cur = [i + 1];
    for (let j = 0; j < bb.length; j++) {
      const cost = aa[i] === bb[j] ? 0 : 1;
      cur[j + 1] = Math.min(cur[j] + 1, prev[j + 1] + 1, prev[j] + cost);
    }
    prev = cur;
  }
  return prev[bb.length];
}

function fuzzyScore(a, b) {
  const x = normalizeMatchText(a);
  const y = normalizeMatchText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) {
    const ratio = Math.min(x.length, y.length) / Math.max(x.length, y.length);
    return 0.82 + (0.18 * ratio);
  }
  const dist = levenshtein(x, y);
  const charScore = 1 - (dist / Math.max(x.length, y.length));
  const xt = new Set(x.split(' ').filter(Boolean));
  const yt = new Set(y.split(' ').filter(Boolean));
  const overlap = [...xt].filter(t => yt.has(t)).length / Math.max(xt.size, yt.size, 1);
  return (charScore * 0.55) + (overlap * 0.45);
}

function findFuzzyMasterMatch(entity, rawName, master) {
  const list = Array.isArray(master) ? master : [];
  const n = normalizeMatchText(rawName);
  if (!n || !list.length) return null;

  const scored = list
    .map(item => ({ item, score: fuzzyScore(n, item?.nama || '') }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  const threshold = n.length <= 8 ? 0.93 : n.length <= 13 ? 0.86 : 0.72;
  const margin = n.length <= 13 ? 0.08 : 0.045;
  if (!best || best.score < threshold) return null;
  if (second && (best.score - second.score) < margin) return null;
  return { item: best.item, matchType: 'fuzzy-ocr', score: best.score };
}

export function filterPdfMasterForEntity(entity, masterList) {
  const ent = String(entity || '').trim().toUpperCase() === 'CV' ? 'CV' : 'PT';
  const source = Array.isArray(masterList) ? masterList : [];
  return source.filter((item) => {
    const kode = String(item?.kode || item?.kodeBarang || '').trim().toUpperCase();
    if (ent === 'CV') return /^(?:CV|BBCV)-\d{3,4}$/.test(kode);
    return /^(?:PT|WK|MM|BBPT)-\d{3,4}$/.test(kode);
  });
}

export function validatePdfItems(entity, textOrItems, masterOverride) {
  const selectedEntity = String(entity || '').trim().toUpperCase() === 'CV' ? 'CV' : 'PT';
  const sourceMaster = Array.isArray(masterOverride) ? masterOverride : (getMasterByEntity(selectedEntity) || []);
  const master = filterPdfMasterForEntity(selectedEntity, sourceMaster);
  const allowedCodes = new Set(master.map((item) => String(item?.kode || item?.kodeBarang || '').trim().toUpperCase()));
  const items = Array.isArray(textOrItems) ? textOrItems : parsePdfLinesToItems(textOrItems);
  const results = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const rawNameOriginal = sanitizePdfProductName(it.rawName || it.nama || it.name || '');
    const qty = Number(it.qty) || 0;
    if (!rawNameOriginal || qty <= 0) continue;

    let match = null;
    let status = 'matched';
    let note = '';
    // CV master includes CV + BBCV; PT master includes PT + WK + MM + BBPT.
    // Only exact/alias/deterministic/fuzzy candidates present in that entity's
    // authoritative master may be emitted. No cross-entity or invented codes.
    const deterministic = resolvePdfNameDeterministic(selectedEntity, rawNameOriginal, master);
    if (deterministic) {
      match = deterministic.item || deterministic;
      note = deterministic.matchType || 'deterministic';
    }
    if (!match) {
      const aliasResult = matchByAlias(selectedEntity, sanitizePdfProductName(rawNameOriginal));
      if (aliasResult) {
        const aliasItem = aliasResult.item || aliasResult;
        const aliasKode = String(aliasItem?.kode || aliasItem?.kodeBarang || '').trim().toUpperCase();
        if (aliasKode && allowedCodes.has(aliasKode)) {
          match = aliasResult;
          note = aliasResult.matchType || 'alias';
        }
      }
    }
    if (!match) {
      const fuzzy = findFuzzyMasterMatch(selectedEntity, rawNameOriginal, master);
      if (fuzzy) {
        match = fuzzy;
        note = fuzzy.matchType;
      }
    }

    if (!match && status === 'matched') {
      status = 'unmatched';
      note = 'tidak cocok master';
    }

    // Entity-scoped master filtering above is the final code allow-list.
    const masterItem = match?.kode ? match : (match?.item || null);
    const kode = masterItem?.kode || match?.kode || null;
    results.push({
      no: i + 1,
      sourceIndex: Number(it.sourceIndex) || (i + 1),
      pdfNo: it.pdfNo || null,
      sourceLine: it.sourceLine || '',
      rawName: rawNameOriginal,
      qty,
      status,
      note,
      kode,
      nama: masterItem?.nama || match?.nama || null,
      satuan: masterItem?.satuan || match?.satuan || null,
      match: masterItem || match || null,
    });
  }
  return results;
}
export function parseLinesFromText(text, _lines = []) {
  return parsePdfLinesToItems(text).map((it, idx) => ({
    no: idx + 1,
    sourceIndex: Number(it.sourceIndex) || (idx + 1),
    pdfNo: it.pdfNo || null,
    name: it.rawName,
    rawName: it.rawName,
    qty: it.qty,
    nameFromPdf: it.rawName,
    sourceLine: it.sourceLine || '',
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

/**
 * Precision guard: live-stock similarity must not override master validation.
 * Ambiguous/unmatched PDF rows stay in the manual-review queue until the operator
 * selects a verified master SKU. Keep legacy call compatibility; extra args are ignored.
 */
export function applyStockAwareFallback(rows) {
  return Array.isArray(rows) ? rows : [];
}

export function detectEntityFromText(text) {
  // PT. Citra Guna / PT. Reza Perkasa are supplier labels, not the PDF entity.
  // Remove these trailing supplier annotations before counting CV/PT markers.
  const t = String(text || '')
    .split(/\r?\n/)
    .map((line) => line
      // Supplier suffixes such as "/ CV. PD3 CHICKEN" are not the document entity.
      .replace(/\s*[/|]\s*(?:cv|pt)\.?\s*(?:pd3\s*chicken|citra\s*guna|reza\s*perkasa|supplier|vendor)\b.*$/i, '')
    )
    .join('\n')
    .toLowerCase();
  if (/\bpt\.?\s*rasyuka|\brasyuka\b/.test(t)) return 'PT';
  if (/\bcv\.?\s*selera|\bselera\b/.test(t)) return 'CV';

  // Entity contract:
  // CV group = CV / BBCV
  // PT group = PT / WK / MM / BBPT
  const ptCodeCount = (t.match(/\b(?:pt|wk|mm|bbpt)\s*[-:]?\s*\d+/g) || []).length;
  const cvCodeCount = (t.match(/\b(?:cv|bbcv)\s*[-:]?\s*\d+/g) || []).length;
  if (ptCodeCount > cvCodeCount && ptCodeCount > 0) return 'PT';
  if (cvCodeCount > ptCodeCount && cvCodeCount > 0) return 'CV';

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
