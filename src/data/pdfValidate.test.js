import { describe, expect, it } from 'vitest';
import {
  detectEntityFromText,
  parsePdfLinesToItems,
  validatePdfItems,
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
