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
    // PDF scan/hasil export tertentu dapat mengandung text layer parsial:
    // beberapa baris terbaca tetapi sebagian besar tabel hilang. Jangan
    // menganggap >=3 baris sebagai tanda bahwa ekstraksi sudah lengkap.
    const textCandidateCount = parsePdfLinesToItems(fullText).length;
    const suspicious = allLines.length < 3 || !/\d/.test(fullText) || textCandidateCount < 15;
    if (suspicious) {
      const ocr = await extractPdfPagesWithOcr(pdf, onProgress);
      if (ocr.text.trim()) {
        const ocrCandidateCount = parsePdfLinesToItems(ocr.text).length;
        if (ocrCandidateCount > textCandidateCount) {
          return { ok: true, text: ocr.text, lines: ocr.lines, pageCount: pdf.numPages, method: 'ocr' };
        }
      }
    }
    return { ok: true, text: fullText, lines: allLines, pageCount: pdf.numPages, method: 'text' };
  } catch (err) {
    return { ok: false, error: err.message || 'Gagal baca PDF' };
  }
}

async function extractPdfPagesWithOcr(pdf, onProgress) {
  try {
    const Tesseract = (await import('tesseract.js')).default;
    const pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      if (onProgress) onProgress(`OCR PDF halaman ${pageNo}/${pdf.numPages}...`);
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
      const result = await Tesseract.recognize(canvas, 'ind+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text' && onProgress) {
            onProgress(`OCR PDF ${pageNo}/${pdf.numPages} ${Math.round((m.progress || 0) * 100)}%`);
          }
        },
      });
      pages.push(cleanOcrText(result?.data?.text || ''));
    }
    const text = pages.filter(Boolean).join('\n');
    return { text, lines: text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) };
  } catch {
    return { text: '', lines: [] };
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
  return String(text || '').split(/\r?\n/).map((line) => line
    // Fix common OCR character substitutions, per row.
    .replace(/[|l](?=\d)/gi, '1')
    .replace(/(?<=\d)[oO]/g, '0')
    .replace(/\bAyarn\b/gi, 'Ayam')
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
    .replace(/^\d{1,3}[.)\s-]+/, '')
    .replace(/\s*[/\\]\s*cv\.?\s*pd3\s*chicken/gi, '')
    .replace(/\s*[/\\]\s*good\s*eat/gi, '')
    .replace(/[-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

  for (const line of lines) {
    if (isPdfNonItemLine(line)) continue;
    if (/^(no\.?|total|grand|sub\s*total|jumlah|halaman|page|tanggal|alamat|telepon|telp|invoice|nota)\b/i.test(line)) continue;
    if (/^(nama\s*barang|barang|kode|satuan|unit|qty|quantity|harga|jumlah\s*harga)\b/i.test(line)) continue;
    if (/^(frozen\s*&\s*kering|rekap\s*order|keterangan|pt\.|cv\.)/i.test(line)) continue;

    const nums = [...line.matchAll(/(\d+(?:[.,]\d+)?)/g)];
    if (!nums.length) continue;

    // The right-most numeric value is the TOTAL column in the source table.
    const last = nums[nums.length - 1];
    const qty = parseFloat(last[1].replace(',', '.'));
    if (!(qty > 0) || qty > 99999) continue;

    let rawName = '';

    // Primary table parser: NO -> NAMA BARANG -> UNIT -> KODE -> outlet quantities -> TOTAL.
    // Capture everything before the first UNIT token, so numbers inside item descriptions
    // (0.5 Kg, 4pcs, 10 pcs, etc.) are not mistaken for the quantity.
    const unitMatch = line.match(/\b(pack|pcs|pail|ekor|kg|box|unit|porsi|gram|liter|lusin|botol|kaleng|karung)\b/i);
    if (unitMatch && unitMatch.index != null) {
      rawName = line.slice(0, unitMatch.index).trim();
      rawName = stripLeadingNo(rawName);
    } else {
      // Fallback for simpler CV/handwritten/text formats: use the text before TOTAL.
      rawName = line.slice(0, last.index).trim();
      rawName = stripLeadingNo(rawName)
        .replace(/\b(pack|pcs|pail|ekor|kg|box|unit|porsi|gram|liter|lusin|botol|kaleng|karung)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // If a row has a leading NO but no recognized unit, reject only obvious non-item rows.
    if (rawName.length < 2 || /^\d[\d\s./-]*$/.test(rawName)) continue;

    sourceIndex += 1;
    items.push({
      rawName: rawName.replace(/\s+/g, ' ').trim(),
      qty,
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

export function validatePdfItems(entity, textOrItems, masterOverride) {
  const master = masterOverride || getMasterByEntity(entity) || [];
  const items = Array.isArray(textOrItems) ? textOrItems : parsePdfLinesToItems(textOrItems);
  const results = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
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
      const fuzzy = findFuzzyMasterMatch(entity, rawNameOriginal, master);
      if (fuzzy) {
        match = fuzzy;
        note = fuzzy.matchType;
      }
    }

    if (!match) {
      status = 'unmatched';
      note = 'tidak cocok master';
    }

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
