import { describe, expect, it } from 'vitest';
import { formatSpreadsheetTimestamp } from './sheetTimestamp';

describe('formatSpreadsheetTimestamp', () => {
  it('preserves the spreadsheet date and WIB time', () => {
    const formatted = formatSpreadsheetTimestamp('2026-11-09 08:49:38');

    expect(formatted).toContain('09 Nov 2026');
    expect(formatted).toMatch(/08[.:]49/);
    expect(formatted).toContain('WIB');
  });

  it('formats ISO timestamps in WIB', () => {
    expect(formatSpreadsheetTimestamp('2026-11-09T01:49:38.000Z')).toMatch(/08[.:]49/);
  });

  it('shows a clear fallback when no sheet timestamp is available', () => {
    expect(formatSpreadsheetTimestamp(null)).toBe('Belum ada data dari spreadsheet');
  });
});
