/**
 * Validasi PDF rekap order / nota terhadap master + alias.
 * Format utama: tabel REKAP ORDER CV/PT (NO | KETERANGAN | UNIT | outlets... | TOTAL)
 * Qty = kolom TOTAL (bukan breakdown outlet).
 */
import { matchByAlias, searchMaster } from './master';

const SKIP =
  /^(no\.?|keterangan|unit|grand\s*total|halaman|page|master|bahan\s*pokok|bumbu|condiment|rekanan|minuman|tanggal|tujuan|penerima|pengirim|surat|jalan|qty|jumlah|nama\s*barang|kode|periode|frozen|kering|rekap\s*order|chinese\s*food|traditional|selera\s*bogatama|rasyuka|inti\s*pratama|ciputra|trans|icon|delta|super|mall|s\.?city|wtc|tandes|grand|gresik|gres|total|cito|lippo|bg\.?kul|royal|solo|moker|mj\.?kerto|r\s*area)$/i;

export function detectEntityFromText(text) {
  const t = String(text || '').toLowerCase();
  if (/pt\.?\s*ras[yu]?ka|rasyuka\s*inti/.test(t)) return 'PT';
  if (/cv\.?\s*selera|selera\s*bogatama/.test(t)) return 'CV';
  return null;
}

export function splitPdfTextToLines(text) {
  if (!text) return [];
  let t = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const nlCount = (t.match(/\n/g) || []).length;
  if (nlCount < 5 && t.length > 60) {
    t = t.replace(/(?:^|\s)(\d{1,3})[.)]\s+(?=[A-Za-z])/g, '\n$1. ');
    t = t.replace(/\s+(\d+[.,]?\d*\s*[x×]\s+)/gi, '\n$1');
  }
  return t.split(/\n/).map((l) => l.trim()).filter((l) => l.length >= 2);
}

export function parseRekapOrderLines(text) {
  const lines = splitPdfTextToLines(text);
  const results = [];
  const seen = new Set();
  for (const raw of lines) {
    if (SKIP.test(raw)) continue;
    if (/^\d+[.,]?\d*$/.test(raw)) continue;
    if (/^(pack|pcs|kg|ekor|pail)$/i.test(raw)) continue;
    const nums = [...raw.matchAll(/(\d+[.,]\d+|\d+)/g)].map((m) =>
      parseFloat(String(m[1]).replace(',', '.'))
    );
    let qty = 0;
    let nama = raw;
    const withNo = raw.match(/^(\d{1,3})[.)]?\s+(.+)$/);
    if (withNo) nama = withNo[2];
    const unitRe = /\b(Pack|Ekor|Pail)\b/gi;
    let unitMatch = null;
    let m;
    while ((m = unitRe.exec(nama)) !== null) unitMatch = m;
    if (unitMatch) {
      const before = nama.slice(0, unitMatch.index).trim();
      const after = nama.slice(unitMatch.index + unitMatch[0].length).trim();
      nama = before;
      const tailNums = [...after.matchAll(/(\d+[.,]\d+|\d+)/g)].map((x) =>
        parseFloat(String(x[1]).replace(',', '.'))
      );
      if (tailNums.length) qty = tailNums[tailNums.length - 1];
    }
    if (!qty && nums.length) {
      const candidates = nums.filter((n) => n > 0 && n < 100000);
      if (candidates.length) qty = candidates[candidates.length - 1];
    }
    nama = nama
      .replace(/\s*\d+[.,]?\d*\s*$/, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\/\s*CV\.?.*$/i, '')
      .replace(/\/\s*PT\.?.*$/i, '')
      .trim();
    if (!nama || nama.length < 2) continue;
    const key = nama.toLowerCase() + '|' + qty;
    if (seen.has(key)) continue;
    seen.add(key);
    if (qty > 0) results.push({ nama, qty, raw });
  }
  return results;
}

export function parseLinesFromText(text) {
  const rekap = parseRekapOrderLines(text);
  if (rekap.length >= 1) return rekap;
  const lines = splitPdfTextToLines(text);
  const out = [];
  for (const raw of lines) {
    if (SKIP.test(raw)) continue;
    let qty = 1;
    let nama = raw;
    const m1 = raw.match(/^(\d+[.,]?\d*)\s*[x×]\s*(.+)$/i);
    const m2 = raw.match(/^(.+?)\s+[x×]\s*(\d+[.,]?\d*)$/i);
    const m3 = raw.match(/^(.+?)\s+(\d+[.,]?\d*)\s*(pack|pcs|kg|ekor)?$/i);
    if (m1) { qty = parseFloat(m1[1].replace(',', '.')); nama = m1[2]; }
    else if (m2) { nama = m2[1]; qty = parseFloat(m2[2].replace(',', '.')); }
    else if (m3) { nama = m3[1]; qty = parseFloat(m3[2].replace(',', '.')); }
    nama = nama.replace(/\s{2,}/g, ' ').trim();
    if (nama.length >= 2 && qty > 0) out.push({ nama, qty, raw });
  }
  return out;
}

export function validateItems(entity, rows) {
  return (rows || []).map((row) => {
    const m = matchByAlias(entity, row.nama);
    if (m && m.item) {
      return {
        ...row,
        status: 'matched',
        matchType: m.matchType,
        item: m.item,
        kode: m.item.kode,
        namaMaster: m.item.nama,
        satuan: m.item.satuan,
      };
    }
    const hits = searchMaster(entity, row.nama).slice(0, 5);
    if (hits.length === 1) {
      return {
        ...row,
        status: 'matched',
        matchType: 'search',
        item: hits[0],
        kode: hits[0].kode,
        namaMaster: hits[0].nama,
        satuan: hits[0].satuan,
      };
    }
    if (hits.length > 1) {
      return { ...row, status: 'ambiguous', candidates: hits };
    }
    return { ...row, status: 'unmatched' };
  });
}

export async function extractTextFromPdf(file) {
  const buf = await file.arrayBuffer();
  try {
    let pdfjs;
    try {
      pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/+esm');
    } catch {
      pdfjs = await import('https://unpkg.com/pdfjs-dist@4.8.69/build/pdf.min.mjs');
    }
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs';
    }
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const pageBlocks = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const items = content.items.filter((it) => it.str && String(it.str).trim());
      const rows = {};
      for (const it of items) {
        const y = it.transform ? Math.round(it.transform[5] / 2) * 2 : 0;
        const key = String(y);
        if (!rows[key]) rows[key] = [];
        rows[key].push({ x: it.transform ? it.transform[4] : 0, str: it.str });
      }
      const sortedY = Object.keys(rows).map(Number).sort((a, b) => b - a);
      for (const y of sortedY) {
        const line = rows[String(y)]
          .sort((a, b) => a.x - b.x)
          .map((c) => c.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (line) pageBlocks.push(line);
      }
      pageBlocks.push('');
    }
    return pageBlocks.join('\n');
  } catch (err) {
    throw new Error(
      'Gagal ekstrak PDF (' +
        (err.message || err) +
        '). Salin teks manual ke kotak Validasi.'
    );
  }
}

export async function scanBarcodeFromVideo(videoEl) {
  if (!('BarcodeDetector' in window)) {
    return { ok: false, error: 'BarcodeDetector tidak didukung di browser ini' };
  }
  const detector = new window.BarcodeDetector({
    formats: ['qr_code', 'ean_13', 'code_128', 'code_39'],
  });
  const barcodes = await detector.detect(videoEl);
  if (!barcodes.length) return { ok: false, error: 'Tidak ada QR/barcode terdeteksi' };
  return { ok: true, value: barcodes[0].rawValue, format: barcodes[0].format };
}

export function summarizeValidation(results) {
  const matched = results.filter((r) => r.status === 'matched');
  const unmatched = results.filter((r) => r.status === 'unmatched');
  const ambiguous = results.filter((r) => r.status === 'ambiguous');
  const total = results.length;
  const pct = total ? Math.round((matched.length / total) * 100) : 0;
  return { matched, unmatched, ambiguous, total, pct };
}
