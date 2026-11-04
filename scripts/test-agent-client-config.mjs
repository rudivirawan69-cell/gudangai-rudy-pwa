import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/data/claude.js', import.meta.url), 'utf8');

test('PWA Agent client targets the Cloudflare gateway from GitHub Pages and other hosts', () => {
  assert.match(source, /VITE_GUDANGAI_AI_API_BASE/);
  assert.match(source, /https:\/\/gudangai-rudy-pwa69\.rudivirawan69\.workers\.dev/);
  assert.match(source, /AGENT_API_BASE\s*\?\s*`\$\{AGENT_API_BASE\}\/api\/agent`\s*:\s*'\/api\/agent'/);
});

test('Agent health uses the same configured gateway origin', () => {
  assert.match(source, /AGENT_HEALTH_ENDPOINT/);
  assert.match(source, /AGENT_API_BASE\}\/api\/agent\/health/);
});

test('PWA forwards the Supabase bearer token and does not call claude-proxy directly', () => {
  assert.match(source, /Authorization:\s*`Bearer \$\{session\.access_token\}`/);
  assert.doesNotMatch(source, /claude-proxy\.workers\.dev/);
});
