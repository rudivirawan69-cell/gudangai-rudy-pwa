import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const sourcePath = resolve(root, 'Code.gs');
const outputPath = resolve(root, 'cloudflare/generated/code-knowledge.js');
const source = await readFile(sourcePath, 'utf8');
const lines = source.split(/\r?\n/);
const chunkSize = 2200;
const overlap = 240;
const chunks = [];
let start = 0;

while (start < source.length) {
  let end = Math.min(source.length, start + chunkSize);
  if (end < source.length) {
    const boundary = source.lastIndexOf('\n', end);
    if (boundary > start + 1200) end = boundary + 1;
  }
  const preceding = source.slice(0, start);
  const declarations = [...preceding.matchAll(/^\s*(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)];
  const section = declarations.at(-1)?.[1] || 'file-header';
  const text = source.slice(start, end).trim();
  if (text) chunks.push({ id: chunks.length + 1, section, startOffset: start, endOffset: end, text });
  if (end >= source.length) break;
  start = Math.max(start + 1, end - overlap);
}

const version = source.match(/const BACKEND_VERSION\s*=\s*["']([^"']+)/)?.[1] || 'unknown';
const knowledge = {
  source: 'Code.gs',
  repository: 'rudivirawan69-cell/gudangai-rudy-pwa',
  ref: process.env.GITHUB_SHA || 'local-build',
  version,
  sha256: createHash('sha256').update(source).digest('hex'),
  lineCount: lines.length,
  characterCount: source.length,
  chunkCount: chunks.length,
  chunks,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, '/* Generated from Code.gs. Do not edit manually. */\nexport const CODE_KNOWLEDGE = ' + JSON.stringify(knowledge) + ';\n', 'utf8');
process.stdout.write('Generated Code.gs knowledge index: ' + chunks.length + ' chunks, ' + source.length + ' chars, SHA-256 ' + knowledge.sha256 + '\n');
