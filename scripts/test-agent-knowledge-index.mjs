import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CODE_KNOWLEDGE } from '../cloudflare/generated/code-knowledge.js';

test('generated Code.gs index covers the complete repository snapshot', async () => {
  const source = await readFile(new URL('../Code.gs', import.meta.url), 'utf8');
  assert.equal(CODE_KNOWLEDGE.source, 'Code.gs');
  assert.equal(CODE_KNOWLEDGE.characterCount, source.length);
  assert.equal(CODE_KNOWLEDGE.lineCount, source.split(/\\r?\\n/).length);
  assert.ok(CODE_KNOWLEDGE.chunkCount > 20);
  const joined = CODE_KNOWLEDGE.chunks.map((chunk) => chunk.text).join('\\n');
  for (const symbol of ['function doPost', 'function getAllStock', 'function getDashboardData', 'function getStockoutRisk', 'function getAgentKnowledge_']) {
    assert.ok(joined.includes(symbol), 'missing source symbol: ' + symbol);
  }
  assert.match(CODE_KNOWLEDGE.sha256, /^[a-f0-9]{64}$/);
});
