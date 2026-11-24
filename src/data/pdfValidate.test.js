import { describe, expect, it } from 'vitest';
import {
  detectEntityFromText,
  parsePdfLinesToItems,
  validatePdfItems,
  parseOrderSummaryFromOcr,
} from './pdfValidate';

describe('PDF chicken fillet supplier suffixes', () => {
  it.each([
    ['CV', 'CV. Selera Bogatama', 'CV-0001', 'CV-0002'],
    ['PT', 'PT. Rasyuka', 'PT-0001', 'PT-0002'],
  ])('keeps Dada/Paha distinct for %s entity when supplier suffix is present', (entity, header, dadaCode, pahaCode) => {
    const text = [
      header,
      '1 Ayam Fillet Dada / PT. Citra Guna 12',
      '2 Ayam Fillet Paha / PT. Reza Perkasa 8',
    ].join('\n');

    expect(detectEntityFromText(text)).toBe(entity);

    const parsed = parsePdfLinesToItems(text);
    expect(parsed.map(({ rawName, qty }) => ({ rawName, qty }))).toEqual([
      { rawName: 'Ayam Fillet Dada', qty: 12 },
      { rawName: 'Ayam Fillet Paha', qty: 8 },
    ]);

    const validated = validatePdfItems(entity, parsed);
    expect(validated.map(({ status, kode, nama }) => ({ status, kode, nama }))).toEqual([
      { status: 'matched', kode: dadaCode, nama: 'Ayam Fillet Dada' },
      { status: 'matched', kode: pahaCode, nama: 'Ayam Fillet Paha' },
    ]);
  });
});


function ocrWord(text, x0, x1, y, line, confidence = 98) {
  return {
    text,
    confidence,
    block_num: 1,
    par_num: 1,
    line_num: line,
    bbox: { x0, x1, y0: y, y1: y + 18 },
  };
}

describe('photo recap TOTAL-column extraction', () => {
  it('uses only the extreme-right TOTAL column and strips packaging/supplier details', () => {
    const words = [
      ocrWord('NAMA', 20, 75, 20, 1), ocrWord('BARANG', 80, 145, 20, 1),
      ocrWord('CITO', 300, 345, 20, 1), ocrWord('LIPPO', 440, 495, 20, 1),
      ocrWord('TOTAL', 700, 760, 20, 1),
      ocrWord('Ayam', 20, 65, 60, 2), ocrWord('Fillet', 70, 115, 60, 2),
      ocrWord('dada', 120, 158, 60, 2), ocrWord('(0.5', 165, 195, 60, 2),
      ocrWord('Kg)', 198, 220, 60, 2), ocrWord('/', 225, 230, 60, 2),
      ocrWord('CV.', 235, 258, 60, 2), ocrWord('PD3', 260, 282, 60, 2),
      ocrWord('CHICKEN', 284, 296, 60, 2),
      ocrWord('12', 310, 330, 60, 2), ocrWord('8', 450, 465, 60, 2),
      ocrWord('400.00', 700, 755, 60, 2),
      ocrWord('Saos', 20, 58, 95, 3), ocrWord('Ayam', 62, 105, 95, 3),
      ocrWord('69', 110, 128, 95, 3), ocrWord('(Frozen)', 132, 190, 95, 3),
      ocrWord('3', 310, 325, 95, 3), ocrWord('5', 450, 465, 95, 3),
      ocrWord('20.00', 700, 750, 95, 3),
      ocrWord('Ayam', 20, 60, 130, 4), ocrWord('Penyet', 65, 115, 130, 4),
      ocrWord('(2', 120, 135, 130, 4), ocrWord('Dada', 140, 175, 130, 4),
      ocrWord('+', 180, 188, 130, 4), ocrWord('2', 190, 202, 130, 4),
      ocrWord('Paha)', 205, 245, 130, 4), ocrWord('4pcs', 250, 280, 130, 4),
      ocrWord('7', 310, 325, 130, 4), ocrWord('3', 450, 465, 130, 4),
      ocrWord('12.00', 700, 750, 130, 4),
    ];
    const result = parseOrderSummaryFromOcr({ words });
    expect(result.ok).toBe(true);
    expect(result.items.map(({ no, rawName, qty }) => ({ no, rawName, qty }))).toEqual([
      { no: 1, rawName: 'Ayam Fillet dada', qty: 400 },
      { no: 2, rawName: 'Saos Ayam 69', qty: 20 },
      { no: 3, rawName: 'Ayam Penyet', qty: 12 },
    ]);
    expect(result.issues).toEqual([]);
  });

  it('fails closed when TOTAL is missing instead of guessing a branch quantity', () => {
    const result = parseOrderSummaryFromOcr({
      words: [
        ocrWord('NAMA', 20, 70, 20, 1), ocrWord('CITO', 300, 350, 20, 1),
        ocrWord('Ayam', 20, 60, 60, 2), ocrWord('Fillet', 65, 110, 60, 2),
        ocrWord('12', 310, 330, 60, 2),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.error).toMatch(/TOTAL/i);
  });


  it('keeps digits that belong to a product name when the table has only TOTAL quantities', () => {
    const result = parseOrderSummaryFromOcr({
      words: [
        ocrWord('BARANG', 20, 100, 20, 1), ocrWord('TOTAL', 700, 760, 20, 1),
        ocrWord('Ice', 20, 42, 60, 2), ocrWord('Cream', 48, 88, 60, 2),
        ocrWord('3', 92, 104, 60, 2), ocrWord('Rasa', 108, 145, 60, 2),
        ocrWord('2.00', 700, 750, 60, 2),
      ],
    });
    expect(result.items).toEqual([
      expect.objectContaining({ no: 1, rawName: 'Ice Cream 3 Rasa', qty: 2 }),
    ]);
  });

  it('routes non-whole TOTAL quantities to manual review', () => {
    const result = parseOrderSummaryFromOcr({
      words: [
        ocrWord('BARANG', 20, 100, 20, 1), ocrWord('TOTAL', 700, 760, 20, 1),
        ocrWord('Udang', 20, 65, 60, 2), ocrWord('4.50', 700, 750, 60, 2),
      ],
    });
    expect(result.items).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].reason).toMatch(/pecahan/i);
  });
});

describe('entity-scoped source master includes raw materials', () => {
  it('maps CV bahan baku from BBCV master', () => {
    const result = validatePdfItems('CV', [{ rawName: 'Bonelles Dada', qty: 4 }], undefined, { includeRawMaterials: true });
    expect(result[0]).toMatchObject({ status: 'matched', kode: 'BBCV-0001' });
  });


  it('keeps ordinary PDF imports blocked from raw-material SKUs', () => {
    const result = validatePdfItems('PT', [{ rawName: 'Bebek', qty: 2 }]);
    expect(result[0]).toMatchObject({ status: 'unmatched', kode: null });
    expect(result[0].note).toMatch(/bahan baku/i);
  });

  it('maps PT bahan baku from BBPT master', () => {
    const result = validatePdfItems('PT', [{ rawName: 'Bebek', qty: 2 }], undefined, { includeRawMaterials: true });
    expect(result[0]).toMatchObject({ status: 'matched', kode: 'BBPT-0012' });
  });
});

describe('document entity detection ignores product supplier suffixes', () => {
  it('does not mistake CV. PD3 CHICKEN supplier labels for the PT document entity', () => {
    const text = [
      'PT. Rasyuka',
      '1 Ayam Fillet Dada / CV. PD3 CHICKEN 400.00',
      '2 Ayam Fillet Paha / CV. PD3 CHICKEN 250.00',
    ].join('\n');
    expect(detectEntityFromText(text)).toBe('PT');
  });
});

describe('recap aliases resolve only to the selected entity master', () => {
  it.each([
    ['CV', 'Ice Cream INDOLAKTO (8 Liter)', 'CV-0030'],
    ['PT', 'Ice Cream INDOLAKTO (8 Liter)', 'PT-0029'],
    ['CV', 'Saos Ayam Frozen', 'CV-0036'],
    ['PT', 'Saos Ayam Frozen', 'WK-0021'],
    ['PT', 'Iga Sapi', 'WK-0004'],
  ])('maps %s alias %s to %s', (entity, rawName, kode) => {
    const result = validatePdfItems(entity, [{ rawName, qty: 2 }]);
    expect(result[0]).toMatchObject({ status: 'matched', kode });
  });
});
