/** Decode R-rocket logo icons for PWA install. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');

let raw = '';
const single = path.join(__dirname, 'icon-b64.json');
const p1 = path.join(__dirname, 'icon-b64-p1.txt');
const p2 = path.join(__dirname, 'icon-b64-p2.txt');
if (fs.existsSync(single)) {
  raw = fs.readFileSync(single, 'utf8');
} else {
  raw = fs.readFileSync(p1, 'utf8') + fs.readFileSync(p2, 'utf8');
}
const data = JSON.parse(raw);

fs.mkdirSync(outDir, { recursive: true });
for (const [name, b64] of Object.entries(data)) {
  fs.writeFileSync(path.join(outDir, name), Buffer.from(b64, 'base64'));
}

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
console.log('Wrote PWA logo icons to public/icons');
