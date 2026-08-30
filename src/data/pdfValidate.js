/**
 * Validasi PDF rekap order / nota terhadap master + alias.
 * Format: tabel REKAP ORDER (NO | KETERANGAN | UNIT | outlets... | TOTAL)
 * Qty = kolom TOTAL.
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

    // Pack/Ekor terakhir (bukan pcs di dalam kurung size)
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
      else if (nums.length >= 2) qty = nums[nums.length - 1];
    } else if (nums.length >= 1) {
      const last = nums[nums.length - 1];
      if (last > 0 && last < 100000) qty = last;
      nama = nama.replace(/(\d+[.,]\d+|\d+)/g, ' ').replace(/\s+/g, ' ').trim();
    }

    nama = nama
      .replace(/^\d{1,3}[.)]\s*/, '')
      .replace(/\s+(Pack|Pcs|Kg|Ekor|Pail)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (nama.length < 3) continue;
    if (SKIP.test(nama)) continue;
    if (qty <= 0) continue;

    const key = nama.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) {
      const prev = results.find((r) => r.nama.toLowerCase().replace(/\s+/g, ' ') === key);
      if (prev) prev.qty = Math.round((prev.qty + qty) * 100) / 100;
      continue;
    }
    seen.add(key);

    results.push({
      nama,
      qty: Math.round(qty * 100) / 100,
      raw,
      source: 'rekap-order',
    });
  }
  return results;
}

export function parseLinesFromText(text) {
  const rekap = parseRekapOrderLines(text);
  if (rekap.length >= 2) return rekap;

  const lines = splitPdfTextToLines(text);
  const results = [];
  for (const raw of lines) {
    if (SKIP.test(raw)) continue;
    if (/^\d+[.)]?\s*$/.test(raw)) continue;

    let qty = 1;
    let nama = raw;
    let m =
      raw.match(/^(\d+[.,]?\d*)\s*[x×]\s*(.+)$/i) ||
      raw.match(/^(.+?)\s*[x×]\s*(\d+[.,]?\d*)$/i) ||
      raw.match(/^(\d+[.,]?\d*)\s+(.+)$/) ||
      raw.match(/^(.+?)\s+[:=]?\s*(\d+[.,]?\d*)\s*(pack|pcs|kg|ekor|pail|ltr|liter)?$/i);

    if (m) {
      if (/^\d/.test(m[1])) {
        qty = parseFloat(String(m[1]).replace(',', '.')) || 1;
        nama = (m[2] || '').trim();
      } else {
        nama = (m[1] || '').trim();
        qty = parseFloat(String(m[2]).replace(',', '.')) || 1;
      }
    }
    nama = nama.replace(/^\d{1,3}[.)]\s*/, '').trim();
    nama = nama.replace(/\s+(pack|pcs|kg|ekor|pail|ltr|liter)\s*$/i, '').trim();
    if (nama.length < 2) continue;
    if (qty <= 0) qty = 1;
    results.push({ nama, qty, raw, source: 'generic' });
  }
  return results;
}

export function validateItems(entity, rows) {
  return rows.map((row) => {
    const match = matchByAlias(entity, row.nama);
    if (match && match.item) {
      return {
        ...row,
        status: 'matched',
        matchType: match.matchType,
        confidence: match.confidence ?? 1,
        item: match.item,
        kode: match.item.kode,
        namaMaster: match.item.nama,
        satuan: match.item.satuan,
      };
    }
    const hits = searchMaster(entity, row.nama);
    if (hits.length === 1) {
      const item = hits[0];
      return {
        ...row,
        status: 'matched',
        matchType: 'search-single',
        confidence: 0.85,
        item,
        kode: item.kode,
        namaMaster: item.nama,
        satuan: item.satuan,
      };
    }
    if (hits.length > 1) {
      return {
        ...row,
        status: 'ambiguous',
        confidence: 0.4,
        candidates: hits.slice(0, 5),
        item: null,
      };
    }
    return { ...row, status: 'unmatched', confidence: 0, item: null, candidates: [] };
  });
}

export async function extractTextFromPdf(file) {
  const buf = await file.arrayBuffer();
  try {
    const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/+esm');
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
      'Gagal ekstrak PDF (' + (err.message || err) + '). Salin teks manual ke kotak Validasi.'
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
  return {
    total,
    matched: matched.length,
    unmatched: unmatched.length,
    ambiguous: ambiguous.length,
    accuracyPct: pct,
    allMatched: unmatched.length === 0 && ambiguous.length === 0 && matched.length > 0,
    matchedItems: matched.map((r) => ({
      kode: r.kode,
      nama: r.namaMaster,
      qty: r.qty,
      satuan: r.satuan,
      keterangan: r.raw,
      item: r.item,
    })),
  };
}
