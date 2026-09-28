/** Assemble R-rocket logo icons for PWA install. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');
const partsDir = path.join(__dirname, 'icons_parts');
fs.mkdirSync(outDir, { recursive: true });

function readPart(name) {
  const p = path.join(partsDir, name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : '';
}

function writePng(name, b64) {
  if (!b64) return false;
  fs.writeFileSync(path.join(outDir, name), Buffer.from(b64, 'base64'));
  return true;
}

let n = 0;
const b512 = readPart('icon_512_part0.txt') + readPart('icon_512_part1.txt') + readPart('icon_512_part2.txt');
if (writePng('icon-512x512.png', b512)) n++;
if (writePng('icon-maskable-512x512.png', b512)) n++;
if (writePng('icon-192x192.png', readPart('icon_192.txt'))) n++;
if (writePng('icon-maskable-192x192.png', readPart('icon_192.txt'))) n++;
if (writePng('apple-touch-icon.png', readPart('apple.txt'))) n++;
if (writePng('icon-96x96.png', readPart('icon_96.txt'))) n++;

const aliases = {
  'icon-72x72.png': 'icon-96x96.png',
  'icon-128x128.png': 'icon-192x192.png',
  'icon-144x144.png': 'icon-192x192.png',
  'icon-152x152.png': 'icon-192x192.png',
  'icon-180x180.png': 'apple-touch-icon.png',
  'icon-256x256.png': 'icon-512x512.png',
  'icon-384x384.png': 'icon-512x512.png',
};
for (const [dest, src] of Object.entries(aliases)) {
  const from = path.join(outDir, src);
  const to = path.join(outDir, dest);
  if (fs.existsSync(from)) fs.copyFileSync(from, to);
}
console.log('Wrote', n, 'PWA logo icons to public/icons');
