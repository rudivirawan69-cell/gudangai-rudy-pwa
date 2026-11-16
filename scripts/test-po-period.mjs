import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../Code.gs', import.meta.url), 'utf8');

function block(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'Missing ' + name);
  const next = source.indexOf('\nfunction ', start + 10);
  return source.slice(start, next > start ? next : source.length);
}

test('PO period is Monday through Sunday; 23 Nov starts a new week', () => {
  const helper = block('getPOPeriodBounds_');
  const fn = new Function('TIMEZONE', 'Utilities', 'getWeekKey_', helper + '\nreturn getPOPeriodBounds_;');
  const utilities = { formatDate(date) { return date.toISOString().slice(0, 10); } };
  const getWeekKey = () => '2026-W47';
  const getPeriod = fn('Asia/Jakarta', utilities, getWeekKey);
  const result = getPeriod(new Date('2026-11-16T00:00:00.000Z'));
  assert.equal(result.periodStart, '2026-11-16');
  assert.equal(result.periodEnd, '2026-11-22');
  assert.equal(result.periodEndExclusive, '2026-11-23');
});

test('PO status counts only arrivals from PO date until the exclusive next-Monday boundary', () => {
  const status = block('getStatusPO');
  assert.match(status, /masukKey < poKey \|\| masukKey >= info\.periodEndExclusive/);
  assert.match(status, /periodStatus: periodStatus/);
  assert.match(status, /isActivePeriod: periodStatus === "AKTIF"/);
  assert.match(status, /"TERTUNDA"/);
});

test('weekly rollover archives and reads back old PO before allowing replacement', () => {
  const rollover = block('rolloverPOWeekIfNeeded_');
  const guard = block('getPOOverwriteGuard_');
  const archiveIndex = rollover.indexOf('props.setProperty("GUDANGAI_PO_LAST_WEEK_STATUS"');
  const verifyIndex = rollover.indexOf('props.getProperty("GUDANGAI_PO_LAST_WEEK_STATUS") !== serialized');
  const weekKeyWriteIndex = rollover.lastIndexOf('props.setProperty("GUDANGAI_PO_WEEK_KEY", currentKey)');
  assert.ok(archiveIndex >= 0 && verifyIndex > archiveIndex && weekKeyWriteIndex > verifyIndex,
    'The previous PO snapshot must be read back successfully before the active week key advances.');
  assert.match(rollover, /PO_ROLLOVER_ARCHIVE_UNCONFIRMED/);
  assert.match(guard, /archived\.weekKey === status\.weekKey/);
  assert.match(guard, /safe: true/);
});

test('PO arrival writer rejects a date outside its PO period', () => {
  const arrival = block('recordPOArrival');
  assert.match(arrival, /PO_PERIOD_MISMATCH/);
  assert.match(arrival, /arrivalKey >= poInfo\.periodEndExclusive/);
});

test('dashboard PO totals use the single active-period status source', () => {
  const dashboard = block('getPOStatus_');
  assert.match(dashboard, /getStatusPO\(\)/);
  assert.match(dashboard, /status\.periodStatus !== "AKTIF"/);
});
