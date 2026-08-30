/**
 * Validasi PDF / nota terhadap master + alias.
 */
import { matchByAlias, searchMaster } from './master';

export function parseLinesFromText(text) {
  if (!text) return [];
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2);

  const results = [];
  const skipRe = /^(no\.?|keterangan|unit|grand\s*total|halaman|page|master|bahan\s*pokok|bumbu|condiment|rekanan|minuman|tanggal|tujuan|penerima|pengirim|surat|jalan)/i;

  for (const raw of lines) {
    if (skipRe.test(raw)) continue;
    if (/^\d+[\.\)]?\s*$/.test(raw)) continue;

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

    nama = nama.replace(/^\d+[\.\)]\s*/, '').trim();
    if (nama.length < 2) continue;
    if (qty <= 0) qty = 1;

    results.push({ nama, qty, raw });
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
        candidates: hits.slice(0, 5),
        item: null,
      };
    }
    return { ...row, status: 'unmatched', item: null, candidates: [] };
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
    let text = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(' ') + '\n';
    }
    return text;
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
  return {
    total: results.length,
    matched: matched.length,
    unmatched: unmatched.length,
    ambiguous: ambiguous.length,
    matchedItems: matched.map((r) => ({
      kode: r.kode,
      nama: r.namaMaster,
      qty: r.qty,
      satuan: r.satuan,
      keterangan: r.raw,
    })),
  };
}
