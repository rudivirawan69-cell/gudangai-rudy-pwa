import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const probe = `
  import { parseTanggal, formatWaktuSinkron } from './tanggal.js';
  const instant = new Date('2026-11-12T18:00:00.000Z');
  console.log(JSON.stringify({
    date: parseTanggal(instant),
    timestamp: formatWaktuSinkron(instant),
    serial: parseTanggal(25569),
    dateOnly: parseTanggal('2026-11-13')
  }));
`;

for (const timezone of ['UTC', 'Asia/Jakarta', 'America/Los_Angeles']) {
  test(`WIB conversion is stable under TZ=${timezone}`, () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
      cwd: process.cwd(),
      env: { ...process.env, TZ: timezone },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const actual = JSON.parse(result.stdout.trim());
    assert.deepEqual(actual, {
      date: '2026-11-13',
      timestamp: '13 Nov 2026, 01.00 WIB',
      serial: '1970-01-01',
      dateOnly: '2026-11-13',
    });
  });
}
